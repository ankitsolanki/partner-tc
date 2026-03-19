import type { Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { Express } from "express";
import { pool } from "../db";

declare module "express-session" {
  interface SessionData {
    partnerUserId?: number;
    partnerId?: number;
    isAdmin?: boolean;
    pendingLicenseKey?: string;
    oauthState?: string;
  }
}

export function setupSession(app: Express): void {
  console.log("[Session] Setting up session middleware...");
  console.log("[Session] Cookie secure:", process.env.NODE_ENV === "production");
  console.log("[Session] Cookie sameSite: lax");
  console.log("[Session] Cookie maxAge: 24h");

  const PgStore = connectPgSimple(session);

  app.use(
    session({
      store: new PgStore({
        pool: pool,
        createTableIfMissing: true,
        tableName: "session",
      }),
      secret: process.env.SESSION_SECRET || "partner-management-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    })
  );

  console.log("[Session] Session middleware configured");
}

export function requirePartnerAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.session.partnerUserId || !req.session.partnerId) {
    console.log("[Auth] Partner auth REJECTED:", {
      path: req.path,
      sessionId: req.session?.id,
      partnerUserId: req.session?.partnerUserId,
      partnerId: req.session?.partnerId,
    });
    res.status(401).json({ message: "Authentication required" });
    return;
  }
  next();
}

export function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.session.partnerUserId || !req.session.isAdmin) {
    console.log("[Auth] Admin auth REJECTED:", {
      path: req.path,
      sessionId: req.session?.id,
      partnerUserId: req.session?.partnerUserId,
      isAdmin: req.session?.isAdmin,
    });
    res.status(401).json({ message: "Admin authentication required" });
    return;
  }
  next();
}
