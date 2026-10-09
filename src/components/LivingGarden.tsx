"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PublicGarden, PublicGardenFlower } from "@/domain/garden";
import { flowerOf } from "@/domain/flowers";
import { ApiError, api } from "@/lib/api";
import { FlowerMark } from "./Flowers";

export function LivingGarden({
  garden,
  flowers: initial,
  editable = false,
  plantingId = null,
  onSelect,
}: {
  garden: PublicGarden;
  flowers: PublicGardenFlower[];
  editable?: boolean;
  plantingId?: string | null;
  onSelect?: (flower: PublicGardenFlower) => void;
}) {
  const [flowers, setFlowers] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sorted = useMemo(() => [...flowers].sort((a, b) => a.z - b.z || a.plantedAt - b.plantedAt), [flowers]);

  async function persistMove(flower: PublicGardenFlower, x: number, y: number) {
    setError(null);
    try {
      const result = await api<{ flower: PublicGardenFlower }>(`/api/garden-flowers/${flower.id}`, {
        method: "PATCH",
        body: { x, y, expectedUpdatedAt: flower.updatedAt },
      });
      setFlowers((current) => current.map((item) => (item.id === flower.id ? result.flower : item)));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That flower wouldn't stay.");
      setFlowers(initial);
    }
  }

  function pointFromEvent(event: ReactPointerEvent) {
    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return null;
    return {
      x: Math.min(0.95, Math.max(0.05, (event.clientX - box.left) / box.width)),
      y: Math.min(0.92, Math.max(0.38, (event.clientY - box.top) / box.height)),
    };
  }

  return (
    <div className={`living-garden theme-${garden.theme}`} aria-label={`${garden.name}, a shared garden`}>
      <div
        className="garden-stage"
        ref={stageRef}
        role="list"
        onPointerMove={(event) => {
          if (!dragging || !editable) return;
          const point = pointFromEvent(event);
          if (!point) return;
          setFlowers((current) =>
            current.map((item) => (item.id === dragging ? { ...item, x: point.x, y: point.y, z: Math.floor(point.y * 1000) } : item)),
          );
        }}
        onPointerUp={(event) => {
          if (!dragging) return;
          const flower = flowers.find((item) => item.id === dragging);
          const point = pointFromEvent(event);
          setDragging(null);
          if (flower && point) void persistMove(flower, point.x, point.y);
        }}
        onPointerLeave={() => {
          if (dragging) setDragging(null);
        }}
      >
        <div className="garden-sky" aria-hidden="true" />
        <div className="garden-soil" aria-hidden="true" />
        <div className="garden-path" aria-hidden="true" />
        {sorted.length === 0 ? (
          <p className="garden-empty">There is plenty of room for something lovely.</p>
        ) : null}
        {sorted.map((flower) => {
          const def = flowerOf(flower.flowerKey);
          const label = `${def.label}, given by ${flower.givenByName}`;
          return (
            <button
              key={flower.id}
              type="button"
              role="listitem"
              className={`garden-plant ${plantingId === flower.id ? "is-planting" : ""} ${selected === flower.id ? "is-selected" : ""}`}
              style={{
                left: `${flower.x * 100}%`,
                top: `${flower.y * 100}%`,
                transform: `translate(-50%, -85%) rotate(${flower.rotation}deg) scale(${flower.scale})`,
                zIndex: flower.z,
              }}
              aria-label={label}
              title={flower.message || label}
              onClick={() => {
                setSelected(flower.id);
                onSelect?.(flower);
              }}
              onPointerDown={(event) => {
                if (!editable) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragging(flower.id);
              }}
            >
              {flower.assetKind === "generated" && flower.assetRef ? (
                <img src={flower.assetRef} alt="" className="garden-plant-img" draggable={false} />
              ) : (
                <FlowerMark flowerKey={flower.flowerKey} styleName={flower.style} />
              )}
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {editable ? <p className="hint">Drag a flower to rearrange. Your partner will see it too.</p> : null}
    </div>
  );
}

export function FlowerStory({ flower }: { flower: PublicGardenFlower }) {
  const def = flowerOf(flower.flowerKey);
  return (
    <aside className="flower-story" aria-live="polite">
      <p className="section-label">{def.label}</p>
      <h3 className="serif">{flower.message || "A flower, for no reason."}</h3>
      <p>
        Given by <strong>{flower.givenByName}</strong>
      </p>
      <p className="hint">Planted {new Date(flower.plantedAt).toLocaleDateString(undefined, { dateStyle: "long" })}</p>
    </aside>
  );
}
