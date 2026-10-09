"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { GARDEN_THEME_LABEL, GARDEN_THEMES, type PublicGarden } from "@/domain/garden";
import { ApiError, api } from "@/lib/api";

export function GardenList({ initial }: { initial: PublicGarden[] }) {
  const [gardens, setGardens] = useState(initial);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const result = await api<{ garden: PublicGarden }>("/api/gardens", {
        method: "POST",
        body: {
          name: String(form.get("name") ?? ""),
          description: String(form.get("description") ?? ""),
          theme: String(form.get("theme") ?? "meadow"),
        },
      });
      setGardens((current) => [...current, result.garden]);
      setOpen(false);
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That garden didn't take.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack">
      <div className="garden-cards">
        {gardens.map((garden) => (
          <Link key={garden.id} href={`/gardens/${garden.id}`} className={`garden-card theme-${garden.theme}`}>
            <span className="section-label">{GARDEN_THEME_LABEL[garden.theme]}</span>
            <strong className="serif">{garden.name}</strong>
            <span className="hint">
              {garden.flowerCount === 0
                ? "Open ground"
                : garden.flowerCount === 1
                  ? "One flower"
                  : `${garden.flowerCount} flowers`}
              {garden.isPrimary ? " · first garden" : ""}
            </span>
          </Link>
        ))}
      </div>
      {!open ? (
        <button className="btn-ghost" type="button" onClick={() => setOpen(true)}>
          Start another garden
        </button>
      ) : (
        <form className="form" method="post" onSubmit={create}>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <label className="field">
            <span>Name</span>
            <input name="name" required maxLength={60} placeholder="Midnight garden" />
          </label>
          <label className="field">
            <span>A line about it</span>
            <input name="description" maxLength={280} placeholder="Optional" />
          </label>
          <label className="field">
            <span>Theme</span>
            <select name="theme" defaultValue="meadow">
              {GARDEN_THEMES.map((theme) => (
                <option key={theme} value={theme}>
                  {GARDEN_THEME_LABEL[theme]}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Making room…" : "Create garden"}
          </button>
        </form>
      )}
    </div>
  );
}
