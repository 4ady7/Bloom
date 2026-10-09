"use client";

import { FormEvent, useState } from "react";
import { GARDEN_THEME_LABEL, GARDEN_THEMES, type PublicGarden, type PublicGardenFlower } from "@/domain/garden";
import { ApiError, api } from "@/lib/api";
import { FlowerStory, LivingGarden } from "./LivingGarden";

export function GardenRoom({
  garden: initial,
  flowers,
  justPlanted = false,
}: {
  garden: PublicGarden;
  flowers: PublicGardenFlower[];
  justPlanted?: boolean;
}) {
  const [garden, setGarden] = useState(initial);
  const [selected, setSelected] = useState<PublicGardenFlower | null>(null);
  const [editing, setEditing] = useState(false);
  const [arrange, setArrange] = useState(false);
  const [message, setMessage] = useState<string | null>(justPlanted ? "A flower settled into the soil." : null);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    try {
      const result = await api<{ garden: PublicGarden }>(`/api/gardens/${garden.id}`, {
        method: "PATCH",
        body: {
          name: String(form.get("name") ?? ""),
          description: String(form.get("description") ?? ""),
          theme: String(form.get("theme") ?? garden.theme),
          expectedUpdatedAt: garden.updatedAt,
        },
      });
      setGarden(result.garden);
      setEditing(false);
      setMessage("Saved.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That didn't save.");
    }
  }

  async function removeSelected() {
    if (!selected) return;
    setError(null);
    try {
      await api(`/api/garden-flowers/${selected.id}`, { method: "DELETE" });
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "It stayed in the garden.");
    }
  }

  return (
    <div className="garden-room stack">
      <div className="plain-pad stack">
        <p className="section-label">{GARDEN_THEME_LABEL[garden.theme]}</p>
        <h2>{garden.name}</h2>
        {garden.description ? <p className="hint">{garden.description}</p> : null}
        {message ? <p role="status">{message}</p> : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="actions">
          <button className="btn-ghost" type="button" onClick={() => setArrange((value) => !value)}>
            {arrange ? "Done arranging" : "Arrange flowers"}
          </button>
          <button className="text-btn" type="button" onClick={() => setEditing((value) => !value)}>
            {editing ? "Cancel" : "Edit garden"}
          </button>
        </div>
        {editing ? (
          <form className="form" method="post" onSubmit={save}>
            <label className="field">
              <span>Name</span>
              <input name="name" defaultValue={garden.name} required maxLength={60} />
            </label>
            <label className="field">
              <span>Description</span>
              <input name="description" defaultValue={garden.description} maxLength={280} />
            </label>
            <label className="field">
              <span>Theme</span>
              <select name="theme" defaultValue={garden.theme}>
                {GARDEN_THEMES.map((theme) => (
                  <option key={theme} value={theme}>
                    {GARDEN_THEME_LABEL[theme]}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn" type="submit">
              Save
            </button>
          </form>
        ) : null}
      </div>
      <LivingGarden garden={garden} flowers={flowers} editable={arrange} onSelect={setSelected} />
      {selected ? (
        <div className="plain-pad stack">
          <FlowerStory flower={selected} />
          <button className="text-btn" type="button" onClick={() => void removeSelected()}>
            Remove from this garden
          </button>
          <p className="hint">Removing takes it out of the soil. The memory of the petal remains on the path.</p>
        </div>
      ) : null}
    </div>
  );
}
