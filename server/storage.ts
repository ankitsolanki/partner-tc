import { eq, and, desc, sql, count, gte } from "drizzle-orm";
import { db } from "./db";
import {
  type User,
  type InsertUser,
  type Partner,
  type InsertPartner,
  type PartnerUser,
  type InsertPartnerUser,
  type PartnerLicenseKey,
  type InsertPartnerLicenseKey,
  type PartnerLicenseEvent,
  type InsertPartnerLicenseEvent,
  type KeyGenerationBatch,
  type InsertKeyGenerationBatch,
  users,
  partners,
  partnerUsers,
  partnerLicenseKeys,
  partnerLicenseEvents,
  keyGenerationBatches,
  LICENSE_STATUS,
} from "@shared/schema";

export interface LicenseFilters {
  status?: string;
  tier?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface PartnerStats {
  totalGenerated: number;
  totalConsumed: number;
  totalRedeemed: number;
  totalAvailable: number;
  totalDeactivated: number;
  totalUpgraded: number;
  totalDowngraded: number;
  tierDistribution: { tier: number; total: number; available: number }[];
}

export interface DailyActivity {
  date: string;
  count: number;
  eventType: string;
}

export interface ConversionFunnel {
  generated: number;
  consumed: number;
  redeemed: number;
  conversionRate: number;
  redemptionRate: number;
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  createPartner(partner: InsertPartner): Promise<Partner>;
  getPartner(name: string): Promise<Partner | undefined>;
  getPartnerById(id: number): Promise<Partner | undefined>;
  getPartners(): Promise<Partner[]>;
  updatePartner(id: number, data: Partial<InsertPartner>): Promise<Partner | undefined>;

  createPartnerUser(user: InsertPartnerUser): Promise<PartnerUser>;
  getPartnerUserByEmail(email: string): Promise<PartnerUser | undefined>;
  getPartnerUserById(id: number): Promise<PartnerUser | undefined>;
  getPartnerUsersByPartnerId(partnerId: number): Promise<PartnerUser[]>;
  updatePartnerUser(id: number, data: Partial<PartnerUser>): Promise<PartnerUser | undefined>;

  generateLicenseKeys(partnerId: number, tier: number, quantity: number, batchId: string, notes?: string): Promise<PartnerLicenseKey[]>;
  getLicenseByKey(licenseKey: string): Promise<PartnerLicenseKey | undefined>;
  getLicensesByPartner(partnerId: number, filters?: LicenseFilters): Promise<{ licenses: PartnerLicenseKey[]; total: number }>;
  updateLicenseStatus(licenseKey: string, status: string, updates?: Partial<PartnerLicenseKey>): Promise<PartnerLicenseKey | undefined>;
  getLicensesByBatch(batchId: string): Promise<PartnerLicenseKey[]>;

  createLicenseEvent(event: InsertPartnerLicenseEvent): Promise<PartnerLicenseEvent>;
  getEventsByLicenseKey(licenseKey: string): Promise<PartnerLicenseEvent[]>;
  getEventsByPartner(partnerId: number, limit?: number): Promise<PartnerLicenseEvent[]>;

  createBatch(batch: InsertKeyGenerationBatch): Promise<KeyGenerationBatch>;
  getBatchesByPartner(partnerId: number): Promise<KeyGenerationBatch[]>;
  getBatchById(batchId: string): Promise<KeyGenerationBatch | undefined>;
  markBatchExported(batchId: string): Promise<KeyGenerationBatch | undefined>;

  getPartnerStats(partnerId: number): Promise<PartnerStats>;
  getPartnerDailyActivity(partnerId: number, days?: number): Promise<DailyActivity[]>;
  getConversionFunnel(partnerId: number): Promise<ConversionFunnel>;

