import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, ScanLine, FileCheck2, BadgeIndianRupee, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { useSession } from "@/lib/use-session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AutoClaim — Welcome to automatic insurance claiming" },
      {
        name: "description",
        content:
          "Upload photos of your damaged vehicle. AutoClaim outlines the damage, scores it, verifies your policy and shows the amount you can claim.",
      },
      { property: "og:title", content: "AutoClaim — Automatic insurance claiming" },
      {
        property: "og:description",
        content:
          "Photo-based vehicle damage detection, policy verification and instant claim estimates.",
      },
    ],
  }),
  component: Index,
});

const steps = [
  {
    icon: Camera,
    title: "Upload photos",
    body: "Add clear pictures of the damaged parts of your vehicle from any angle.",
  },
  {
    icon: ScanLine,
    title: "Damage detected",
    body: "Damaged panels are outlined in red and scored as a damage percentage.",
  },
  {
    icon: FileCheck2,
    title: "Policy verified",
    body: "Your policy details are matched against the insurer's records.",
  },
  {
    icon: BadgeIndianRupee,
    title: "Claim amount",
    body: "Get a claim ID and the amount payable for your damage type.",
  },
];

function Index() {
  const { user } = useSession();

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main>
        <section className="mx-auto w-full max-w-6xl px-5 pb-16 pt-20 sm:pt-28">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-primary">
            Section 1 · Welcome
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.05] sm:text-6xl">
            <span className="text-gradient">Welcome to automatic insurance claiming</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            AutoClaim reads the photos of your damaged vehicle, marks every damaged part in
            red, works out how badly it is damaged, checks your policy against the insurer's
            records and tells you exactly what you can claim.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link to={user ? "/upload" : "/auth"}>
                {user ? "Start a claim" : "Log in / Sign up to continue"}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <span className="text-sm text-muted-foreground">
              Takes about two minutes end to end.
            </span>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 pb-24">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <article key={step.title} className="surface p-6">
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/12 text-primary">
                    <step.icon className="size-5" />
                  </span>
                  <span className="font-display text-3xl font-bold text-border">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h2 className="mt-5 text-lg font-semibold">{step.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70 py-8">
        <p className="mx-auto max-w-6xl px-5 text-sm text-muted-foreground">
          AutoClaim · damage estimates are indicative and subject to insurer approval.
        </p>
      </footer>
    </div>
  );
}
