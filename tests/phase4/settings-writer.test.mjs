import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";

const source = fs.readFileSync("src/features/settings/settingsWriter.ts", "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const exports = {};
runInNewContext(outputText, { exports, structuredClone });
const { createSettingsWriter } = exports;

test("settings writes are ordered and take immutable snapshots", async () => {
  const writes = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const write = createSettingsWriter(async value => {
    writes.push(value);
    if (writes.length === 1) await gate;
  });
  const first = { volume: 0.2, layout: ["home"] };
  const a = write(first);
  const b = write({ volume: 0.8, layout: ["library"] });
  first.layout.push("changed");
  await Promise.resolve();
  assert.deepEqual(writes, [{ volume: 0.2, layout: ["home"] }]);
  release();
  await Promise.all([a, b]);
  assert.deepEqual(writes, [{ volume: 0.2, layout: ["home"] }, { volume: 0.8, layout: ["library"] }]);
});

test("a failed settings write does not poison subsequent saves", async () => {
  const writes = [];
  const write = createSettingsWriter(async value => {
    writes.push(value);
    if (value === 1) throw new Error("disk unavailable");
  });
  const failed = write(1);
  const saved = write(2);
  await assert.rejects(failed, /disk unavailable/);
  await saved;
  assert.deepEqual(writes, [1, 2]);
});


test("flush waits for pending settings and reports a failed last write", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const writer = createSettingsWriter(async value => { await gate; if (value === 2) throw new Error("unavailable"); });
  const first = writer(1);
  let flushed = false;
  const flush = writer.flush().then(() => { flushed = true; });
  await Promise.resolve();
  assert.equal(flushed, false);
  release();
  await Promise.all([first, flush]);
  assert.equal(flushed, true);
  const failed = writer(2);
  await assert.rejects(writer.flush(), /unavailable/);
  await assert.rejects(failed, /unavailable/);
  await writer(3);
  await writer.flush();
});

test("native close flush waits for the registered renderer and rejects stale acknowledgments", async () => {
  const { createSettingsFlushRuntime } = createRequire(import.meta.url)("../../electron/runtime/settings-flush.cjs");
  const flush = createSettingsFlushRuntime({timeoutMs: 30});
  const messages = [];
  const contents = { isDestroyed: () => false, send: (channel,id) => messages.push({channel,id}) };
  assert.equal(await flush.request(contents), true);
  flush.ready(contents);
  const request = flush.request(contents);
  assert.equal(flush.request(contents), request);
  assert.equal(messages.length, 1);
  assert.equal(flush.complete(contents,"stale",true), false);
  assert.equal(flush.complete({},messages[0].id,true), false);
  assert.equal(flush.complete(contents,messages[0].id,true), true);
  assert.equal(await request,true);
  const timeout = flush.request(contents);
  assert.equal(await timeout,false);
  const interrupted = flush.request(contents);
  flush.forget(contents);
  assert.equal(await interrupted,false);
  assert.equal(await flush.request(contents),true);
});
