import { Router } from "express";
import { validateHmacSignature } from "../utils/crypto";
import { storage } from "../storage";
import { updateWorkspacePlanForUser, addHeimdallUser } from "../services/heimdall";
import { z } from "zod";

const router = Router();

const webhookPayloadSchema = z.object({
  event: z.enum(["purchase", "activate", "upgrade", "downgrade", "deactivate", "migrate", "test"]),
  license_key: z.string().optional(),
  prev_license_key: z.string().optional(),
  new_license_key: z.string().optional(),
  tier: z.number().optional(),
  new_tier: z.number().optional(),
  user_id: z.number().optional(),
  partner_name: z.string().optional(),
  test: z.boolean().optional(),
});

router.post("/partner", async (req, res) => {
  console.log("[Webhook] ─── POST /api/webhooks/partner ───");
  console.log("[Webhook] Full request body:", JSON.stringify(req.body));
  console.log("[Webhook] Headers:", JSON.stringify({
    "x-webhook-signature": req.headers["x-webhook-signature"] ? "present" : "missing",
    "x-webhook-timestamp": req.headers["x-webhook-timestamp"],
    "x-partner-name": req.headers["x-partner-name"],
    "content-type": req.headers["content-type"],
  }));
  console.log("[Webhook] Query params:", JSON.stringify(req.query));

  const signature = req.headers["x-webhook-signature"] as string | undefined;
  const timestamp = req.headers["x-webhook-timestamp"] as string | undefined;
  const partnerNameQuery = req.query.name as string | undefined;
  const partnerNameHeader = req.headers["x-partner-name"] as string | undefined;
  const partnerName = partnerNameQuery ?? partnerNameHeader;

  if (!partnerName) {
    console.log("[Webhook] REJECTED: No partner name provided");
    return res
      .status(400)
      .json({ message: "Missing partner name. Provide ?name=appsumo or x-partner-name header." });
  }

  console.log("[Webhook] Partner name:", partnerName);
  const partner = await storage.getPartner(partnerName);
  if (!partner) {
    console.log("[Webhook] REJECTED: Partner not found:", partnerName);
    return res.status(404).json({ message: "Partner not found" });
  }
  console.log("[Webhook] Partner found:", { id: partner.id, name: partner.name, isActive: partner.isActive });

  if (!partner.isActive) {
    console.log("[Webhook] REJECTED: Partner is inactive");
    return res.status(403).json({ message: "Partner is inactive" });
  }

  if (partner.webhookSecret && signature && timestamp) {
    console.log("[Webhook] Validating HMAC signature...");
    const rawBody =
      typeof (req as any).rawBody === "object"
        ? Buffer.from((req as any).rawBody).toString("utf-8")
        : JSON.stringify(req.body);

    const isValid = validateHmacSignature(rawBody, timestamp, signature, partner.webhookSecret);
    console.log("[Webhook] HMAC validation result:", isValid);
    if (!isValid) {
      console.log("[Webhook] REJECTED: Invalid webhook signature");
      return res.status(401).json({ message: "Invalid webhook signature" });
    }
  } else {
    console.log("[Webhook] Skipping HMAC validation (no secret/signature)");
  }

  const parsed = webhookPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    console.log("[Webhook] REJECTED: Invalid payload:", JSON.stringify(parsed.error.flatten()));
    return res.status(400).json({ message: "Invalid payload", error: parsed.error.flatten() });
  }

  const payload = parsed.data;
  console.log("[Webhook] Parsed event:", payload.event, "| license_key:", payload.license_key?.slice(0, 8), "| tier:", payload.tier);

  if (payload.event === "test" || payload.test) {
    console.log("[Webhook] Test event — acknowledging");
    return res.json({ event: "test", success: true });
  }

  const webhookData = req.body as Record<string, unknown>;

  switch (payload.event) {
    case "purchase": {
      console.log("[Webhook:purchase] ─── Processing purchase event ───");
      if (!payload.license_key || payload.tier === undefined) {
        console.log("[Webhook:purchase] REJECTED: Missing license_key or tier");
        return res.status(400).json({ message: "license_key and tier required for purchase" });
      }
      console.log("[Webhook:purchase] Key:", payload.license_key.slice(0, 8) + "...", "| Tier:", payload.tier);
      await storage.handlePurchaseEvent(partner.id, payload.license_key, payload.tier, webhookData);
      console.log("[Webhook:purchase] SUCCESS — license stored in DB");
      return res.json({ event: "purchase", success: true });
    }

    case "activate": {
      console.log("[Webhook:activate] ─── Processing activate event ───");
      if (!payload.license_key) {
        console.log("[Webhook:activate] REJECTED: Missing license_key");
        return res.status(400).json({ message: "license_key required for activate" });
      }
      console.log("[Webhook:activate] Key:", payload.license_key.slice(0, 8) + "...");
      await storage.handleActivateEvent(partner.id, payload.license_key, webhookData);
      console.log("[Webhook:activate] SUCCESS — license activated");
      return res.json({ event: "activate", success: true });
    }

    case "upgrade": {
      console.log("[Webhook:upgrade] ─── Processing upgrade event ───");
      // AppSumo sends: license_key = new key, prev_license_key = old key, tier = new tier
      const upgradeNewKey = payload.license_key ?? payload.new_license_key;
      const upgradeNewTier = payload.tier ?? payload.new_tier;
      if (!payload.prev_license_key || !upgradeNewKey || upgradeNewTier === undefined) {
        console.log("[Webhook:upgrade] REJECTED: Missing fields. prev_license_key:", payload.prev_license_key, "newKey:", upgradeNewKey, "newTier:", upgradeNewTier);
        return res.status(400).json({
          message: "prev_license_key, license_key, and tier required for upgrade",
        });
      }
      console.log("[Webhook:upgrade] Prev key:", payload.prev_license_key.slice(0, 8) + "...", "| New key:", upgradeNewKey.slice(0, 8) + "...", "| New tier:", upgradeNewTier);

      // Fetch Heimdall data from the old key BEFORE updating it
      const upgradePrevLicense = await storage.getLicenseByKey(payload.prev_license_key);
      console.log("[Webhook:upgrade] Previous license Heimdall data:", {
        heimdallWorkspaceId: upgradePrevLicense?.heimdallWorkspaceId,
        heimdallUserId: upgradePrevLicense?.heimdallUserId,
        redeemerEmail: upgradePrevLicense?.redeemerEmail,
      });

      await storage.handleUpgradeEvent(
        partner.id,
        payload.prev_license_key,
        upgradeNewKey,
        upgradeNewTier,
        webhookData
      );
      console.log("[Webhook:upgrade] Local DB updated");

      // Sync plan change to Heimdall
      let heimdallSyncSuccess = false;
      if (upgradePrevLicense?.heimdallWorkspaceId && upgradePrevLicense?.redeemerEmail) {
        try {
          console.log("[Webhook:upgrade] Syncing plan change to Heimdall...");
          await updateWorkspacePlanForUser(
            upgradePrevLicense.heimdallWorkspaceId,
            upgradeNewTier,
            upgradeNewKey,
            upgradePrevLicense.redeemerEmail
          );
          console.log("[Webhook:upgrade] Heimdall plan sync SUCCESS");
          heimdallSyncSuccess = true;
        } catch (err) {
          console.error("[Webhook:upgrade] Heimdall sync FAILED:", err);
          // Return 500 so AppSumo retries the webhook
          return res.status(500).json({
            event: "upgrade",
            success: false,
            message: "Local DB updated but Heimdall plan sync failed — please retry",
          });
        }
      } else {
        console.log("[Webhook:upgrade] No Heimdall workspace or redeemer email on previous key — skipping sync (user may not have redeemed yet)");
        heimdallSyncSuccess = true; // Nothing to sync is not a failure
      }

      return res.json({ event: "upgrade", success: true, heimdallSynced: heimdallSyncSuccess });
    }

    case "downgrade": {
      console.log("[Webhook:downgrade] ─── Processing downgrade event ───");
      // AppSumo sends: license_key = new key, prev_license_key = old key, tier = new tier
      const downgradeNewKey = payload.license_key ?? payload.new_license_key;
      const downgradeNewTier = payload.tier ?? payload.new_tier;
      if (!payload.prev_license_key || !downgradeNewKey || downgradeNewTier === undefined) {
        console.log("[Webhook:downgrade] REJECTED: Missing fields. prev_license_key:", payload.prev_license_key, "newKey:", downgradeNewKey, "newTier:", downgradeNewTier);
        return res.status(400).json({
          message: "prev_license_key, license_key, and tier required for downgrade",
        });
      }
      console.log("[Webhook:downgrade] Prev key:", payload.prev_license_key.slice(0, 8) + "...", "| New key:", downgradeNewKey.slice(0, 8) + "...", "| New tier:", downgradeNewTier);

      // Fetch Heimdall data from the old key BEFORE updating it
      const downgradePrevLicense = await storage.getLicenseByKey(payload.prev_license_key);
      console.log("[Webhook:downgrade] Previous license Heimdall data:", {
        heimdallWorkspaceId: downgradePrevLicense?.heimdallWorkspaceId,
        heimdallUserId: downgradePrevLicense?.heimdallUserId,
        redeemerEmail: downgradePrevLicense?.redeemerEmail,
      });

      await storage.handleDowngradeEvent(
        partner.id,
        payload.prev_license_key,
        downgradeNewKey,
        downgradeNewTier,
        webhookData
      );
      console.log("[Webhook:downgrade] Local DB updated");

      // Sync plan change to Heimdall
      let downgradeSyncSuccess = false;
      if (downgradePrevLicense?.heimdallWorkspaceId && downgradePrevLicense?.redeemerEmail) {
        try {
          console.log("[Webhook:downgrade] Syncing plan change to Heimdall...");
          await updateWorkspacePlanForUser(
            downgradePrevLicense.heimdallWorkspaceId,
            downgradeNewTier,
            downgradeNewKey,
            downgradePrevLicense.redeemerEmail
          );
          console.log("[Webhook:downgrade] Heimdall plan sync SUCCESS");
          downgradeSyncSuccess = true;
        } catch (err) {
          console.error("[Webhook:downgrade] Heimdall sync FAILED:", err);
          // Return 500 so AppSumo retries the webhook
          return res.status(500).json({
            event: "downgrade",
            success: false,
            message: "Local DB updated but Heimdall plan sync failed — please retry",
          });
        }
      } else {
        console.log("[Webhook:downgrade] No Heimdall workspace or redeemer email on previous key — skipping sync (user may not have redeemed yet)");
        downgradeSyncSuccess = true; // Nothing to sync is not a failure
      }

      return res.json({ event: "downgrade", success: true, heimdallSynced: downgradeSyncSuccess });
    }

    case "deactivate": {
      console.log("[Webhook:deactivate] ─── Processing deactivate event ───");
      if (!payload.license_key) {
        console.log("[Webhook:deactivate] REJECTED: Missing license_key");
        return res.status(400).json({ message: "license_key required for deactivate" });
      }
      console.log("[Webhook:deactivate] Key:", payload.license_key.slice(0, 8) + "...");
      await storage.handleDeactivateEvent(partner.id, payload.license_key, webhookData);
      console.log("[Webhook:deactivate] Local DB updated — license deactivated");

      // Move user to free plan on Heimdall
      // Fetch the license data AFTER deactivation (Heimdall fields are preserved)
      const deactivatedLicense = await storage.getLicenseByKey(payload.license_key);
      console.log("[Webhook:deactivate] License Heimdall data:", {
        heimdallWorkspaceId: deactivatedLicense?.heimdallWorkspaceId,
        redeemerEmail: deactivatedLicense?.redeemerEmail,
      });

      if (deactivatedLicense?.heimdallWorkspaceId && deactivatedLicense?.redeemerEmail) {
        try {
          const restorePlanId = deactivatedLicense.previousPlanId || null;
          const restorePlanType = deactivatedLicense.previousPlanType || "FREEMIUM";
          console.log("[Webhook:deactivate] Restoring workspace to previous plan:", { restorePlanId, restorePlanType });
          const { token } = await addHeimdallUser(deactivatedLicense.redeemerEmail, "", "");

          const heimdallUrl = `${process.env.HEIMDALL_API_URL || "https://heimdallapi.tinycommand.com"}/service/v0/workspace/add`;
          const heimdallRes = await fetch(heimdallUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", token },
            body: JSON.stringify({
              _id: deactivatedLicense.heimdallWorkspaceId,
              type: restorePlanType,
              plan_id: restorePlanId,
              license_code: null,
              license_provider: null,
            }),
          });

          const heimdallData = (await heimdallRes.json()) as Record<string, unknown>;
          console.log("[Webhook:deactivate] Heimdall response:", JSON.stringify(heimdallData).slice(0, 300));

          if (heimdallData.status === "success") {
            console.log("[Webhook:deactivate] Workspace moved to free plan SUCCESS");
          } else {
            console.error("[Webhook:deactivate] Heimdall returned status:failed:", JSON.stringify(heimdallData));
            return res.status(500).json({
              event: "deactivate",
              success: false,
              message: "Local DB updated but Heimdall plan restore failed — please retry",
            });
          }
        } catch (err) {
          console.error("[Webhook:deactivate] Heimdall free plan sync FAILED:", err);
          return res.status(500).json({
            event: "deactivate",
            success: false,
            message: "Local DB updated but Heimdall plan restore failed — please retry",
          });
        }
      } else {
        console.log("[Webhook:deactivate] No Heimdall workspace ID or redeemer email — skipping (user may not have redeemed)");
      }

      return res.json({ event: "deactivate", success: true });
    }

    case "migrate": {
      console.log("[Webhook:migrate] ─── Processing migrate event ───");
      console.log("[Webhook:migrate] Full payload:", JSON.stringify(webhookData));
      return res.json({ event: "migrate", success: true });
    }

    default:
      console.log("[Webhook] REJECTED: Unknown event:", payload.event);
      return res.status(400).json({ message: `Unknown event: ${payload.event}` });
  }
});

export default router;
