import { Router } from "express";
import { validateHmacSignature } from "../utils/crypto";
import { storage } from "../storage";
import { updateWorkspacePlanForUser, addHeimdallUser, findHeimdallUser } from "../services/heimdall";
import { updateAddOnCredits, cancelSubscription } from "../services/track";
import { z } from "zod";
import { log, verbose, error } from "../utils/logger";

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
  // Add-on / extended fields from AppSumo
  unit_quantity: z.number().optional(),
  partner_plan_name: z.string().optional(),
  license_status: z.string().optional(),
  extra: z.record(z.unknown()).optional(),
  event_timestamp: z.number().optional(),
  created_at: z.number().optional(),
});

router.post("/partner", async (req, res) => {
  log("Webhook", "POST /api/webhooks/partner");
  verbose("Webhook", "Full request body:", JSON.stringify(req.body));
  verbose("Webhook", "Headers:", JSON.stringify({
    "x-webhook-signature": req.headers["x-webhook-signature"] ? "present" : "missing",
    "x-webhook-timestamp": req.headers["x-webhook-timestamp"],
    "x-partner-name": req.headers["x-partner-name"],
    "content-type": req.headers["content-type"],
  }));
  verbose("Webhook", "Query params:", JSON.stringify(req.query));

  const signature = req.headers["x-webhook-signature"] as string | undefined;
  const timestamp = req.headers["x-webhook-timestamp"] as string | undefined;
  const partnerNameQuery = req.query.name as string | undefined;
  const partnerNameHeader = req.headers["x-partner-name"] as string | undefined;
  const partnerName = partnerNameQuery ?? partnerNameHeader;

  if (!partnerName) {
    error("Webhook", "REJECTED: No partner name provided");
    return res
      .status(400)
      .json({ message: "Missing partner name. Provide ?name=appsumo or x-partner-name header." });
  }

  verbose("Webhook", "Partner name:", partnerName);
  const partner = await storage.getPartner(partnerName);
  if (!partner) {
    error("Webhook", "REJECTED: Partner not found:", partnerName);
    return res.status(404).json({ message: "Partner not found" });
  }
  verbose("Webhook", "Partner found:", { id: partner.id, name: partner.name, isActive: partner.isActive });

  if (!partner.isActive) {
    error("Webhook", "REJECTED: Partner is inactive");
    return res.status(403).json({ message: "Partner is inactive" });
  }

  if (partner.webhookSecret && signature && timestamp) {
    verbose("Webhook", "Validating HMAC signature...");
    const rawBody =
      typeof (req as any).rawBody === "object"
        ? Buffer.from((req as any).rawBody).toString("utf-8")
        : JSON.stringify(req.body);

    const isValid = validateHmacSignature(rawBody, timestamp, signature, partner.webhookSecret);
    verbose("Webhook", "HMAC validation result:", isValid);
    if (!isValid) {
      error("Webhook", "REJECTED: Invalid webhook signature");
      return res.status(401).json({ message: "Invalid webhook signature" });
    }
  } else {
    verbose("Webhook", "Skipping HMAC validation (no secret/signature)");
  }

  const parsed = webhookPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    error("Webhook", "REJECTED: Invalid payload:", JSON.stringify(parsed.error.flatten()));
    return res.status(400).json({ message: "Invalid payload", error: parsed.error.flatten() });
  }

  const payload = parsed.data;
  log("Webhook", `Received event: ${payload.event} | license_key: ${payload.license_key?.slice(0, 8) ?? "N/A"} | tier: ${payload.tier ?? "N/A"}`);
  verbose("Webhook", "Add-on fields:", {
    unit_quantity: payload.unit_quantity ?? "NOT_SENT",
    partner_plan_name: payload.partner_plan_name ?? "NOT_SENT",
    license_status: payload.license_status ?? "NOT_SENT",
    extra: payload.extra ?? "NOT_SENT",
    prev_license_key: payload.prev_license_key?.slice(0, 8) ?? "NOT_SENT",
  });

  if (payload.event === "test" || payload.test) {
    log("Webhook", "Test event — acknowledging");
    return res.json({ event: "test", success: true });
  }

  const webhookData = req.body as Record<string, unknown>;

  switch (payload.event) {
    case "purchase": {
      log("Webhook:purchase", "Processing purchase event");
      if (!payload.license_key || payload.tier === undefined) {
        error("Webhook:purchase", "REJECTED: Missing license_key or tier");
        return res.status(400).json({ message: "license_key and tier required for purchase" });
      }
      log("Webhook:purchase", `Key: ${payload.license_key.slice(0, 8)}... | Tier: ${payload.tier}`);
      await storage.handlePurchaseEvent(partner.id, payload.license_key, payload.tier, webhookData);
      log("Webhook:purchase", "SUCCESS — license stored in DB");
      return res.json({ event: "purchase", success: true });
    }

    case "activate": {
      log("Webhook:activate", "Processing activate event");
      if (!payload.license_key) {
        error("Webhook:activate", "REJECTED: Missing license_key");
        return res.status(400).json({ message: "license_key required for activate" });
      }
      log("Webhook:activate", `Key: ${payload.license_key.slice(0, 8)}...`);
      await storage.handleActivateEvent(partner.id, payload.license_key, webhookData);
      log("Webhook:activate", "SUCCESS — license activated");
      return res.json({ event: "activate", success: true });
    }

    case "upgrade": {
      log("Webhook:upgrade", "Processing upgrade event");
      // AppSumo sends: license_key = new key, prev_license_key = old key, tier = new tier
      const upgradeNewKey = payload.license_key ?? payload.new_license_key;
      const upgradeNewTier = payload.tier ?? payload.new_tier;
      if (!payload.prev_license_key || !upgradeNewKey || upgradeNewTier === undefined) {
        error("Webhook:upgrade", "REJECTED: Missing fields", { prev_license_key: payload.prev_license_key, newKey: upgradeNewKey, newTier: upgradeNewTier });
        return res.status(400).json({
          message: "prev_license_key, license_key, and tier required for upgrade",
        });
      }
      log("Webhook:upgrade", `Prev key: ${payload.prev_license_key.slice(0, 8)}... | New key: ${upgradeNewKey.slice(0, 8)}... | New tier: ${upgradeNewTier}`);

      // Fetch Heimdall data from the old key BEFORE updating it
      const upgradePrevLicense = await storage.getLicenseByKey(payload.prev_license_key);
      verbose("Webhook:upgrade", "Previous license Heimdall data:", {
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
      log("Webhook:upgrade", "Local DB updated");

      const upgradeUnitQty = payload.unit_quantity ?? 0;
      verbose("Webhook:upgrade", `unit_quantity: ${upgradeUnitQty} | partner_plan_name: ${payload.partner_plan_name ?? "none"}`);

      // Sync plan change to Heimdall
      let heimdallSyncSuccess = false;
      if (upgradePrevLicense?.heimdallWorkspaceId && upgradePrevLicense?.redeemerEmail) {
        try {
          log("Webhook:upgrade", "Syncing plan change to Heimdall...");
          await updateWorkspacePlanForUser(
            upgradePrevLicense.heimdallWorkspaceId,
            upgradeNewTier,
            upgradeNewKey,
            upgradePrevLicense.redeemerEmail
          );
          log("Webhook:upgrade", "Heimdall plan sync SUCCESS");
          heimdallSyncSuccess = true;
        } catch (err) {
          error("Webhook:upgrade", "Heimdall sync FAILED:", err);
          // Return 500 so AppSumo retries the webhook
          return res.status(500).json({
            event: "upgrade",
            success: false,
            message: "Local DB updated but Heimdall plan sync failed — please retry",
          });
        }
      } else {
        log("Webhook:upgrade", "No Heimdall workspace or redeemer email on previous key — skipping sync (user may not have redeemed yet)");
        heimdallSyncSuccess = true; // Nothing to sync is not a failure
      }

      // Update monthly credit allowance if unit_quantity > 0 (add-on purchase)
      let creditsUpdated = false;
      if (upgradeUnitQty > 0 && upgradePrevLicense?.heimdallWorkspaceId) {
        try {
          log("Webhook:upgrade", "Add-on detected — updating monthly credit allowance...");
          await updateAddOnCredits(
            upgradePrevLicense.heimdallWorkspaceId,
            upgradeUnitQty,
            upgradeNewTier
          );
          creditsUpdated = true;
          log("Webhook:upgrade", "Monthly credit allowance updated successfully");
        } catch (err) {
          error("Webhook:upgrade", "Credit allowance update FAILED (non-blocking):", err);
          // Don't return 500 for credit failures — the plan upgrade succeeded.
          // Credits can be manually reconciled.
        }
      } else if (upgradeUnitQty > 0) {
        log("Webhook:upgrade", "Add-on detected but no workspace ID — cannot update credits");
      }

      return res.json({ event: "upgrade", success: true, heimdallSynced: heimdallSyncSuccess, creditsUpdated });
    }

    case "downgrade": {
      log("Webhook:downgrade", "Processing downgrade event");
      // AppSumo sends: license_key = new key, prev_license_key = old key, tier = new tier
      const downgradeNewKey = payload.license_key ?? payload.new_license_key;
      const downgradeNewTier = payload.tier ?? payload.new_tier;
      if (!payload.prev_license_key || !downgradeNewKey || downgradeNewTier === undefined) {
        error("Webhook:downgrade", "REJECTED: Missing fields", { prev_license_key: payload.prev_license_key, newKey: downgradeNewKey, newTier: downgradeNewTier });
        return res.status(400).json({
          message: "prev_license_key, license_key, and tier required for downgrade",
        });
      }
      log("Webhook:downgrade", `Prev key: ${payload.prev_license_key.slice(0, 8)}... | New key: ${downgradeNewKey.slice(0, 8)}... | New tier: ${downgradeNewTier}`);

      // Fetch Heimdall data from the old key BEFORE updating it
      const downgradePrevLicense = await storage.getLicenseByKey(payload.prev_license_key);
      verbose("Webhook:downgrade", "Previous license Heimdall data:", {
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
      log("Webhook:downgrade", "Local DB updated");

      // Sync plan change to Heimdall
      let downgradeSyncSuccess = false;
      if (downgradePrevLicense?.heimdallWorkspaceId && downgradePrevLicense?.redeemerEmail) {
        try {
          log("Webhook:downgrade", "Syncing plan change to Heimdall...");
          await updateWorkspacePlanForUser(
            downgradePrevLicense.heimdallWorkspaceId,
            downgradeNewTier,
            downgradeNewKey,
            downgradePrevLicense.redeemerEmail
          );
          log("Webhook:downgrade", "Heimdall plan sync SUCCESS");
          downgradeSyncSuccess = true;
        } catch (err) {
          error("Webhook:downgrade", "Heimdall sync FAILED:", err);
          // Return 500 so AppSumo retries the webhook
          return res.status(500).json({
            event: "downgrade",
            success: false,
            message: "Local DB updated but Heimdall plan sync failed — please retry",
          });
        }
      } else {
        log("Webhook:downgrade", "No Heimdall workspace or redeemer email on previous key — skipping sync (user may not have redeemed yet)");
        downgradeSyncSuccess = true; // Nothing to sync is not a failure
      }

      return res.json({ event: "downgrade", success: true, heimdallSynced: downgradeSyncSuccess });
    }

    case "deactivate": {
      log("Webhook:deactivate", "Processing deactivate event");
      if (!payload.license_key) {
        error("Webhook:deactivate", "REJECTED: Missing license_key");
        return res.status(400).json({ message: "license_key required for deactivate" });
      }
      log("Webhook:deactivate", `Key: ${payload.license_key.slice(0, 8)}...`);

      // Check the license status BEFORE marking it deactivated
      // If the key was already "upgraded" or "downgraded", another key has taken over.
      // AppSumo sends deactivate for the OLD key after an upgrade — we should NOT
      // undo the upgrade by restoring to FREEMIUM.
      const licenseBeforeDeactivate = await storage.getLicenseByKey(payload.license_key);
      const statusBeforeDeactivate = licenseBeforeDeactivate?.status;
      const deactivateReason = (payload.extra as Record<string, unknown>)?.reason as string ?? "";
      log("Webhook:deactivate", `Status before deactivate: ${statusBeforeDeactivate ?? "NOT_IN_DB"} | Reason: ${deactivateReason}`);

      const wasUpgradedOrDowngraded = statusBeforeDeactivate === "upgraded" || statusBeforeDeactivate === "downgraded";
      if (wasUpgradedOrDowngraded) {
        log("Webhook:deactivate", `Key was already ${statusBeforeDeactivate} — another key has taken over. Skipping Heimdall restore and Track cancel.`);
      }

      await storage.handleDeactivateEvent(partner.id, payload.license_key, webhookData);
      log("Webhook:deactivate", "Local DB updated — license deactivated");

      // If the key was upgraded/downgraded, just update DB status and return.
      // Do NOT restore Heimdall or cancel subscription — the new key handles that.
      if (wasUpgradedOrDowngraded) {
        return res.json({ event: "deactivate", success: true, skippedRestore: true, reason: `Key was already ${statusBeforeDeactivate}` });
      }

      // Move user to free plan on Heimdall (only for actual refunds/cancellations)
      const deactivatedLicense = await storage.getLicenseByKey(payload.license_key);
      verbose("Webhook:deactivate", "License Heimdall data:", {
        heimdallWorkspaceId: deactivatedLicense?.heimdallWorkspaceId,
        redeemerEmail: deactivatedLicense?.redeemerEmail,
      });

      if (deactivatedLicense?.heimdallWorkspaceId && deactivatedLicense?.redeemerEmail) {
        try {
          const restorePlanId = deactivatedLicense.previousPlanId || null;
          const restorePlanType = deactivatedLicense.previousPlanType || "FREEMIUM";
          verbose("Webhook:deactivate", "Restoring workspace to previous plan:", { restorePlanId, restorePlanType });

          // Fetch existing user to get their real name before calling user/add
          const deactivateUser = await findHeimdallUser(deactivatedLicense.redeemerEmail);
          const { token } = await addHeimdallUser(
            deactivatedLicense.redeemerEmail,
            deactivateUser?.firstName || "",
            deactivateUser?.lastName || ""
          );

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
          verbose("Webhook:deactivate", "Heimdall response:", JSON.stringify(heimdallData).slice(0, 300));

          if (heimdallData.status === "success") {
            log("Webhook:deactivate", "Workspace moved to free plan SUCCESS");
          } else {
            error("Webhook:deactivate", "Heimdall returned status:failed:", JSON.stringify(heimdallData));
            return res.status(500).json({
              event: "deactivate",
              success: false,
              message: "Local DB updated but Heimdall plan restore failed — please retry",
            });
          }
        } catch (err) {
          error("Webhook:deactivate", "Heimdall free plan sync FAILED:", err);
          return res.status(500).json({
            event: "deactivate",
            success: false,
            message: "Local DB updated but Heimdall plan restore failed — please retry",
          });
        }
      } else {
        log("Webhook:deactivate", "No Heimdall workspace ID or redeemer email — skipping Heimdall restore (user may not have redeemed)");
      }

      // Cancel subscription in tiny-track so monthly credit grants stop
      let subscriptionCancelled = false;
      if (deactivatedLicense?.heimdallWorkspaceId) {
        try {
          log("Webhook:deactivate", `Cancelling tiny-track subscription for workspace: ${deactivatedLicense.heimdallWorkspaceId}`);
          await cancelSubscription(
            deactivatedLicense.heimdallWorkspaceId,
            `AppSumo license deactivated/refunded (license_key: ${payload.license_key})`
          );
          subscriptionCancelled = true;
          log("Webhook:deactivate", "Tiny-track subscription cancelled successfully");
        } catch (err) {
          error("Webhook:deactivate", "Tiny-track subscription cancel FAILED (non-blocking):", err);
          // Non-blocking — Heimdall plan already restored. Subscription can be manually cancelled.
        }
      } else {
        log("Webhook:deactivate", "No workspace ID — skipping tiny-track subscription cancel");
      }

      return res.json({ event: "deactivate", success: true, subscriptionCancelled });
    }

    case "migrate": {
      log("Webhook:migrate", "Processing migrate event");
      verbose("Webhook:migrate", "Full payload:", JSON.stringify(webhookData));
      return res.json({ event: "migrate", success: true });
    }

    default:
      error("Webhook", "REJECTED: Unknown event:", payload.event);
      return res.status(400).json({ message: `Unknown event: ${payload.event}` });
  }
});

export default router;
