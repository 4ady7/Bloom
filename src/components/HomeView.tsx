"use client";

import Link from "next/link";
import { formatWhen } from "@/domain/time";
import type { GardenElement, PublicPetal, PublicUser, QuietNote, Season } from "@/domain/types";
import { GardenScene } from "./GardenScene";
import { Nav } from "./Chrome";

interface HomeProps {
  user: PublicUser;
  relationship: { partner: { displayName: string } | null } | null;
  unopened: PublicPetal[];
  recent: PublicPetal[];
  upcoming: PublicPetal[];
  garden: { season: Season; elements: GardenElement[] };
  notes: QuietNote[];
}

export function HomeView({ home }: { home: HomeProps }) {
  const partner = home.relationship?.partner?.displayName ?? "them";
  const waiting = home.unopened[0];
  const recent = home.recent.filter((petal) => petal.id !== waiting?.id).slice(0, 5);
  const gardenCaption =
    home.garden.elements.length === 0
      ? "Nothing here yet. That's alright."
      : home.garden.elements.length === 1
        ? "One small thing, so far."
        : "A little history, growing slowly.";

  return (
    <div className={`stage season-${home.garden.season}`}>
      <section className="garden-panel" aria-label="Shared garden">
        <GardenScene elements={home.garden.elements} season={home.garden.season} caption={gardenCaption} />
        <p className="for-whom">
          for <em>{partner}</em>
        </p>
      </section>
      <div className="letter">
        <header className="topbar">
          <Link href="/home" className="word">
            Bloom
          </Link>
          <Link href="/settings" className="quiet-link">
            You
          </Link>
        </header>
        <main className="stack" id="content">
          {waiting ? (
            <article className="waiting">
              <p className="serif" style={{ fontSize: "1.7rem" }}>
                {waiting.senderName} left something for you.
              </p>
              {home.unopened.length > 1 ? <p className="behind">Another is waiting behind it.</p> : null}
              <Link className="btn" href={`/petal/${waiting.id}`}>
                Open
              </Link>
            </article>
          ) : null}
          {home.notes.map((note) =>
            note.petalId ? (
              <Link key={note.id} href={`/petal/${note.petalId}`} className="kept">
                <span className="kept-kind">{note.body}</span>
              </Link>
            ) : null,
          )}
          {home.upcoming.length > 0 ? (
            <section>
              <p className="section-label">On the way</p>
              {home.upcoming.map((petal) => (
                <Link key={petal.id} href={`/petal/${petal.id}`} className="kept">
                  <span className="kept-kind">Arrives {petal.scheduledFor ? formatWhen(petal.scheduledFor, home.user.timezone) : "later"}</span>
                </Link>
              ))}
            </section>
          ) : null}
          {recent.length > 0 ? (
            <section>
              <p className="section-label">Already here</p>
              {recent.map((petal) => (
                <Link key={petal.id} href={`/petal/${petal.id}`} className="kept">
                  <span className="kept-kind">{petal.fromYou ? "You left" : petal.senderName} · {label(petal.type)}</span>
                  <span className="kept-when">{formatWhen(petal.createdAt, home.user.timezone)}</span>
                </Link>
              ))}
            </section>
          ) : !waiting ? (
            <p className="lede">The garden is quiet. You can leave something whenever it occurs to you.</p>
          ) : null}
        </main>
        <div className="dock">
          <Link className="btn btn-block" href="/send">
            Give them something
          </Link>
          <Nav />
        </div>
      </div>
    </div>
  );
}

function label(type: string): string {
  if (type === "note") return "a note";
  if (type === "flower") return "a flower";
  if (type === "memory") return "a memory";
  if (type === "photo") return "a photo";
  if (type === "song") return "a song";
  if (type === "question") return "a question";
  return "a surprise";
}
