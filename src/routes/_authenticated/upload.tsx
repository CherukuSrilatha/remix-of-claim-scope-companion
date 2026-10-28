import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ImagePlus, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { analyzeDamage } from "@/lib/claims.functions";
import { fileToCompressedDataUrl, dataUrlToBlob } from "@/lib/image-utils";

export const Route = createFileRoute("/_authenticated/upload")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (userId) {
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });
      if (isAdmin) throw redirect({ to: "/admin" });
    }
  },
  head: () => ({
    meta: [
      { title: "Upload damage photos — AutoClaim" },
      {
        name: "description",
        content:
          "Upload photos of the damaged parts of your vehicle so AutoClaim can detect and outline the damage.",
      },
      { property: "og:title", content: "Upload damage photos — AutoClaim" },
      {
        property: "og:description",
        content: "Photo upload step of the AutoClaim automatic vehicle claim process.",
      },
    ],
  }),
  component: UploadPage,
});

function UploadPage() {
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const analyze = useServerFn(analyzeDamage);
  const navigate = useNavigate();

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    const room = 4 - previews.length;
    if (room <= 0) {
      toast.error("You can add up to 4 photos");
      return;
    }
    try {
      const encoded = await Promise.all(files.slice(0, room).map(fileToCompressedDataUrl));
      setPreviews((current) => [...current, ...encoded]);
    } catch {
      toast.error("One of those files could not be read as an image");
    }
  }

  async function onAnalyze() {
    if (!previews.length) {
      toast.error("Add at least one photo of the damage");
      return;
    }
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Your session expired. Please log in again.");

      const batch = crypto.randomUUID();
      const paths: string[] = [];
      for (const [i, preview] of previews.entries()) {
        const path = `${userId}/${batch}-${i}.jpg`;
        const { error } = await supabase.storage
          .from("claim-images")
          .upload(path, dataUrlToBlob(preview), { contentType: "image/jpeg" });
        if (error) throw new Error(error.message);
        paths.push(path);
      }

      const result = await analyze({ data: { images: previews, storagePaths: paths } });
      if (!result.isVehicle) {
        toast.warning("We could not recognise a vehicle — check the assessment.");
      }
      navigate({ to: "/claim/$id", params: { id: result.claimId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Assessment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-5 py-14">
        <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-primary">
          Section 3 · Damage photos
        </span>
        <h1 className="text-3xl font-bold">Upload photos of the damaged part</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add up to 4 clear, well-lit photos. AutoClaim will outline every damaged area in red.
        </p>

        <div className="surface mt-8 p-6">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/40 px-6 py-12 text-center transition-colors hover:border-primary/60">
            <ImagePlus className="size-7 text-primary" />
            <span className="font-medium">Choose photos</span>
            <span className="text-xs text-muted-foreground">JPG or PNG, up to 4 images</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={onPick}
              disabled={busy}
            />
          </label>

          {previews.length > 0 && (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {previews.map((src, i) => (
                <div key={i} className="relative overflow-hidden rounded-lg border border-border">
                  <img src={src} alt={`Damage photo ${i + 1}`} className="h-28 w-full object-cover" />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => setPreviews((c) => c.filter((_, index) => index !== i))}
                    className="absolute right-1 top-1 rounded-md bg-background/85 p-1 text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <Button className="mt-6 w-full" size="lg" onClick={onAnalyze} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ScanLine className="size-4" />}
            {busy ? "Detecting damage…" : "Detect damage"}
          </Button>
        </div>
      </main>
    </div>
  );
}
