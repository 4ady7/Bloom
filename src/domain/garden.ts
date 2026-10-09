import type { FlowerStyle } from "./flowers";

export const GARDEN_THEMES = ["meadow", "night", "memory", "secret", "summer"] as const;
export type GardenTheme = (typeof GARDEN_THEMES)[number];

export const GARDEN_THEME_LABEL: Record<GardenTheme, string> = {
  meadow: "Meadow light",
  night: "Night garden",
  memory: "Memory garden",
  secret: "Secret garden",
  summer: "Summer garden",
};

export const MAX_GARDENS_PER_RELATIONSHIP = 12;
export const MAX_FLOWERS_PER_GARDEN = 400;

export interface PublicGarden {
  id: string;
  name: string;
  description: string;
  theme: GardenTheme;
  isPrimary: boolean;
  flowerCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface PublicGardenFlower {
  id: string;
  gardenId: string;
  flowerKey: string;
  style: FlowerStyle;
  assetKind: "builtin" | "generated";
  assetRef: string | null;
  petalId: string | null;
  givenBy: string;
  givenByName: string;
  plantedBy: string;
  plantedByName: string;
  message: string;
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  plantedAt: number;
  updatedAt: number;
}

export interface Placement {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
}

export function isGardenTheme(value: string): value is GardenTheme {
  return (GARDEN_THEMES as readonly string[]).includes(value);
}

/**
 * Place a flower in normalized garden space (0..1).
 * Soil sits in the lower band; slight randomness; avoid close neighbors.
 */
export function placeInGarden(
  existing: { x: number; y: number }[],
  seed: string,
  attemptExtra = 0,
): Placement {
  const rand = mulberry(seed + String(attemptExtra));
  for (let attempt = 0; attempt < 28; attempt += 1) {
    const x = 0.08 + rand() * 0.84;
    const y = 0.42 + rand() * 0.48;
    if (existing.every((spot) => distance(spot.x, spot.y, x, y) >= 0.055)) {
      return {
        x: clamp(x, 0.05, 0.95),
        y: clamp(y, 0.38, 0.92),
        z: Math.floor(y * 1000),
        scale: 0.78 + rand() * 0.4,
        rotation: (rand() - 0.5) * 28,
      };
    }
  }
  const fallbackX = 0.12 + (existing.length % 8) * 0.1;
  const fallbackY = 0.5 + (Math.floor(existing.length / 8) % 5) * 0.08;
  return {
    x: clamp(fallbackX, 0.05, 0.95),
    y: clamp(fallbackY, 0.4, 0.92),
    z: Math.floor(fallbackY * 1000),
    scale: 0.9,
    rotation: (rand() - 0.5) * 12,
  };
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mulberry(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
