import type { Express } from "express";
import type { Server } from "http";
import { setupSession } from "./middleware/auth";
import { seedDatabase } from "./storage";
import partnerRoutes from "./routes/partner";
import adminRoutes from "./routes/admin";
import webhookRoutes from "./routes/webhook";
import oauthRoutes from "./routes/oauth";
import provisioningRoutes from "./routes/provisioning";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  console.log("[Routes] Registering routes...");

  setupSession(app);

  app.use("/api/partner", partnerRoutes);
  console.log("[Routes]   /api/partner → partnerRoutes");

  app.use("/api/admin", adminRoutes);
  console.log("[Routes]   /api/admin → adminRoutes");

  app.use("/api/webhooks", webhookRoutes);
  console.log("[Routes]   /api/webhooks → webhookRoutes");

  app.use("/api/auth", oauthRoutes);
  console.log("[Routes]   /api/auth → oauthRoutes (AppSumo only, NO Keycloak)");

  app.use("/api/redeem", provisioningRoutes);
  console.log("[Routes]   /api/redeem → provisioningRoutes (NEW)");

  console.log("[Routes] All routes registered. Seeding database...");
  await seedDatabase();
  console.log("[Routes] Database seeded.");

  return httpServer;
}
