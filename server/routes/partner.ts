import { Router } from "express";
import { requirePartnerAuth } from "../middleware/auth";
import { comparePassword } from "../utils/crypto";
import { generateLicensesCsv } from "../utils/csv";
import { storage } from "../storage";
import { loginSchema, generateLicensesSchema } from "@shared/schema";
import { randomUUID } from "crypto";

const router = Router();

router.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input", error: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;
  const user = await storage.getPartnerUserByEmail(email);

  if (!user || !user.isActive) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  if (user.isAdmin) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const valid = comparePassword(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  await storage.updatePartnerUser(user.id, { lastLoginAt: new Date() });

  req.session.partnerUserId = user.id;
  req.session.partnerId = user.partnerId;
  req.session.isAdmin = false;

  return res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    partnerId: user.partnerId,
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

router.get("/auth/me", requirePartnerAuth, async (req, res) => {
  const user = await storage.getPartnerUserById(req.session.partnerUserId!);
  if (!user) {
    return res.status(401).json({ message: "User not found" });
  }

  const partner = await storage.getPartnerById(user.partnerId);

  return res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    partnerId: user.partnerId,
    partnerName: partner?.displayName ?? partner?.name,
  });
});

router.post("/licenses/generate", requirePartnerAuth, async (req, res) => {
  const parsed = generateLicensesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input", error: parsed.error.flatten() });
  }

  const { tier, quantity, notes } = parsed.data;
  const partnerId = req.session.partnerId!;
  const batchId = randomUUID();

  const batch = await storage.createBatch({
    batchId,
    partnerId,
    tier,
    quantity,
    generatedByType: "partner",
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

router.get("/licenses", requirePartnerAuth, async (req, res) => {
  const partnerId = req.session.partnerId!;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
  const page = req.query.page ? parseInt(req.query.page as string) : 1;
  const offset = (page - 1) * limit;

  const filters = {
    status: req.query.status as string | undefined,
    tier: req.query.tier ? parseInt(req.query.tier as string) : undefined,
    search: req.query.search as string | undefined,
    limit,
    offset,
  };

  const { licenses, total } = await storage.getLicensesByPartner(partnerId, filters);
  const totalPages = Math.ceil(total / limit);
  return res.json({ data: licenses, total, page, totalPages });
});

router.get("/licenses/stats", requirePartnerAuth, async (req, res) => {
  const partnerId = req.session.partnerId!;
  const stats = await storage.getPartnerStats(partnerId);
  const recentEvents = await storage.getEventsByPartner(partnerId, 10);
  return res.json({ ...stats, recentEvents });
});

router.get("/licenses/export", requirePartnerAuth, async (req, res) => {
  const partnerId = req.session.partnerId!;
  const filters = {
    status: req.query.status as string | undefined,
    tier: req.query.tier ? parseInt(req.query.tier as string) : undefined,
    search: req.query.search as string | undefined,
    limit: 100000,
    offset: 0,
  };

  const { licenses } = await storage.getLicensesByPartner(partnerId, filters);
  const csv = generateLicensesCsv(licenses);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=licenses.csv");
  return res.send(csv);
});

router.get("/licenses/:licenseKey", requirePartnerAuth, async (req, res) => {
  const licenseKey = req.params.licenseKey as string;
  const license = await storage.getLicenseByKey(licenseKey);
  if (!license || license.partnerId !== req.session.partnerId!) {
    return res.status(404).json({ message: "License not found" });
  }

  const events = await storage.getEventsByLicenseKey(licenseKey);
  return res.json({ license, events });
});

router.get("/batches", requirePartnerAuth, async (req, res) => {
  const partnerId = req.session.partnerId!;
  const batches = await storage.getBatchesByPartner(partnerId);
  return res.json(batches);
});

router.get("/batches/:batchId/export", requirePartnerAuth, async (req, res) => {
  const batchId = req.params.batchId as string;
  const batch = await storage.getBatchById(batchId);
  if (!batch || batch.partnerId !== req.session.partnerId!) {
    return res.status(404).json({ message: "Batch not found" });
  }

  const licenses = await storage.getLicensesByBatch(batchId);
  const csv = generateLicensesCsv(licenses);

  await storage.markBatchExported(batchId);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=batch-${batchId}.csv`
  );
  return res.send(csv);
});

router.get("/reports/overview", requirePartnerAuth, async (req, res) => {
  const partnerId = req.session.partnerId!;

  const [funnel, dailyActivity, stats] = await Promise.all([
    storage.getConversionFunnel(partnerId),
    storage.getPartnerDailyActivity(partnerId),
    storage.getPartnerStats(partnerId),
  ]);

  return res.json({ funnel, dailyActivity, tierDistribution: stats.tierDistribution });
});

export default router;
