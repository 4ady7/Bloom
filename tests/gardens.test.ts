import { describe, expect, it } from "vitest";
import { placeInGarden } from "@/domain/garden";
import { createUser, pairUsers, randomUUID } from "./helpers";

describe("garden placement", () => {
  it("keeps normalized coordinates and avoids stacking on the same spot", () => {
    const first = placeInGarden([], "seed-a");
    expect(first.x).toBeGreaterThanOrEqual(0.05);
    expect(first.x).toBeLessThanOrEqual(0.95);
    expect(first.y).toBeGreaterThanOrEqual(0.38);
    const second = placeInGarden([{ x: first.x, y: first.y }], "seed-b");
    const distance = Math.hypot(first.x - second.x, first.y - second.y);
    expect(distance).toBeGreaterThan(0.01);
  });
});

describe("shared gardens", () => {
  it("creates a primary garden for a pair and keeps outsiders out", async () => {
    const { listGardens, createGarden, getGarden } = await import("@/server/gardens");
    const { ada, bea } = await pairUsers();
    const outsider = await createUser("Cy");
    const forAda = listGardens(ada.user.id);
    const forBea = listGardens(bea.user.id);
    expect(forAda.length).toBeGreaterThanOrEqual(1);
    expect(forAda[0].isPrimary).toBe(true);
    expect(forBea.map((garden) => garden.id)).toEqual(forAda.map((garden) => garden.id));
    expect(() => getGarden(outsider.user.id, forAda[0].id)).toThrow(/isn't here|empty/);
    const night = createGarden(ada.user.id, { name: "Night Garden", theme: "night", description: "Quiet" });
    expect(night.theme).toBe("night");
    expect(listGardens(bea.user.id).some((garden) => garden.id === night.id)).toBe(true);
  });

  it("lets the recipient plant a flower once, with a persistent place", async () => {
    const { createPetal, openPetal, getPetal } = await import("@/server/petals");
    const { listGardens, plantFlowerFromPetal, listGardenFlowers, moveFlower } = await import("@/server/gardens");
    const { ada, bea } = await pairUsers();
    const gardens = listGardens(bea.user.id);
    const gardenId = gardens[0].id;
    const sent = await createPetal(ada.user.id, randomUUID(), {
      type: "flower",
      content: { variety: "tulip", note: "for no reason" },
      schedule: null,
      expiresInDays: null,
      random: false,
    });
    openPetal(bea.user.id, sent.petal.id);
    expect(getPetal(bea.user.id, sent.petal.id).plantedInGardenId).toBeNull();
    const planted = plantFlowerFromPetal(
      bea.user.id,
      { gardenId, petalId: sent.petal.id, idempotencyKey: randomUUID() },
    );
    expect(planted.flowerKey).toBe("tulip");
    expect(planted.message).toBe("for no reason");
    expect(getPetal(bea.user.id, sent.petal.id).plantedInGardenId).toBe(gardenId);
    const again = plantFlowerFromPetal(
      bea.user.id,
      { gardenId, petalId: sent.petal.id, idempotencyKey: randomUUID() },
    );
    expect(again.id).toBe(planted.id);
    expect(() =>
      plantFlowerFromPetal(ada.user.id, {
        gardenId,
        petalId: sent.petal.id,
        idempotencyKey: randomUUID(),
      }),
    ).toThrow(/Only the person/);
    const page = listGardenFlowers(bea.user.id, gardenId, null);
    expect(page.flowers.some((flower) => flower.id === planted.id)).toBe(true);
    const moved = moveFlower(bea.user.id, planted.id, {
      x: 0.33,
      y: 0.66,
      expectedUpdatedAt: planted.updatedAt,
    });
    expect(moved.x).toBeCloseTo(0.33);
    expect(moved.y).toBeCloseTo(0.66);
    const outsider = await createUser("Cy");
    expect(() => listGardenFlowers(outsider.user.id, gardenId, null)).toThrow(/isn't here|empty/);
  });

  it("falls back to built-in flowers when generation is unavailable", async () => {
    const { generateFlower, listFlowerProviders } = await import("@/server/flower-providers");
    const user = await createUser("Ada");
    const providers = listFlowerProviders();
    expect(providers.find((item) => item.id === "builtin")?.available).toBe(true);
    expect(providers.find((item) => item.id === "generated")?.available).toBe(false);
    const flower = await generateFlower(user.user.id, { flowerKey: "rose", provider: "builtin" });
    expect(flower.assetKind).toBe("builtin");
    expect(flower.flowerKey).toBe("rose");
    await expect(generateFlower(user.user.id, { provider: "generated" })).rejects.toThrow(/isn't configured|unavailable/i);
  });
});
