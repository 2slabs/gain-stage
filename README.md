# gain stage

Gain staging for Ableton Live. When the mix runs hot and slams the master limiter, this brings every top-level fader down by the same number of dB, so the master peak lands on a target (−6 dB by default) and the channels keep their relative levels.

A [2sl](https://2sl.to) project. Built on Ableton's Extensions SDK (public beta).

## Use it

1. Put the **2sl meter** (Max for Live, in `~/m4l-dev/devices/2sl-meter/`) **first** on the main track, before any limiter, so it reads the mix going in.
2. Press **reset** on the meter, then play the loudest part of the track. The meter holds the highest peak.
3. Right-click any track → **Gain Stage Mix…**. The dialog shows the held peak, the target, the change (e.g. −8.3 dB) and every fader's before → after. **Apply** moves them in one undo step, and resets the meter so you can play it again and check.

No meter? Type the peak yourself (for example, with the limiter bypassed, read the master meter).

**What moves:** ungrouped tracks and group tracks. Tracks inside a group follow their group fader, so they aren't touched. Return tracks stay put by default, because post-fader sends already drop with the track faders. Turn on **returns** if you use pre-fader sends. Faders at −inf stay at −inf. A fader that would pass +6 dB or below −69.6 dB stops there, and the dialog says so.

## How the dB maths works

The SDK gives fader positions as 0–1 values, and Live's curve isn't published, so it was measured with Max for Live (`str_for_value` on a track's volume, every 0.0005; see `~/m4l-dev/devices/tools/fader-calibrate.*`). From −18 dB up it's exactly linear, dB = (value − 0.85) × 40. Below that, `src/fader.ts` uses the measured table, which matches Live's display within 0.006 dB everywhere.

## Develop

Same setup as chord-progressions (SDK `.tgz` into `vendor/`, `.env`, `npm install`).

```sh
npm test          # fader curve + plan
npm run ui        # the dialog in a browser with a sample mix
../dev-all.sh     # run with chord-progressions and bassline in one host
npm run package   # → gain-stage-<version>.ablx
```

| path | what |
|---|---|
| `src/fader.ts` | Live's fader curve, value ↔ dB (measured) |
| `src/plan.ts` | the plan: offset, per-fader targets, clamping |
| `src/extension.ts` | reads faders and the 2sl meter, applies the plan |
| `ui/` | the dialog (2sl-ui) |

Ableton and Live are trademarks of Ableton AG; this project isn't affiliated with or endorsed by Ableton.
