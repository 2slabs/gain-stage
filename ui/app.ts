// Dialog logic. Bundled and inlined into interface.html by build.ts.
import { formatDb, makePlan, type Plan } from "../src/plan.ts";
import type { Cancelled, Init, Result, Settings } from "../src/protocol.ts";
import { applyTheme, closeDialog, radioGroup, slider, toggle } from "./2sl/ui.ts";

declare global {
  interface Window {
    __INIT__: Init | null;
  }
}

const init: Init = window.__INIT__ ?? demoInit();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const DEFAULTS: Settings = { version: 1, targetDb: -6, includeReturns: false, resetMeter: true, theme: "dark" };
let settings: Settings = init.saved?.version === 1 ? { ...DEFAULTS, ...init.saved } : { ...DEFAULTS };
// The meter's target wins: that's where it's set.
if (init.meter?.targetDb != null) settings.targetDb = init.meter.targetDb;

const meter = init.meter;
const measured = meter?.state === 3 && meter.peakDb !== null;
let peakDb: number | null = measured ? meter!.peakDb : null;

function plan(): Plan | null {
  if (peakDb === null || !Number.isFinite(peakDb)) return null;
  return makePlan(peakDb, settings.targetDb, [...init.tracks, ...(settings.includeReturns ? init.returns : [])]);
}

function setup() {
  const peak = $<HTMLInputElement>("peak");
  if (peakDb !== null) peak.value = peakDb.toFixed(1);
  peak.placeholder = "e.g. 0.0";
  peak.oninput = () => {
    const v = parseFloat(peak.value);
    peakDb = Number.isFinite(v) ? v : null;
    render();
  };

  slider($("target"), $("target-presets"), { min: -12, max: -1, step: 0.5, marks: [-10, -6, -3], valueEl: $("target-value"), format: (v) => formatDb(v) },
    () => settings.targetDb, (v) => { settings.targetDb = v; render(); });
  toggle($("returns"), () => settings.includeReturns, (on) => { settings.includeReturns = on; render(); });
  toggle($("reset"), () => settings.resetMeter, (on) => (settings.resetMeter = on));
  $<HTMLButtonElement>("reset").disabled = !meter;
  radioGroup($("theme"), [["dark", "dark"], ["light", "light"]], () => settings.theme ?? "dark", (v) => {
    settings.theme = v as "dark" | "light";
    applyTheme(settings.theme);
  });

  $("cancel").onclick = cancel;
  $("apply").onclick = apply;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cancel();
    else if (e.key === "Enter") apply();
  });
}

/** Step 1: what the meter heard, or exactly what to do next. */
function renderMeasure() {
  const notice = $("measure-notice");
  const reading = $("reading");
  const hint = $("measure-hint");
  let todo = "";
  let warn = false;
  if (!meter) {
    todo = "put the 2sl meter first on the main track (before the limiter), set its target, press measure, play the loudest part, then reopen this. or type the peak below.";
  } else if (!meter.first) {
    todo = "the 2sl meter isn't first on the main track, so it may be reading after your limiter. move it to the start of the chain and measure again.";
    warn = true;
  } else if (meter.state === 1) {
    todo = "the meter is armed and waiting for audio: play the loudest part until it says held, then reopen this.";
  } else if (meter.state === 2) {
    todo = "the meter is still measuring: let it finish (it says held), then reopen this.";
  } else if (!measured) {
    todo = "on the 2sl meter: press measure, play the loudest part until it says held, then reopen this.";
  }
  notice.textContent = todo;
  notice.className = todo ? (warn ? "ui-notice warn" : "ui-notice") : "ui-notice hidden";
  hint.textContent = meter ? "with the 2sl meter on the main track" : "";

  reading.innerHTML = "";
  if (measured) {
    const add = (label: string, value: string) => {
      const span = document.createElement("span");
      span.innerHTML = '<span class="ui-label"></span> <b></b>';
      span.querySelector(".ui-label")!.textContent = label;
      span.querySelector("b")!.textContent = value;
      reading.append(span);
    };
    add("peak", formatDb(meter!.peakDb!));
    if (meter!.rmsDb !== null) {
      add("rms", formatDb(meter!.rmsDb, false));
      add("crest", formatDb(meter!.peakDb! - meter!.rmsDb, false));
    }
  }
  $("peak-source").textContent = measured && peakDb === meter!.peakDb ? "from the meter (edit to override)" : peakDb === null ? "" : "typed";
  $("step-measure").classList.toggle("done", peakDb !== null);
}

