import "dotenv/config";
// or, if you prefer explicit:
import dotenv from "dotenv";
dotenv.config();
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// ─── Global request logger (enhanced) ─────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  // Log EVERY incoming request (not just /api)
  if (path.startsWith("/api") || path.startsWith("/redeem")) {
    console.log(`[REQ] ──► ${req.method} ${path} from ${req.ip} | Host: ${req.headers.host} | Referer: ${req.headers.referer || "none"}`);
    if (req.method === "POST" && path.startsWith("/api")) {
      console.log(`[REQ]     Body keys: ${Object.keys(req.body || {}).join(", ") || "(empty)"}`);
    }
    if (req.session) {
      console.log(`[REQ]     Session ID: ${req.session.id} | pendingLicenseKey: ${req.session.pendingLicenseKey ? req.session.pendingLicenseKey.slice(0, 8) + "..." : "null"}`);
    }
  }

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  // Capture redirects
  const originalRedirect = res.redirect;
  res.redirect = function (this: Response, ...args: any[]) {
    const url = typeof args[0] === "string" ? args[0] : args[1];
    console.log(`[RES] ◄── ${req.method} ${path} → REDIRECT ${res.statusCode || 302} to: ${url}`);
    return originalRedirect.apply(this, args as any);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `[RES] ◄── ${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse).slice(0, 300)}`;
      }
      console.log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("[ERROR] Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5009", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
      console.log("════════════════════════════════════════════════════════════");
      console.log("  Partner-TC server started");
      console.log("  Port:", port);
      console.log("  NODE_ENV:", process.env.NODE_ENV);
      console.log("  APP_BASE_URL:", process.env.APP_BASE_URL);
      console.log("  HEIMDALL_API_URL:", process.env.HEIMDALL_API_URL || "(default: https://heimdallapi.tinycommand.com)");
      console.log("  DATABASE_URL:", (process.env.DATABASE_URL || "").replace(/:[^:@]+@/, ":***@"));
      console.log("  SESSION_SECRET:", process.env.SESSION_SECRET ? "SET" : "MISSING");
      console.log("  APPSUMO_CLIENT_ID:", process.env.APPSUMO_CLIENT_ID ? "SET" : "MISSING");
      console.log("  APPSUMO_CLIENT_SECRET:", process.env.APPSUMO_CLIENT_SECRET ? "SET" : "MISSING");
      console.log("  KEYCLOAK flow: REMOVED (using Heimdall server-side provisioning)");
      console.log("  Build timestamp:", new Date().toISOString());
      console.log("════════════════════════════════════════════════════════════");
    },
  );
})();
