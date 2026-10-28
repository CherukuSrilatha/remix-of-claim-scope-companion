export type DamageRegion = {
  imageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  part: string;
  severity?: string;
};

export function DamageOverlay({
  src,
  regions,
  alt,
}: {
  src: string;
  regions: DamageRegion[];
  alt: string;
}) {
  return (
    <figure className="relative overflow-hidden rounded-xl border border-border bg-secondary">
      <img src={src} alt={alt} className="block w-full object-contain" />
      {regions.map((region, i) => (
        <div
          key={i}
          className="absolute rounded-[4px] border-2 border-damage shadow-[0_0_0_9999px_transparent]"
          style={{
            left: `${region.x * 100}%`,
            top: `${region.y * 100}%`,
            width: `${region.width * 100}%`,
            height: `${region.height * 100}%`,
            backgroundColor: "color-mix(in oklab, var(--color-damage) 14%, transparent)",
          }}
        >
          <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-damage px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive-foreground">
            {region.part}
          </span>
        </div>
      ))}
    </figure>
  );
}
