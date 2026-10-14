// Data passed between the extension and the dialog.
import type { Channel } from "./plan.ts";

export interface Settings {
  version: 1;
  /** Master peak to aim for, dB. */
  targetDb: number;
  includeReturns: boolean;
  /** Re-arm the meter after applying, so the next play-through confirms the result. */
  resetMeter: boolean;
  theme?: "dark" | "light";
}

export interface MeterReading {
  /** Held sample peak in dB, or null if it hasn't heard anything since its last reset. */
  peakDb: number | null;
  /** RMS over the same window, dB (null if not measured). */
  rmsDb: number | null;
  /** Is it the first device on the main track (so it reads before any limiter)? */
  first: boolean;
  /** The target set on the meter, dB. */
  targetDb: number | null;
  /** 0 idle, 1 armed (waiting for audio), 2 measuring, 3 held. */
  state: number;
}

export interface Init {
  /** The 2sl meter on the main track, if there is one. */
  meter: MeterReading | null;
  /** Top-level tracks and group tracks (children of groups follow their group). */
  tracks: Channel[];
  returns: Channel[];
  saved: Settings | null;
}

export interface Result {
  /** Fader values to set, by channel id. */
  apply: { id: string; value: number }[];
  offsetDb: number;
  /** Write back to the meter if it changed in the dialog. */
  targetDb: number;
  resetMeter: boolean;
  settings: Settings;
}

export interface Cancelled {
  cancelled: true;
  settings: Settings;
}
