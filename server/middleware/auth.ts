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
}

export function requirePartnerAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.session.partnerUserId || !req.session.partnerId) {
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
    res.status(401).json({ message: "Admin authentication required" });
    return;
  }
  next();
}
