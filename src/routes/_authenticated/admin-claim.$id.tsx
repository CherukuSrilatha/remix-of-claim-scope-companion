import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { DamageOverlay, type DamageRegion } from "@/components/DamageOverlay";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { useIsAdmin } from "@/lib/use-is-admin";
import { STATUS_LABEL, inr } from "@/lib/claim-extras";

export const Route = createFileRoute("/_authenticated/admin-claim/$id")({
  head: () => ({
    meta: [
      { title: "Claim request details — AutoClaim" },
      { name: "description", content: "Insurer view of a customer's claim, policy and photos." },
      { property: "og:title", content: "Claim request details — AutoClaim" },
      { property: "og:description", content: "Review customer, policy and damage photos." },
    ],
  }),
  component: AdminClaimPage,
});

function AdminClaimPage() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const admin = useIsAdmin(user?.id);

  const q = useQuery({
    queryKey: ["admin-claim", id],
    enabled: admin.data === true,
    queryFn: async () => {
      const { data: claim, error } = await supabase.from("claims").select("*").eq("id", id).single();
      if (error) throw new Error(error.message);
      const { data: profile } = await supabase.from("profiles").select("full_name, created_at").eq("id", claim.user_id).maybeSingle();
      let urls: string[] = [];
      if (claim.image_urls.length) {
        const { data } = await supabase.storage.from("claim-images").createSignedUrls(claim.image_urls, 3600);
        urls = (data ?? []).map((d) => d.signedUrl ?? "");
      }
      return { claim, profile, urls };
    },
  });

  if (admin.isLoading || !user || q.isLoading) {
    return <div className="min-h-screen"><SiteHeader /><div className="flex justify-center py-32"><Loader2 className="size-5 animate-spin" /></div></div>;
  }
  if (!admin.data) {
    return <div className="min-h-screen"><SiteHeader /><p className="py-32 text-center text-muted-foreground">This page is only for insurer staff.</p></div>;
  }
  if (q.error || !q.data) {
    return <div className="min-h-screen"><SiteHeader /><p className="py-32 text-center text-muted-foreground">Claim not found.</p></div>;
  }

  const { claim, profile, urls } = q.data;
  const regions = (claim.damage_regions ?? []) as unknown as DamageRegion[];
  const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

  const sections: [string, [string, string][]][] = [
    ["Customer", [
      ["Account name", fmt(profile?.full_name)],
      ["Customer since", profile ? new Date(profile.created_at).toLocaleDateString() : "—"],
      ["Claim submitted", new Date(claim.created_at).toLocaleString()],
    ]],
    ["Policy", [
      ["Holder name", fmt(claim.holder_name)],
      ["Policy number", fmt(claim.policy_number)],
      ["Insurance type", fmt(claim.insurance_type)],
      ["Vehicle", `${fmt(claim.vehicle_type)} · ${fmt(claim.vehicle_model)}`],
      ["Insured amount", claim.insured_amount != null ? inr(Number(claim.insured_amount)) : "—"],
      ["Policy date", fmt(claim.policy_date)],
      ["Amount paid so far", claim.amount_paid != null ? inr(Number(claim.amount_paid)) : "—"],
      ["Verification", `${claim.verification_status}${claim.verification_reason ? ` — ${claim.verification_reason}` : ""}`],
    ]],
    ["Claim", [
      ["Claim ID", fmt(claim.claim_reference)],
      ["Status", STATUS_LABEL[claim.claim_status as keyof typeof STATUS_LABEL] ?? claim.claim_status],
      ["Damage", `${Number(claim.damage_percentage ?? 0)}% · ${fmt(claim.severity)}`],
      ["Damaged parts", claim.damaged_parts.join(", ") || "—"],
      ["Claimable amount", claim.claimable_amount != null ? inr(Number(claim.claimable_amount)) : "—"],
    ]],
    ["Bank details", [
      ["Account name", fmt(claim.bank_account_name)],
      ["Account number", fmt(claim.bank_account_number)],
      ["IFSC", fmt(claim.bank_ifsc)],
      ["Bank", fmt(claim.bank_name)],
    ]],
  ];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-5 py-10">
        <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4" /> Back to dashboard
        </Link>
        <h1 className="mt-3 text-3xl font-bold">{claim.claim_reference ?? "New claim request"}</h1>
        {claim.summary && <p className="mt-2 text-muted-foreground">{claim.summary}</p>}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {sections.map(([title, rows]) => (
            <section key={title} className="surface p-5">
              <h2 className="font-display text-lg font-semibold">{title}</h2>
              <dl className="mt-3 space-y-2 text-sm">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <h2 className="mt-10 font-display text-xl font-semibold">Submitted photos</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {urls.map((src, i) => src && (
            <DamageOverlay key={i} src={src} alt={`Damage photo ${i + 1}`} regions={regions.filter((r) => r.imageIndex === i)} />
          ))}
          {!urls.length && <p className="text-muted-foreground">No photos submitted.</p>}
        </div>
      </main>
    </div>
  );
}
