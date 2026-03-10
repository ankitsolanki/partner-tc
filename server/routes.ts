import type { Express } from "express";
import type { Server } from "http";
import { setupSession } from "./middleware/auth";
import { seedDatabase } from "./storage";
import partnerRoutes from "./routes/partner";
import adminRoutes from "./routes/admin";
import webhookRoutes from "./routes/webhook";
import oauthRoutes from "./routes/oauth";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupSession(app);

  app.use("/api/partner", partnerRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/webhooks", webhookRoutes);
  app.use("/api/auth", oauthRoutes);

  await seedDatabase();

  return httpServer;
}
