import { Router } from "express";
import { redeemSignupSchema, LICENSE_STATUS } from "@shared/schema";
import { storage } from "../storage";
import { provisionAccount, HeimdallError } from "../services/heimdall";

const router = Router();

// ─── GET /api/redeem/license-info ─────────────────────────────────────────────
router.get("/license-info", async (req, res) => {
  console.log("[Redeem:license-info] ═══════════════════════════════════════");
  console.log("[Redeem:license-info] GET /api/redeem/license-info");
  console.log("[Redeem:license-info] Session ID:", req.session.id);
  console.log("[Redeem:license-info] Cookie header:", req.headers.cookie || "NO COOKIE");
  console.log("[Redeem:license-info] pendingLicenseKey (FULL):", req.session.pendingLicenseKey || "NULL");
  console.log("[Redeem:license-info] All session keys:", JSON.stringify(Object.keys(req.session)));
  console.log("[Redeem:license-info] Session data:", JSON.stringify({
    pendingLicenseKey: req.session.pendingLicenseKey || null,
    partnerUserId: req.session.partnerUserId,
    partnerId: req.session.partnerId,
    isAdmin: req.session.isAdmin,
    oauthState: req.session.oauthState ? "SET" : null,
  }));
  console.log("[Redeem:license-info] ═══════════════════════════════════════");

  const licenseKey = req.session.pendingLicenseKey;
  if (!licenseKey) {
    console.log("[Redeem:license-info] No pendingLicenseKey in session — returning 400");
    return res.status(400).json({
      message: "No pending license key. Please start the activation from AppSumo.",
    });
  }

  console.log("[Redeem:license-info] Looking up license key:", licenseKey.slice(0, 8) + "...");
  const license = await storage.getLicenseByKey(licenseKey);

  if (!license) {
    console.log("[Redeem:license-info] License key NOT FOUND in DB");
    return res.status(404).json({ message: "License key not found." });
  }

  console.log("[Redeem:license-info] License found:", {
    tier: license.tier,
    status: license.status,
    partnerId: license.partnerId,
  });

  if (license.status === LICENSE_STATUS.REDEEMED) {
    console.log("[Redeem:license-info] License already REDEEMED — returning 409");
    return res.status(409).json({
      message: "This license has already been redeemed.",
      alreadyRedeemed: true,
      supportEmail: "support@tinycommand.com",
    });
  }

  console.log("[Redeem:license-info] Returning license info successfully");
  return res.json({
    tier: license.tier,
    status: license.status,
    partnerName: "AppSumo",
  });
});

// ─── POST /api/redeem/signup ──────────────────────────────────────────────────
router.post("/signup", async (req, res) => {
  console.log("[Redeem:signup] ─── POST /api/redeem/signup ───");
  console.log("[Redeem:signup] Session ID:", req.session.id);
  console.log("[Redeem:signup] Request body:", JSON.stringify({
    email: req.body?.email,
    firstName: req.body?.firstName,
    lastName: req.body?.lastName,
  }));

  // 1. Validate session has a pending license key
  const licenseKey = req.session.pendingLicenseKey;
  if (!licenseKey) {
    console.log("[Redeem:signup] No pendingLicenseKey in session — returning 400");
    return res.status(400).json({
      message: "No pending license key. Please start the activation from AppSumo.",
    });
  }
  console.log("[Redeem:signup] License key from session:", licenseKey.slice(0, 8) + "...");

  // 2. Validate request body
  const parsed = redeemSignupSchema.safeParse(req.body);
  if (!parsed.success) {
    console.log("[Redeem:signup] Validation failed:", JSON.stringify(parsed.error.flatten()));
    return res.status(400).json({
      message: "Invalid input",
      error: parsed.error.flatten(),
    });
  }

  const { email, firstName, lastName, password } = parsed.data;
  console.log("[Redeem:signup] Validated input:", { email, firstName, lastName, passwordLength: password.length });

  // 3. Fetch license from DB
  const license = await storage.getLicenseByKey(licenseKey);
  if (!license) {
    console.log("[Redeem:signup] License key NOT FOUND in DB");
    return res.status(404).json({ message: "License key not found." });
  }

  console.log("[Redeem:signup] License found:", {
    tier: license.tier,
    status: license.status,
    partnerId: license.partnerId,
  });

  // 4. Check not already redeemed
  if (license.status === LICENSE_STATUS.REDEEMED) {
    console.log("[Redeem:signup] License already REDEEMED — returning 409");
    return res.status(409).json({
      message: "This license has already been redeemed.",
      alreadyRedeemed: true,
      supportEmail: "support@tinycommand.com",
    });
  }

  // 5. Provision account on Heimdall
  console.log("[Redeem:signup] ─── Starting Heimdall provisioning ───");
  try {
    const result = await provisionAccount(
      email,
      firstName,
      lastName,
      license.tier,
      licenseKey,
      password
    );

    console.log("[Redeem:signup] Provisioning completed:", {
      heimdallUserId: result.heimdallUserId,
      heimdallWorkspaceId: result.heimdallWorkspaceId,
      isNewUser: result.isNewUser,
    });

    // 6. Update license in local DB
    console.log("[Redeem:signup] Updating license status to REDEEMED...");
    await storage.updateLicenseStatus(licenseKey, LICENSE_STATUS.REDEEMED, {
      redeemedAt: new Date(),
      heimdallUserId: result.heimdallUserId,
      heimdallWorkspaceId: result.heimdallWorkspaceId,
      redeemerEmail: email,
      previousPlanId: result.previousPlanId,
      previousPlanType: result.previousPlanType,
    });
    console.log("[Redeem:signup] Saved previous plan info:", { previousPlanId: result.previousPlanId, previousPlanType: result.previousPlanType });
    console.log("[Redeem:signup] License status updated");

    // 7. Log the event
    console.log("[Redeem:signup] Creating license event...");
    await storage.createLicenseEvent({
      licenseKey,
      partnerId: license.partnerId,
      eventType: "redeem",
      previousStatus: license.status,
      newStatus: LICENSE_STATUS.REDEEMED,
      triggeredBy: "oauth",
      tier: license.tier,
    });
    console.log("[Redeem:signup] License event created");

    // 8. Clear pending license key from session
    delete req.session.pendingLicenseKey;
    console.log("[Redeem:signup] Cleared pendingLicenseKey from session");

    // 9. Return success
    console.log("[Redeem:signup] ─── SUCCESS ─── Returning result");
    return res.json({
      success: true,
      isNewUser: result.isNewUser,
      email,
      name: `${firstName} ${lastName}`,
    });
  } catch (err) {
    console.error("[Redeem:signup] ─── PROVISIONING FAILED ───");
    console.error("[Redeem:signup] Error type:", (err as Error).constructor.name);
    console.error("[Redeem:signup] Error message:", (err as Error).message);
    if (err instanceof HeimdallError) {
      console.error("[Redeem:signup] Failed at step:", err.step);
    }
    console.error("[Redeem:signup] Full error:", err);

    const message =
      err instanceof HeimdallError
        ? `Provisioning failed at step: ${err.step}. ${err.message}`
        : "Account provisioning failed. Please try again or contact support.";

    return res.status(500).json({ message });
  }
});

export default router;
