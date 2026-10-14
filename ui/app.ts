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
let peakDb: number | null = init.meter?.peakDb ?? null;

function plan(): Plan | null {
  if (peakDb === null || !Number.isFinite(peakDb)) return null;
  return makePlan(peakDb, settings.targetDb, [...init.tracks, ...(settings.includeReturns ? init.returns : [])]);
}

function setup() {
  const peak = $<HTMLInputElement>("peak");
  if (peakDb !== null) peak.value = peakDb.toFixed(1);
  peak.placeholder = "e.g. 1.5";
  peak.oninput = () => {
    const v = parseFloat(peak.value);
    peakDb = Number.isFinite(v) ? v : null;
    render();
  };

  slider($("target"), $("target-presets"), { min: -12, max: -1, step: 0.5, marks: [-10, -6, -3], valueEl: $("target-value"), format: (v) => formatDb(v) },
    () => settings.targetDb, (v) => { settings.targetDb = v; render(); });
  toggle($("returns"), () => settings.includeReturns, (on) => { settings.includeReturns = on; render(); });
  toggle($("reset"), () => settings.resetMeter, (on) => (settings.resetMeter = on));
  radioGroup($("theme"), [["dark", "dark"], ["light", "light"]], () => settings.theme ?? "dark", (v) => {
    settings.theme = v as "dark" | "light";
    applyTheme(settings.theme);
  });
  $<HTMLButtonElement>("reset").disabled = !init.meter;

  $("cancel").onclick = cancel;
  $("apply").onclick = apply;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cancel();
    else if (e.key === "Enter") apply();
  });
  if (peakDb === null) peak.focus();
}

function render() {
  applyTheme(settings.theme ?? "dark");
  const p = plan();

  // Where the peak comes from, and anything to watch out for.
  const notice = $("notice");
  let warning = "";
  if (!init.meter) warning = "no 2sl meter on the main track: add it first in the chain, play the loudest part, then reopen. or type the peak below.";
  else if (!init.meter.first) warning = "the 2sl meter isn't first on the main track, so it may read after your limiter. move it to the start of the chain.";
  else if (init.meter.peakDb === null) warning = "the 2sl meter has no reading yet: press reset on it, play the loudest part until it says held, then reopen.";
  notice.textContent = warning;
  notice.className = warning ? "ui-notice warn" : "ui-notice hidden";
  const fromMeter = init.meter?.peakDb != null && peakDb === init.meter.peakDb;
  const rms = init.meter?.rmsDb ?? null;
  $("peak-source").textContent = fromMeter
    ? rms !== null ? `meter · rms ${formatDb(rms, false)} · crest ${formatDb(init.meter!.peakDb! - rms, false)}` : "from 2sl meter"
    : "typed";

  $("status").innerHTML = "<b></b><span></span>";
  $("status").querySelector("b")!.textContent = peakDb === null ? "peak unknown" : `master ${formatDb(peakDb)}`;
  $("status").querySelector("span")!.textContent = `target ${formatDb(settings.targetDb)}`;

  const offset = $("offset");
  const hint = $("offset-hint");
  const applyBtn = $<HTMLButtonElement>("apply");
  if (!p) {
    offset.textContent = "–";
    offset.className = "ui-readout zero";
    hint.textContent = "type the master peak to see the change";
    applyBtn.disabled = true;
    applyBtn.querySelector("span")!.textContent = "apply";
  } else {
    const moved = p.rows.filter((r) => r.toValue !== r.value).length;
    offset.textContent = formatDb(p.offsetDb);
    offset.className = p.offsetDb === 0 ? "ui-readout zero" : "ui-readout";
    hint.textContent = p.offsetDb === 0
      ? "already on target"
      : `on ${moved} fader${moved === 1 ? "" : "s"}${p.exact ? ", relative levels kept exactly" : ": some faders hit their limit, so levels won't stay exactly relative"}`;
    applyBtn.disabled = p.offsetDb === 0 || moved === 0;
    applyBtn.querySelector("span")!.textContent = `apply ${formatDb(p.offsetDb)}`;
  }

  const body = $("rows");
  body.innerHTML = "";
  const rows = p?.rows ?? [...init.tracks, ...(settings.includeReturns ? init.returns : [])].map((c) => ({ ...c, fromDb: NaN, toDb: NaN, toValue: c.value, note: undefined }));
  for (const r of rows) {
    const tr = document.createElement("tr");
    const unchanged = !p || r.toValue === r.value;
    if (unchanged) tr.className = "dim";
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
  $("footnote").textContent = "groups move as one · one undo step";
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
    resetMeter: settings.resetMeter && !!init.meter,
    settings,
  };
  closeDialog(JSON.stringify(result));
}

// Outside Live (npm run ui): a sample mix.
function demoInit(): Init {
  const v = (db: number) => 0.85 + db / 40;
  return {
    meter: { peakDb: 2.3, rmsDb: -9.6, first: true },
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
