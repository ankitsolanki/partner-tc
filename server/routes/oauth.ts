import { Router } from "express";
import { randomBytes } from "crypto";

const router = Router();

// ─── AppSumo constants ────────────────────────────────────────────────────────
const APPSUMO_AUTHORIZE_URL = "https://appsumo.com/openid/authorize";
const APPSUMO_TOKEN_URL = "https://appsumo.com/openid/token/";
const APPSUMO_LICENSE_URL = "https://appsumo.com/openid/license_key/";

function appsumoCallbackUri(): string {
  // AppSumo validates this URL with a plain GET (no code/state),
  // and also expects the redirect_uri used during code exchange to match exactly.
  return `${process.env.APP_BASE_URL ?? ""}/api/auth/partner/callback?partner=appsumo`;
}

// ─── 1. Start AppSumo OAuth ───────────────────────────────────────────────────
router.get("/partner/authorize", (req, res) => {
  const clientId = process.env.APPSUMO_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ message: "APPSUMO_CLIENT_ID env var not configured" });
  }

  const state = randomBytes(24).toString("hex");
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: appsumoCallbackUri(),
    state,
  });

  return res.redirect(`${APPSUMO_AUTHORIZE_URL}?${params.toString()}`);
});

// ─── 2. AppSumo callback → exchange code → fetch license → redirect to signup
router.get("/partner/callback", async (req, res) => {
  const { code, error, partner } = req.query;

  if (error) {
    console.error("[AppSumo OAuth] Provider returned error:", error);
    return res.status(400).json({ message: `AppSumo OAuth error: ${error}` });
  }

  // Health checks and URL validation from AppSumo hit this endpoint with no code.
  // Treat those as a simple liveness check and avoid running the OAuth flow.
  if (!code) {
    if (String(partner ?? "").toLowerCase() === "appsumo") {
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ message: "Missing authorization code" });
  }

  const clientId = process.env.APPSUMO_CLIENT_ID;
  const clientSecret = process.env.APPSUMO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("[AppSumo OAuth] Missing APPSUMO_CLIENT_ID or APPSUMO_CLIENT_SECRET");
    return res.status(500).json({ message: "AppSumo credentials not configured on server" });
  }

  try {
    // Step 1 — Exchange code for access token
    const tokenRes = await fetch(APPSUMO_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: code as string,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: appsumoCallbackUri(),
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("[AppSumo OAuth] Token exchange failed:", tokenRes.status, body);
      return res.status(400).json({ message: "Failed to exchange authorization code with AppSumo" });
    }

    const tokenData = (await tokenRes.json()) as Record<string, unknown>;
    if (tokenData.error) {
      console.error("[AppSumo OAuth] Token error:", tokenData.error, tokenData.error_description);
      return res.status(400).json({ message: `AppSumo token error: ${tokenData.error}` });
    }

    const accessToken = tokenData.access_token as string;
    if (!accessToken) {
      console.error("[AppSumo OAuth] No access_token in response:", tokenData);
      return res.status(400).json({ message: "No access token received from AppSumo" });
    }

    // Step 2 — Fetch license key
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

    // Step 3 — Store license key in session and redirect to signup page
    req.session.pendingLicenseKey = licenseKey;
    console.log("[AppSumo OAuth] License stored in session:", licenseKey.slice(0, 8) + "...");

    const baseUrl = process.env.APP_BASE_URL ?? "";
    console.log("[AppSumo OAuth] Redirecting to signup page");
    return res.redirect(`${baseUrl}/redeem/signup`);
  } catch (err) {
    console.error("[AppSumo OAuth] Unexpected error:", err);
    return res.status(500).json({ message: "OAuth processing failed unexpectedly" });
  }
});

export default router;
