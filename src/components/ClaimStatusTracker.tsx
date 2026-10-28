import { Check, X } from "lucide-react";
import { CLAIM_STEPS } from "@/lib/claim-extras";

export function ClaimStatusTracker({ status, note }: { status: string; note?: string | null }) {
  const rejected = status === "rejected";
  const current = CLAIM_STEPS.findIndex((s) => s.value === status);
  return (
    <div className="surface p-6">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Claim status</p>
      {rejected ? (
        <div className="mt-3 flex items-center gap-2 font-semibold text-damage">
          <X className="size-5" /> Rejected
        </div>
      ) : (
        <ol className="mt-4 grid grid-cols-5 gap-2">
          {CLAIM_STEPS.map((step, i) => {
            const done = i <= current;
            return (
              <li key={step.value} className="flex flex-col items-center gap-2 text-center">
                <span
                  className={`flex size-8 items-center justify-center rounded-full border-2 text-xs font-bold ${
                    done
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="size-4" /> : i + 1}
                </span>
                <span className={`text-xs ${done ? "font-semibold" : "text-muted-foreground"}`}>
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {note && <p className="mt-4 text-sm text-muted-foreground">Insurer note: {note}</p>}
    </div>
  );
}
