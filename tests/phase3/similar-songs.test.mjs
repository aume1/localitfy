import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { validateSimilarityRequest, readNormalizedVector } = require("../../electron/analysis/similarity.cjs");
const { createSimilarityService } = require("../../electron/analysis/similarity-service.cjs");

test("similarity requests and invalid vectors are bounded before searching", () => {
  assert.deepEqual(validateSimilarityRequest({ songId: "seed" }), { songId: "seed", limit: 30 });
  assert.deepEqual(validateSimilarityRequest({ songIds: ["a", "b", "a"], seedKey: "liked", limit: 10 }), { songIds: ["a", "b"], seedKey: "liked", limit: 10 });
  assert.deepEqual(validateSimilarityRequest({ recent: true }), { recent: true, seedKey: "recent", limit: 30 });
  for (const payload of [{ songIds: [], seedKey: "k" }, { songIds: ["a"] }, { songIds: Array(2001).fill("a"), seedKey: "k" }, { songIds: [1], seedKey: "k" }]) {
    assert.throws(() => validateSimilarityRequest(payload));
  }
  for (const payload of [null, {}, { songId: "" }, { songId: "x".repeat(201) }, { songId: "seed", limit: 500 },
    { songId: "seed", limit: 0 }, { songId: "seed", limit: "30" }]) assert.throws(() => validateSimilarityRequest(payload));
  assert.equal(readNormalizedVector(Buffer.alloc(2048)), null);
  assert.equal(readNormalizedVector(Buffer.alloc(4)), null);
  const vector = Buffer.alloc(2048); vector.writeFloatLE(Infinity, 0);
  assert.equal(readNormalizedVector(vector), null);
});

test("similarity queries rank compatible profiles and validate files through the real readonly worker", () => {
  const result = spawnSync(process.execPath, ["scripts/run-electron-node.cjs", "scripts/test-similar-songs.cjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /real SQLite \+ worker/);
});

test("similarity worker concurrency is bounded and shutdown rejects pending queries", async () => {
  const workers = [];
  const service = createSimilarityService({ getDatabasePath: () => "/application/library.sqlite", workerFactory: (_file, options) => {
    assert.equal(options.workerData.databasePath, "/application/library.sqlite");
    const worker = new EventEmitter();
    worker.terminate = async () => {};
    workers.push(worker);
    return worker;
  } });
  const one = service.find({ songId: "one" });
  const two = service.find({ songId: "two" });
  const settled = Promise.allSettled([one, two]);
  assert.throws(() => service.find({ songId: "three" }), /still being calculated/);
  workers[0].emit("message", { result: { seedId: "one", status: "ready", matches: [], compared: 0 } });
  service.dispose();
  const outcomes = await settled;
  assert.equal(outcomes[0].status, "fulfilled");
  assert.equal(outcomes[1].status, "rejected");
  assert.throws(() => service.find({ songId: "three" }), /unavailable/);
});
