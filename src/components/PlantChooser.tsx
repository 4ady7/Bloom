"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicGarden } from "@/domain/garden";
import type { PublicPetal } from "@/domain/types";
import { flowerOf, normalizeFlowerKey } from "@/domain/flowers";
import { ApiError, api } from "@/lib/api";
import { FlowerArt } from "./Flowers";

export function PlantChooser({ petal }: { petal: PublicPetal }) {
  const router = useRouter();
  const [gardens, setGardens] = useState<PublicGarden[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [phase, setPhase] = useState<"choose" | "planting" | "done">("choose");
  const key = useRef(crypto.randomUUID());
  const variety =
    petal.type === "flower" && petal.content && "variety" in petal.content
      ? normalizeFlowerKey(String(petal.content.variety))
      : "ranunculus";

  useEffect(() => {
    api<{ gardens: PublicGarden[] }>("/api/gardens")
      .then((result) => setGardens(result.gardens))
      .catch(() => setError("The gardens couldn't be found just now."));
  }, []);

  if (petal.plantedInGardenId) {
    return (
      <div className="plant-chooser">
        <p className="hint">Already planted in one of your gardens.</p>
        <button className="btn" type="button" onClick={() => router.push(`/gardens/${petal.plantedInGardenId}`)}>
          Open that garden
        </button>
      </div>
    );
  }

  async function plant(garden: PublicGarden) {
    setPending(garden.id);
    setError(null);
    setPhase("planting");
    try {
      await api(`/api/gardens/${garden.id}/plant`, {
        method: "POST",
        body: { petalId: petal.id },
        idempotencyKey: key.current,
      });
      setPhase("done");
      window.setTimeout(() => router.push(`/gardens/${garden.id}?planted=1`), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 900);
    } catch (caught) {
      setPhase("choose");
      setError(caught instanceof ApiError ? caught.message : "It didn't take root. You can try again.");
      if (caught instanceof ApiError && caught.code === "IDEMPOTENCY_CONFLICT") key.current = crypto.randomUUID();
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="plant-chooser stack" aria-label="Plant this flower">
      <div className={`flower-wrap ${phase === "planting" || phase === "done" ? "bloom-in" : ""}`}>
        <FlowerArt variety={variety} stage={phase === "done" ? "bloom" : phase === "planting" ? "bud" : "bloom"} />
      </div>
      <h2>{phase === "done" ? "It's growing there now." : "Where should I plant this?"}</h2>
      <p className="hint">
        {flowerOf(variety).label}
        {petal.senderName ? ` · from ${petal.senderName}` : ""}
      </p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {phase === "choose" ? (
        <div className="choice-list">
          {(gardens ?? []).map((garden) => (
            <button
              key={garden.id}
              className="choice"
              type="button"
              disabled={Boolean(pending)}
              onClick={() => void plant(garden)}
            >
              <strong>{garden.name}</strong>
              <span>
                {garden.flowerCount === 0
                  ? "Still open ground"
                  : garden.flowerCount === 1
                    ? "One flower so far"
                    : `${garden.flowerCount} flowers`}
              </span>
            </button>
          ))}
          {gardens === null ? <p className="hint">Looking for your gardens…</p> : null}
          {gardens && gardens.length === 0 ? <p className="hint">Make a garden first, then come back to plant.</p> : null}
        </div>
      ) : null}
      {phase === "planting" ? <p className="hint">Settling into the soil…</p> : null}
    </section>
  );
}
