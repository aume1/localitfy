import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createAnalysisService } = require("../../electron/analysis/service.cjs");
const { MODEL, ANALYZER_VERSION } = require("../../electron/analysis/model.cjs");
const waitUntil = async (check) => {
  for (let i = 0; i < 100; i++) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 10)); }
  assert.fail("service did not settle");
};
function fixture(t, { battery = false, enabled = true, records = [], defer = false, allowOnBattery = false, songs = [{ id: "song", filePath: "/test.wav", duration: 30 }] } = {}) {
  const settings = { experimentalMusicAnalysis: enabled, analysisOnBattery: allowOnBattery };
  const saved = [];
  const workers = [];
  const power = new EventEmitter();
  power.isOnBatteryPower = () => battery;
  const service = createAnalysisService({ root: "/unused", ffmpegPath: "/unused", powerMonitor: power,
    statFile: async () => ({ isFile: () => true, size: 10, mtimeMs: 20 }),
    repositories: { settings: { get: () => settings, save: (patch) => Object.assign(settings, patch) },
      songs: { list: () => songs },
      analysis: { list: () => records, save: (record) => saved.push(record), clear: () => records.splice(0) }, listening: { clear: () => {} } },
    modelManager: { initialized: Promise.resolve(), metadata: MODEL, installedPath: "/unused",
      status: () => ({ state: "ready" }), cancel: async () => {}, remove: async () => {} },
    workerFactory: () => {
      const worker = new EventEmitter();
      worker.postMessage = (job) => {
        if (job.cancel) { queueMicrotask(() => worker.emit("exit", 0)); return; }
        if (!defer) queueMicrotask(() => worker.emit("message", { songId: job.songId, vector: new Float32Array(512), rms: 0.2 }));
      };
      worker.terminate = async () => {};
      workers.push(worker);
      return worker;
    }
  });
  t.after(() => service.dispose());
  return { service, workers, settings, saved, power, setBattery: (value) => { battery = value; power.emit(value ? "on-battery" : "on-ac"); } };
}

test("analysis is opt-in and power-aware; status does not start workers", async (t) => {
  const { service, workers } = fixture(t, { enabled: false });
  await service.status();
  assert.equal(workers.length, 0);
  await assert.rejects(service.start(), /Enable analysis/);
  assert.equal((await service.status()).scanning, false);
  const onBattery = fixture(t, { battery: true });
  await assert.rejects(onBattery.service.start(), /Connect to power/);
  assert.equal(onBattery.workers.length, 0);
});

test("current cached files are skipped; changed/error entries can be retried", async (t) => {
  const record = { songId: "song", modelId: MODEL.id, analyzerVersion: ANALYZER_VERSION, filePath: "/test.wav", fileSize: 10, fileMtime: 20, status: "ready" };
  const cached = fixture(t, { records: [record] });
  await cached.service.start();
  assert.equal(cached.workers.length, 0);
  const failed = fixture(t, { records: [{ ...record, status: "failed" }] });
  await failed.service.start();
  assert.equal(failed.workers.length, 0);
  await failed.service.start({ retry: true });
  await waitUntil(() => failed.saved.length === 1);
  const changed = fixture(t, { records: [{ ...record, fileSize: 5 }] });
  await changed.service.start();
  await waitUntil(() => changed.saved.length === 1);
});

test("disabling/suspending cancels workers and ignores late results", async (t) => {
  const { service, workers, saved, settings, power } = fixture(t, { defer: true });
  await service.start();
  assert.equal(workers.length, 1);
  await service.setEnabled(false);
  assert.equal(settings.experimentalMusicAnalysis, false);
  workers[0].emit("message", { songId: "song", vector: new Float32Array(512), rms: 0.1 });
  assert.equal(saved.length, 0);
  assert.equal((await service.status()).paused, true);
  await service.setEnabled(true);
  await service.start();
  power.emit("suspend");
  await waitUntil(async () => (await service.status()).paused);
});


test("battery inference defaults off and can be enabled without automatically starting", async (t) => {
  const { service, workers, settings } = fixture(t, { battery: true });
  assert.equal((await service.status()).allowOnBattery, false);
  const allowed = await service.setAllowOnBattery(true);
  assert.equal(allowed.allowOnBattery, true);
  assert.equal(settings.analysisOnBattery, true);
  assert.equal(workers.length, 0);
  await service.start();
  assert.equal(workers.length, 1);
  await assert.rejects(service.setAllowOnBattery("true"), /Expected a boolean/);
  assert.equal(settings.analysisOnBattery, true);
});

test("unplugging pauses by default and ignores late inference results", async (t) => {
  const { service, workers, saved, setBattery } = fixture(t, { defer: true });
  await service.start();
  setBattery(true);
  await waitUntil(async () => (await service.status()).paused);
  workers[0].emit("message", { songId: "song", vector: new Float32Array(512), rms: 0.1 });
  assert.equal(saved.length, 0);
});

test("battery permission keeps inference and subsequent queued tracks running after unplugging", async (t) => {
  const { service, saved, setBattery } = fixture(t, { allowOnBattery: true, songs: [
    { id: "one", filePath: "/one.wav", duration: 30 }, { id: "two", filePath: "/two.wav", duration: 30 }
  ] });
  await service.start();
  setBattery(true);
  await waitUntil(() => saved.length === 2);
  assert.deepEqual(saved.map((record) => record.songId), ["one", "two"]);
  assert.equal((await service.status()).allowOnBattery, true);
});

test("revoking battery permission pauses active work; suspension still pauses with permission", async (t) => {
  const { service, workers, settings, power } = fixture(t, { battery: true, allowOnBattery: true, defer: true });
  await service.start();
  await service.setAllowOnBattery(false);
  assert.equal(settings.analysisOnBattery, false);
  assert.equal((await service.status()).paused, true);
  assert.equal(workers.length, 1);
  await service.setAllowOnBattery(true);
  await service.start();
  power.emit("suspend");
  assert.equal((await service.status()).paused, true);
});
