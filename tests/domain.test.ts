import { describe, expect, it } from "vitest";
import { formatWhen, localToUtcIso, TimeInputError } from "@/domain/time";
import { selectPetalType, typeWeights } from "@/domain/random";

describe("timezone conversion", () => {
  it("converts a normal London time to UTC", () => {
    const iso = localToUtcIso({ year: 2026, month: 6, day: 15, hour: 8, minute: 0 }, "Europe/London");
    expect(iso.startsWith("2026-06-15T07:00:00")).toBe(true);
  });

  it("rejects the missing hour when US clocks spring forward", () => {
    expect(() => localToUtcIso({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, "America/New_York")).toThrow(TimeInputError);
  });

  it("keeps the valid times on either side of the spring-forward gap", () => {
    const before = localToUtcIso({ year: 2026, month: 3, day: 8, hour: 1, minute: 30 }, "America/New_York");
    const after = localToUtcIso({ year: 2026, month: 3, day: 8, hour: 3, minute: 30 }, "America/New_York");
    expect(before.startsWith("2026-03-08T06:30:00")).toBe(true);
    expect(after.startsWith("2026-03-08T07:30:00")).toBe(true);
  });

  it("resolves the fall-back overlap to a single stored instant", () => {
    const first = localToUtcIso({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, "America/New_York");
    const again = localToUtcIso({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, "America/New_York");
    expect(first).toBe(again);
    expect(first.startsWith("2026-11-01T05:30:00")).toBe(true);
  });

  it("rejects a timezone the platform does not know", () => {
    expect(() => localToUtcIso({ year: 2026, month: 1, day: 1, hour: 1, minute: 0 }, "Not/AZone")).toThrow(TimeInputError);
  });
});

describe("formatWhen", () => {
  it("uses a fixed 12-hour clock so server and browser text match", () => {
    const now = Date.parse("2026-10-08T12:00:00Z");
    const earlier = Date.parse("2026-10-08T11:11:00Z");
    expect(formatWhen(earlier, "Europe/London", now)).toBe("today at 12:11 PM");
    expect(formatWhen(Date.parse("2026-10-07T10:00:00Z"), "Europe/London", now)).toBe("yesterday at 11:00 AM");
    expect(formatWhen(Date.parse("2026-10-05T15:00:00Z"), "Europe/London", now)).toBe("Monday at 4:00 PM");
  });
});

describe("random selection", () => {
  const now = Date.parse("2026-05-01T12:00:00Z");

  it("weights the type just used far below an unused one", () => {
    const weights = typeWeights([{ type: "flower", createdAt: now - 1000 }], now);
    const flower = weights.find((item) => item.id === "flower")!.weight;
    const note = weights.find((item) => item.id === "note")!.weight;
    expect(flower).toBeLessThan(note * 0.2);
  });

  it("still returns the only available type", () => {
    const picked = selectPetalType({
      history: [{ type: "note", createdAt: now }],
      now,
      eligible: ["note"],
      rng: () => 0.99,
    });
    expect(picked).toBe("note");
  });

  it("is deterministic for a fixed rng", () => {
    const first = selectPetalType({ history: [], now, rng: () => 0 });
    const second = selectPetalType({ history: [], now, rng: () => 0 });
    expect(first).toBe(second);
  });
});