  handlePurchaseEvent(partnerId: number, licenseKey: string, tier: number, payload: Record<string, unknown> | null): Promise<PartnerLicenseKey>;
  handleActivateEvent(partnerId: number, licenseKey: string, payload: Record<string, unknown> | null): Promise<PartnerLicenseKey>;
  handleUpgradeEvent(partnerId: number, previousKey: string, newKey: string, newTier: number, payload: Record<string, unknown> | null): Promise<PartnerLicenseKey>;
  handleDowngradeEvent(partnerId: number, previousKey: string, newKey: string, newTier: number, payload: Record<string, unknown> | null): Promise<PartnerLicenseKey>;
  handleDeactivateEvent(partnerId: number, licenseKey: string, payload: Record<string, unknown> | null): Promise<PartnerLicenseKey>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async createPartner(partner: InsertPartner): Promise<Partner> {
    const [result] = await db.insert(partners).values(partner).returning();
    return result;
  }

  async getPartner(name: string): Promise<Partner | undefined> {
    const [result] = await db.select().from(partners).where(eq(partners.name, name)).limit(1);
    return result;
  }

  async getPartnerById(id: number): Promise<Partner | undefined> {
    const [result] = await db.select().from(partners).where(eq(partners.id, id)).limit(1);
    return result;
  }

  async getPartners(): Promise<Partner[]> {
    return db.select().from(partners).orderBy(desc(partners.createdAt));
  }

  async updatePartner(id: number, data: Partial<InsertPartner>): Promise<Partner | undefined> {
    const [result] = await db.update(partners).set(data).where(eq(partners.id, id)).returning();
    return result;
  }

  async createPartnerUser(user: InsertPartnerUser): Promise<PartnerUser> {
    const [result] = await db.insert(partnerUsers).values(user).returning();
    return result;
  }

  async getPartnerUserByEmail(email: string): Promise<PartnerUser | undefined> {
    const [result] = await db.select().from(partnerUsers).where(eq(partnerUsers.email, email)).limit(1);
    return result;
  }

  async getPartnerUserById(id: number): Promise<PartnerUser | undefined> {
    const [result] = await db.select().from(partnerUsers).where(eq(partnerUsers.id, id)).limit(1);
    return result;
  }

  async getPartnerUsersByPartnerId(partnerId: number): Promise<PartnerUser[]> {
    return db.select().from(partnerUsers).where(eq(partnerUsers.partnerId, partnerId)).orderBy(desc(partnerUsers.createdAt));
  }

  async updatePartnerUser(id: number, data: Partial<PartnerUser>): Promise<PartnerUser | undefined> {
    const [result] = await db.update(partnerUsers).set(data).where(eq(partnerUsers.id, id)).returning();
    return result;
  }

  async generateLicenseKeys(partnerId: number, tier: number, quantity: number, batchId: string, notes?: string): Promise<PartnerLicenseKey[]> {
    const keysToInsert: InsertPartnerLicenseKey[] = [];
    for (let i = 0; i < quantity; i++) {
      keysToInsert.push({
        partnerId,
        tier,
        status: LICENSE_STATUS.GENERATED,
        batchId,
        notes: notes || null,
      });
    }

    const inserted = await db.insert(partnerLicenseKeys).values(keysToInsert).returning();
    return inserted;
  }

  async getLicenseByKey(licenseKey: string): Promise<PartnerLicenseKey | undefined> {
    const [result] = await db
      .select()
      .from(partnerLicenseKeys)
      .where(eq(partnerLicenseKeys.licenseKey, licenseKey))
      .limit(1);
    return result;
  }

  async getLicensesByPartner(partnerId: number, filters?: LicenseFilters): Promise<{ licenses: PartnerLicenseKey[]; total: number }> {
    const conditions = [eq(partnerLicenseKeys.partnerId, partnerId)];

    if (filters?.status) {
      conditions.push(eq(partnerLicenseKeys.status, filters.status));
    }
    if (filters?.tier) {
      conditions.push(eq(partnerLicenseKeys.tier, filters.tier));
    }
    if (filters?.search) {
      conditions.push(sql`${partnerLicenseKeys.licenseKey}::text ILIKE ${'%' + filters.search + '%'}`);
    }

    const whereClause = and(...conditions);

    const [totalResult] = await db
      .select({ count: count() })
      .from(partnerLicenseKeys)
      .where(whereClause);

    const total = totalResult?.count ?? 0;

    const licenses = await db
      .select()
      .from(partnerLicenseKeys)
      .where(whereClause)
      .orderBy(desc(partnerLicenseKeys.generatedAt))
      .limit(filters?.limit ?? 50)
      .offset(filters?.offset ?? 0);

    return { licenses, total };
  }

