import { sql, relations } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  partnerLicenseKey: text("partner_license_key"),
  partnerId: integer("partner_id"),
  partnerTier: integer("partner_tier"),
  licenseStatus: varchar("license_status", { length: 50 }),
  subscriptionSource: varchar("subscription_source", { length: 50 }),
});

export const usersRelations = relations(users, ({ one }) => ({
  partner: one(partners, {
    fields: [users.partnerId],
    references: [partners.id],
  }),
}));

export const partners = pgTable("partners", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  apiKey: varchar("api_key", { length: 255 }).unique(),
  oauthClientId: varchar("oauth_client_id", { length: 255 }),
  oauthClientSecret: text("oauth_client_secret"),
  webhookSecret: varchar("webhook_secret", { length: 255 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const partnersRelations = relations(partners, ({ many }) => ({
  partnerUsers: many(partnerUsers),
  licenseKeys: many(partnerLicenseKeys),
  batches: many(keyGenerationBatches),
}));

export const partnerUsers = pgTable(
  "partner_users",
  {
    id: serial("id").primaryKey(),
    partnerId: integer("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    name: varchar("name", { length: 255 }),
    role: varchar("role", { length: 50 }).default("viewer").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    isAdmin: boolean("is_admin").default(false).notNull(),
    lastLoginAt: timestamp("last_login_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_partner_users_partner_id").on(table.partnerId),
    index("idx_partner_users_email").on(table.email),
  ]
);

export const partnerUsersRelations = relations(partnerUsers, ({ one }) => ({
  partner: one(partners, {
    fields: [partnerUsers.partnerId],
    references: [partners.id],
  }),
}));

export const partnerLicenseKeys = pgTable(
  "partner_license_keys",
  {
    id: serial("id").primaryKey(),
    licenseKey: uuid("license_key").notNull().unique().default(sql`gen_random_uuid()`),
    partnerId: integer("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade" }),
    tier: integer("tier").notNull(),
    status: varchar("status", { length: 50 }).default("generated").notNull(),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
    consumedAt: timestamp("consumed_at"),
    redeemedAt: timestamp("redeemed_at"),
    upgradedAt: timestamp("upgraded_at"),
    downgradedAt: timestamp("downgraded_at"),
    deactivatedAt: timestamp("deactivated_at"),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    upgradedToKey: text("upgraded_to_key"),
    previousKey: text("previous_key"),
    batchId: text("batch_id"),
    notes: text("notes"),
    heimdallUserId: text("heimdall_user_id"),
    heimdallWorkspaceId: text("heimdall_workspace_id"),
    redeemerEmail: varchar("redeemer_email", { length: 255 }),
    previousPlanId: text("previous_plan_id"),
    previousPlanType: text("previous_plan_type"),
    unitQuantity: integer("unit_quantity").default(0),
    partnerPlanName: varchar("partner_plan_name", { length: 255 }),
  },
  (table) => [
    index("idx_license_keys_partner_id").on(table.partnerId),
    index("idx_license_keys_status").on(table.status),
    index("idx_license_keys_tier").on(table.tier),
    index("idx_license_keys_user_id").on(table.userId),
    index("idx_license_keys_batch_id").on(table.batchId),
  ]
);

export const partnerLicenseKeysRelations = relations(
  partnerLicenseKeys,
  ({ one }) => ({
    partner: one(partners, {
      fields: [partnerLicenseKeys.partnerId],
      references: [partners.id],
    }),
    user: one(users, {
      fields: [partnerLicenseKeys.userId],
      references: [users.id],
    }),
  })
);

export const partnerLicenseEvents = pgTable(
  "partner_license_events",
  {
    id: serial("id").primaryKey(),
    licenseKey: text("license_key").notNull(),
    partnerId: integer("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    previousStatus: varchar("previous_status", { length: 50 }),
    newStatus: varchar("new_status", { length: 50 }).notNull(),
    triggeredBy: varchar("triggered_by", { length: 50 }).notNull(),
    webhookPayload: jsonb("webhook_payload"),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    tier: integer("tier"),
    previousTier: integer("previous_tier"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_license_events_license_key").on(table.licenseKey),
    index("idx_license_events_event_type").on(table.eventType),
    index("idx_license_events_created_at").on(table.createdAt),
    index("idx_license_events_partner_id").on(table.partnerId),
  ]
);

export const partnerLicenseEventsRelations = relations(
  partnerLicenseEvents,
  ({ one }) => ({
    partner: one(partners, {
      fields: [partnerLicenseEvents.partnerId],
      references: [partners.id],
    }),
  })
);

export const keyGenerationBatches = pgTable(
  "key_generation_batches",
  {
    id: serial("id").primaryKey(),
    batchId: text("batch_id").notNull().unique(),
    partnerId: integer("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "cascade" }),
    tier: integer("tier").notNull(),
    quantity: integer("quantity").notNull(),
    generatedByType: varchar("generated_by_type", { length: 50 }).notNull(),
    generatedByUserId: integer("generated_by_user_id"),
    exported: boolean("exported").default(false).notNull(),
    exportedAt: timestamp("exported_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_batches_partner_id").on(table.partnerId),
    index("idx_batches_batch_id").on(table.batchId),
  ]
);

export const keyGenerationBatchesRelations = relations(
  keyGenerationBatches,
  ({ one }) => ({
    partner: one(partners, {
      fields: [keyGenerationBatches.partnerId],
      references: [partners.id],
    }),
  })
);

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
});

export const insertPartnerSchema = createInsertSchema(partners).omit({
  id: true,
  createdAt: true,
});

export const insertPartnerUserSchema = createInsertSchema(partnerUsers).omit({
  id: true,
  lastLoginAt: true,
  createdAt: true,
});

export const insertPartnerLicenseKeySchema = createInsertSchema(
  partnerLicenseKeys
).omit({
  id: true,
  generatedAt: true,
});

export const insertPartnerLicenseEventSchema = createInsertSchema(
  partnerLicenseEvents
).omit({
  id: true,
  createdAt: true,
});

export const insertKeyGenerationBatchSchema = createInsertSchema(
  keyGenerationBatches
).omit({
  id: true,
  createdAt: true,
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const generateLicensesSchema = z.object({
  tier: z.number().int().min(1).max(4),
  quantity: z.number().int().min(1).max(10000),
  notes: z.string().optional(),
});

export const createPartnerFormSchema = z.object({
  name: z.string().min(1).max(255),
  displayName: z.string().min(1).max(255),
  contactEmail: z.string().email(),
});

export const redeemSignupSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const createPartnerUserFormSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  password: z.string().min(6),
  role: z.enum(["admin", "manager", "viewer"]),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Partner = typeof partners.$inferSelect;
export type InsertPartner = z.infer<typeof insertPartnerSchema>;
export type PartnerUser = typeof partnerUsers.$inferSelect;
export type InsertPartnerUser = z.infer<typeof insertPartnerUserSchema>;
export type PartnerLicenseKey = typeof partnerLicenseKeys.$inferSelect;
export type InsertPartnerLicenseKey = z.infer<typeof insertPartnerLicenseKeySchema>;
export type PartnerLicenseEvent = typeof partnerLicenseEvents.$inferSelect;
export type InsertPartnerLicenseEvent = z.infer<typeof insertPartnerLicenseEventSchema>;
export type KeyGenerationBatch = typeof keyGenerationBatches.$inferSelect;
export type InsertKeyGenerationBatch = z.infer<typeof insertKeyGenerationBatchSchema>;

export const LICENSE_STATUS = {
  GENERATED: "generated",
  CONSUMED: "consumed",
  REDEEMED: "redeemed",
  UPGRADED: "upgraded",
  DOWNGRADED: "downgraded",
  DEACTIVATED: "deactivated",
} as const;

export type LicenseStatus = (typeof LICENSE_STATUS)[keyof typeof LICENSE_STATUS];
