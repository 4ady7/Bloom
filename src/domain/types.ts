import { FLOWER_KEYS } from "./flowers";

export const PETAL_TYPES = [
  "note",
  "flower",
  "memory",
  "photo",
  "song",
  "question",
  "surprise",
] as const;

export type PetalType = (typeof PETAL_TYPES)[number];

export const FLOWER_VARIETIES = FLOWER_KEYS;
export type FlowerVariety = (typeof FLOWER_VARIETIES)[number];

export const SURPRISE_KINDS = ["hold", "stars", "seal"] as const;
export type SurpriseKind = (typeof SURPRISE_KINDS)[number];

export const RANDOM_ELIGIBLE: PetalType[] = ["note", "flower", "question", "surprise", "memory"];

export type GardenKind = "flower" | "leaf" | "star" | "light" | "lantern";

export const GARDEN_KIND: Record<PetalType, GardenKind> = {
  note: "leaf",
  flower: "flower",
  memory: "light",
  photo: "light",
  song: "star",
  question: "lantern",
  surprise: "star",
};

export interface QuestionPrompt {
  id: string;
  prompt: string;
}

export const QUESTION_BANK: QuestionPrompt[] = [
  { id: "smile", prompt: "What is one tiny thing that made you smile today?" },
  { id: "forward", prompt: "What are you looking forward to, even a little?" },
  { id: "hour", prompt: "If we had an hour with nowhere to be, what would you want to do?" },
  { id: "day", prompt: "What's a small thing you wish I knew about your day?" },
  { id: "eat", prompt: "What should we eat the next time we're together?" },
  { id: "place", prompt: "What place feels like you lately?" },
  { id: "keep", prompt: "What is something small you want to keep from this week?" },
  { id: "soft", prompt: "What has felt soft, or kind, in the last few days?" },
];

export interface NoteContent {
  text: string;
}
export interface FlowerContent {
  variety: FlowerVariety;
  note: string;
}
export interface MemoryContent {
  title: string;
  date: string;
  place: string;
  text: string;
  mediaId: string | null;
}
export interface PhotoContent {
  mediaId: string;
  caption: string;
}
export interface SongContent {
  title: string;
  artist: string;
  url: string;
  note: string;
  mediaId: string | null;
}
export interface QuestionContent {
  prompt: string;
  senderNote: string;
  questionId?: string;
}
export interface SurpriseContent {
  kind: SurpriseKind;
  message: string;
}

export type PetalContent =
  | NoteContent
  | FlowerContent
  | MemoryContent
  | PhotoContent
  | SongContent
  | QuestionContent
  | SurpriseContent;

export interface PetalMetadata {
  source?: "random" | "chosen";
  questionId?: string;
  variety?: string;
  surpriseKind?: string;
}

export const PETAL_LABEL: Record<PetalType, string> = {
  note: "A note",
  flower: "A flower",
  memory: "A memory",
  photo: "A photo",
  song: "A song",
  question: "A question",
  surprise: "A surprise",
};

export const PETAL_HINT: Record<PetalType, string> = {
  note: "A few words, left where they'll find them.",
  flower: "Something beautiful, with or without a line inside.",
  memory: "A day, a place, a picture you both know.",
  photo: "A picture, and maybe a caption.",
  song: "A song that made you think of them.",
  question: "A small question. They don't have to answer.",
  surprise: "A little gesture before the words.",
};

export type PetalStatus = "scheduled" | "sealed" | "opened" | "cancelled" | "expired";

export interface PublicUser {
  id: string;
  displayName: string;
  timezone: string;
  email: string;
}

export interface PublicPetal {
  id: string;
  type: PetalType;
  content: PetalContent;
  metadata: PetalMetadata;
  status: PetalStatus;
  fromYou: boolean;
  senderName: string;
  createdAt: number;
  updatedAt: number;
  scheduledFor: number | null;
  openedAt: number | null;
  expiresAt: number | null;
  response: { body: string; createdAt: number } | null;
  /** Set when a flower petal has been planted into a shared garden. */
  plantedInGardenId: string | null;
}

export interface GardenElement {
  id: string;
  petalId: string;
  kind: GardenKind;
  variant: string;
  stage: "bud" | "bloom" | "withered";
  createdAt: number;
}

export type Season = "spring" | "summer" | "autumn" | "winter";

export interface QuietNote {
  id: string;
  petalId: string | null;
  body: string;
  createdAt: number;
}