  async updateLicenseStatus(licenseKey: string, status: string, updates?: Partial<PartnerLicenseKey>): Promise<PartnerLicenseKey | undefined> {
    const setData: Record<string, unknown> = { status, ...updates };
    const [result] = await db
      .update(partnerLicenseKeys)
      .set(setData)
      .where(eq(partnerLicenseKeys.licenseKey, licenseKey))
      .returning();
    return result;
  }

  async getLicensesByBatch(batchId: string): Promise<PartnerLicenseKey[]> {
    return db
      .select()
      .from(partnerLicenseKeys)
      .where(eq(partnerLicenseKeys.batchId, batchId))
      .orderBy(desc(partnerLicenseKeys.generatedAt));
  }

  async createLicenseEvent(event: InsertPartnerLicenseEvent): Promise<PartnerLicenseEvent> {
    const [result] = await db.insert(partnerLicenseEvents).values(event).returning();
    return result;
  }

  async getEventsByLicenseKey(licenseKey: string): Promise<PartnerLicenseEvent[]> {
    return db
      .select()
      .from(partnerLicenseEvents)
      .where(eq(partnerLicenseEvents.licenseKey, licenseKey))
      .orderBy(desc(partnerLicenseEvents.createdAt));
  }

  async getEventsByPartner(partnerId: number, limit: number = 50): Promise<PartnerLicenseEvent[]> {
    return db
      .select()
      .from(partnerLicenseEvents)
      .where(eq(partnerLicenseEvents.partnerId, partnerId))
      .orderBy(desc(partnerLicenseEvents.createdAt))
      .limit(limit);
  }

  async createBatch(batch: InsertKeyGenerationBatch): Promise<KeyGenerationBatch> {
    const [result] = await db.insert(keyGenerationBatches).values(batch).returning();
    return result;
  }

  async getBatchesByPartner(partnerId: number): Promise<KeyGenerationBatch[]> {
    return db
      .select()
      .from(keyGenerationBatches)
      .where(eq(keyGenerationBatches.partnerId, partnerId))
      .orderBy(desc(keyGenerationBatches.createdAt));
  }

  async getBatchById(batchId: string): Promise<KeyGenerationBatch | undefined> {
    const [result] = await db
      .select()
      .from(keyGenerationBatches)
      .where(eq(keyGenerationBatches.batchId, batchId))
      .limit(1);
    return result;
  }

  async markBatchExported(batchId: string): Promise<KeyGenerationBatch | undefined> {
    const [result] = await db
      .update(keyGenerationBatches)
      .set({ exported: true, exportedAt: new Date() })
      .where(eq(keyGenerationBatches.batchId, batchId))
      .returning();
    return result;
  }

  async getPartnerStats(partnerId: number): Promise<PartnerStats> {
    const statusCounts = await db
      .select({
        status: partnerLicenseKeys.status,
        count: count(),
      })
      .from(partnerLicenseKeys)
      .where(eq(partnerLicenseKeys.partnerId, partnerId))
      .groupBy(partnerLicenseKeys.status);

    const statusMap: Record<string, number> = {};
    for (const row of statusCounts) {
      statusMap[row.status] = row.count;
    }

    const tierData = await db
      .select({
        tier: partnerLicenseKeys.tier,
        status: partnerLicenseKeys.status,
        count: count(),
      })
      .from(partnerLicenseKeys)
      .where(eq(partnerLicenseKeys.partnerId, partnerId))
      .groupBy(partnerLicenseKeys.tier, partnerLicenseKeys.status);

    const tierMap: Record<number, { total: number; available: number }> = {};
    for (const row of tierData) {
      if (!tierMap[row.tier]) {
        tierMap[row.tier] = { total: 0, available: 0 };
      }
      tierMap[row.tier].total += row.count;
      if (row.status === LICENSE_STATUS.GENERATED) {
        tierMap[row.tier].available += row.count;
      }
    }

    const tierDistribution = Object.entries(tierMap).map(([tier, data]) => ({
      tier: parseInt(tier),
      total: data.total,
      available: data.available,
    }));

    return {
      totalGenerated: statusMap[LICENSE_STATUS.GENERATED] ?? 0,
      totalConsumed: statusMap[LICENSE_STATUS.CONSUMED] ?? 0,
      totalRedeemed: statusMap[LICENSE_STATUS.REDEEMED] ?? 0,
      totalAvailable: statusMap[LICENSE_STATUS.GENERATED] ?? 0,
      totalDeactivated: statusMap[LICENSE_STATUS.DEACTIVATED] ?? 0,
      totalUpgraded: statusMap[LICENSE_STATUS.UPGRADED] ?? 0,
      totalDowngraded: statusMap[LICENSE_STATUS.DOWNGRADED] ?? 0,
      tierDistribution,
    };
  }

