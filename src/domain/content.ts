import { z } from "zod";
import {
  FLOWER_VARIETIES,
  QUESTION_BANK,
  SURPRISE_KINDS,
  type FlowerContent,
  type FlowerVariety,
  type MemoryContent,
  type NoteContent,
  type PetalContent,
  type PetalType,
  type PhotoContent,
  type QuestionContent,
  type SongContent,
  type SurpriseContent,
  type SurpriseKind,
} from "./types";

const trimmed = (max: number) => z.string().trim().max(max);

export const contentSchemas = {
  note: z
    .object({
      text: z.string().trim().min(1).max(2000),
    })
    .strict(),
  flower: z
    .object({
      variety: z.enum(FLOWER_VARIETIES),
      note: trimmed(280).optional().default(""),
    })
    .strict(),
  memory: z
    .object({
      title: z.string().trim().min(1).max(120),
      date: z
        .string()
        .trim()
        .max(40)
        .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "date")
        .optional()
        .default(""),
      place: trimmed(120).optional().default(""),
      text: trimmed(2000).optional().default(""),
      mediaId: z.string().uuid().nullable().optional().default(null),
    })
    .strict(),
  photo: z
    .object({
      mediaId: z.string().uuid(),
      caption: trimmed(280).optional().default(""),
    })
    .strict(),
  song: z
    .object({
      title: z.string().trim().min(1).max(160),
      artist: trimmed(160).optional().default(""),
      url: trimmed(500)
        .refine((value) => value === "" || isHttpUrl(value), "url")
        .optional()
        .default(""),
      note: trimmed(500).optional().default(""),
      mediaId: z.string().uuid().nullable().optional().default(null),
    })
    .strict(),
  question: z
    .object({
      prompt: z.string().trim().min(1).max(280),
      senderNote: trimmed(500).optional().default(""),
      questionId: z.string().trim().max(40).optional(),
    })
    .strict(),
  surprise: z
    .object({
      kind: z.enum(SURPRISE_KINDS),
      message: z.string().trim().min(1).max(1000),
    })
    .strict(),
} satisfies Record<PetalType, z.ZodTypeAny>;

export const scheduleSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  })
  .strict();

export type ScheduleInput = z.infer<typeof scheduleSchema>;

export const createPetalSchema = z
  .object({
    type: z.enum(["note", "flower", "memory", "photo", "song", "question", "surprise"]),
    content: z.unknown(),
    schedule: scheduleSchema.nullable(),
    expiresInDays: z.union([z.literal(1), z.literal(3), z.literal(7)]).nullable(),
    random: z.boolean().optional().default(false),
  })
  .strict();

export const updatePetalSchema = z
  .object({
    content: z.unknown(),
    schedule: scheduleSchema.nullable(),
    expiresInDays: z.union([z.literal(1), z.literal(3), z.literal(7)]).nullable(),
    expectedUpdatedAt: z.number().int(),
  })
  .strict();

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function safeHttpUrl(value: string): string | null {
  if (!value || !isHttpUrl(value)) return null;
  const url = new URL(value);
  if (url.username || url.password) return null;
  return url.toString();
}

export function parseContent(type: PetalType, content: unknown): PetalContent {
  const parsed = contentSchemas[type].parse(content);
  return parsed as PetalContent;
}

export function mediaIdsOf(type: PetalType, content: PetalContent): string[] {
  if (type === "photo") return [(content as PhotoContent).mediaId];
  if (type === "memory") {
    const id = (content as MemoryContent).mediaId;
    return id ? [id] : [];
  }
  if (type === "song") {
    const id = (content as SongContent).mediaId;
    return id ? [id] : [];
  }
  return [];
}

export function expectedMediaKind(type: PetalType): "image" | "audio" | null {
  if (type === "photo" || type === "memory") return "image";
  if (type === "song") return "audio";
  return null;
}

export function emptyContent(type: PetalType): PetalContent {
  switch (type) {
    case "note":
      return { text: "" } satisfies NoteContent;
    case "flower":
      return { variety: "ranunculus", note: "" } satisfies FlowerContent;
    case "memory":
      return { title: "", date: "", place: "", text: "", mediaId: null } satisfies MemoryContent;
    case "photo":
      return { mediaId: "", caption: "" } satisfies PhotoContent;
    case "song":
      return { title: "", artist: "", url: "", note: "", mediaId: null } satisfies SongContent;
    case "question":
      return { prompt: QUESTION_BANK[0].prompt, senderNote: "", questionId: QUESTION_BANK[0].id } satisfies QuestionContent;
    case "surprise":
      return { kind: "seal", message: "" } satisfies SurpriseContent;
  }
}

export function contentReady(type: PetalType, content: unknown): boolean {
  const result = contentSchemas[type].safeParse(content);
  return result.success;
}

export function varietyOr(value: string | undefined, fallback: FlowerVariety): FlowerVariety {
  return FLOWER_VARIETIES.includes(value as FlowerVariety) ? (value as FlowerVariety) : fallback;
}

export function surpriseOr(value: string | undefined, fallback: SurpriseKind): SurpriseKind {
  return SURPRISE_KINDS.includes(value as SurpriseKind) ? (value as SurpriseKind) : fallback;
}
