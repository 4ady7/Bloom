export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) sorted[key] = sortValue(source[key]);
    return sorted;
  }
  return value;
}

export function waitingPhrase(count: number): string | null {
  if (count <= 0) return null;
  if (count === 1) return "Someone left something for you.";
  if (count === 2) return "Two things are waiting.";
  return "A few things are waiting.";
}
