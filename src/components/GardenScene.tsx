import type { GardenElement, Season } from "@/domain/types";

export function GardenScene({
  elements,
  season,
  caption,
}: {
  elements: GardenElement[];
  season: Season;
  caption?: string;
}) {
  const shown = elements.slice(-48);
  return (
    <figure className="garden-figure">
      <svg className="garden-scene" viewBox="0 0 360 280" role="img" aria-label={caption ?? "Your garden"}>
        <path d="M20 214 C 90 188, 150 230, 210 206 S 320 188, 344 214" fill="none" stroke="var(--sage)" strokeWidth="2" />
        <path d="M16 230 H344" stroke="var(--line)" strokeWidth="1" />
        {season === "winter" &&
          [40, 90, 150, 220, 300].map((x) => <circle key={x} cx={x} cy={36 + (x % 20)} r="1.4" fill="var(--ink-soft)" opacity="0.5" />)}
        {shown.length === 0 && (
          <g>
            <path d="M180 214 V150" stroke="var(--sage)" strokeWidth="2" />
            <ellipse cx="180" cy="142" rx="10" ry="16" fill="var(--bud)" />
          </g>
        )}
        {shown.map((element, index) => {
          const spot = place(element.id, index);
          return (
            <g key={element.id} transform={`translate(${spot.x} ${spot.y}) rotate(${spot.rotate})`}>
              <GardenMark element={element} />
            </g>
          );
        })}
      </svg>
      {caption ? <figcaption className="garden-caption">{caption}</figcaption> : null}
    </figure>
  );
}

function place(id: string, index: number) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const x = 28 + (Math.abs(hash) % 300);
  const y = 86 + (Math.abs(hash >>> 8) % 110) - (index % 3) * 6;
  const rotate = (Math.abs(hash) % 24) - 12;
  return { x, y, rotate };
}

function GardenMark({ element }: { element: GardenElement }) {
  const faded = element.stage === "withered";
  const color = faded ? "var(--ink-soft)" : colorFor(element);
  if (element.kind === "leaf") {
    return (
      <g>
        <path d="M0 20 C 10 8, 18 8, 20 0 C 12 12, 6 16, 0 20 Z" fill={color} />
      </g>
    );
  }
  if (element.kind === "star") {
    return <path d="M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2 Z" fill={color} />;
  }
  if (element.kind === "light") {
    return <circle r={element.stage === "bud" ? 4 : 6} fill={color} opacity={element.stage === "bud" ? 0.45 : 0.9} />;
  }
  if (element.kind === "lantern") {
    return <rect x="-5" y="-8" width="10" height="14" rx="3" fill={color} />;
  }
  if (element.stage === "bud") return <ellipse cx="0" cy="0" rx="5" ry="9" fill="var(--bud)" />;
  return (
    <g>
      <ellipse cx="0" cy="-6" rx="4" ry="7" fill={color} />
      <ellipse cx="6" cy="0" rx="4" ry="7" fill={color} transform="rotate(72)" />
      <ellipse cx="2" cy="6" rx="4" ry="7" fill={color} transform="rotate(144)" />
      <circle r="2.2" fill="var(--gold)" />
    </g>
  );
}

function colorFor(element: GardenElement): string {
  if (element.variant === "poppy") return "#c4493a";
  if (element.variant === "sweet-pea") return "#d989b6";
  if (element.variant === "cosmos") return "#e7b3c2";
  if (element.variant === "anemone") return "#8d6a92";
  if (element.variant === "ranunculus") return "#e7a090";
  if (element.kind === "leaf") return "var(--sage)";
  if (element.kind === "star") return "var(--gold)";
  if (element.kind === "lantern") return "var(--rose)";
  return "var(--gold)";
}
