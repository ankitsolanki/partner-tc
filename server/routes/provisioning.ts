import { Router } from "express";
import { redeemSignupSchema, LICENSE_STATUS } from "@shared/schema";
import { storage } from "../storage";
import { provisionAccount, HeimdallError } from "../services/heimdall";

const router = Router();

// ─── GET /api/redeem/license-info ─────────────────────────────────────────────
// Frontend calls this to display license info on the signup page.
router.get("/license-info", async (req, res) => {
  const licenseKey = req.session.pendingLicenseKey;
  if (!licenseKey) {
    return res.status(400).json({
      message: "No pending license key. Please start the activation from AppSumo.",
    });
  }

  const license = await storage.getLicenseByKey(licenseKey);
  if (!license) {
    return res.status(404).json({ message: "License key not found." });
  }

  if (license.status === LICENSE_STATUS.REDEEMED) {
    return res.status(409).json({
      message: "This license has already been redeemed.",
      alreadyRedeemed: true,
      supportEmail: "support@tinycommand.com",
    });
  }

  return res.json({
    tier: license.tier,
    status: license.status,
    partnerName: "AppSumo",
  });
});

// ─── POST /api/redeem/signup ──────────────────────────────────────────────────
// Accepts the signup form, orchestrates Heimdall provisioning, updates license.
router.post("/signup", async (req, res) => {
  // 1. Validate session has a pending license key
  const licenseKey = req.session.pendingLicenseKey;
  if (!licenseKey) {
    return res.status(400).json({
      message: "No pending license key. Please start the activation from AppSumo.",
    });
  }

  // 2. Validate request body
  const parsed = redeemSignupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid input",
      error: parsed.error.flatten(),
    });
  }

  const { email, firstName, lastName } = parsed.data;

  // 3. Fetch license from DB
  const license = await storage.getLicenseByKey(licenseKey);
  if (!license) {
    return res.status(404).json({ message: "License key not found." });
  }

  // 4. Check not already redeemed
  if (license.status === LICENSE_STATUS.REDEEMED) {
    return res.status(409).json({
      message: "This license has already been redeemed.",
      alreadyRedeemed: true,
      supportEmail: "support@tinycommand.com",
    });
  }

  // 5. Provision account on Heimdall
  try {
    const result = await provisionAccount(
      email,
      firstName,
      lastName,
      license.tier,
      licenseKey
    );

    // 6. Update license in local DB
    await storage.updateLicenseStatus(licenseKey, LICENSE_STATUS.REDEEMED, {
      redeemedAt: new Date(),
      heimdallUserId: result.heimdallUserId,
      heimdallWorkspaceId: result.heimdallWorkspaceId,
      redeemerEmail: email,
    });

    // 7. Log the event
    await storage.createLicenseEvent({
      licenseKey,
      partnerId: license.partnerId,
      eventType: "redeem",
      previousStatus: license.status,
      newStatus: LICENSE_STATUS.REDEEMED,
      triggeredBy: "oauth",
      tier: license.tier,
    });

    // 8. Clear pending license key from session
    delete req.session.pendingLicenseKey;

    // 9. Return success
    console.log("[Provisioning] Account provisioned successfully:", {
      email,
      isNewUser: result.isNewUser,
      workspaceId: result.heimdallWorkspaceId,
    });

    return res.json({
      success: true,
      isNewUser: result.isNewUser,
      email,
      name: `${firstName} ${lastName}`,
    });
  } catch (err) {
    console.error("[Provisioning] Failed:", err);

    const message =
      err instanceof HeimdallError
        ? `Provisioning failed at step: ${err.step}. ${err.message}`
        : "Account provisioning failed. Please try again or contact support.";

    return res.status(500).json({ message });
  }
});

export default router;
