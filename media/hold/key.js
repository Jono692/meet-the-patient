// Offline keyer for the hold-screen clip. Reads raw rgb24 frames on stdin, writes the
// keyed-and-composited frames on stdout, ready for ffmpeg to encode.
//
//   node key.js <width> <height> [similarity] [smoothness] [deadzone]
//
// The matte is the patients' live key from src/chroma.js: distance from the key colour in
// UV, and a soft curved ramp from transparent to opaque. So the hold screen and the patients
// are keyed on the same basis.
//
// Spill is where it differs, because this clip's green is vivid and ours is dull. Green is
// pulled toward 0.6 red + 0.4 blue, which keeps hair's brown order (red > green > blue), but
// only by the amount its excess over that exceeds DEADZONE. Measured excess: her grey top
// ~4/255, skin and hair below zero, green-tinged strands ~29/255. So the strands are
// corrected and she is left exactly as she was.
//
// What was tried and rejected on 3 Nov, each checked at 2x against the source:
//   - the patients' own spill step (desaturate near the key): bright green fringe on her hair
//   - ffmpeg despill: fringe gone, but her grey top turned mauve
//   - clamping green to max(red, blue): top fine, hair edge olive (green = red reads olive)
//   - swapping green for blue by distance: cannot tell a 12% green strand from her grey top
//   - un-mixing edge pixels to recover her fine loose strands, with either a linear UV matte
//     or a colour-difference matte: both turned the strands navy. The footage is sharpened,
//     so her hair carries a dark halo darker than either hair or green; un-mixing a pixel the
//     model does not fit drives it toward black, and the added blue makes it navy.
// The finest loose strands therefore cannot be pulled cleanly from this source, and are let
// go: a clean edge reads better at 55 inches than a ragged one.
//
// Defaults are tuned for AdobeStock_207362531. In UV distance the backdrop sits at <= 0.024
// from the key and her skin, hair and top at >= 0.209, so:
//   similarity 0.04  - fully transparent below this, clears the backdrop with margin
//   smoothness 0.15  - opaque above 0.19; the long ramp lets the last light strands blend
//                      into the blue instead of sitting as a solid rim, still 0.02 short of
//                      her grey top
//   deadzone   6     - green excess in 0-255 levels left alone

const [W, H] = [parseInt(process.argv[2], 10), parseInt(process.argv[3], 10)];
const SIM = parseFloat(process.argv[4] ?? "0.04");
const SMOOTH = parseFloat(process.argv[5] ?? "0.15");
const DEADZONE = parseFloat(process.argv[6] ?? "6") / 255;
if (!W || !H) { console.error("usage: node key.js <width> <height> [sim] [smooth] [deadzone]"); process.exit(1); }

const KEY = [0x5b / 255, 0xd4 / 255, 0x6c / 255];   // the backdrop, sampled from the clip
const BG = [0x00 / 255, 0x35 / 255, 0x95 / 255];    // #003595, the stand background

const toU = (r, g, b) => r * -0.169 + g * -0.331 + b * 0.5 + 0.5;
const toV = (r, g, b) => r * 0.5 + g * -0.419 + b * -0.081 + 0.5;
const KU = toU(...KEY), KV = toV(...KEY);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const FRAME = W * H * 3;
let buf = Buffer.alloc(0);

function keyFrame(f) {
  const out = Buffer.allocUnsafe(FRAME);
  for (let i = 0; i < FRAME; i += 3) {
    const r = f[i] / 255, g = f[i + 1] / 255, b = f[i + 2] / 255;
    const dist = Math.hypot(toU(r, g, b) - KU, toV(r, g, b) - KV);
    const mask = Math.pow(clamp01((dist - SIM) / SMOOTH), 1.5);
    const excess = g - (0.6 * r + 0.4 * b);          // green above hair's brown order
    const cg = excess > DEADZONE ? g - (excess - DEADZONE) : g;
    out[i] = Math.round((BG[0] + (r - BG[0]) * mask) * 255);
    out[i + 1] = Math.round((BG[1] + (cg - BG[1]) * mask) * 255);
    out[i + 2] = Math.round((BG[2] + (b - BG[2]) * mask) * 255);
  }
  return out;
}

process.stdin.on("data", (chunk) => {
  buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
  while (buf.length >= FRAME) {
    process.stdout.write(keyFrame(buf.subarray(0, FRAME)));
    buf = buf.subarray(FRAME);
  }
});
process.stdin.on("end", () => {
  if (buf.length) console.error(`key.js: ${buf.length} trailing bytes ignored - not a whole frame`);
});
