import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { normalizePlayEvent } = require("../../electron/db/play-events.cjs");
const source = fs.readFileSync(new URL("../../src/features/player/listeningHistory.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { ListeningHistory } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

function setup() {
  let time = 1_000_000;
  let id = 0;
  const writes = [];
  const tracker = new ListeningHistory((event) => writes.push(event), () => time, () => time, () => `id-${++id}`);
  const audio = { currentTime: 0, paused: false, seeking: false, playbackRate: 1 };
  const advance = (ms, seconds = ms / 1000) => {
    time += ms;
    audio.currentTime += seconds;
    tracker.sample(audio);
  };
  return { writes, tracker, audio, advance, elapse: (ms) => { time += ms; } };
}

test("history checkpoints are bounded and pause/resume keeps one event", () => {
  const { tracker, writes, audio, advance, elapse } = setup();
  tracker.play("song", 0, "playlist");
  for (let i = 0; i < 16; i++) advance(1000);
  assert.equal(writes.length, 2);
  audio.paused = true;
  tracker.pause(audio);
  const paused = writes.at(-1);
  assert.equal(paused.msListened, 16_000);
  assert.equal(paused.contextType, "playlist");
  assert.equal(paused.contextId, "playlist");
  elapse(60_000);
  audio.paused = false;
  tracker.play("song", audio.currentTime);
  advance(1000);
  tracker.finish("ended");
  assert.equal(writes.at(-1).msListened, 17_000);
  assert.equal(writes.at(-1).id, writes[0].id);
  assert.equal(writes.at(-1).outcome, "ended");
  assert.equal(normalizePlayEvent(writes.at(-1), writes.at(-1).updatedAt)?.songId, "song");
});

test("seeking, stalls, suspended observations and playback rate do not inflate listening", () => {
  const { tracker, writes, audio, advance } = setup();
  tracker.play("song", 0);
  advance(1000);
  audio.seeking = true;
  advance(1000, 90);
  tracker.discontinuity(audio.currentTime);
  audio.seeking = false;
  advance(1000, 0);
  advance(1000, 0);
  audio.playbackRate = 2;
  advance(1000, 2);
  audio.playbackRate = 0.5;
  advance(1000, 0.5);
  advance(60_000, 30);
  tracker.finish("interrupted");
  assert.equal(writes.at(-1).msListened, 3000);
});

test("replacement, repeats, transitions and errors remain distinct and finalization is idempotent", () => {
  const { tracker, writes, advance } = setup();
  tracker.play("one", 0);
  advance(1000);
  tracker.play("two", 0);
  assert.equal(writes.at(-2).outcome, "replaced");
  tracker.finish("transition");
  tracker.play("two", 0);
  tracker.finish("error");
  tracker.finish("error");
  const finals = writes.filter((event) => event.endedAt !== null);
  assert.deepEqual(finals.map((event) => event.outcome), ["replaced", "transition", "error"]);
  assert.equal(new Set(finals.map((event) => event.id)).size, 3);
  assert.equal(new Set(finals.map((event) => event.sessionId)).size, 1);
});

test("native input rejects malformed, excessive and inconsistent events", () => {
  const { tracker, writes } = setup();
  tracker.play("song", 0);
  const valid = writes[0];
  assert.ok(normalizePlayEvent(valid));
  for (const patch of [
    { id: "" }, { songId: {} }, { sessionId: "x".repeat(201) }, { startedAt: NaN },
    { updatedAt: Infinity }, { msListened: -1 }, { msListened: 1 }, { outcome: "skipped" },
    { endedAt: valid.updatedAt }, { contextType: "playlist", contextId: null },
    { updatedAt: valid.startedAt - 1 }, { updatedAt: Date.now() + 120_000 }
  ]) assert.equal(normalizePlayEvent({ ...valid, ...patch }), null, JSON.stringify(patch));
});
