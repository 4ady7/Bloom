"use client";

import { useRef, useState } from "react";
import type { SurpriseContent } from "@/domain/types";

export function Surprise({ content }: { content: SurpriseContent }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="stack">
      {content.kind === "hold" && !open ? <Hold onOpen={() => setOpen(true)} /> : null}
      {content.kind === "stars" && !open ? <Stars onOpen={() => setOpen(true)} /> : null}
      {content.kind === "seal" && !open ? (
        <button className="btn" type="button" onClick={() => setOpen(true)}>
          Break the seal
        </button>
      ) : null}
      {open ? (
        <p className="seal-message unfold" tabIndex={-1} ref={(node) => node?.focus()} aria-live="polite">
          {content.message}
        </p>
      ) : (
        <button className="text-btn" type="button" onClick={() => setOpen(true)}>
          Just show me
        </button>
      )}
    </div>
  );
}

function Hold({ onOpen }: { onOpen: () => void }) {
  const [width, setWidth] = useState(0);
  const frame = useRef(0);
  const running = useRef(false);
  function start() {
    if (running.current) return;
    running.current = true;
    const began = performance.now();
    const step = (time: number) => {
      const next = Math.min(100, ((time - began) / 1400) * 100);
      setWidth(next);
      if (next >= 100) {
        running.current = false;
        onOpen();
        return;
      }
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }
  function stop() {
    running.current = false;
    cancelAnimationFrame(frame.current);
    setWidth(0);
  }
  return (
    <button
      type="button"
      className="hold"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(event) => {
        if (event.repeat) return;
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          start();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") stop();
      }}
      aria-describedby="hold-hint"
    >
      <i style={{ width: `${width}%` }} />
      <span>Hold</span>
      <span id="hold-hint" className="hint">
        Press and hold until it opens.
      </span>
    </button>
  );
}

function Stars({ onOpen }: { onOpen: () => void }) {
  const [pressed, setPressed] = useState<number[]>([]);
  function tap(index: number) {
    const next = pressed.includes(index) ? pressed : [...pressed, index];
    setPressed(next);
    if (next.length === 5) onOpen();
  }
  return (
    <div className="stars" role="group" aria-label="Five quiet stars">
      {[0, 1, 2, 3, 4].map((index) => (
        <button
          key={index}
          type="button"
          className="star-btn"
          aria-pressed={pressed.includes(index)}
          aria-label={`Star ${index + 1}`}
          onClick={() => tap(index)}
        >
          ✦
        </button>
      ))}
    </div>
  );
}
