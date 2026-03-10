import { Router } from "express";
import { randomBytes } from "crypto";

const router = Router();

const APPSUMO_AUTHORIZE_URL = "https://appsumo.com/openid/authorize";
const APPSUMO_TOKEN_URL = "https://appsumo.com/openid/token/";
const APPSUMO_LICENSE_URL = "https://appsumo.com/openid/license_key/";

function getRedirectUri(): string {
  const base = process.env.APP_BASE_URL ?? "";
  return `${base}/api/auth/partner/callback`;
}

router.get("/partner/authorize", (req, res) => {
  const clientId = process.env.APPSUMO_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ message: "AppSumo client ID not configured" });
  }

  const state = randomBytes(24).toString("hex");
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: getRedirectUri(),
    state,
  });

  return res.redirect(`${APPSUMO_AUTHORIZE_URL}?${params.toString()}`);
});

router.get("/partner/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error("[AppSumo OAuth] Provider returned error:", error);
    return res.status(400).json({ message: `AppSumo OAuth error: ${error}` });
  }

  if (!code || !state) {
    return res.status(400).json({ message: "Missing code or state parameter" });
  }

  if (!req.session.oauthState || req.session.oauthState !== state) {
    console.error("[AppSumo OAuth] State mismatch — possible CSRF attempt", {
      expected: req.session.oauthState,
      received: state,
    });
    return res.status(403).json({ message: "Invalid OAuth state — please try again" });
  }

  delete req.session.oauthState;

  const clientId = process.env.APPSUMO_CLIENT_ID;
  const clientSecret = process.env.APPSUMO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[AppSumo OAuth] Missing APPSUMO_CLIENT_ID or APPSUMO_CLIENT_SECRET env vars");
    return res.status(500).json({ message: "AppSumo OAuth credentials not configured on server" });
  }

  try {
    // Step 1: Exchange authorization code for access token
    const tokenRes = await fetch(APPSUMO_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: code as string,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getRedirectUri(),
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("[AppSumo OAuth] Token exchange failed:", tokenRes.status, body);
      return res.status(400).json({ message: "Failed to exchange authorization code with AppSumo" });
    }

    const tokenData = (await tokenRes.json()) as Record<string, unknown>;

    if (tokenData.error) {
      console.error("[AppSumo OAuth] Token response error:", tokenData.error, tokenData.error_description);
      return res.status(400).json({ message: `AppSumo token error: ${tokenData.error}` });
    }

    const accessToken = tokenData.access_token as string;
    if (!accessToken) {
      console.error("[AppSumo OAuth] No access_token in response:", tokenData);
      return res.status(400).json({ message: "No access token received from AppSumo" });
    }

    // Step 2: Fetch license key using the access token
    const licenseParams = new URLSearchParams({ access_token: accessToken });
    const licenseRes = await fetch(`${APPSUMO_LICENSE_URL}?${licenseParams.toString()}`);

    if (!licenseRes.ok) {
      const body = await licenseRes.text();
      console.error("[AppSumo OAuth] License fetch failed:", licenseRes.status, body);
      return res.status(400).json({ message: "Failed to fetch license key from AppSumo" });
    }

    const licenseData = (await licenseRes.json()) as Record<string, unknown>;
    const licenseKey = licenseData.license_key as string;

    if (!licenseKey) {
      console.error("[AppSumo OAuth] No license_key in response:", licenseData);
      return res.status(400).json({ message: "No license key returned by AppSumo" });
    }

    // Store in session for the onboarding step
    req.session.pendingLicenseKey = licenseKey;

    console.log("[AppSumo OAuth] Success — license key stored in session:", licenseKey.slice(0, 8) + "...");

    // Return success — onboarding redirect will be added once that page is built
    return res.json({
      success: true,
      licenseKey,
      message: "AppSumo OAuth complete. License key stored in session.",
    });
  } catch (err) {
    console.error("[AppSumo OAuth] Unexpected error:", err);
    return res.status(500).json({ message: "OAuth processing failed unexpectedly" });
  }
});

export default router;
