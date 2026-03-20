const VERBOSE = process.env.VERBOSE_LOGS === "true";

export function log(prefix: string, message: string, data?: unknown): void {
  if (data !== undefined) {
    console.log(`[${prefix}]`, message, typeof data === "string" ? data : JSON.stringify(data));
  } else {
    console.log(`[${prefix}]`, message);
  }
}

export function verbose(prefix: string, message: string, data?: unknown): void {
  if (!VERBOSE) return;
  log(prefix, message, data);
}

export function error(prefix: string, message: string, data?: unknown): void {
  if (data !== undefined) {
    console.error(`[${prefix}]`, message, typeof data === "string" ? data : JSON.stringify(data));
  } else {
    console.error(`[${prefix}]`, message);
  }
}

export function logCurl(prefix: string, method: string, url: string, headers: Record<string, string>, body?: string): void {
  if (!VERBOSE) return;
  const parts = [`curl -X ${method} '${url}'`];
  for (const [key, value] of Object.entries(headers)) {
    parts.push(`-H '${key}: ${value}'`);
  }
  if (body) {
    parts.push(`-d '${body}'`);
  }
  console.log(`[${prefix}:curl]`, parts.join(" \\\n  "));
}

export function isVerbose(): boolean {
  return VERBOSE;
}
