// Optional offline integration check: node scripts/run-electron-node.cjs scripts/test-music-analysis.cjs /absolute/model/path
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { Worker } = require("node:worker_threads");
const { once } = require("node:events");
const { MODEL } = require("../electron/analysis/model.cjs");

async function main() {
  const modelPath = process.argv[2];
  if (!modelPath || !fs.existsSync(path.join(modelPath, "onnx/audio_model_quantized.onnx"))) throw new Error("Pass an installed local model directory. This check never downloads a model.");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "localtify-analysis-smoke-"));
  const ffmpegPath = require("ffmpeg-static");
  const wave = path.join(root, "tone.wav");
  const rendered = spawnSync(ffmpegPath, ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=12", "-y", wave]);
  assert.equal(rendered.status, 0, String(rendered.stderr));
  const worker = new Worker(path.resolve(__dirname, "../electron/analysis/worker.cjs"), { workerData: { modelPath, ffmpegPath }, resourceLimits: { maxOldGenerationSizeMb: 256 } });
  const timeout = setTimeout(() => { void worker.terminate(); }, 60_000);
  const infer = async (filePath) => {
    const result = once(worker, "message");
    worker.postMessage({ songId: "synthetic", filePath, duration: 12 });
    return (await result)[0];
  };
  try {
    const start = performance.now();
    const first = await infer(wave);
    assert.equal(first.error, undefined);
    assert.equal(first.vector.length, MODEL.dimensions);
    assert.ok(first.vector.every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...first.vector) - 1) < 1e-5);
    assert.ok(first.rms > 0 && first.rms < 1);
    const second = await infer(wave);
    const cosine = first.vector.reduce((sum, value, i) => sum + value * second.vector[i], 0);
    assert.ok(cosine > 0.9999, `repeated inference changed: ${cosine}`);
    const missing = await infer(path.join(root, "missing.wav"));
    assert.equal(typeof missing.error, "string");
    console.log(`[music-analysis] offline worker decode + 512-D normalized embeddings + determinism + missing file passed (${Math.round(performance.now() - start)} ms)`);
  } finally {
    clearTimeout(timeout);
    worker.postMessage({ cancel: true });
    await worker.terminate();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
