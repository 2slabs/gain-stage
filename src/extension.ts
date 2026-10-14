import * as fs from "node:fs";
import * as path from "node:path";
import {
  initialize,
  AudioTrack,
  MidiTrack,
  type ActivationContext,
  type DeviceParameter,
  type ExtensionContext,
  type Track,
} from "@ableton-extensions/sdk";

// build.ts inlines this HTML (with the bundled ui/app.ts, styles and fonts) as a string.
import dialogHtml from "../ui/interface.html";
import type { Channel } from "./plan.ts";
import type { Cancelled, Init, MeterReading, Result, Settings } from "./protocol.ts";

type V = "1.0.0";
type Context = ExtensionContext<V>;

/** The 2sl meter (Max for Live) exposes these parameters. */
const PEAK_PARAM = "Peak Hold";
const RESET_PARAM = "Reset";
const RMS_PARAM = "RMS";
const SILENT_DB = -69.9;

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");
  context.commands.registerCommand("gain-stage.open", () => run(() => gainStage(context)));
  for (const scope of ["AudioTrack", "MidiTrack"] as const) {
    context.ui.registerContextMenuAction(scope, "Gain Stage Mix…", "gain-stage.open").then(
      () => console.log(`gain-stage: menu registered for ${scope}`),
      (err) => console.error(`gain-stage: couldn't register menu for ${scope}:`, err),
    );
  }
}

function run(task: () => Promise<void>) {
  task().catch((err) => console.error("gain-stage:", err));
}

const isPlainTrack = (t: Track<V>) => t instanceof MidiTrack || t instanceof AudioTrack;

/** The meter's parameters on the main track, if it's there. */
function findMeter(context: Context) {
  const devices = context.application.song.mainTrack.devices;
  for (const [index, d] of devices.entries()) {
    const peak = d.parameters.find((p) => p.name === PEAK_PARAM);
    if (peak) {
      const find = (name: string) => d.parameters.find((p) => p.name === name) ?? null;
      return { index, peak, rms: find(RMS_PARAM), reset: find(RESET_PARAM) };
    }
  }
  return null;
}

async function gainStage(context: Context) {
  const song = context.application.song;
  // Children of a group are left alone: moving the group fader moves them with it.
  const topLevel = song.tracks.filter((t) => !t.groupTrack);
  const faders = new Map<string, DeviceParameter<V>>();
  const channel = (t: Track<V>, kind: Channel["kind"]): Channel => {
    const id = String(t.handle.id);
    faders.set(id, t.mixer.volume);
    return { id, name: t.name, kind, value: 0 };
  };
  const tracks = topLevel.map((t) => channel(t, isPlainTrack(t) ? "track" : "group"));
  const returns = song.returnTracks.map((t) => channel(t, "return"));
  await Promise.all([...tracks, ...returns].map(async (c) => (c.value = await faders.get(c.id)!.getValue())));

  const meterParams = findMeter(context);
  let meter: MeterReading | null = null;
  if (meterParams) {
    const peak = await meterParams.peak.getValue();
    const rms = meterParams.rms ? await meterParams.rms.getValue() : SILENT_DB - 1;
    meter = {
      peakDb: peak <= SILENT_DB ? null : peak,
      rmsDb: rms <= SILENT_DB ? null : rms,
      first: meterParams.index === 0,
    };
  }
  console.log(`gain-stage: meter ${meter ? `peak ${meter.peakDb} dB, rms ${meter.rmsDb} dB, ${meter.first ? "first" : "not first"} on main` : "not found"}; ${tracks.length} top-level tracks, ${returns.length} returns`);

  const init: Init = { meter, tracks, returns, saved: loadSettings(context) };
  const json = JSON.stringify(init).replace(/</g, "\\u003c");
  const html = dialogHtml.replace("window.__INIT__ = null;", () => `window.__INIT__ = ${json};`);
  const raw = await context.ui.showModalDialog(`data:text/html,${encodeURIComponent(html)}`, 600, 600);
  if (!raw) return;
  const reply = JSON.parse(raw) as Result | Cancelled;
  saveSettings(context, reply.settings);
  if ("cancelled" in reply) return;

  // All faders in one undo step.
  await context.withinTransaction(() =>
    Promise.all(reply.apply.map(({ id, value }) => faders.get(id)?.setValue(value))),
  );
  console.log(`gain-stage: moved ${reply.apply.length} faders by ${reply.offsetDb} dB`);

  if (reply.resetMeter && meterParams?.reset) {
    await meterParams.reset.setValue(1);
    await meterParams.reset.setValue(0);
  }
}

function settingsFile(context: Context): string | null {
  const dir = context.environment.storageDirectory;
  return dir ? path.join(dir, "settings.json") : null;
}

function loadSettings(context: Context): Settings | null {
  const file = settingsFile(context);
  try {
    return file ? (JSON.parse(fs.readFileSync(file, "utf8")) as Settings) : null;
  } catch {
    return null;
  }
}

function saveSettings(context: Context, settings: Settings) {
  const file = settingsFile(context);
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.warn("gain-stage: couldn't save settings:", err);
  }
}
