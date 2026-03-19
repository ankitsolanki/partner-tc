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
  console.log("[OAuth:authorize] ─── STEP 1: Starting AppSumo OAuth ───");
  console.log("[OAuth:authorize] APP_BASE_URL:", process.env.APP_BASE_URL);
  console.log("[OAuth:authorize] Callback URI:", appsumoCallbackUri());

  const clientId = process.env.APPSUMO_CLIENT_ID;
  if (!clientId) {
    console.error("[OAuth:authorize] APPSUMO_CLIENT_ID not configured");
    return res.status(500).json({ message: "APPSUMO_CLIENT_ID env var not configured" });
  }

  const state = randomBytes(24).toString("hex");
  req.session.oauthState = state;
  console.log("[OAuth:authorize] Generated state:", state.slice(0, 12) + "...");

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: appsumoCallbackUri(),
    state,
  });

  const redirectUrl = `${APPSUMO_AUTHORIZE_URL}?${params.toString()}`;
  console.log("[OAuth:authorize] Redirecting to AppSumo:", redirectUrl.slice(0, 80) + "...");
  return res.redirect(redirectUrl);
});

// ─── 2. AppSumo callback → exchange code → fetch license → redirect to signup
router.get("/partner/callback", async (req, res) => {
  console.log("[OAuth:callback] ─── STEP 2: AppSumo callback received ───");
  console.log("[OAuth:callback] Full query params:", JSON.stringify(req.query));
  console.log("[OAuth:callback] Headers host:", req.headers.host);
  console.log("[OAuth:callback] Original URL:", req.originalUrl);

  const { code, error, partner } = req.query;

  if (error) {
    console.error("[OAuth:callback] Provider returned error:", error);
    return res.status(400).json({ message: `AppSumo OAuth error: ${error}` });
  }

  // Health checks and URL validation from AppSumo hit this endpoint with no code.
  if (!code) {
    console.log("[OAuth:callback] No code in request. Partner:", partner);
    if (String(partner ?? "").toLowerCase() === "appsumo") {
      console.log("[OAuth:callback] Responding with health check OK");
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ message: "Missing authorization code" });
  }

  const clientId = process.env.APPSUMO_CLIENT_ID;
  const clientSecret = process.env.APPSUMO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("[OAuth:callback] Missing APPSUMO_CLIENT_ID or APPSUMO_CLIENT_SECRET");
    return res.status(500).json({ message: "AppSumo credentials not configured on server" });
  }

  try {
    // Step 1 — Exchange code for access token
    console.log("[OAuth:callback] Exchanging code for access token...");
    console.log("[OAuth:callback] Token URL:", APPSUMO_TOKEN_URL);
    console.log("[OAuth:callback] Code:", (code as string).slice(0, 12) + "...");

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

    console.log("[OAuth:callback] Token response status:", tokenRes.status);

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("[OAuth:callback] Token exchange failed:", tokenRes.status, body);
      return res.status(400).json({ message: "Failed to exchange authorization code with AppSumo" });
    }

    const tokenData = (await tokenRes.json()) as Record<string, unknown>;
    console.log("[OAuth:callback] Token response keys:", Object.keys(tokenData));

    if (tokenData.error) {
      console.error("[OAuth:callback] Token error:", tokenData.error, tokenData.error_description);
      return res.status(400).json({ message: `AppSumo token error: ${tokenData.error}` });
    }

    const accessToken = tokenData.access_token as string;
    if (!accessToken) {
      console.error("[OAuth:callback] No access_token in response:", tokenData);
      return res.status(400).json({ message: "No access token received from AppSumo" });
    }

    console.log("[OAuth:callback] Got access token:", accessToken.slice(0, 12) + "...");

    // Step 2 — Fetch license key
    console.log("[OAuth:callback] Fetching license key from AppSumo...");
    const licenseParams = new URLSearchParams({ access_token: accessToken });
    const licenseRes = await fetch(`${APPSUMO_LICENSE_URL}?${licenseParams.toString()}`);

    console.log("[OAuth:callback] License response status:", licenseRes.status);

    if (!licenseRes.ok) {
      const body = await licenseRes.text();
      console.error("[OAuth:callback] License fetch failed:", licenseRes.status, body);
      return res.status(400).json({ message: "Failed to fetch license key from AppSumo" });
    }

    const licenseData = (await licenseRes.json()) as Record<string, unknown>;
    console.log("[OAuth:callback] License response:", JSON.stringify(licenseData));

    const licenseKey = licenseData.license_key as string;
    if (!licenseKey) {
      console.error("[OAuth:callback] No license_key in response:", licenseData);
      return res.status(400).json({ message: "No license key returned by AppSumo" });
    }

    // Step 3 — Store license key in session and redirect to signup page
    req.session.pendingLicenseKey = licenseKey;
    console.log("[OAuth:callback] License stored in session:", licenseKey.slice(0, 8) + "...");
    console.log("[OAuth:callback] Session ID:", req.session.id);
    console.log("[OAuth:callback] ─── Redirecting to /redeem/signup (relative) ───");
    console.log("[OAuth:callback] NOTE: This is a RELATIVE redirect — stays on same host");

    return res.redirect("/redeem/signup");
  } catch (err) {
    console.error("[OAuth:callback] Unexpected error:", err);
    return res.status(500).json({ message: "OAuth processing failed unexpectedly" });
  }
});

export default router;
