import { Router } from "express";
import { storage } from "../storage";

const router = Router();

router.get("/partner/callback", async (req, res) => {
  const { code, partner } = req.query;

  if (!code || !partner) {
    return res.status(400).json({ message: "Missing code or partner parameter" });
  }

  const partnerName = partner as string;
  const partnerRecord = await storage.getPartner(partnerName);

  if (!partnerRecord) {
    return res.status(404).json({ message: "Partner not found" });
  }

  if (!partnerRecord.oauthClientId || !partnerRecord.oauthClientSecret) {
    return res.status(400).json({ message: "Partner OAuth not configured" });
  }

  try {
    const tokenResponse = await fetch(`https://${partnerName}.com/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        client_id: partnerRecord.oauthClientId,
        client_secret: partnerRecord.oauthClientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      return res.status(400).json({ message: "Failed to exchange authorization code" });
    }

    const tokenData = (await tokenResponse.json()) as Record<string, unknown>;
    const accessToken = tokenData.access_token as string;

    const licenseResponse = await fetch(`https://${partnerName}.com/api/license`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!licenseResponse.ok) {
      return res.status(400).json({ message: "Failed to fetch license information" });
    }

    const licenseData = (await licenseResponse.json()) as Record<string, unknown>;
    const licenseKey = licenseData.license_key as string;

    if (licenseKey) {
      req.session.pendingLicenseKey = licenseKey;
    }

    return res.redirect("/onboarding");
  } catch (error) {
    console.error("OAuth callback error:", error);
    return res.status(500).json({ message: "OAuth processing failed" });
  }
});

export default router;
