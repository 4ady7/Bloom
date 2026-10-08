import type { PetalType } from "./types";
import { FLOWER_VARIETIES, QUESTION_BANK, RANDOM_ELIGIBLE, SURPRISE_KINDS, type FlowerVariety, type SurpriseKind } from "./types";

export interface RecentPetal {
  type: string;
  createdAt: number;
  questionId?: string;
  variety?: string;
  surpriseKind?: string;
}

export function weightedPick<T extends string>(
  options: { id: T; weight: number }[],
  rng: () => number,
): T {
  const usable = options.filter((option) => option.weight > 0);
  const pool = usable.length > 0 ? usable : options;
  const total = pool.reduce((sum, option) => sum + option.weight, 0);
  let roll = rng() * total;
  for (const option of pool) {
    roll -= option.weight;
    if (roll <= 0) return option.id;
  }
  return pool[pool.length - 1].id;
}

export function typeWeights(
  history: RecentPetal[],
  now: number,
  eligible: PetalType[] = RANDOM_ELIGIBLE,
  avoidType?: string,
): { id: PetalType; weight: number }[] {
  const recent = [...history].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  const last = recent[0]?.type;
  return eligible.map((type) => {
    let weight = type === "memory" ? 0.7 : 1;
    const uses = recent.filter((item) => item.type === type).length;
    weight *= Math.pow(0.42, uses);
    if (type === last && eligible.length > 1) weight *= 0.08;
    if (type === avoidType && eligible.length > 1) weight *= 0.05;
    const lastUse = recent.find((item) => item.type === type);
    if (lastUse && now - lastUse.createdAt < 36 * 60 * 60 * 1000) weight *= 0.55;
    return { id: type, weight: Math.max(weight, 0.01) };
  });
}

export function selectPetalType(input: {
  history: RecentPetal[];
  now: number;
  rng?: () => number;
  avoidType?: string;
  eligible?: PetalType[];
}): PetalType {
  const eligible = input.eligible ?? RANDOM_ELIGIBLE;
  return weightedPick(typeWeights(input.history, input.now, eligible, input.avoidType), input.rng ?? Math.random);
}

function penalize<T extends string>(ids: readonly T[], recent: (string | undefined)[], avoid?: string) {
  const last = recent.find(Boolean);
  return ids.map((id) => {
    let weight = 1;
    const uses = recent.filter((item) => item === id).length;
    weight *= Math.pow(0.4, uses);
    if (id === last && ids.length > 1) weight *= 0.1;
    if (id === avoid && ids.length > 1) weight *= 0.05;
    return { id, weight: Math.max(weight, 0.01) };
  });
}

export function selectFlowerVariety(recent: (string | undefined)[], rng: () => number, avoid?: string): FlowerVariety {
  return weightedPick(penalize(FLOWER_VARIETIES, recent, avoid), rng);
}

export function selectSurpriseKind(recent: (string | undefined)[], rng: () => number, avoid?: string): SurpriseKind {
  return weightedPick(penalize(SURPRISE_KINDS, recent, avoid), rng);
}

export function selectQuestion(recent: (string | undefined)[], rng: () => number, avoid?: string) {
  const pick = weightedPick(
    penalize(
      QUESTION_BANK.map((item) => item.id),
      recent,
      avoid,
    ),
    rng,
  );
  return QUESTION_BANK.find((item) => item.id === pick) ?? QUESTION_BANK[0];
}
