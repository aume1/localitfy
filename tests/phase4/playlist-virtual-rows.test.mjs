import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { runInNewContext } from "node:vm";

const read = (relative) => fs.readFileSync(relative, "utf8");

test("virtual playlist rows are positioned by their own transform", () => {
  assert.match(read("src/features/playlists/components/VirtualPlaylistTrackList.tsx"), /"--playlist-row-y": `\$\{virtualRow\.start - scrollMargin\}px`/);
  assert.match(read("src/features/playlists/playlists.css"), /\.playlistTrackRow\.virtualPlaylistTrackRow \{[^}]*position: absolute;[^}]*transform: translateY\(var\(--playlist-row-y,0px\)\);/);
});

test("the always-on performance transform reset leaves virtual playlist rows alone", () => {
  // body.localtifyPerf is always set, so a `transform: none !important` that matches these rows stacks them all at the top.
  const css = read("src/features/shell/performance.css");
  for (const block of css.split("}")) {
    if (!/transform:\s*none/.test(block) || !/\.playlistTrackRow/.test(block)) continue;
    assert.match(block, /:not\(\.virtualPlaylistTrackRow\)/);
  }
});


test("shared pointer session reorders after scrolling and cancels without dropping", () => {
  const source = ts.transpileModule(read("src/features/library/components/trackPointerSession.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const listeners = new Map(), captureListeners = new Map(), frames = new Map(), events = [];
  let frameId = 0;
  const window = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const capture = { isConnected: true, scrollTop: 0, closest: () => capture,
    getBoundingClientRect: () => ({ top: 0, bottom: 300, left: 0, right: 400, height: 300 }),
    setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {},
    addEventListener: (name, fn) => captureListeners.set(name, fn), removeEventListener: name => captureListeners.delete(name) };
  const exports = {};
  runInNewContext(source, { exports, window, requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame: id => frames.delete(id) });
  const event = (y, id = 1) => ({ pointerId: id, clientX: 100, clientY: y, currentTarget: capture, preventDefault() {} });
  const start = () => exports.startTrackPointerSession(event(150), { move: (x,y) => events.push(["move",x,y]), finish: (apply,x,y) => events.push(["finish",apply,x,y]) });
  start();
  captureListeners.get("lostpointercapture")({ ...event(150), target: {} });
  listeners.get("pointermove")(event(290));
  const [id, tick] = frames.entries().next().value; frames.delete(id); tick();
  assert.ok(capture.scrollTop > 0);
  listeners.get("pointerup")(event(290));
  assert.deepEqual(events.at(-1), ["finish",true,100,290]);
  assert.equal(listeners.size,0);
  assert.equal(frames.size,0);
  const cancel = start();
  listeners.get("pointermove")(event(290));
  cancel();
  assert.deepEqual(events.at(-1), ["finish",false,100,290]);
  assert.equal(listeners.size,0);
});
