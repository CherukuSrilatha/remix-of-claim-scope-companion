import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { STATUS_LABEL, inr } from "@/lib/claim-extras";

export const Route = createFileRoute("/_authenticated/claims")({
  head: () => ({
    meta: [
      { title: "My claims — AutoClaim" },
      { name: "description", content: "All your AutoClaim vehicle damage claims and their status." },
      { property: "og:title", content: "My claims — AutoClaim" },
      { property: "og:description", content: "Track every vehicle insurance claim in one place." },
    ],
  }),
  component: ClaimsPage,
});

export function statusClass(status: string) {
  if (status === "rejected") return "border-damage/40 bg-damage/10 text-damage";
  if (status === "approved" || status === "paid") return "border-success/40 bg-success/10 text-success";
  return "border-primary/30 bg-primary/10 text-primary";
}

function ClaimsPage() {
  const { user } = useSession();
  const q = useQuery({
    queryKey: ["my-claims", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claims")
        .select("id, claim_reference, created_at, damage_percentage, damaged_parts, claim_status, claimable_amount, vehicle_model")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-5 py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">My claims</h1>
            <p className="mt-2 text-sm text-muted-foreground">Every claim you have started, newest first.</p>
          </div>
          <Button asChild>
            <Link to="/upload"><Plus className="size-4" /> New claim</Link>
          </Button>
        </div>

        {q.isLoading ? (
          <div className="flex justify-center py-20 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : !q.data?.length ? (
          <p className="surface mt-8 p-8 text-center text-muted-foreground">No claims yet.</p>
        ) : (
          <ul className="mt-8 space-y-3">
            {q.data.map((c) => (
              <li key={c.id}>
                <Link to="/claim/$id" params={{ id: c.id }} className="surface flex flex-wrap items-center justify-between gap-4 p-5 transition-colors hover:border-primary/50">
                  <div>
                    <p className="font-display font-semibold">{c.claim_reference ?? "No claim ID yet"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()} · {c.vehicle_model ?? "Vehicle"} · {Number(c.damage_percentage ?? 0)}% damage
                    </p>
                    <p className="mt-1 text-xs capitalize text-muted-foreground">{c.damaged_parts.join(", ")}</p>
                  </div>
                  <div className="text-right">
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClass(c.claim_status)}`}>
                      {STATUS_LABEL[c.claim_status] ?? c.claim_status}
                    </span>
                    {Number(c.claimable_amount) > 0 && (
                      <p className="mt-2 font-semibold">{inr(Number(c.claimable_amount))}</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
