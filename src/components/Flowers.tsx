import { flowerOf } from "@/domain/flowers";

export function FlowerArt({
  variety = "ranunculus",
  stage = "bloom",
}: {
  variety?: string;
  stage?: "bud" | "bloom" | "withered";
}) {
  if (stage === "bud") {
    return (
      <svg viewBox="0 0 120 160" role="img" aria-label="A closed bud">
        <path d="M60 150 V70" stroke="currentColor" strokeWidth="2" fill="none" />
        <ellipse cx="60" cy="58" rx="16" ry="28" fill="var(--bud)" />
        <ellipse cx="60" cy="62" rx="8" ry="22" fill="var(--rose)" opacity="0.7" />
      </svg>
    );
  }
  const faded = stage === "withered";
  const petal = faded ? "var(--ink-soft)" : petalColor(variety);
  return (
    <svg viewBox="0 0 120 160" role="img" aria-label={faded ? "A faded flower" : flowerOf(variety).label}>
      <path d="M60 150 V78" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M60 110 C40 100 30 90 34 78" stroke="var(--sage)" strokeWidth="2" fill="none" />
      <ellipse cx="28" cy="84" rx="14" ry="8" fill="var(--sage)" opacity="0.8" transform="rotate(-30 28 84)" />
      {petals(variety).map((p, index) => (
        <ellipse key={index} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill={petal} opacity={p.opacity} transform={p.transform} />
      ))}
      <circle cx="60" cy="62" r="6" fill={faded ? "var(--ink-soft)" : "var(--gold)"} />
    </svg>
  );
}

/** Compact mark for planting inside a garden stage. */
export function FlowerMark({ flowerKey, styleName = "illustrated" }: { flowerKey: string; styleName?: string }) {
  const color = petalColor(flowerKey);
  const watercolor = styleName === "watercolor" || styleName === "hand-drawn";
  const fantasy = styleName === "fantasy" || flowerKey === "fantasy";
  return (
    <svg viewBox="0 0 64 88" className="flower-mark" aria-hidden="true">
      <path d="M32 86 V44" stroke="var(--sage)" strokeWidth="2.2" fill="none" />
      <ellipse cx="20" cy="58" rx="10" ry="5" fill="var(--sage)" opacity="0.75" transform="rotate(-28 20 58)" />
      {fantasy ? <circle cx="32" cy="28" r="18" fill={color} opacity="0.22" /> : null}
      {petals(flowerKey).map((p, index) => (
        <ellipse
          key={index}
          cx={p.cx * (64 / 120)}
          cy={p.cy * (88 / 160)}
          rx={p.rx * (64 / 120) * (watercolor ? 1.08 : 1)}
          ry={p.ry * (88 / 160) * (watercolor ? 1.08 : 1)}
          fill={color}
          opacity={watercolor ? Math.min(1, p.opacity + 0.05) : p.opacity}
          transform={scaleTransform(p.transform, 64 / 120, 88 / 160)}
        />
      ))}
      <circle cx="32" cy="34" r={flowerKey === "sunflower" ? 7 : 4.2} fill={flowerKey === "sunflower" ? "#5a3b18" : "var(--gold)"} />
    </svg>
  );
}

function scaleTransform(transform: string, sx: number, sy: number): string {
  if (!transform) return "";
  const match = /rotate\(([-\d.]+) (\d+) (\d+)\)/.exec(transform);
  if (!match) return transform;
  return `rotate(${match[1]} ${Number(match[2]) * sx} ${Number(match[3]) * sy})`;
}

function petalColor(variety: string): string {
  return flowerOf(variety).color;
}

function petals(variety: string) {
  if (variety === "poppy") {
    return [
      { cx: 60, cy: 48, rx: 22, ry: 16, opacity: 0.95, transform: "" },
      { cx: 40, cy: 62, rx: 18, ry: 14, opacity: 0.9, transform: "rotate(-20 40 62)" },
      { cx: 80, cy: 62, rx: 18, ry: 14, opacity: 0.9, transform: "rotate(20 80 62)" },
      { cx: 60, cy: 74, rx: 16, ry: 12, opacity: 0.85, transform: "" },
    ];
  }
  if (variety === "cosmos" || variety === "daisy") {
    return Array.from({ length: variety === "daisy" ? 10 : 8 }, (_, index) => {
      const angle = index * (variety === "daisy" ? 36 : 45);
      return { cx: 60, cy: 40, rx: 7, ry: 18, opacity: 0.9, transform: `rotate(${angle} 60 62)` };
    });
  }
  if (variety === "sweet-pea") {
    return [
      { cx: 52, cy: 58, rx: 18, ry: 24, opacity: 0.95, transform: "rotate(-18 52 58)" },
      { cx: 70, cy: 54, rx: 16, ry: 22, opacity: 0.8, transform: "rotate(16 70 54)" },
      { cx: 60, cy: 46, rx: 10, ry: 14, opacity: 0.7, transform: "" },
    ];
  }
  if (variety === "anemone" || variety === "rose") {
    const count = variety === "rose" ? 8 : 6;
    return Array.from({ length: count }, (_, index) => ({
      cx: 60,
      cy: 42,
      rx: variety === "rose" ? 9 : 10,
      ry: variety === "rose" ? 14 : 16,
      opacity: 0.9,
      transform: `rotate(${index * (360 / count)} 60 62)`,
    }));
  }
  if (variety === "tulip") {
    return [
      { cx: 60, cy: 50, rx: 14, ry: 24, opacity: 0.95, transform: "" },
      { cx: 48, cy: 54, rx: 11, ry: 20, opacity: 0.85, transform: "rotate(-18 48 54)" },
      { cx: 72, cy: 54, rx: 11, ry: 20, opacity: 0.85, transform: "rotate(18 72 54)" },
    ];
  }
  if (variety === "lavender") {
    return [
      { cx: 60, cy: 36, rx: 5, ry: 8, opacity: 0.95, transform: "" },
      { cx: 60, cy: 48, rx: 6, ry: 9, opacity: 0.9, transform: "" },
      { cx: 60, cy: 60, rx: 6, ry: 9, opacity: 0.85, transform: "" },
      { cx: 52, cy: 44, rx: 5, ry: 7, opacity: 0.8, transform: "rotate(-12 52 44)" },
      { cx: 68, cy: 52, rx: 5, ry: 7, opacity: 0.8, transform: "rotate(12 68 52)" },
    ];
  }
  if (variety === "sunflower") {
    return Array.from({ length: 12 }, (_, index) => ({
      cx: 60,
      cy: 38,
      rx: 6,
      ry: 16,
      opacity: 0.92,
      transform: `rotate(${index * 30} 60 62)`,
    }));
  }
  if (variety === "wildflower") {
    return [
      { cx: 50, cy: 50, rx: 8, ry: 12, opacity: 0.9, transform: "rotate(-20 50 50)" },
      { cx: 68, cy: 46, rx: 7, ry: 11, opacity: 0.85, transform: "rotate(24 68 46)" },
      { cx: 58, cy: 58, rx: 9, ry: 10, opacity: 0.8, transform: "" },
    ];
  }
  if (variety === "fantasy") {
    return Array.from({ length: 7 }, (_, index) => ({
      cx: 60,
      cy: 40,
      rx: 8,
      ry: 18,
      opacity: 0.88,
      transform: `rotate(${index * 51.4} 60 62)`,
    }));
  }
  return Array.from({ length: 10 }, (_, index) => ({
    cx: 60,
    cy: 46,
    rx: 8,
    ry: 14,
    opacity: 0.88,
    transform: `rotate(${index * 36} 60 62)`,
  }));
}