  async getPartnerDailyActivity(partnerId: number, days: number = 30): Promise<DailyActivity[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const results = await db
      .select({
        date: sql<string>`DATE(${partnerLicenseEvents.createdAt})::text`,
        eventType: partnerLicenseEvents.eventType,
        count: count(),
      })
      .from(partnerLicenseEvents)
      .where(
        and(
          eq(partnerLicenseEvents.partnerId, partnerId),
          gte(partnerLicenseEvents.createdAt, startDate)
        )
      )
      .groupBy(sql`DATE(${partnerLicenseEvents.createdAt})`, partnerLicenseEvents.eventType)
      .orderBy(sql`DATE(${partnerLicenseEvents.createdAt})`);

    return results.map((r) => ({
      date: r.date,
      count: r.count,
      eventType: r.eventType,
    }));
  }

  async getConversionFunnel(partnerId: number): Promise<ConversionFunnel> {
    const statusCounts = await db
      .select({
        status: partnerLicenseKeys.status,
        count: count(),
      })
      .from(partnerLicenseKeys)
      .where(eq(partnerLicenseKeys.partnerId, partnerId))
      .groupBy(partnerLicenseKeys.status);

    const statusMap: Record<string, number> = {};
    for (const row of statusCounts) {
      statusMap[row.status] = row.count;
    }

    const generated = Object.values(statusMap).reduce((sum, c) => sum + c, 0);
    const consumed =
      (statusMap[LICENSE_STATUS.CONSUMED] ?? 0) +
      (statusMap[LICENSE_STATUS.REDEEMED] ?? 0) +
      (statusMap[LICENSE_STATUS.UPGRADED] ?? 0) +
      (statusMap[LICENSE_STATUS.DOWNGRADED] ?? 0) +
      (statusMap[LICENSE_STATUS.DEACTIVATED] ?? 0);
    const redeemed =
      (statusMap[LICENSE_STATUS.REDEEMED] ?? 0) +
      (statusMap[LICENSE_STATUS.UPGRADED] ?? 0) +
      (statusMap[LICENSE_STATUS.DOWNGRADED] ?? 0) +
      (statusMap[LICENSE_STATUS.DEACTIVATED] ?? 0);

    return {
      generated,
      consumed,
      redeemed,
      conversionRate: generated > 0 ? (consumed / generated) * 100 : 0,
      redemptionRate: consumed > 0 ? (redeemed / consumed) * 100 : 0,
    };
  }

  async handlePurchaseEvent(partnerId: number, licenseKey: string, tier: number, payload: Record<string, unknown> | null): Promise<PartnerLicenseKey> {
    const existing = await this.getLicenseByKey(licenseKey);

    if (existing) {
      const updated = await this.updateLicenseStatus(licenseKey, LICENSE_STATUS.CONSUMED, {
        consumedAt: new Date(),
      });

      await this.createLicenseEvent({
        licenseKey,
        partnerId,
        eventType: "purchase",
        previousStatus: existing.status,
        newStatus: LICENSE_STATUS.CONSUMED,
        triggeredBy: "webhook",
        webhookPayload: payload,
        tier,
      });

      return updated!;
    }

    const [newKey] = await db
      .insert(partnerLicenseKeys)
      .values({
        licenseKey,
        partnerId,
        tier,
        status: LICENSE_STATUS.CONSUMED,
        consumedAt: new Date(),
      })
      .returning();

    await this.createLicenseEvent({
      licenseKey,
      partnerId,
      eventType: "purchase",
      previousStatus: null,
      newStatus: LICENSE_STATUS.CONSUMED,
      triggeredBy: "webhook",
      webhookPayload: payload,
      tier,
    });

    return newKey;
  }

