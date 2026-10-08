import { DateTime } from "luxon";
import type { Season } from "./types";

export class TimeInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeInputError";
  }
}

export interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 80) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a wall-clock time in an IANA zone to a UTC ISO string.
 * Nonexistent times (spring-forward gaps) are rejected.
 * Ambiguous times (fall-back overlap) resolve to the earlier offset and
 * the returned instant is the one that will be stored.
 */
export function localToUtcIso(local: LocalDateTime, timeZone: string): string {
  if (!isValidTimeZone(timeZone)) {
    throw new TimeInputError("Choose a valid timezone.");
  }
  const dt = DateTime.fromObject(
    {
      year: local.year,
      month: local.month,
      day: local.day,
      hour: local.hour,
      minute: local.minute,
      second: 0,
      millisecond: 0,
    },
    { zone: timeZone },
  );
  if (!dt.isValid) {
    throw new TimeInputError("That time does not exist because the clocks change. Choose another.");
  }
  const zoned = dt.setZone(timeZone);
  if (
    zoned.year !== local.year ||
    zoned.month !== local.month ||
    zoned.day !== local.day ||
    zoned.hour !== local.hour ||
    zoned.minute !== local.minute
  ) {
    throw new TimeInputError("That time does not exist because the clocks change. Choose another.");
  }
  const iso = dt.toUTC().toISO({ suppressMilliseconds: true });
  if (!iso) throw new TimeInputError("That time could not be saved.");
  return iso;
}

export function seasonFor(epochMs: number, timeZone: string): Season {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const month = Number(new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "numeric" }).format(epochMs));
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** Clock text that is identical on the server and in the browser. */
function clock(dt: DateTime): string {
  const hour = dt.hour % 12 || 12;
  const minute = String(dt.minute).padStart(2, "0");
  return `${hour}:${minute} ${dt.hour >= 12 ? "PM" : "AM"}`;
}

export function formatWhen(epochMs: number, timeZone: string, now = Date.now()): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const dt = DateTime.fromMillis(epochMs, { zone });
  const today = DateTime.fromMillis(now, { zone });
  const time = clock(dt);
  if (dt.hasSame(today, "day")) return `today at ${time}`;
  if (dt.hasSame(today.plus({ days: 1 }), "day")) return `tomorrow at ${time}`;
  if (dt.hasSame(today.minus({ days: 1 }), "day")) return `yesterday at ${time}`;
  return `${WEEKDAYS[dt.weekday - 1]} at ${time}`;
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
