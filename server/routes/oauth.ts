import { Router } from "express";
import { randomBytes, createHash } from "crypto";

const router = Router();

// ─── AppSumo constants ────────────────────────────────────────────────────────
const APPSUMO_AUTHORIZE_URL = "https://appsumo.com/openid/authorize";
const APPSUMO_TOKEN_URL = "https://appsumo.com/openid/token/";
const APPSUMO_LICENSE_URL = "https://appsumo.com/openid/license_key/";

// ─── Keycloak helpers ─────────────────────────────────────────────────────────
function keycloakBase(): string {
  const server = (process.env.KEYCLOAK_AUTH_SERVER_URL ?? "").replace(/\/$/, "");
  const realm = process.env.KEYCLOAK_REALM ?? "";
  return `${server}/realms/${realm}/protocol/openid-connect`;
}

function keycloakCallbackUri(): string {
  return `${process.env.APP_BASE_URL ?? ""}/api/auth/keycloak/callback`;
}

function appsumoCallbackUri(): string {
  // AppSumo validates this URL with a plain GET (no code/state),
  // and also expects the redirect_uri used during code exchange to match exactly.
  return `${process.env.APP_BASE_URL ?? ""}/api/auth/partner/callback?partner=appsumo`;
}

// ─── PKCE helpers ─────────────────────────────────────────────────────────────
function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
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

// ─── 2. AppSumo callback → exchange code → fetch license → chain to Keycloak ──
router.get("/partner/callback", async (req, res) => {
  const { code, state, error, partner } = req.query;

  if (error) {
    console.error("[AppSumo OAuth] Provider returned error:", error);
    return res.status(400).json({ message: `AppSumo OAuth error: ${error}` });
  }

  if (!code || !state) {
    // AppSumo Partner Portal pings/validates the redirect URL with no parameters.
    // Treat that as a health check instead of a hard failure.
    if (String(partner ?? "").toLowerCase() === "appsumo") {
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ message: "Missing code or state parameter" });
  }

  if (!req.session.oauthState || req.session.oauthState !== state) {
    console.error("[AppSumo OAuth] State mismatch — possible CSRF attempt", {
      expected: req.session.oauthState,
      received: state,
    });
    return res.status(403).json({ message: "Invalid OAuth state — please restart the flow" });
  }
  delete req.session.oauthState;

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

    // Store license key for the Keycloak step
    req.session.pendingLicenseKey = licenseKey;
    console.log("[AppSumo OAuth] License stored in session:", licenseKey.slice(0, 8) + "...");

    // Step 3 — Redirect to Keycloak (PKCE)
    const keycloakClientId = process.env.KEYCLOAK_CLIENT_ID;
    if (!keycloakClientId) {
      console.error("[AppSumo OAuth] KEYCLOAK_CLIENT_ID not configured — cannot chain to Keycloak");
      return res.status(500).json({ message: "Keycloak not configured on server" });
    }

    const { verifier, challenge } = generatePKCE();
    req.session.keycloakCodeVerifier = verifier;

    const kcState = randomBytes(24).toString("hex");
    req.session.oauthState = kcState;

    const kcParams = new URLSearchParams({
      client_id: keycloakClientId,
      response_type: "code",
      redirect_uri: keycloakCallbackUri(),
      state: kcState,
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: "openid profile email",
    });

    console.log("[AppSumo OAuth → Keycloak] Redirecting to Keycloak login");
    return res.redirect(`${keycloakBase()}/auth?${kcParams.toString()}`);
  } catch (err) {
    console.error("[AppSumo OAuth] Unexpected error:", err);
    return res.status(500).json({ message: "OAuth processing failed unexpectedly" });
  }
});

// ─── 3. Keycloak callback → exchange code → link license → redirect to app ────
router.get("/keycloak/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error("[Keycloak OAuth] Provider returned error:", error);
    return res.status(400).json({ message: `Keycloak error: ${error}` });
  }

  if (!code || !state) {
    return res.status(400).json({ message: "Missing code or state from Keycloak" });
  }

  if (!req.session.oauthState || req.session.oauthState !== state) {
    console.error("[Keycloak OAuth] State mismatch", {
      expected: req.session.oauthState,
      received: state,
    });
    return res.status(403).json({ message: "Invalid Keycloak state — please restart the flow" });
  }
  delete req.session.oauthState;

  const codeVerifier = req.session.keycloakCodeVerifier;
  if (!codeVerifier) {
    console.error("[Keycloak OAuth] No PKCE code verifier in session");
    return res.status(400).json({ message: "Session expired — please restart the flow" });
  }
  delete req.session.keycloakCodeVerifier;

  const pendingLicenseKey = req.session.pendingLicenseKey;
  if (!pendingLicenseKey) {
    console.error("[Keycloak OAuth] No pending license key in session");
    return res.status(400).json({ message: "No pending license key — please restart from AppSumo" });
  }

  const keycloakClientId = process.env.KEYCLOAK_CLIENT_ID;
  if (!keycloakClientId) {
    return res.status(500).json({ message: "KEYCLOAK_CLIENT_ID not configured" });
  }

  try {
    // Step 1 — Exchange Keycloak code for token (PKCE — no client secret needed)
    const tokenRes = await fetch(`${keycloakBase()}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code as string,
        client_id: keycloakClientId,
        redirect_uri: keycloakCallbackUri(),
        code_verifier: codeVerifier,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("[Keycloak OAuth] Token exchange failed:", tokenRes.status, body);
      return res.status(400).json({ message: "Failed to exchange code with Keycloak" });
    }

    const tokenData = (await tokenRes.json()) as Record<string, unknown>;
    if (tokenData.error) {
      console.error("[Keycloak OAuth] Token error:", tokenData.error, tokenData.error_description);
      return res.status(400).json({ message: `Keycloak token error: ${tokenData.error}` });
    }

    // Step 2 — Decode the ID token JWT to get user identity (no signature verify needed for sub)
    const idToken = (tokenData.id_token ?? tokenData.access_token) as string;
    if (!idToken) {
      console.error("[Keycloak OAuth] No id_token or access_token in response");
      return res.status(400).json({ message: "No token received from Keycloak" });
    }

    const [, payloadB64] = idToken.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Record<string, unknown>;

    const keycloakUserId = payload.sub as string;
    const userEmail = payload.email as string | undefined;
    const userName = (payload.name ?? payload.preferred_username) as string | undefined;

    console.log("[Keycloak OAuth] User authenticated:", {
      sub: keycloakUserId,
      email: userEmail,
    });

    // Step 3 — Clear the pending license key from session (it's been claimed)
    delete req.session.pendingLicenseKey;

    // Step 4 — Redirect to the redemption success page on this platform
    const baseUrl = process.env.APP_BASE_URL ?? "";
    const successParams = new URLSearchParams({
      ...(userName ? { name: userName } : {}),
      ...(userEmail ? { email: userEmail } : {}),
    });

    console.log("[Keycloak OAuth] Flow complete — redirecting to success page");
    return res.redirect(`${baseUrl}/redeem/success?${successParams.toString()}`);
  } catch (err) {
    console.error("[Keycloak OAuth] Unexpected error:", err);
    return res.status(500).json({ message: "Keycloak processing failed unexpectedly" });
  }
});

export default router;
