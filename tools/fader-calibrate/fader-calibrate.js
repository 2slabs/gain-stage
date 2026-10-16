// Writes Live's fader curve (internal value -> displayed dB) for the track this device is on.
// Output: live-fader-curve.tsv next to this device. Run once, then delete the device.
// Measured this way: references/live-fader-curve.tsv, the source of src/fader.ts's table.
autowatch = 1;
outlets = 1;

function fail(message) {
  post("fader-calibrate: " + message + "\n");
  error("fader-calibrate: " + message + "\n");
  outlet(0, "error");
}

function bang() {
  var volume_parameter = new LiveAPI("this_device canonical_parent mixer_device volume");
  if (!volume_parameter || volume_parameter.id == 0) { fail("no mixer volume found"); return; }
  var device_path = this.patcher.filepath;
  if (!device_path) { fail("save the device first: its folder is where the curve is written"); return; }
  var output_path = device_path.substring(0, device_path.lastIndexOf("/") + 1) + "live-fader-curve.tsv";
  var output_file = new File(output_path, "write", "TEXT");
  if (!output_file.isopen) { fail("couldn't open " + output_path); return; }
  output_file.eof = 0;
  // one writeline per row: a single writestring stops at 32767 bytes, which cut the first measurement at 0.9435
  output_file.writeline("value\tdisplay");
  var step_count = 2000;
  for (var step_index = 0; step_index <= step_count; step_index++) {
    var fader_value = step_index / step_count;
    output_file.writeline(fader_value.toFixed(4) + "\t" + volume_parameter.call("str_for_value", fader_value));
  }
  output_file.close();
  post("fader-calibrate: wrote " + (step_count + 1) + " rows to " + output_path + "\n");
  outlet(0, "done");
}
