import { log, verbose, error } from "../utils/logger";

const HEIMDALL_BASE = process.env.HEIMDALL_API_URL || "https://heimdallapi.tinycommand.com";

export const PLAN_ID_MAP: Record<number, string> = {
  1: "e602e61d-7eec-45f0-8a17-405173947090",
  2: "82480e8b-8b70-4939-bf0f-6b50b069bb88",
  3: "d80c78c8-1634-4548-9eab-88daf6dc225c",
  4: "737aaec7-380d-4279-8b49-16c651f10d17",
};

const PLAN_TYPE_MAP: Record<number, string> = {
  1: "appsumo_tier_1",
  2: "appsumo_tier_2",
  3: "appsumo_tier_3",
  4: "appsumo_tier_4",
};

export class HeimdallError extends Error {
  step: string;
  constructor(step: string, message: string) {
    super(message);
    this.name = "HeimdallError";
    this.step = step;
  }
}

export interface ProvisioningResult {
  heimdallUserId: string;
  heimdallWorkspaceId: string;
  isNewUser: boolean;
  previousPlanId: string | null;
  previousPlanType: string | null;
}

// ─── Step 1: Register user on Keycloak ────────────────────────────────────────
async function registerKeycloakUser(
  email: string,
  firstName: string,
  lastName: string,
  password: string
): Promise<{ alreadyExisted: boolean }> {
  const P = "Heimdall:1-register";
  const url = `${HEIMDALL_BASE}/service/public/v0/external/keycloak/admin/register-user`;

  log(P, "Registering user on Keycloak", email);
  verbose(P, "URL:", url);
  verbose(P, "Name:", `${firstName} ${lastName}`);

  const requestBody = {
    email,
    firstName,
    lastName,
    enabled: true,
    emailVerified: false,
    credentials: [
      {
        type: "password",
        value: password,
        temporary: false,
      },
    ],
  };
  verbose(P, "Request body (password redacted):", JSON.stringify({ ...requestBody, credentials: "[REDACTED]" }));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  verbose(P, "Response status:", res.status);

  if (res.status === 409) {
    log(P, "User already exists on Keycloak (HTTP 409) — continuing");
    return { alreadyExisted: true };
  }

  const responseBody = await res.text();
  verbose(P, "Response body:", responseBody);

  // Heimdall wraps errors in HTTP 200 with status:"failed"
  try {
    const parsed = JSON.parse(responseBody);
    if (parsed.status === "failed") {
      const errorMsg = parsed.result?.error?.errorMessage || parsed.result?.message || "";
      log(P, "Heimdall returned status:failed. Error:", errorMsg);
      if (errorMsg.toLowerCase().includes("user exists") || parsed.result?.error?.status_code === 409) {
        log(P, "User already exists (detected from response body) — continuing");
        return { alreadyExisted: true };
      }
      throw new HeimdallError("register", `Keycloak register failed: ${errorMsg}`);
    }
  } catch (e) {
    if (e instanceof HeimdallError) throw e;
    // Not JSON or parse error — continue
  }

  if (!res.ok) {
    error(P, "FAILED:", `${res.status} ${responseBody}`);
    throw new HeimdallError("register", `Failed to register user on Keycloak: ${res.status}`);
  }

  log(P, "SUCCESS — user created");
  return { alreadyExisted: false };
}

