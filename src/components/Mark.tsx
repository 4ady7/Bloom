export function Mark({ title = "Bloom" }: { title?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="mark">
      <title>{title}</title>
      <path d="M32 34c8-14 20-14 20-14S48 36 32 36 12 20 12 20s12 0 20 14z" fill="currentColor" />
      <path d="M32 30c-8-14-20-14-20-14s4 16 20 16 20-16 20-16-12 0-20 14z" fill="currentColor" opacity="0.8" />
      <circle cx="32" cy="32" r="3" fill="var(--paper)" />
    </svg>
  );
}
