import { Router } from "express";
import { requireAdminAuth } from "../middleware/auth";
import { comparePassword, hashPassword, generateApiKey } from "../utils/crypto";
import { storage } from "../storage";
import {
  loginSchema,
  generateLicensesSchema,
  createPartnerFormSchema,
  createPartnerUserFormSchema,
} from "@shared/schema";
import { randomUUID } from "crypto";

const router = Router();

router.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input", error: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;
  const user = await storage.getPartnerUserByEmail(email);

  if (!user || !user.isActive || !user.isAdmin) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const valid = comparePassword(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  await storage.updatePartnerUser(user.id, { lastLoginAt: new Date() });

  req.session.partnerUserId = user.id;
  req.session.partnerId = user.partnerId;
  req.session.isAdmin = true;

  return res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isAdmin: true,
  });
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Failed to logout" });
    }
    res.clearCookie("connect.sid");
    return res.json({ message: "Logged out" });
  });
});

router.get("/auth/me", requireAdminAuth, async (req, res) => {
  const user = await storage.getPartnerUserById(req.session.partnerUserId!);
  if (!user) {
    return res.status(401).json({ message: "User not found" });
  }

  return res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isAdmin: true,
  });
});

router.get("/partners", requireAdminAuth, async (_req, res) => {
  const partnersList = await storage.getPartners();
  return res.json(partnersList);
});

router.post("/partners", requireAdminAuth, async (req, res) => {
  const parsed = createPartnerFormSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input", error: parsed.error.flatten() });
  }

  const existing = await storage.getPartner(parsed.data.name);
  if (existing) {
    return res.status(409).json({ message: "Partner with this name already exists" });
  }

  const partner = await storage.createPartner({
    name: parsed.data.name,
    displayName: parsed.data.displayName,
    contactEmail: parsed.data.contactEmail,
    apiKey: generateApiKey(),
    webhookSecret: generateApiKey(),
    isActive: true,
  });

  return res.status(201).json(partner);
});

router.get("/partners/:id", requireAdminAuth, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid partner ID" });
  }

  const partner = await storage.getPartnerById(id);
  if (!partner) {
    return res.status(404).json({ message: "Partner not found" });
  }

  const stats = await storage.getPartnerStats(id);
  return res.json({ partner, stats });
});

router.put("/partners/:id", requireAdminAuth, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid partner ID" });
  }

  const partner = await storage.updatePartner(id, req.body);
  if (!partner) {
    return res.status(404).json({ message: "Partner not found" });
  }

  return res.json(partner);
});

router.post("/partners/:id/users", requireAdminAuth, async (req, res) => {
  const partnerId = parseInt(req.params.id as string);
  if (isNaN(partnerId)) {
    return res.status(400).json({ message: "Invalid partner ID" });
  }

  const parsed = createPartnerUserFormSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input", error: parsed.error.flatten() });
  }

  const existing = await storage.getPartnerUserByEmail(parsed.data.email);
  if (existing) {
    return res.status(409).json({ message: "User with this email already exists" });
  }

  const user = await storage.createPartnerUser({
    partnerId,
    email: parsed.data.email,
    passwordHash: hashPassword(parsed.data.password),
    name: parsed.data.name,
    role: parsed.data.role,
    isActive: true,
    isAdmin: false,
  });

  return res.status(201).json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    partnerId: user.partnerId,
  });
});

router.get("/partners/:id/users", requireAdminAuth, async (req, res) => {
  const partnerId = parseInt(req.params.id as string);
  if (isNaN(partnerId)) {
    return res.status(400).json({ message: "Invalid partner ID" });
  }

  const users = await storage.getPartnerUsersByPartnerId(partnerId);
  const safeUsers = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  }));

  return res.json(safeUsers);
});

router.post("/licenses/generate", requireAdminAuth, async (req, res) => {
  const parsed = generateLicensesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input", error: parsed.error.flatten() });
  }

  const partnerId = req.body.partnerId;
  if (!partnerId || typeof partnerId !== "number") {
    return res.status(400).json({ message: "partnerId is required" });
  }

  const partner = await storage.getPartnerById(partnerId);
  if (!partner) {
    return res.status(404).json({ message: "Partner not found" });
  }

  const { tier, quantity, notes } = parsed.data;
  const batchId = randomUUID();

  const batch = await storage.createBatch({
    batchId,
    partnerId,
    tier,
    quantity,
    generatedByType: "admin",
    generatedByUserId: req.session.partnerUserId!,
    notes: notes ?? null,
  });

  const licenses = await storage.generateLicenseKeys(partnerId, tier, quantity, batchId, notes);

  for (const license of licenses) {
    await storage.createLicenseEvent({
      licenseKey: license.licenseKey,
      partnerId,
      eventType: "generate",
      previousStatus: null,
      newStatus: "generated",
      triggeredBy: "manual",
      tier,
    });
  }

  return res.status(201).json({ batch, licenses, count: licenses.length });
});

