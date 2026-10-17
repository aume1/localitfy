import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createModelManager } = require("../../electron/analysis/model-manager.cjs");
const { preserveExperimentalSettings } = require("../../electron/ipc/analysis.cjs");
const content = Buffer.from("test-weights");
const model = { id: "test-model", revision: "pinned", files: [{ path: "onnx/weights.onnx", bytes: content.length, sha256: crypto.createHash("sha256").update(content).digest("hex") }] };
const settle = async (manager) => {
  for (let i = 0; i < 200; i++) {
    if (manager.status().state !== "downloading") return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("download did not settle");
};
async function fixture(t, fetchImpl) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "localtify-model-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const manager = createModelManager(root, { model, fetchImpl });
  await manager.initialized;
  return { root, manager };
}

test("model status never downloads implicitly; explicit installation verifies and survives restart", async (t) => {
  let calls = 0;
  const fetchImpl = async (url) => { calls++; assert.match(url, /\/resolve\/pinned\//); return new Response(content); };
  const { root, manager } = await fixture(t, fetchImpl);
  assert.equal(calls, 0);
  assert.equal(manager.status().state, "not-installed");
  await Promise.all([manager.download(), manager.download()]);
  await settle(manager);
  assert.equal(calls, 1);
  assert.equal(manager.status().state, "ready");
  const restarted = createModelManager(root, { model, fetchImpl });
  await restarted.initialized;
  assert.equal(restarted.status().state, "ready");
  assert.equal(calls, 1);
  await restarted.remove();
  assert.equal(restarted.status().state, "not-installed");
  assert.deepEqual(await fs.readdir(root), []);
});

test("corrupt, truncated, oversized and unsuccessful responses cannot install a model", async (t) => {
  for (const response of [() => new Response(Buffer.alloc(content.length)), () => new Response("short"),
    () => new Response(Buffer.alloc(content.length + 1)), () => new Response("error", { status: 503 })]) {
    const { root, manager } = await fixture(t, async () => response());
    await manager.download();
    await settle(manager);
    assert.equal(manager.status().state, "error");
    assert.deepEqual(await fs.readdir(root), []);
  }
});

test("cancel/remove abort pending downloads and leave no partial installation", async (t) => {
  const { root, manager } = await fixture(t, async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));
  await manager.download();
  await manager.remove();
  assert.equal(manager.status().state, "not-installed");
  assert.deepEqual(await fs.readdir(root), []);
});

test("a modified installed file is rejected on next launch", async (t) => {
  const { root, manager } = await fixture(t, async () => new Response(content));
  await manager.download(); await settle(manager);
  await fs.writeFile(path.join(manager.installedPath, model.files[0].path), Buffer.alloc(content.length));
  const restarted = createModelManager(root, { model, fetchImpl: () => assert.fail("unexpected network") });
  await restarted.initialized;
  assert.equal(restarted.status().state, "not-installed");
});

test("ordinary settings saves cannot overwrite experimental enable/history privacy state", () => {
  const saved = { experimentalMusicAnalysis: true, analysisOnBattery: true, listeningHistoryEnabled: false, listeningHistoryClearedAt: 123 };
  assert.deepEqual(preserveExperimentalSettings({ volume: 0.8, experimentalMusicAnalysis: false, analysisOnBattery: false,
    listeningHistoryEnabled: true, listeningHistoryClearedAt: 0 }, saved), { volume: 0.8, ...saved });
});

test("model download stalls fail clearly without treating a timeout as user cancellation", async (t) => {
  const { root, manager } = await (async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "localtify-model-stall-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const manager = createModelManager(root, { model, inactivityTimeoutMs: 25, downloadTimeoutMs: 5_000,
      fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }) });
    await manager.initialized;
    return { root, manager };
  })();
  await manager.download();
  await settle(manager);
  assert.equal(manager.status().state, "error");
  assert.match(manager.status().error, /stalled/i);
  assert.deepEqual(await fs.readdir(root), []);
});
