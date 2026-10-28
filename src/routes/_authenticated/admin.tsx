import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { useIsAdmin } from "@/lib/use-is-admin";
import { STATUS_LABEL, inr } from "@/lib/claim-extras";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Insurer dashboard — AutoClaim" },
      { name: "description", content: "Review, approve and pay AutoClaim vehicle claims." },
      { property: "og:title", content: "Insurer dashboard — AutoClaim" },
      { property: "og:description", content: "Staff dashboard for reviewing claims." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user } = useSession();
  const admin = useIsAdmin(user?.id);
  const [filter, setFilter] = useState("all");

  const claims = useQuery({
    queryKey: ["admin-claims"],
    enabled: admin.data === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claims")
        .select("id, claim_reference, created_at, holder_name, policy_number, vehicle_model, damage_percentage, verification_status, claim_status, status_note, claimable_amount, bank_account_name, bank_account_number, bank_ifsc, bank_name")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  if (admin.isLoading || !user) {
    return <div className="min-h-screen"><SiteHeader /><div className="flex justify-center py-32"><Loader2 className="size-5 animate-spin" /></div></div>;
  }
  if (!admin.data) {
    return <div className="min-h-screen"><SiteHeader /><p className="py-32 text-center text-muted-foreground">This page is only for insurer staff.</p></div>;
  }

  const list = (claims.data ?? []).filter((c) => filter === "all" || c.claim_status === filter);
  const all = claims.data ?? [];
  const stats = [
    ["Total claims", String(all.length)],
    ["Waiting for review", String(all.filter((c) => c.claim_status === "under_review").length)],
    ["Approved / paid", String(all.filter((c) => ["approved", "paid"].includes(c.claim_status)).length)],
    ["Total payable", inr(all.filter((c) => ["approved", "paid"].includes(c.claim_status)).reduce((s, c) => s + Number(c.claimable_amount ?? 0), 0))],
  ];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-5 py-14">
        <h1 className="text-3xl font-bold">Insurer dashboard</h1>
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {stats.map(([k, v]) => (
            <div key={k} className="surface p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{k}</p>
              <p className="mt-1 font-display text-2xl font-bold">{v}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Show</span>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All claims</SelectItem>
              {Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {claims.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="size-5 animate-spin" /></div>
        ) : (
          <ul className="mt-4 space-y-3">
            {list.map((c) => <AdminRow key={c.id} claim={c} />)}
            {!list.length && <p className="surface p-8 text-center text-muted-foreground">No claims here.</p>}
          </ul>
        )}
      </main>
    </div>
  );
}

type Row = {
  id: string; claim_reference: string | null; created_at: string; holder_name: string | null;
  policy_number: string | null; vehicle_model: string | null; damage_percentage: number | null;
  verification_status: string; claim_status: string; status_note: string | null; claimable_amount: number | null;
  bank_account_name: string | null; bank_account_number: string | null; bank_ifsc: string | null; bank_name: string | null;
};

function AdminRow({ claim }: { claim: Row }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState(claim.claim_status);
  const [note, setNote] = useState(claim.status_note ?? "");
  const [amount, setAmount] = useState(String(claim.claimable_amount ?? 0));
  const [busy, setBusy] = useState(false);

  async function save() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) { toast.error("Enter a valid amount"); return; }
    setBusy(true);
    const { error } = await supabase
      .from("claims")
      .update({ claim_status: status, status_note: note.trim().slice(0, 500) || null, claimable_amount: n })
      .eq("id", claim.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Claim updated");
    qc.invalidateQueries({ queryKey: ["admin-claims"] });
  }

  return (
    <li className="surface grid gap-4 p-5 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <Link to="/admin-claim/$id" params={{ id: claim.id }} className="font-display font-semibold hover:text-primary">
          {claim.claim_reference ?? "New request — approve to assign claim ID"}
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">
          {new Date(claim.created_at).toLocaleDateString()} · {claim.holder_name ?? "Unknown holder"} · {claim.policy_number ?? "—"} · {claim.vehicle_model ?? "—"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {Number(claim.damage_percentage ?? 0)}% damage · policy {claim.verification_status}
        </p>
        {claim.bank_account_number && (
          <p className="mt-1 text-xs">
            Bank: {claim.bank_account_name} · A/C {claim.bank_account_number} · IFSC {claim.bank_ifsc}{claim.bank_name ? ` · ${claim.bank_name}` : ""}
          </p>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Payout amount" />
        <Input className="sm:col-span-2" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Note to the customer (optional)" />
        <Button className="sm:col-span-2" onClick={save} disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />} Save
        </Button>
      </div>
    </li>
  );
}
