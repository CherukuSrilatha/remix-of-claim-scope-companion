import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  ShieldCheck,
  ShieldAlert,
  BadgeCheck,
  Star,
  ArrowRight,
  FileDown,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SiteHeader } from "@/components/SiteHeader";
import { DamageOverlay, type DamageRegion } from "@/components/DamageOverlay";
import { ClaimStatusTracker } from "@/components/ClaimStatusTracker";
import { supabase } from "@/integrations/supabase/client";
import { verifyClaim } from "@/lib/claims.functions";
import { estimateRepairs, inr } from "@/lib/claim-extras";

export const Route = createFileRoute("/_authenticated/claim/$id")({
  head: () => ({
    meta: [
      { title: "Damage assessment and claim — AutoClaim" },
      {
        name: "description",
        content:
          "See the detected damage, the damage percentage, your policy verification result and the amount you can claim.",
      },
      { property: "og:title", content: "Damage assessment and claim — AutoClaim" },
      {
        property: "og:description",
        content: "AutoClaim damage report, policy verification and claim amount.",
      },
    ],
  }),
  component: ClaimPage,
});

const INSURANCE_TYPES = [
  { value: "comprehensive", label: "Comprehensive" },
  { value: "third_party", label: "Third party" },
  { value: "own_damage", label: "Own damage" },
  { value: "zero_depreciation", label: "Zero depreciation" },
];

const VEHICLE_TYPES = ["car", "bike", "suv", "truck", "van"];