  async handleActivateEvent(partnerId: number, licenseKey: string, payload: Record<string, unknown> | null): Promise<PartnerLicenseKey> {
    let existing = await this.getLicenseByKey(licenseKey);
    const previousStatus = existing?.status ?? LICENSE_STATUS.GENERATED;

    // If the key doesn't exist yet (purchase webhook hasn't arrived), create it
    if (!existing) {
      const tier = (payload as Record<string, unknown>)?.tier as number ?? 1;
      const [created] = await db
        .insert(partnerLicenseKeys)
        .values({
          licenseKey,
          partnerId,
          tier,
          status: LICENSE_STATUS.CONSUMED,
          consumedAt: new Date(),
        })
        .returning();
      existing = created;
    } else {
      // Activate webhook means user clicked "Activate" on AppSumo.
      // Set to CONSUMED (ready to redeem), NOT REDEEMED.
      // REDEEMED is only set after the user completes the signup form
      // and Heimdall provisioning succeeds.
      const result = await this.updateLicenseStatus(licenseKey, LICENSE_STATUS.CONSUMED, {
        consumedAt: new Date(),
      });
      existing = result ?? existing;
    }

    await this.createLicenseEvent({
      licenseKey,
      partnerId,
      eventType: "activate",
      previousStatus,
      newStatus: LICENSE_STATUS.CONSUMED,
      triggeredBy: "webhook",
      webhookPayload: payload,
      tier: existing.tier,
    });

    return existing;
  }

  async handleUpgradeEvent(partnerId: number, previousKey: string, newKey: string, newTier: number, payload: Record<string, unknown> | null): Promise<PartnerLicenseKey> {
    const existingPrevious = await this.getLicenseByKey(previousKey);
    const previousTier = existingPrevious?.tier;

    if (existingPrevious) {
      await this.updateLicenseStatus(previousKey, LICENSE_STATUS.UPGRADED, {
        upgradedAt: new Date(),
        upgradedToKey: newKey,
      });
    }

    await this.createLicenseEvent({
      licenseKey: previousKey,
      partnerId,
      eventType: "upgrade",
      previousStatus: existingPrevious?.status ?? null,
      newStatus: LICENSE_STATUS.UPGRADED,
      triggeredBy: "webhook",
      webhookPayload: payload,
      tier: newTier,
      previousTier,
    });

    let newLicense: PartnerLicenseKey;
    const existingNew = await this.getLicenseByKey(newKey);
    if (existingNew) {
      const updated = await this.updateLicenseStatus(newKey, LICENSE_STATUS.REDEEMED, {
        tier: newTier,
        redeemedAt: new Date(),
        userId: existingPrevious?.userId,
        previousKey,
        heimdallUserId: existingPrevious?.heimdallUserId,
        heimdallWorkspaceId: existingPrevious?.heimdallWorkspaceId,
        redeemerEmail: existingPrevious?.redeemerEmail,
        previousPlanId: existingPrevious?.previousPlanId,
        previousPlanType: existingPrevious?.previousPlanType,
      });
      newLicense = updated!;
    } else {
      const [created] = await db
        .insert(partnerLicenseKeys)
        .values({
          licenseKey: newKey,
          partnerId,
          tier: newTier,
          status: LICENSE_STATUS.REDEEMED,
          redeemedAt: new Date(),
          userId: existingPrevious?.userId,
          previousKey,
          heimdallUserId: existingPrevious?.heimdallUserId,
          heimdallWorkspaceId: existingPrevious?.heimdallWorkspaceId,
          redeemerEmail: existingPrevious?.redeemerEmail,
          previousPlanId: existingPrevious?.previousPlanId,
          previousPlanType: existingPrevious?.previousPlanType,
        })
        .returning();
      newLicense = created;
    }

    // Create event for the NEW key so it has an audit trail
    await this.createLicenseEvent({
      licenseKey: newKey,
      partnerId,
      eventType: "upgrade",
      previousStatus: existingNew?.status ?? null,
      newStatus: LICENSE_STATUS.REDEEMED,
      triggeredBy: "webhook",
      webhookPayload: payload,
      tier: newTier,
      previousTier,
    });

    return newLicense;
  }

