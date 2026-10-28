import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DamageOverlay, type DamageRegion } from "@/components/DamageOverlay";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_LABEL, estimateRepairs, inr } from "@/lib/claim-extras";

export const Route = createFileRoute("/_authenticated/report/$id")({
  head: () => ({
    meta: [
      { title: "Claim report — AutoClaim" },
      { name: "description", content: "Printable AutoClaim report with photos, damage, policy and claim amount." },
      { property: "og:title", content: "Claim report — AutoClaim" },
      { property: "og:description", content: "Download your AutoClaim claim report as a PDF." },
    ],
  }),
  component: ReportPage,
});

function ReportPage() {
  const { id } = Route.useParams();
  const [urls, setUrls] = useState<string[]>([]);
  const q = useQuery({
    queryKey: ["claim", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("claims").select("*").eq("id", id).single();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const c = q.data;

  useEffect(() => {
    if (!c?.image_urls.length) return;
    supabase.storage.from("claim-images").createSignedUrls(c.image_urls, 3600).then(({ data }) => {
      if (data) setUrls(data.map((d) => d.signedUrl ?? ""));
    });
  }, [c]);

  if (q.isLoading || !c) {
    return <div className="flex justify-center py-32 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>;
  }

  const regions = c.damage_regions as unknown as DamageRegion[];
  const repairs = estimateRepairs(c.damaged_parts, regions, c.severity);
  const rows: [string, string][] = [
    ["Claim ID", c.claim_reference ?? "—"],
    ["Status", STATUS_LABEL[c.claim_status] ?? c.claim_status],
    ["Date", new Date(c.created_at).toLocaleDateString()],
    ["Policy holder", c.holder_name ?? "—"],
    ["Policy number", c.policy_number ?? "—"],
    ["Insurance type", (c.insurance_type ?? "—").replace("_", " ")],
    ["Vehicle", `${c.vehicle_type ?? ""} ${c.vehicle_model ?? ""}`.trim() || "—"],
    ["Insured amount", c.insured_amount ? inr(Number(c.insured_amount)) : "—"],
    ["Damage", `${Number(c.damage_percentage ?? 0)}% (${c.severity ?? "unknown"})`],
    ["Verification", c.verification_status],
    ["Amount you can claim", inr(Number(c.claimable_amount ?? 0))],
  ];

  return (
    <main className="mx-auto max-w-3xl bg-background px-6 py-10 text-foreground">
      <div className="mb-8 flex justify-between gap-3 print:hidden">
        <Button asChild variant="outline"><Link to="/claim/$id" params={{ id }}><ArrowLeft className="size-4" /> Back</Link></Button>
        <Button onClick={() => window.print()}><Printer className="size-4" /> Save as PDF / Print</Button>
      </div>
      <h1 className="font-display text-3xl font-bold">AutoClaim — Claim report</h1>
      <p className="mt-1 text-sm text-muted-foreground">{c.summary}</p>

      <table className="mt-6 w-full text-sm">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-border">
              <td className="py-2 text-muted-foreground">{k}</td>
              <td className="py-2 text-right font-medium capitalize">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-8 text-lg font-semibold">Repair estimate</h2>
      <table className="mt-2 w-full text-sm">
        <tbody>
          {repairs.map((r) => (
            <tr key={r.part} className="border-b border-border">
              <td className="py-2 capitalize">{r.part}</td>
              <td className="py-2 capitalize text-muted-foreground">{r.severity}</td>
              <td className="py-2 text-right">{inr(r.cost)}</td>
            </tr>
          ))}
          <tr><td colSpan={2} className="pt-2 font-semibold">Total</td><td className="pt-2 text-right font-semibold">{inr(repairs.reduce((s, r) => s + r.cost, 0))}</td></tr>
        </tbody>
      </table>

      <h2 className="mt-8 text-lg font-semibold">Photos</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {urls.map((u, i) => (
          <DamageOverlay key={u || i} src={u} alt={`Photo ${i + 1}`} regions={regions.filter((r) => r.imageIndex === i)} />
        ))}
      </div>
      <p className="mt-8 text-xs text-muted-foreground">Estimates are indicative and subject to insurer approval.</p>
    </main>
  );
}