router.get("/test/partner-config", requireAdminAuth, async (_req, res) => {
  const partner = await storage.getPartner("appsumo");
  if (!partner) {
    return res.status(404).json({ message: "AppSumo partner not found" });
  }
  const stats = await storage.getPartnerStats(partner.id);
  return res.json({
    id: partner.id,
    name: partner.name,
    displayName: partner.displayName,
    isActive: partner.isActive,
    apiKey: partner.apiKey,
    webhookSecret: partner.webhookSecret,
    oauthClientId: partner.oauthClientId,
    oauthClientSecret: partner.oauthClientSecret ? "configured" : null,
    stats,
  });
});

router.get("/test/licenses", requireAdminAuth, async (req, res) => {
  const partnerId = req.query.partnerId ? parseInt(req.query.partnerId as string) : null;
  if (!partnerId) {
    return res.status(400).json({ message: "partnerId is required" });
  }
  const { licenses } = await storage.getLicensesByPartner(partnerId, { limit: 200, offset: 0 });
  return res.json(licenses.map((l) => ({
    licenseKey: l.licenseKey,
    status: l.status,
    tier: l.tier,
  })));
});

router.post("/test/webhook", requireAdminAuth, async (req, res) => {
  const { event, partnerName = "appsumo", license_key, prev_license_key, new_license_key, tier, new_tier, user_id } = req.body;

  const partner = await storage.getPartner(partnerName);
  if (!partner) {
    return res.status(404).json({ message: `Partner "${partnerName}" not found` });
  }

  if (event === "test") {
    return res.json({ event: "test", success: true });
  }

  try {
    let license;
    switch (event) {
      case "purchase": {
        if (!license_key || tier === undefined) {
          return res.status(400).json({ message: "license_key and tier required for purchase" });
        }
        license = await storage.handlePurchaseEvent(partner.id, license_key, tier, req.body);
        break;
      }
      case "activate": {
        if (!license_key) {
          return res.status(400).json({ message: "license_key required for activate" });
        }
        license = await storage.handleActivateEvent(partner.id, license_key, req.body);
        break;
      }
      case "upgrade": {
        if (!prev_license_key || !new_license_key || new_tier === undefined) {
          return res.status(400).json({ message: "prev_license_key, new_license_key, and new_tier required for upgrade" });
        }
        license = await storage.handleUpgradeEvent(partner.id, prev_license_key, new_license_key, new_tier, req.body);
        break;
      }
      case "downgrade": {
        if (!prev_license_key || !new_license_key || new_tier === undefined) {
          return res.status(400).json({ message: "prev_license_key, new_license_key, and new_tier required for downgrade" });
        }
        license = await storage.handleDowngradeEvent(partner.id, prev_license_key, new_license_key, new_tier, req.body);
        break;
      }
      case "deactivate": {
        if (!license_key) {
          return res.status(400).json({ message: "license_key required for deactivate" });
        }
        license = await storage.handleDeactivateEvent(partner.id, license_key, req.body);
        break;
      }
      default:
        return res.status(400).json({ message: `Unknown event: ${event}` });
    }
    return res.json({ event, success: true, license });
  } catch (err: any) {
    return res.status(500).json({ event, success: false, error: err.message });
  }
});

router.get("/stats", requireAdminAuth, async (_req, res) => {
  const partnersList = await storage.getPartners();

  let totalKeys = 0;
  let totalRedeemed = 0;
  let totalActive = 0;

  const partnerSummaries = [];

  for (const partner of partnersList) {
    const stats = await storage.getPartnerStats(partner.id);
    const totalCreated =
      stats.totalGenerated +
      stats.totalConsumed +
      stats.totalRedeemed +
      stats.totalDeactivated +
      stats.totalUpgraded +
      stats.totalDowngraded;

    totalKeys += totalCreated;
    totalRedeemed += stats.totalRedeemed;
    totalActive += stats.totalGenerated;

    partnerSummaries.push({
      id: partner.id,
      name: partner.name,
      displayName: partner.displayName,
      contactEmail: partner.contactEmail,
      isActive: partner.isActive,
      totalCreated,
      available: stats.totalGenerated,
      consumed: stats.totalConsumed,
      redeemed: stats.totalRedeemed,
      deactivated: stats.totalDeactivated,
      upgraded: stats.totalUpgraded,
      downgraded: stats.totalDowngraded,
      tierDistribution: stats.tierDistribution,
    });
  }

  return res.json({
    totalPartners: partnersList.length,
    totalKeys,
    totalRedeemed,
    totalActive,
    partnerSummaries,
  });
});

export default router;