// ─── Step 2: Add/upsert user in Heimdall MongoDB ─────────────────────────────
export async function addHeimdallUser(
  email: string,
  firstName: string,
  lastName: string
): Promise<{ token: string; userId: string }> {
  const P = "Heimdall:2-addUser";
  const url = `${HEIMDALL_BASE}/service/v0/user/add`;

  log(P, "Adding user to Heimdall MongoDB", email);
  verbose(P, "URL:", url);

  // Heimdall's user/add service requires `name` to be truthy (validation check).
  // The User model's add method handles first_name/last_name smartly:
  //   - If first_name is falsy in body → preserves existing value from DB
  //   - If first_name is truthy in body → OVERWRITES with new value
  // So: always send real names when available. When names aren't available
  // (webhook sync fallback), send only `name` as placeholder — do NOT send
  // first_name/last_name so Heimdall preserves existing user data.
  const requestBody: Record<string, string> = {
    email_id: email,
  };
  if (firstName || lastName) {
    // Real names available — send them all
    requestBody.name = `${firstName} ${lastName}`.trim();
    requestBody.first_name = firstName;
    requestBody.last_name = lastName;
  } else {
    // No names available (webhook sync fallback for unknown users).
    // Send name to pass Heimdall's validation, but omit first_name/last_name
    // so the model preserves existing values for known users.
    requestBody.name = email.split("@")[0];
  }
  verbose(P, "Request body:", JSON.stringify(requestBody));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  verbose(P, "Response status:", res.status);

  if (!res.ok) {
    const body = await res.text();
    error(P, "FAILED:", `${res.status} ${body}`);
    throw new HeimdallError("add_user", `Failed to add user to Heimdall: ${res.status} — ${body}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  verbose(P, "Response keys:", Object.keys(data));
  verbose(P, "Full response:", JSON.stringify(data).slice(0, 500));

  const result = data.result as Record<string, unknown> | undefined;

  verbose(P, "Result object keys:", result ? Object.keys(result) : "NO RESULT");

  // Token can be at data.token OR data.result.token (Heimdall nests it inside result)
  const token = (data.token ?? result?.token) as string | undefined;
  const userId = (result?._id ?? result?.id ?? data._id ?? data.id) as string | undefined;

  verbose(P, "Token present:", `${!!token} | found at: ${data.token ? "data.token" : result?.token ? "result.token" : "NOWHERE"}`);
  verbose(P, "Extracted userId:", userId);

  if (!token) {
    error(P, "No token in response!", JSON.stringify(data));
    throw new HeimdallError("add_user", "No token returned from Heimdall user/add");
  }

  if (!userId) {
    error(P, "No user ID in response!", JSON.stringify(data));
    throw new HeimdallError("add_user", "No user ID returned from Heimdall user/add");
  }

  log(P, "SUCCESS", { userId, email, tokenLength: token.length });
  return { token, userId };
}

// ─── Step 3: Find root workspace ──────────────────────────────────────────────
interface WorkspaceInfo {
  workspaceId: string;
  planId: string | null;
  planType: string | null;
}

async function findRootWorkspace(
  ownerId: string,
  token: string
): Promise<WorkspaceInfo | null> {
  const P = "Heimdall:3-findWorkspace";
  const params = new URLSearchParams({ owner_id: ownerId, return_root: "true" });
  const url = `${HEIMDALL_BASE}/service/v0/workspace/find/one?${params.toString()}`;

  log(P, "Finding root workspace for owner:", ownerId);
  verbose(P, "URL:", url);
  verbose(P, "Token (first 20):", token.slice(0, 20) + "...");

  const res = await fetch(url, {
    method: "GET",
    headers: { token },
  });

  verbose(P, "Response status:", res.status);

  if (!res.ok) {
    const body = await res.text();
    verbose(P, "Not OK:", `${res.status} ${body}`);
    if (res.status === 404) {
      log(P, "No workspace found (404) — will create new");
      return null;
    }
    error(P, "Unexpected error — will create new workspace");
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  const result = data.result as Record<string, unknown> | undefined;
  verbose(P, "Response keys:", Object.keys(data));
  verbose(P, "Full response:", JSON.stringify(data).slice(0, 800));
  if (result) {
    verbose(P, "WORKSPACE PLAN STATE:", {
      plan_id: result.plan_id ?? "NULL",
      type: result.type ?? "NULL",
      license_code: result.license_code ?? "NULL",
      license_provider: result.license_provider ?? "NULL",
    });
  }

  // Heimdall returns 200 with status:"failed" when no workspace found
  if (data.status === "failed") {
    log(P, "Heimdall returned status:failed —", (result?.message as string) || "no workspace");
    return null;
  }

  const workspaceId = (result?._id ?? result?.id ?? data._id ?? data.id) as string | undefined;

  if (!workspaceId) {
    log(P, "No workspace ID in response — will create new");
    return null;
  }

  const planId = (result?.plan_id as string) || null;
  const planType = (result?.type as string) || null;
  log(P, "SUCCESS — found workspace:", `${workspaceId} | plan_id: ${planId} | type: ${planType}`);
  return { workspaceId, planId, planType };
}

// ─── Step 4: Add workspace with plan ──────────────────────────────────────────
async function addWorkspacePlan(
  token: string,
  params: {
    workspaceId: string | null;
    ownerId: string;
    workspaceName: string;
    licenseKey: string;
    planId: string;
    planType: string;
  }
): Promise<string> {
  const P = "Heimdall:4-addWorkspace";
  const url = `${HEIMDALL_BASE}/service/v0/workspace/add`;

  log(P, "Adding workspace/plan", params.workspaceId ? "UPDATE existing" : "CREATE new");
  verbose(P, "URL:", url);

  const body: Record<string, unknown> = {
    owner_id: params.ownerId,
    name: params.workspaceName,
    license_code: params.licenseKey,
    license_provider: "appsumo",
    plan_id: params.planId,
    type: params.planType,
  };

  if (params.workspaceId) {
    body._id = params.workspaceId;
  }

  verbose(P, "Request body:", JSON.stringify(body));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify(body),
  });

  verbose(P, "Response status:", res.status);

  if (!res.ok) {
    const resBody = await res.text();
    error(P, "FAILED:", `${res.status} ${resBody}`);
    throw new HeimdallError("add_workspace", `Failed to add workspace/plan: ${res.status} — ${resBody}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const result = data.result as Record<string, unknown> | undefined;
  verbose(P, "Response keys:", Object.keys(data));
  verbose(P, "Full response:", JSON.stringify(data).slice(0, 500));

  if (data.status === "failed") {
    const errMsg = (result?.message as string) || "Unknown error";
    error(P, "Heimdall returned status:failed:", errMsg);
    throw new HeimdallError("add_workspace", `Heimdall workspace/add failed: ${errMsg}`);
  }

  // Workspace ID is nested inside result
  const workspaceId = (result?._id ?? result?.id ?? data._id ?? data.id) as string | undefined;

  if (!workspaceId) {
    error(P, "No workspace ID in response:", JSON.stringify(data));
    throw new HeimdallError("add_workspace", "No workspace ID returned from Heimdall");
  }

  log(P, "SUCCESS — workspace:", workspaceId);
  return workspaceId;
}

// ─── Step 5: Trigger forgot password email ────────────────────────────────────
async function triggerForgotPassword(email: string): Promise<void> {
  const P = "Heimdall:5-forgotPwd";
  const url = `${HEIMDALL_BASE}/service/public/v0/user/forgot/password`;

  log(P, "Triggering forgot password", email);
  verbose(P, "URL:", url);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email_id: email }),
  });

  verbose(P, "Response status:", res.status);

  if (!res.ok) {
    const body = await res.text();
    error(P, "FAILED (non-critical):", `${res.status} ${body}`);
  } else {
    const body = await res.text();
    log(P, "SUCCESS");
    verbose(P, "Response:", body.slice(0, 200));
  }
}

