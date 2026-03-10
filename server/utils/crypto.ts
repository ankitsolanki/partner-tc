import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function comparePassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const derivedHash = scryptSync(password, salt, 64).toString("hex");
  const hashBuffer = Buffer.from(hash, "hex");
  const derivedBuffer = Buffer.from(derivedHash, "hex");
  if (hashBuffer.length !== derivedBuffer.length) return false;
  return timingSafeEqual(hashBuffer, derivedBuffer);
}

export function validateHmacSignature(
  body: string,
  timestamp: string,
  signature: string,
  secret: string
): boolean {
  const message = `${timestamp}.${body}`;
  const expectedSignature = createHmac("sha256", secret)
    .update(message)
    .digest("hex");
  const sigBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  if (sigBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(sigBuffer, expectedBuffer);
}

export function generateApiKey(): string {
  return randomBytes(32).toString("hex");
}