  async handleDowngradeEvent(partnerId: number, previousKey: string, newKey: string, newTier: number, payload: Record<string, unknown> | null): Promise<PartnerLicenseKey> {
    const existingPrevious = await this.getLicenseByKey(previousKey);
    const previousTier = existingPrevious?.tier;

    if (existingPrevious) {
      await this.updateLicenseStatus(previousKey, LICENSE_STATUS.DOWNGRADED, {
        downgradedAt: new Date(),
        upgradedToKey: newKey,
      });
    }

    await this.createLicenseEvent({
      licenseKey: previousKey,
      partnerId,
      eventType: "downgrade",
      previousStatus: existingPrevious?.status ?? null,
      newStatus: LICENSE_STATUS.DOWNGRADED,
      triggeredBy: "webhook",
      webhookPayload: payload,
      tier: newTier,
      previousTier,
    });

    let newLicense: PartnerLicenseKey;
    const existingNew = await this.getLicenseByKey(newKey);
    if (existingNew) {
      const updated = await this.updateLicenseStatus(newKey, LICENSE_STATUS.REDEEMED, {
        tier: newTier,
        redeemedAt: new Date(),
        userId: existingPrevious?.userId,
        previousKey,
        heimdallUserId: existingPrevious?.heimdallUserId,
        heimdallWorkspaceId: existingPrevious?.heimdallWorkspaceId,
        redeemerEmail: existingPrevious?.redeemerEmail,
        previousPlanId: existingPrevious?.previousPlanId,
        previousPlanType: existingPrevious?.previousPlanType,
      });
      newLicense = updated!;
    } else {
      const [created] = await db
        .insert(partnerLicenseKeys)
        .values({
          licenseKey: newKey,
          partnerId,
          tier: newTier,
          status: LICENSE_STATUS.REDEEMED,
          redeemedAt: new Date(),
          userId: existingPrevious?.userId,
          previousKey,
          heimdallUserId: existingPrevious?.heimdallUserId,
          heimdallWorkspaceId: existingPrevious?.heimdallWorkspaceId,
          redeemerEmail: existingPrevious?.redeemerEmail,
          previousPlanId: existingPrevious?.previousPlanId,
          previousPlanType: existingPrevious?.previousPlanType,
        })
        .returning();
      newLicense = created;
    }

    // Create event for the NEW key so it has an audit trail
    await this.createLicenseEvent({
      licenseKey: newKey,
      partnerId,
      eventType: "downgrade",
      previousStatus: existingNew?.status ?? null,
      newStatus: LICENSE_STATUS.REDEEMED,
      triggeredBy: "webhook",
      webhookPayload: payload,
      tier: newTier,
      previousTier,
    });

    return newLicense;
  }

