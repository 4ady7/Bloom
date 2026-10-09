import { FLOWER_CATALOG, type FlowerStyle, flowerOf, isFlowerStyle } from "@/domain/flowers";
import { AppError } from "./errors";
import { hitOrThrow } from "./rate-limit";

export interface FlowerGenerateRequest {
  flowerKey?: string;
  style?: FlowerStyle;
  mood?: string;
  colors?: string[];
}

export interface FlowerGenerateResult {
  provider: string;
  flowerKey: string;
  style: FlowerStyle;
  assetKind: "builtin" | "generated";
  assetRef: string | null;
  note: string;
}

export interface FlowerProvider {
  id: string;
  available(): boolean;
  generate(input: FlowerGenerateRequest & { userId: string }): Promise<FlowerGenerateResult>;
}

class BuiltInFlowerProvider implements FlowerProvider {
  id = "builtin";

  available(): boolean {
    return true;
  }

  async generate(input: FlowerGenerateRequest & { userId: string }): Promise<FlowerGenerateResult> {
    const flowerKey = input.flowerKey && FLOWER_CATALOG.some((item) => item.key === input.flowerKey)
      ? input.flowerKey
      : FLOWER_CATALOG[Math.floor(Math.random() * FLOWER_CATALOG.length)].key;
    const def = flowerOf(flowerKey);
    const style =
      input.style && def.styles.includes(input.style)
        ? input.style
        : def.styles[0];
    return {
      provider: this.id,
      flowerKey,
      style,
      assetKind: "builtin",
      assetRef: null,
      note: "Bloom's own illustrated flower.",
    };
  }
}

/**
 * Optional external generation. Configured with BLOOM_IMAGE_API_URL and BLOOM_IMAGE_API_KEY.
 * The rest of Bloom never depends on this. If it fails, callers fall back to builtin.
 */
class GeneratedFlowerProvider implements FlowerProvider {
  id = "generated";

  available(): boolean {
    return Boolean(process.env.BLOOM_IMAGE_API_URL && process.env.BLOOM_IMAGE_API_KEY);
  }

  async generate(input: FlowerGenerateRequest & { userId: string }): Promise<FlowerGenerateResult> {
    if (!this.available()) {
      throw new AppError("GENERATION_UNAVAILABLE", "Flower generation isn't set up on this server.", 409);
    }
    hitOrThrow(`flower-gen:${input.userId}`, 6, 60 * 60 * 1000);
    const url = process.env.BLOOM_IMAGE_API_URL as string;
    const key = process.env.BLOOM_IMAGE_API_KEY as string;
    const flowerKey = input.flowerKey ?? "rose";
    const style = input.style && isFlowerStyle(input.style) ? input.style : "realistic";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          flowerKey,
          style,
          mood: (input.mood ?? "").slice(0, 80),
          colors: (input.colors ?? []).slice(0, 4),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new AppError("GENERATION_FAILED", "The flower studio couldn't paint just now.", 502);
      }
      const payload = (await response.json()) as { assetRef?: string };
      if (!payload.assetRef || typeof payload.assetRef !== "string" || payload.assetRef.length > 500) {
        throw new AppError("GENERATION_FAILED", "The flower studio returned something Bloom couldn't keep.", 502);
      }
      return {
        provider: this.id,
        flowerKey,
        style,
        assetKind: "generated",
        assetRef: payload.assetRef,
        note: "Grown with an external flower studio.",
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("GENERATION_FAILED", "The flower studio didn't answer in time.", 504);
    } finally {
      clearTimeout(timer);
    }
  }
}

const builtin = new BuiltInFlowerProvider();
const generated = new GeneratedFlowerProvider();

export function listFlowerProviders(): { id: string; available: boolean }[] {
  return [
    { id: builtin.id, available: builtin.available() },
    { id: generated.id, available: generated.available() },
  ];
}

export async function generateFlower(
  userId: string,
  body: FlowerGenerateRequest & { provider?: string },
): Promise<FlowerGenerateResult> {
  const wantGenerated = body.provider === "generated";
  if (wantGenerated && generated.available()) {
    try {
      return await generated.generate({ ...body, userId });
    } catch {
      return builtin.generate({ ...body, userId });
    }
  }
  if (wantGenerated && !generated.available()) {
    throw new AppError(
      "GENERATION_UNAVAILABLE",
      "External flower generation isn't configured. Bloom's illustrated flowers still work.",
      409,
    );
  }
  return builtin.generate({ ...body, userId });
}
