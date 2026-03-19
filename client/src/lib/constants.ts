export const LICENSE_STATUSES = [
  { value: "generated", label: "Generated", color: "gray" },
  { value: "consumed", label: "Consumed", color: "yellow" },
  { value: "redeemed", label: "Redeemed", color: "green" },
  { value: "upgraded", label: "Upgraded", color: "blue" },
  { value: "downgraded", label: "Downgraded", color: "orange" },
  { value: "deactivated", label: "Deactivated", color: "red" },
] as const;

export const TIER_LABELS: Record<number, string> = {
  1: "Tier 1",
  2: "Tier 2",
  3: "Tier 3",
  4: "Tier 4",
};

export const STATUS_COLORS: Record<string, string> = {
  generated: "bg-muted text-muted-foreground",
  consumed: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  redeemed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  upgraded: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  downgraded: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  deactivated: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export const MAX_BATCH_SIZE = 10000;
