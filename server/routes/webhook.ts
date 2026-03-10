import { Router } from "express";
import { validateHmacSignature } from "../utils/crypto";
import { storage } from "../storage";
import { z } from "zod";

const router = Router();

const webhookPayloadSchema = z.object({
  event: z.enum(["purchase", "activate", "upgrade", "downgrade", "deactivate", "test"]),
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
  const signature = req.headers["x-webhook-signature"] as string | undefined;
  const timestamp = req.headers["x-webhook-timestamp"] as string | undefined;
  const partnerName = req.headers["x-partner-name"] as string | undefined;

  if (!partnerName) {
    return res.status(400).json({ message: "Missing x-partner-name header" });
  }

  const partner = await storage.getPartner(partnerName);
  if (!partner) {
    return res.status(404).json({ message: "Partner not found" });
  }

  if (!partner.isActive) {
    return res.status(403).json({ message: "Partner is inactive" });
  }

  if (partner.webhookSecret && signature && timestamp) {
    const rawBody =
      typeof (req as any).rawBody === "object"
        ? Buffer.from((req as any).rawBody).toString("utf-8")
        : JSON.stringify(req.body);

    const isValid = validateHmacSignature(rawBody, timestamp, signature, partner.webhookSecret);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid webhook signature" });
    }
  }

  const parsed = webhookPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", error: parsed.error.flatten() });
  }

  const payload = parsed.data;

  if (payload.event === "test" || payload.test) {
    return res.json({ event: "test", success: true });
  }

  const webhookData = req.body as Record<string, unknown>;

  switch (payload.event) {
    case "purchase": {
      if (!payload.license_key || payload.tier === undefined) {
        return res.status(400).json({ message: "license_key and tier required for purchase" });
      }
      await storage.handlePurchaseEvent(partner.id, payload.license_key, payload.tier, webhookData);
      return res.json({ event: "purchase", success: true });
    }

    case "activate": {
      if (!payload.license_key || !payload.user_id) {
        return res.status(400).json({ message: "license_key and user_id required for activate" });
      }
      await storage.handleActivateEvent(partner.id, payload.license_key, payload.user_id, webhookData);
      return res.json({ event: "activate", success: true });
    }

    case "upgrade": {
      if (!payload.prev_license_key || !payload.new_license_key || payload.new_tier === undefined) {
        return res.status(400).json({
          message: "prev_license_key, new_license_key, and new_tier required for upgrade",
        });
      }
      await storage.handleUpgradeEvent(
        partner.id,
        payload.prev_license_key,
        payload.new_license_key,
        payload.new_tier,
        webhookData
      );
      return res.json({ event: "upgrade", success: true });
    }

    case "downgrade": {
      if (!payload.prev_license_key || !payload.new_license_key || payload.new_tier === undefined) {
        return res.status(400).json({
          message: "prev_license_key, new_license_key, and new_tier required for downgrade",
        });
      }
      await storage.handleDowngradeEvent(
        partner.id,
        payload.prev_license_key,
        payload.new_license_key,
        payload.new_tier,
        webhookData
      );
      return res.json({ event: "downgrade", success: true });
    }

    case "deactivate": {
      if (!payload.license_key) {
        return res.status(400).json({ message: "license_key required for deactivate" });
      }
      await storage.handleDeactivateEvent(partner.id, payload.license_key, webhookData);
      return res.json({ event: "deactivate", success: true });
    }

    default:
      return res.status(400).json({ message: `Unknown event: ${payload.event}` });
  }
});

export default router;