  async handleDeactivateEvent(partnerId: number, licenseKey: string, payload: Record<string, unknown> | null): Promise<PartnerLicenseKey> {
    let existing = await this.getLicenseByKey(licenseKey);
    const previousStatus = existing?.status ?? LICENSE_STATUS.REDEEMED;

    if (!existing) {
      // Key doesn't exist in DB — create it in deactivated state
      const tier = (payload as Record<string, unknown>)?.tier as number ?? 1;
      const [created] = await db
        .insert(partnerLicenseKeys)
        .values({
          licenseKey,
          partnerId,
          tier,
          status: LICENSE_STATUS.DEACTIVATED,
          deactivatedAt: new Date(),
        })
        .returning();
      existing = created;
    } else {
      const result = await this.updateLicenseStatus(licenseKey, LICENSE_STATUS.DEACTIVATED, {
        deactivatedAt: new Date(),
      });
      existing = result ?? existing;
    }

    await this.createLicenseEvent({
      licenseKey,
      partnerId,
      eventType: "deactivate",
      previousStatus,
      newStatus: LICENSE_STATUS.DEACTIVATED,
      triggeredBy: "webhook",
      webhookPayload: payload,
      tier: existing.tier,
    });

    return existing;
  }
}

export const storage = new DatabaseStorage();

export async function seedDatabase(): Promise<void> {
  const existingPartner = await storage.getPartner("appsumo");
  if (existingPartner) {
    return;
  }

  const { scryptSync, randomBytes } = await import("crypto");

  function hashPassword(password: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
  }

  const partner = await storage.createPartner({
    name: "appsumo",
    displayName: "AppSumo",
    contactEmail: "partners@appsumo.com",
    apiKey: randomBytes(32).toString("hex"),
    webhookSecret: randomBytes(32).toString("hex"),
    isActive: true,
  });

  await storage.createPartnerUser({
    partnerId: partner.id,
    email: "partner@appsumo.com",
    passwordHash: hashPassword("partner123"),
    name: "AppSumo Partner",
    role: "admin",
    isActive: true,
    isAdmin: false,
  });

  await storage.createPartnerUser({
    partnerId: partner.id,
    email: "admin@tinycommand.com",
    passwordHash: hashPassword("admin123"),
    name: "Tiny Command Admin",
    role: "admin",
    isActive: true,
    isAdmin: true,
  });

  const batchId = `AS-1-${Date.now()}`;
  await storage.createBatch({
    batchId,
    partnerId: partner.id,
    tier: 1,
    quantity: 30,
    generatedByType: "partner",
    exported: false,
    notes: "Initial seed batch - Tier 1",
  });

  const keys = await storage.generateLicenseKeys(partner.id, 1, 20, batchId, "Seed Tier 1 keys");

  const batchId2 = `AS-2-${Date.now()}`;
  await storage.createBatch({
    batchId: batchId2,
    partnerId: partner.id,
    tier: 2,
    quantity: 15,
    generatedByType: "partner",
    exported: false,
    notes: "Initial seed batch - Tier 2",
  });

  await storage.generateLicenseKeys(partner.id, 2, 15, batchId2, "Seed Tier 2 keys");

  const batchId3 = `AS-3-${Date.now()}`;
  await storage.createBatch({
    batchId: batchId3,
    partnerId: partner.id,
    tier: 3,
    quantity: 10,
    generatedByType: "partner",
    exported: false,
    notes: "Initial seed batch - Tier 3",
  });

  await storage.generateLicenseKeys(partner.id, 3, 10, batchId3, "Seed Tier 3 keys");

  for (let i = 0; i < 8 && i < keys.length; i++) {
    await storage.updateLicenseStatus(keys[i].licenseKey, LICENSE_STATUS.CONSUMED, {
      consumedAt: new Date(Date.now() - (10 - i) * 86400000),
    });
    await storage.createLicenseEvent({
      licenseKey: keys[i].licenseKey,
      partnerId: partner.id,
      eventType: "consumed",
      previousStatus: LICENSE_STATUS.GENERATED,
      newStatus: LICENSE_STATUS.CONSUMED,
      triggeredBy: "webhook",
      tier: 1,
    });
  }

  for (let i = 0; i < 5 && i < keys.length; i++) {
    await storage.updateLicenseStatus(keys[i].licenseKey, LICENSE_STATUS.REDEEMED, {
      redeemedAt: new Date(Date.now() - (8 - i) * 86400000),
    });
    await storage.createLicenseEvent({
      licenseKey: keys[i].licenseKey,
      partnerId: partner.id,
      eventType: "redeemed",
      previousStatus: LICENSE_STATUS.CONSUMED,
      newStatus: LICENSE_STATUS.REDEEMED,
      triggeredBy: "oauth",
      tier: 1,
    });
  }

  if (keys.length > 5) {
    await storage.updateLicenseStatus(keys[5].licenseKey, LICENSE_STATUS.DEACTIVATED, {
      deactivatedAt: new Date(Date.now() - 2 * 86400000),
    });
    await storage.createLicenseEvent({
      licenseKey: keys[5].licenseKey,
      partnerId: partner.id,
      eventType: "deactivated",
      previousStatus: LICENSE_STATUS.CONSUMED,
      newStatus: LICENSE_STATUS.DEACTIVATED,
      triggeredBy: "webhook",
      tier: 1,
    });
  }

  console.log("[seed] Database seeded with AppSumo partner, users, and sample license keys");
}
