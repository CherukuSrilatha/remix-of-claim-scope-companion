import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { LocateFixed, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/_authenticated/garages")({
  head: () => ({
    meta: [
      { title: "Nearby garages — AutoClaim" },
      { name: "description", content: "Find car repair garages near you to fix your vehicle damage." },
      { property: "og:title", content: "Nearby garages — AutoClaim" },
      { property: "og:description", content: "Map of vehicle repair shops close to you." },
    ],
  }),
  component: GaragesPage,
});

function GaragesPage() {
  const [query, setQuery] = useState("car repair garage");
  const [city, setCity] = useState("");

  function useMyLocation() {
    if (!navigator.geolocation) { toast.error("Location is not available on this device"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setQuery(`car repair garage near ${pos.coords.latitude},${pos.coords.longitude}`),
      () => toast.error("Allow location access, or type your city instead"),
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-5 py-14">
        <h1 className="text-3xl font-bold">Garages near you</h1>
        <p className="mt-2 text-sm text-muted-foreground">Find a repair shop to get your vehicle fixed.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={useMyLocation}><LocateFixed className="size-4" /> Use my location</Button>
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (city.trim()) setQuery(`car repair garage in ${city.trim()}`);
            }}
          >
            <Input value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} placeholder="Or type your city / area" />
            <Button type="submit" variant="outline"><Search className="size-4" /> Search</Button>
          </form>
        </div>
        <div className="surface mt-6 overflow-hidden p-0">
          <iframe
            title="Nearby garages map"
            className="h-[520px] w-full border-0"
            loading="lazy"
            src={`https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`}
          />
        </div>
      </main>
    </div>
  );
}
