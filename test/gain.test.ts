import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { MIN_DB, toDb, toValue } from "../src/fader.ts";
import { formatDb, makePlan, type Channel } from "../src/plan.ts";

const near = (a: number, b: number, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test("fader curve: known points from Live's display", () => {
  near(toDb(0.85), 0);
  near(toDb(0.7), -6);
  near(toDb(1), 6);
  near(toDb(0.4), -18);
  near(toDb(0.3), -24.2);
  near(toDb(0.1), -48.6);
  near(toDb(0.02), -63.373);
  assert.equal(toDb(0), -Infinity);
});

test("fader curve matches every measured point", () => {
  const file = `${process.env.HOME}/m4l-dev/fader-curve.tsv`;
  if (!fs.existsSync(file)) return; // the measurement lives on the dev machine
  for (const line of fs.readFileSync(file, "utf8").trim().split("\n").slice(1)) {
    const [v, d] = line.split("\t");
    const db = d.startsWith("-inf") ? -Infinity : parseFloat(d);
    if (db === -Infinity) assert.equal(toDb(Number(v)), -Infinity);
    else near(toDb(Number(v)), db, 0.006); // display rounds to 0.1 dB above −18
  }
});

test("dB → value → dB round-trips across the range", () => {
  for (let db = 6; db >= MIN_DB; db -= 0.37) near(toDb(toValue(db)), db, 0.002);
  assert.equal(toValue(-Infinity), 0);
  assert.equal(toValue(12), 1);
});

const ch = (name: string, db: number, kind: Channel["kind"] = "track"): Channel => ({ id: name, name, kind, value: toValue(db) });

test("plan moves every fader by target − peak", () => {
  const p = makePlan(2.3, -6, [ch("kick", 0), ch("bass", -4.5), ch("pads", -21), ch("drums", -2, "group")]);
  assert.equal(p.offsetDb, -8.3);
  assert.ok(p.exact);
  for (const r of p.rows) near(r.toDb - r.fromDb, -8.3, 0.002);
  near(toDb(p.rows[0].toValue), -8.3, 0.002);
});

test("relative levels are kept exactly", () => {
  const p = makePlan(0, -6, [ch("a", -3), ch("b", -15), ch("c", -30)]);
  near(p.rows[0].toDb - p.rows[1].toDb, 12, 0.002);
  near(p.rows[1].toDb - p.rows[2].toDb, 15, 0.002);
});

test("faders at −inf stay put; clamping is reported", () => {
  const p = makePlan(-20, -6, [{ id: "off", name: "off", kind: "track", value: 0 }, ch("hot", 0)]);
  assert.equal(p.rows[0].toValue, 0);
  assert.ok(p.rows[0].note);
  assert.equal(p.rows[1].toDb, 6);
  assert.ok(!p.exact);
  const q = makePlan(10, -6, [ch("quiet", -60)]);
  near(q.rows[0].toDb, MIN_DB);
  assert.ok(!q.exact);
});

test("formatting", () => {
  assert.equal(formatDb(-8.34), "−8.3 dB");
  assert.equal(formatDb(2), "+2.0 dB");
  assert.equal(formatDb(0.01), "0.0 dB");
  assert.equal(formatDb(-Infinity), "−inf dB");
});