function ClaimPage() {
  const { id } = Route.useParams();
  const verify = useServerFn(verifyClaim);
  const [signedUrls, setSignedUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sentFeedback, setSentFeedback] = useState(false);
  const [retry, setRetry] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const [form, setForm] = useState({
    holderName: "",
    policyNumber: "",
    insuranceType: "comprehensive",
    vehicleType: "car",
    vehicleModel: "",
    insuredAmount: "",
    policyDate: "",
    amountPaid: "",
  });

  const claimQuery = useQuery({
    queryKey: ["claim", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claims")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const claim = claimQuery.data;
  const images = useMemo(() => claim?.image_urls ?? [], [claim]);
  const regions = (claim?.damage_regions ?? []) as unknown as DamageRegion[];

  useEffect(() => {
    let active = true;
    if (!images.length) return;
    supabase.storage
      .from("claim-images")
      .createSignedUrls(images, 3600)
      .then(({ data }) => {
        if (active && data) setSignedUrls(data.map((d) => d.signedUrl ?? ""));
      });
    return () => {
      active = false;
    };
  }, [images]);

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    const insured = Number(form.insuredAmount);
    const paid = Number(form.amountPaid);
    if (!form.holderName.trim() || !form.policyNumber.trim() || !form.vehicleModel.trim()) {
      toast.error("Please fill in your name, policy number and vehicle model");
      return;
    }
    if (!Number.isFinite(insured) || insured <= 0 || !Number.isFinite(paid) || paid < 0) {
      toast.error("Enter valid amounts");
      return;
    }
    if (!form.policyDate) {
      toast.error("Select the policy date");
      return;
    }
    setBusy(true);
    try {
      const result = await verify({
        data: {
          claimId: id,
          holderName: form.holderName,
          policyNumber: form.policyNumber,
          insuranceType: form.insuranceType,
          vehicleType: form.vehicleType,
          vehicleModel: form.vehicleModel,
          insuredAmount: insured,
          policyDate: form.policyDate,
          amountPaid: paid,
        },
      });
      await claimQuery.refetch();
      setRetry(false);
      if (result.status === "verified") toast.success("Policy verified");
      else toast.error("Policy could not be verified");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function onFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      toast.error("Pick a rating first");
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    const { error } = await supabase.from("feedback").insert({
      user_id: userId,
      claim_id: id,
      rating,
      comment: comment.trim().slice(0, 1000) || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setSentFeedback(true);
    toast.success("Thanks for your feedback");
  }

  if (claimQuery.isLoading) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="flex items-center justify-center py-32 text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Loading your assessment…
        </div>
      </div>
    );
  }

  if (claimQuery.isError || !claim) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-md px-5 py-28 text-center">
          <h1 className="text-2xl font-semibold">Claim not found</h1>
          <Button asChild className="mt-6">
            <Link to="/upload">Start a new claim</Link>
          </Button>
        </div>
      </div>
    );
  }

  const damage = Number(claim.damage_percentage ?? 0);
  const repairs = estimateRepairs(claim.damaged_parts, regions, claim.severity);
  const verified = claim.verification_status === "verified";
  const decided = claim.verification_status !== "pending" && !(retry && !verified);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl space-y-10 px-5 py-14">
        {/* Damage detection */}
        <section>
          <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-primary">
            Section 3 · Detected damage
          </span>
          <h1 className="text-3xl font-bold">Damage report</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{claim.summary}</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {signedUrls.map((url, i) => (
              <DamageOverlay
                key={url || i}
                src={url}
                alt={`Uploaded vehicle photo ${i + 1} with damage outlined`}
                regions={regions.filter((r) => r.imageIndex === i)}
              />
            ))}
          </div>

          <div className="surface mt-6 grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Damage percentage
              </p>
              <p className="font-display text-5xl font-bold text-damage">{damage}%</p>
              <p className="mt-1 text-sm capitalize text-muted-foreground">
                Severity: {claim.severity ?? "unknown"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Damaged parts
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {claim.damaged_parts.length ? (
                  claim.damaged_parts.map((part) => (
                    <span
                      key={part}
                      className="rounded-full border border-damage/40 bg-damage/10 px-3 py-1 text-xs font-medium capitalize text-damage"
                    >
                      {part}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No damage detected</span>
                )}
              </div>
            </div>
          </div>

          {repairs.length > 0 && (
            <div className="surface mt-6 p-6">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Estimated repair cost
              </p>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {repairs.map((r) => (
                    <tr key={r.part} className="border-b border-border/60">
                      <td className="py-2 capitalize">{r.part}</td>
                      <td className="py-2 capitalize text-muted-foreground">{r.severity}</td>
                      <td className="py-2 text-right font-medium">{inr(r.cost)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="pt-3 font-semibold" colSpan={2}>
                      Total estimate
                    </td>
                    <td className="pt-3 text-right font-display text-lg font-bold">
                      {inr(repairs.reduce((s, r) => s + r.cost, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                Indicative parts + labour prices; final cost depends on the garage.
              </p>
            </div>
          )}
        </section>

        {/* Policy details */}
        <section>
          <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-primary">
            Section 4 · Policy verification
          </span>
          <h2 className="text-2xl font-bold">Your insurance details</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            We match these against the insurer's records to confirm the policy is genuine.
          </p>

          {!decided ? (
            <form onSubmit={onVerify} className="surface mt-6 grid gap-4 p-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="holderName">Policy holder name</Label>
                <Input
                  id="holderName"
                  value={form.holderName}
                  maxLength={100}
                  onChange={(e) => setForm({ ...form, holderName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="policyNumber">Policy number</Label>
                <Input
                  id="policyNumber"
                  value={form.policyNumber}
                  maxLength={40}
                  placeholder="AC-100001"
                  onChange={(e) => setForm({ ...form, policyNumber: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Type of insurance</Label>
                <Select
                  value={form.insuranceType}
                  onValueChange={(v) => setForm({ ...form, insuranceType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INSURANCE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Vehicle type</Label>
                <Select
                  value={form.vehicleType}
                  onValueChange={(v) => setForm({ ...form, vehicleType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vehicleModel">Vehicle model</Label>
                <Input
                  id="vehicleModel"
                  value={form.vehicleModel}
                  maxLength={80}
                  placeholder="Hyundai i20"
                  onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="insuredAmount">Insured amount</Label>
                <Input
                  id="insuredAmount"
                  type="number"
                  min="0"
                  value={form.insuredAmount}
                  onChange={(e) => setForm({ ...form, insuredAmount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="policyDate">Policy date</Label>
                <Input
                  id="policyDate"
                  type="date"
                  value={form.policyDate}
                  onChange={(e) => setForm({ ...form, policyDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amountPaid">Amount paid so far</Label>
                <Input
                  id="amountPaid"
                  type="number"
                  min="0"
                  value={form.amountPaid}
                  onChange={(e) => setForm({ ...form, amountPaid: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  className="mb-3 w-full"
                  onClick={() =>
                    setForm({
                      holderName: "Arjun Mehta",
                      policyNumber: "AC-100001",
                      insuranceType: "comprehensive",
                      vehicleType: "car",
                      vehicleModel: "Hyundai i20",
                      insuredAmount: "650000",
                      policyDate: "2024-03-14",
                      amountPaid: "48000",
                    })
                  }
                >
                  Fill with demo policy
                </Button>
                <Button type="submit" size="lg" className="w-full" disabled={busy}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="size-4" />
                  )}
                  Verify my policy
                </Button>
                <p className="mt-3 text-xs text-muted-foreground">
                  Demo records you can try: AC-100001 · Arjun Mehta · car · Hyundai i20 ·
                  comprehensive · insured 650000 · paid 48000 · 2024-03-14
                </p>
              </div>
            </form>
          ) : (
            <div className="surface mt-6 p-6">
              <div className="flex items-start gap-3">
                {verified ? (
                  <BadgeCheck className="mt-0.5 size-6 shrink-0 text-success" />
                ) : (
                  <ShieldAlert className="mt-0.5 size-6 shrink-0 text-damage" />
                )}
                <div>
                  <h3 className="text-lg font-semibold">
                    {verified
                      ? "Policy verified — you are a legitimate policy holder"
                      : "Policy could not be verified"}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {claim.verification_reason}
                  </p>
                </div>
              </div>

              {verified && (
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-secondary/40 p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Your claim ID
                    </p>
                    <p className="mt-1 font-display text-2xl font-bold">
                      {claim.claim_reference ?? "Awaiting insurer approval"}
                    </p>
                    {!claim.claim_reference && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Your request has been sent to the insurer. They will assign a unique claim ID once approved.
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border border-primary/30 bg-primary/10 p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-primary">
                      Amount you can claim
                    </p>
                    <p className="mt-1 font-display text-2xl font-bold text-primary">
                      {Number(claim.claimable_amount ?? 0).toLocaleString()}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Based on {damage}% damage and your {claim.insurance_type?.replace("_", " ")}{" "}
                      cover.
                    </p>
                  </div>
                </div>
              )}

              {verified && (
                <div className="mt-6 space-y-4">
                  <ClaimStatusTracker status={claim.claim_status} note={claim.status_note} />
                  {claim.claim_status === "approved" && (
                    <BankForm claimId={id} onDone={() => claimQuery.refetch()} />
                  )}
                  {claim.claim_status === "processing" && (
                    <div className="rounded-xl border border-primary/30 bg-primary/10 p-5">
                      <p className="font-semibold text-primary">In process</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Bank details received for account ending {claim.bank_account_number?.slice(-4)}. The money will be credited to your account in 2–5 working days.
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <Button asChild variant="outline">
                      <Link to="/report/$id" params={{ id }}>
                        <FileDown className="size-4" /> Download claim report
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link to="/garages">
                        <MapPin className="size-4" /> Find a garage nearby
                      </Link>
                    </Button>
                  </div>
                </div>
              )}

              {!verified && (
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button onClick={() => setRetry(true)}>Edit details and try again</Button>
                  <Button asChild variant="outline">
                    <Link to="/upload">
                      Start again <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Feedback */}
        {decided && (
          <section>
            <h2 className="text-2xl font-bold">How did that go?</h2>
            {sentFeedback ? (
              <p className="surface mt-4 p-6 text-sm text-muted-foreground">
                Thanks — your feedback has been recorded.
              </p>
            ) : (
              <form onSubmit={onFeedback} className="surface mt-4 space-y-4 p-6">
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={`${value} star`}
                      onClick={() => setRating(value)}
                      className="rounded p-1"
                    >
                      <Star
                        className={
                          value <= rating
                            ? "size-6 fill-warning text-warning"
                            : "size-6 text-muted-foreground"
                        }
                      />
                    </button>
                  ))}
                </div>
                <Textarea
                  value={comment}
                  maxLength={1000}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Tell us how the assessment felt (optional)"
                  rows={3}
                />
                <Button type="submit">Send feedback</Button>
              </form>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function BankForm({ claimId, onDone }: { claimId: string; onDone: () => void }) {
  const [f, setF] = useState({ name: "", number: "", confirm: "", ifsc: "", bank: "" });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const number = f.number.replace(/\s/g, "");
    const ifsc = f.ifsc.trim().toUpperCase();
    if (f.name.trim().length < 2) { toast.error("Enter the account holder name"); return; }
    if (!/^\d{9,18}$/.test(number)) { toast.error("Account number must be 9–18 digits"); return; }
    if (number !== f.confirm.replace(/\s/g, "")) { toast.error("Account numbers do not match"); return; }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) { toast.error("Enter a valid IFSC code, e.g. SBIN0001234"); return; }
    setBusy(true);
    const { error } = await supabase
      .from("claims")
      .update({
        bank_account_name: f.name.trim().slice(0, 100),
        bank_account_number: number,
        bank_ifsc: ifsc,
        bank_name: f.bank.trim().slice(0, 100) || null,
        claim_status: "processing",
      })
      .eq("id", claimId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Bank details submitted");
    onDone();
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border p-5">
      <div>
        <p className="font-semibold">Your claim is approved</p>
        <p className="text-sm text-muted-foreground">Enter your bank account details to receive the payout.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label>Account holder name</Label><Input value={f.name} onChange={set("name")} maxLength={100} /></div>
        <div className="space-y-1"><Label>Bank name</Label><Input value={f.bank} onChange={set("bank")} maxLength={100} /></div>
        <div className="space-y-1"><Label>Account number</Label><Input value={f.number} onChange={set("number")} inputMode="numeric" maxLength={20} /></div>
        <div className="space-y-1"><Label>Confirm account number</Label><Input value={f.confirm} onChange={set("confirm")} inputMode="numeric" maxLength={20} /></div>
        <div className="space-y-1"><Label>IFSC code</Label><Input value={f.ifsc} onChange={set("ifsc")} maxLength={11} /></div>
      </div>
      <Button type="submit" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Submit bank details</Button>
    </form>
  );
}
