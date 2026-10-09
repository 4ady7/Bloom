"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import type { PublicPetal } from "@/domain/types";
import { formatWhen } from "@/domain/time";
import { ApiError, api } from "@/lib/api";
import { FlowerArt } from "./Flowers";
import { PetalView } from "./PetalView";
import { PlantChooser } from "./PlantChooser";

export function Reveal({
  initial,
  notice,
  timezone,
}: {
  initial: PublicPetal | null;
  notice?: string;
  timezone: string;
}) {
  const [petal, setPetal] = useState(initial);
  const [phase, setPhase] = useState<"sealed" | "opening" | "shown">(
    initial && !initial.fromYou && initial.status === "sealed" ? "sealed" : "shown",
  );
  const [error, setError] = useState<string | null>(notice ?? null);
  const [pending, setPending] = useState(false);

  async function openIt(event: FormEvent) {
    event.preventDefault();
    if (!petal) return;
    setPending(true);
    setError(null);
    setPhase("opening");
    try {
      const result = await api<{ petal: PublicPetal }>(`/api/petals/${petal.id}/open`, { method: "POST", body: {} });
      setPetal(result.petal);
      window.setTimeout(() => setPhase("shown"), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650);
    } catch (caught) {
      setPhase("sealed");
      setError(caught instanceof ApiError ? caught.message : "It didn't open. You can try again.");
    } finally {
      setPending(false);
    }
  }

  if (!petal) {
    return (
      <main className="plain-page">
        <h2>This isn&apos;t here.</h2>
        {error ? <p>{error}</p> : null}
        <Link className="btn" href="/home">
          Back to the garden
        </Link>
      </main>
    );
  }

  if (petal.status === "expired" && !petal.fromYou) {
    return (
      <main className="ceremony">
        <div className="flower-wrap">
          <FlowerArt stage="withered" />
        </div>
        <h2>This faded before it was opened.</h2>
        <Link href="/home">Back to the garden</Link>
      </main>
    );
  }

  if (phase !== "shown" && !petal.fromYou && petal.status === "sealed") {
    return (
      <main className="ceremony">
        <div className={`flower-wrap ${phase === "sealed" ? "bloom-in" : ""}`}>
          <FlowerArt stage="bud" />
        </div>
        <h2>{petal.senderName} left something for you.</h2>
        <p className="hint">There&apos;s no need to answer.</p>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <form method="post" action={`/api/petals/${petal.id}/open`} onSubmit={openIt}>
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Opening…" : "Open"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="plain-page">
      <p className="section-label">
        {petal.fromYou ? "You left this" : `${petal.senderName} left this`}
        {petal.openedAt ? <span className="when"> · opened {formatWhen(petal.openedAt, timezone)}</span> : ""}
      </p>
      <div className="unfold">
        <PetalView petal={petal} />
      </div>
      {!petal.fromYou && petal.type === "flower" && petal.status === "opened" ? <PlantChooser petal={petal} /> : null}
      {petal.fromYou && petal.type === "flower" && petal.plantedInGardenId ? (
        <Link className="btn-ghost" href={`/gardens/${petal.plantedInGardenId}`}>
          See where it grew
        </Link>
      ) : null}
      {petal.fromYou && (petal.status === "sealed" || petal.status === "scheduled") ? <TakeBack id={petal.id} /> : null}
      <Link className="quiet-link" href="/home">
        Close
      </Link>
    </main>
  );
}

function TakeBack({ id }: { id: string }) {
  const [sure, setSure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!sure) {
    return (
      <button className="text-btn" type="button" onClick={() => setSure(true)}>
        Take it back
      </button>
    );
  }
  return (
    <div className="stack">
      <p>They haven&apos;t opened it. You can still take it back.</p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="btn-ghost"
        type="button"
        onClick={async () => {
          try {
            await api(`/api/petals/${id}`, { method: "DELETE" });
            window.location.assign("/home");
          } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "It stayed where it was.");
          }
        }}
      >
        Yes, take it back
      </button>
    </div>
  );
}
