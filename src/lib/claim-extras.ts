export const CLAIM_STEPS = [
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under review" },
  { value: "approved", label: "Approved" },
  { value: "processing", label: "In process" },
  { value: "paid", label: "Paid" },
] as const;

export const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  processing: "In process",
  rejected: "Rejected",
  paid: "Paid",
};

const PART_COSTS: [RegExp, number][] = [
  [/bumper/i, 9000],
  [/head ?l(a|i)mp|headlight/i, 7000],
  [/tail ?l(a|i)mp|taillight/i, 4500],
  [/bonnet|hood/i, 14000],
  [/door/i, 12000],
  [/fender|quarter/i, 8000],
  [/windshield|windscreen|glass|window/i, 10000],
  [/mirror/i, 3500],
  [/grille|grill/i, 4000],
  [/wheel|tyre|tire|rim/i, 6000],
  [/roof/i, 16000],
  [/boot|trunk|tailgate/i, 13000],
  [/radiator/i, 11000],
];

const SEVERITY_FACTOR: Record<string, number> = {
  minor: 0.6,
  moderate: 1,
  severe: 1.6,
  "total loss": 2,
};

export type RepairLine = { part: string; severity: string; cost: number };

export function estimateRepairs(
  parts: string[],
  regions: { part: string; severity?: string }[],
  overallSeverity: string | null,
): RepairLine[] {
  return parts.map((part) => {
    const region = regions.find((r) => r.part.toLowerCase() === part.toLowerCase());
    const severity = (region?.severity ?? overallSeverity ?? "moderate").toLowerCase();
    const base = PART_COSTS.find(([re]) => re.test(part))?.[1] ?? 6000;
    const labour = 1500;
    return {
      part,
      severity,
      cost: Math.round((base * (SEVERITY_FACTOR[severity] ?? 1) + labour) / 100) * 100,
    };
  });
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
