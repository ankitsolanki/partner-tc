import type { PartnerLicenseKey } from "@shared/schema";

export function generateLicensesCsv(licenses: PartnerLicenseKey[]): string {
  const headers = [
    "license_key",
    "tier",
    "status",
    "generated_at",
    "consumed_at",
    "redeemed_at",
    "batch_id",
  ];

  const rows = licenses.map((license) => [
    license.licenseKey,
    String(license.tier),
    license.status,
    license.generatedAt ? license.generatedAt.toISOString() : "",
    license.consumedAt ? license.consumedAt.toISOString() : "",
    license.redeemedAt ? license.redeemedAt.toISOString() : "",
    license.batchId ?? "",
  ]);

  const csvLines = [headers.join(",")];
  for (const row of rows) {
    csvLines.push(row.map((field) => `"${field}"`).join(","));
  }

  return csvLines.join("\n");
}