function render() {
  applyTheme(settings.theme ?? "dark");
  renderMeasure();
  $("target-hint").textContent = meter?.targetDb != null
    ? settings.targetDb === meter.targetDb ? "from the meter" : "will be saved to the meter"
    : "";

  const p = plan();
  const offset = $("offset");
  const hint = $("offset-hint");
  const applyBtn = $<HTMLButtonElement>("apply");
  if (!p) {
    offset.textContent = "–";
    offset.className = "ui-readout zero";
    hint.textContent = "needs a peak from step 1";
    applyBtn.disabled = true;
    applyBtn.querySelector("span")!.textContent = "apply";
  } else {
    const moved = p.rows.filter((r) => r.toValue !== r.value).length;
    offset.textContent = formatDb(p.offsetDb);
    offset.className = p.offsetDb === 0 ? "ui-readout zero" : "ui-readout";
    hint.textContent = p.offsetDb === 0
      ? "already on target: nothing to move"
      : `on ${moved} fader${moved === 1 ? "" : "s"}, ${formatDb(peakDb!)} → ${formatDb(settings.targetDb)}${p.exact ? ", relative levels kept" : ". some faders hit their limit, so those won't stay exactly relative"}`;
    applyBtn.disabled = p.offsetDb === 0 || moved === 0;
    applyBtn.querySelector("span")!.textContent = p.offsetDb === 0 ? "apply" : `apply ${formatDb(p.offsetDb)}`;
  }

  const body = $("rows");
  body.innerHTML = "";
  const channels = [...init.tracks, ...(settings.includeReturns ? init.returns : [])];
  const rows = p?.rows ?? channels.map((c) => ({ ...c, fromDb: NaN, toDb: NaN, toValue: c.value, note: undefined as string | undefined }));
  for (const r of rows) {
    const tr = document.createElement("tr");
    if (!p || r.toValue === r.value) tr.className = "dim";
    const cells = [r.name, r.kind === "track" ? "" : r.kind, p ? formatDb(r.fromDb, false) : "", p ? "→" : "", p ? formatDb(r.toDb, false) : "", r.note ?? ""];
    cells.forEach((text, i) => {
      const td = document.createElement("td");
      td.textContent = text;
      if (i === 1) td.className = "kind";
      if (i === 2 || i === 4) td.className = "num";
      if (i === 3) td.className = "arrow";
      tr.append(td);
    });
    body.append(tr);
  }
}

function cancel() {
  const message: Cancelled = { cancelled: true, settings };
  closeDialog(JSON.stringify(message));
}

function apply() {
  const p = plan();
  if (!p || p.offsetDb === 0) return;
  const result: Result = {
    apply: p.rows.filter((r) => r.toValue !== r.value).map((r) => ({ id: r.id, value: r.toValue })),
    offsetDb: p.offsetDb,
    targetDb: settings.targetDb,
    resetMeter: settings.resetMeter && !!meter,
    settings,
  };
  closeDialog(JSON.stringify(result));
}

// Outside Live (npm run ui): a sample mix.
function demoInit(): Init {
  const v = (db: number) => 0.85 + db / 40;
  return {
    meter: { peakDb: 0, rmsDb: -10.3, first: true, targetDb: -6, state: 3 },
    tracks: [
      { id: "1", name: "Kick", kind: "track", value: v(0) },
      { id: "2", name: "Bass", kind: "track", value: v(-3.5) },
      { id: "3", name: "Drums", kind: "group", value: v(-1) },
      { id: "4", name: "Chords", kind: "track", value: v(-9) },
      { id: "5", name: "Pad", kind: "track", value: 0.3 },
      { id: "6", name: "FX (muted)", kind: "track", value: 0 },
    ],
    returns: [{ id: "r1", name: "A-Reverb", kind: "return", value: v(0) }, { id: "r2", name: "B-Echo", kind: "return", value: v(-4) }],
    saved: null,
  };
}

void document.fonts.ready.then(() => {
  setup();
  render();
});
