// The gain-staging plan: move every top-level fader by the same number of dB so
// the master peak lands on the target, keeping the channels' relative levels.
import { MAX_DB, MIN_DB, toDb, toValue } from "./fader.ts";

export interface Channel {
  id: string;
  name: string;
  /** track: an ungrouped track. group: a group track (its children follow it). return: a return track. */
  kind: "track" | "group" | "return";
  /** Fader value, 0–1. */
  value: number;
}

export interface Row extends Channel {
  fromDb: number;
  toDb: number;
  toValue: number;
  /** Set when this fader can't move by the full amount. */
  note?: string;
}

export interface Plan {
  /** dB added to every fader (negative = quieter). */
  offsetDb: number;
  rows: Row[];
  /** False if any fader was clamped, so relative levels won't be exact. */
  exact: boolean;
}

export function makePlan(peakDb: number, targetDb: number, channels: Channel[]): Plan {
  const offsetDb = Math.round((targetDb - peakDb) * 10) / 10;
  let exact = true;
  const rows = channels.map((c): Row => {
    const fromDb = toDb(c.value);
    if (fromDb === -Infinity) return { ...c, fromDb, toDb: fromDb, toValue: c.value, note: "fader at −inf: left alone" };
    let target = fromDb + offsetDb;
    let note: string | undefined;
    if (target > MAX_DB) {
      target = MAX_DB;
      note = `stops at +${MAX_DB} dB`;
      exact = false;
    } else if (target < MIN_DB) {
      target = MIN_DB;
      note = `stops at ${MIN_DB.toFixed(1)} dB`;
      exact = false;
    }
    return { ...c, fromDb, toDb: target, toValue: toValue(target), note };
  });
  return { offsetDb, rows, exact };
}

/** "−8.3 dB", "+2.0 dB", "−inf dB" */
export function formatDb(db: number, signed = true): string {
  if (db === -Infinity) return "−inf dB";
  const v = Math.abs(db) < 0.05 ? 0 : db;
  const s = Math.abs(v).toFixed(1);
  return `${v < 0 ? "−" : signed && v > 0 ? "+" : ""}${s} dB`;
}
