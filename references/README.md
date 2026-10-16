# references

- `live-fader-curve.tsv`: Live's track volume fader, internal value (0–1, every 0.0005) → displayed dB, from `str_for_value` on a track's volume, measured in Live 12 with `tools/fader-calibrate/`. It is the source of the table in `src/fader.ts` (below value 0.4) and of the linear rule above −18 dB.
  - It stops at 0.9435 (+3.742 dB): the first version of fader-calibrate wrote it with one `writestring`, which stops at 32767 bytes. Above −18 dB the curve is exactly linear, so `src/fader.ts` doesn't need the missing rows. The device now writes one line per row; re-run it to get the full curve.
