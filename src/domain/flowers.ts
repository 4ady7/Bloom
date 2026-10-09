export const FLOWER_STYLES = [
  "illustrated",
  "watercolor",
  "whimsical",
  "botanical",
  "minimal",
  "fantasy",
  "hand-drawn",
  "realistic",
] as const;

export type FlowerStyle = (typeof FLOWER_STYLES)[number];

export interface FlowerDefinition {
  key: string;
  label: string;
  family: string;
  styles: FlowerStyle[];
  color: string;
  description: string;
}

/** Built-in illustrated flowers. Add a row here to teach Bloom a new bloom. */
export const FLOWER_CATALOG: FlowerDefinition[] = [
  {
    key: "ranunculus",
    label: "Ranunculus",
    family: "soft",
    styles: ["illustrated", "watercolor"],
    color: "#e7a090",
    description: "Many soft petals, close and warm.",
  },
  {
    key: "poppy",
    label: "Poppy",
    family: "wild",
    styles: ["illustrated", "hand-drawn"],
    color: "#c4493a",
    description: "Bright and brief, like a thought.",
  },
  {
    key: "sweet-pea",
    label: "Sweet pea",
    family: "soft",
    styles: ["illustrated", "watercolor"],
    color: "#d989b6",
    description: "A quiet climbing bloom.",
  },
  {
    key: "cosmos",
    label: "Cosmos",
    family: "wild",
    styles: ["illustrated", "minimal"],
    color: "#e7b3c2",
    description: "Open faces toward the light.",
  },
  {
    key: "anemone",
    label: "Anemone",
    family: "soft",
    styles: ["illustrated", "botanical"],
    color: "#6e4b73",
    description: "A dark center in pale petals.",
  },
  {
    key: "tulip",
    label: "Tulip",
    family: "garden",
    styles: ["illustrated", "botanical"],
    color: "#d46a6a",
    description: "A simple cup of color.",
  },
  {
    key: "rose",
    label: "Rose",
    family: "garden",
    styles: ["illustrated", "watercolor"],
    color: "#b84a5a",
    description: "Layered, familiar, still surprising.",
  },
  {
    key: "daisy",
    label: "Daisy",
    family: "wild",
    styles: ["illustrated", "whimsical", "minimal"],
    color: "#f2e8c9",
    description: "Open and ordinary in the best way.",
  },
  {
    key: "lavender",
    label: "Lavender",
    family: "herb",
    styles: ["illustrated", "botanical"],
    color: "#8f7bb5",
    description: "A tall, quiet scent of purple.",
  },
  {
    key: "sunflower",
    label: "Sunflower",
    family: "garden",
    styles: ["illustrated", "whimsical"],
    color: "#e4b84a",
    description: "A face that finds the sun.",
  },
  {
    key: "wildflower",
    label: "Wildflower",
    family: "wild",
    styles: ["illustrated", "hand-drawn", "whimsical"],
    color: "#7aa36b",
    description: "Whatever grows where it wants.",
  },
  {
    key: "fantasy",
    label: "Fantasy bloom",
    family: "fantasy",
    styles: ["fantasy", "whimsical"],
    color: "#6fa8c9",
    description: "A flower that only exists between you.",
  },
];

export const FLOWER_KEYS = FLOWER_CATALOG.map((item) => item.key) as [string, ...string[]];

export function flowerOf(key: string): FlowerDefinition {
  return FLOWER_CATALOG.find((item) => item.key === key) ?? FLOWER_CATALOG[0];
}

export function isFlowerKey(value: string): boolean {
  return FLOWER_CATALOG.some((item) => item.key === value);
}

export function isFlowerStyle(value: string): value is FlowerStyle {
  return (FLOWER_STYLES as readonly string[]).includes(value);
}

export function defaultStyleFor(key: string): FlowerStyle {
  return flowerOf(key).styles[0] ?? "illustrated";
}

/** Map older petal variety names onto the catalog. */
export function normalizeFlowerKey(value: string | undefined | null): string {
  if (!value) return "ranunculus";
  if (isFlowerKey(value)) return value;
  return "ranunculus";
}