// ─── Service token (for webhook-triggered plan updates) ───────────────────────
// The signed token endpoint signs whatever body you send as the JWT payload.
// We include { sub: "service" } so that endpoints requiring decoded.user_id
// (like user/find/one) accept the token — Heimdall sets user_id = decoded.sub.
export async function getServiceToken(): Promise<string> {
  const P = "Heimdall:serviceToken";
  const url = `${HEIMDALL_BASE}/service/v0/get/signed/token`;

  log(P, "Getting service token");
  verbose(P, "URL:", url);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      app_id: "digihealth-admin-token-creator",
      secret: "hockeystick",
    },
    body: JSON.stringify({ sub: "service" }),
  });

  verbose(P, "Response status:", res.status);

  if (!res.ok) {
    const body = await res.text();
    error(P, "FAILED:", `${res.status} ${body}`);
    throw new HeimdallError("service_token", `Failed to get service token: ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const result = data.result as Record<string, unknown> | undefined;
  const token = (data.token ?? result?.token ?? data.access_token ?? result?.access_token) as string | undefined;

  if (!token) {
    error(P, "No token in response:", JSON.stringify(data));
    throw new HeimdallError("service_token", "No token in service token response");
  }

  log(P, "SUCCESS");
  verbose(P, "Token length:", `${token.length} | found at: ${data.token ? "data.token" : "result.token"}`);
  return token;
}

// ─── Find existing user in Heimdall ───────────────────────────────────────────
// Uses service token + user/find/one to get user data without modifying anything.
export async function findHeimdallUser(
  email: string
): Promise<{ firstName: string; lastName: string; name: string; userId: string } | null> {
  const P = "Heimdall:findUser";
  log(P, "Looking up user by email", email);

  try {
    const serviceToken = await getServiceToken();

    const params = new URLSearchParams({ email_id: email });
    const url = `${HEIMDALL_BASE}/service/v0/user/find/one?${params.toString()}`;
    verbose(P, "URL:", url);

    const res = await fetch(url, {
      method: "GET",
      headers: { token: serviceToken },
    });

    verbose(P, "Response status:", res.status);

    if (!res.ok) {
      log(P, "HTTP error — user may not exist", res.status);
      return null;
    }

    const data = (await res.json()) as Record<string, unknown>;
    verbose(P, "Response:", JSON.stringify(data).slice(0, 500));

    if (data.status === "failed") {
      log(P, "Heimdall returned status:failed — user not found");
      return null;
    }

    const result = data.result as Record<string, unknown> | undefined;
    const firstName = (result?.first_name as string) || "";
    const lastName = (result?.last_name as string) || "";
    const name = (result?.name as string) || "";
    const userId = (result?._id ?? result?.id) as string | undefined;

    log(P, "Found user", { userId, name, firstName, lastName });

    if (!userId) {
      log(P, "No user ID in response — treating as not found");
      return null;
    }

    return { firstName, lastName, name, userId };
  } catch (err) {
    error(P, "Error looking up user (non-fatal):", err);
    return null;
  }
}

// ─── Update workspace plan (for webhooks) ─────────────────────────────────────
// First fetches the existing user to get their real name, then calls user/add
// with that name to get a user token (service token can't update workspaces).
export async function updateWorkspacePlanForUser(
  workspaceId: string,
  tier: number,
  licenseKey: string,
  redeemerEmail: string
): Promise<void> {
  const P = "Heimdall:updatePlan";
  log(P, "Updating workspace plan", { workspaceId, tier, redeemerEmail });

  const planId = PLAN_ID_MAP[tier];
  const planType = PLAN_TYPE_MAP[tier];
  if (!planId || !planType) {
    error(P, "Unknown tier:", tier);
    return;
  }

  // Step 1: Fetch existing user to get their real name
  log(P, "Fetching existing user from Heimdall...");
  const existingUser = await findHeimdallUser(redeemerEmail);

  const firstName = existingUser?.firstName || "";
  const lastName = existingUser?.lastName || "";
  verbose(P, "User lookup result:", existingUser ? { firstName, lastName, name: existingUser.name } : "NOT_FOUND");

  // Step 2: Get user token via user/add (upsert) with the real name
  log(P, "Getting user token via user/add...");
  const { token } = await addHeimdallUser(redeemerEmail, firstName, lastName);
  verbose(P, "Got user token, length:", token.length);

  const url = `${HEIMDALL_BASE}/service/v0/workspace/add`;
  const requestBody = {
    _id: workspaceId,
    license_code: licenseKey,
    license_provider: "appsumo",
    plan_id: planId,
    type: planType,
  };
  verbose(P, "Request body:", JSON.stringify(requestBody));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify(requestBody),
  });

  verbose(P, "Response status:", res.status);

  if (!res.ok) {
    const body = await res.text();
    error(P, "HTTP FAILED:", `${res.status} ${body}`);
    throw new HeimdallError("update_plan", `Failed to update workspace plan: ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  verbose(P, "Response:", JSON.stringify(data).slice(0, 500));

  if (data.status === "failed") {
    const result = data.result as Record<string, unknown> | undefined;
    const errMsg = (result?.message as string) || "Unknown error";
    error(P, "Heimdall returned status:failed:", errMsg);
    throw new HeimdallError("update_plan", `Heimdall workspace update failed: ${errMsg}`);
  }

  log(P, "SUCCESS — workspace plan updated", { workspaceId, tier, planId });
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────
export async function provisionAccount(
  email: string,
  firstName: string,
  lastName: string,
  tier: number,
  licenseKey: string,
  password: string
): Promise<ProvisioningResult> {
  const P = "Heimdall:provision";
  log(P, "Starting account provisioning", { email, tier });
  verbose(P, "Name:", `${firstName} ${lastName}`);
  verbose(P, "License:", licenseKey.slice(0, 8) + "...");
  verbose(P, "Password length:", password.length);
  verbose(P, "HEIMDALL_BASE:", HEIMDALL_BASE);

  const planId = PLAN_ID_MAP[tier];
  const planType = PLAN_TYPE_MAP[tier];
  if (!planId || !planType) {
    throw new HeimdallError("validation", `Unknown tier: ${tier}`);
  }
  verbose(P, "Plan mapping:", { planId, planType });

  // Step 1: Register on Keycloak (using user-provided password)
  log(P, "Step 1/5: Register on Keycloak");
  const { alreadyExisted } = await registerKeycloakUser(email, firstName, lastName, password);
  log(P, "Step 1 done. alreadyExisted:", alreadyExisted);

  // Step 2: Add/upsert in Heimdall MongoDB
  log(P, "Step 2/5: Add user to Heimdall");
  const { token, userId } = await addHeimdallUser(email, firstName, lastName);
  log(P, "Step 2 done. userId:", userId);

  // Step 3: Find existing root workspace and capture current plan
  log(P, "Step 3/5: Find root workspace");
  const existingWorkspace = await findRootWorkspace(userId, token);
  const previousPlanId = existingWorkspace?.planId ?? null;
  const previousPlanType = existingWorkspace?.planType ?? null;
  log(P, "Step 3 done.", `workspace: ${existingWorkspace?.workspaceId ?? "NONE"} | previousPlan: ${previousPlanId} ${previousPlanType}`);

  // Step 4: Add/update workspace with plan
  log(P, "Step 4/5: Add workspace/plan");
  const workspaceName = firstName
    ? `${firstName}'s Workspace`
    : "Your Workspace";
  verbose(P, "Workspace name:", workspaceName);

  const workspaceId = await addWorkspacePlan(token, {
    workspaceId: existingWorkspace?.workspaceId ?? null,
    ownerId: userId,
    workspaceName,
    licenseKey,
    planId,
    planType,
  });
  log(P, "Step 4 done. workspaceId:", workspaceId);

  // Step 5: No longer needed — user provides their own password in the signup form
  log(P, "Step 5/5: SKIPPED (user set password in signup form)");

  log(P, "PROVISIONING COMPLETE", { userId, workspaceId, isNewUser: !alreadyExisted });

  return {
    heimdallUserId: userId,
    heimdallWorkspaceId: workspaceId,
    isNewUser: !alreadyExisted,
    previousPlanId,
    previousPlanType,
  };
}
