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
    <svg viewBox="0 0 120 160" role="img" aria-label={faded ? "A faded flower" : "A flower"}>
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

function petalColor(variety: string): string {
  if (variety === "poppy") return "#c4493a";
  if (variety === "sweet-pea") return "#d989b6";
  if (variety === "cosmos") return "#e7b3c2";
  if (variety === "anemone") return "#6e4b73";
  return "#e7a090";
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
  if (variety === "cosmos") {
    return Array.from({ length: 8 }, (_, index) => {
      const angle = index * 45;
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
  if (variety === "anemone") {
    return Array.from({ length: 6 }, (_, index) => ({
      cx: 60,
      cy: 42,
      rx: 10,
      ry: 16,
      opacity: 0.92,
      transform: `rotate(${index * 60} 60 62)`,
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
