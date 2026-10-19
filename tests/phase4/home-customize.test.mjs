import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { runInNewContext } from "node:vm";

const read = (relative) => fs.readFileSync(relative, "utf8");

function loadCommonJs(relative) {
  const { outputText } = ts.transpileModule(read(relative), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const module = { exports: {} };
  runInNewContext(outputText, { module, exports: module.exports });
  return module.exports;
}

const layout = loadCommonJs("src/features/home/homeLayout.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));
const defaults = ["jumpBack", "listenNow", "mostListened", "newReleases"];

test("Home shows every section in the default order until customized", () => {
  assert.deepEqual(plain(layout.visibleHomeSections(undefined, undefined)), defaults);
  assert.deepEqual(plain(layout.visibleHomeSections([], [])), defaults);
  assert.equal(layout.isHomeLayoutCustomized([], []), false);
  assert.equal(layout.isHomeLayoutCustomized(defaults, []), false);
});

test("saved order wins, unknown ids are dropped and new sections are appended", () => {
  assert.deepEqual(plain(layout.resolveHomeSectionOrder(["newReleases", "bogus", "listenNow", "newReleases"])), ["newReleases", "listenNow", "jumpBack", "mostListened"]);
  assert.deepEqual(plain(layout.normalizeHomeHidden("listenNow")), []);
  assert.deepEqual(plain(layout.normalizeHomeHidden(["listenNow", "bogus", "listenNow"])), ["listenNow"]);
});

test("sections move one step and stop at the ends", () => {
  assert.deepEqual(plain(layout.moveHomeSection([], "listenNow", -1)), ["listenNow", "jumpBack", "mostListened", "newReleases"]);
  assert.deepEqual(plain(layout.moveHomeSection([], "jumpBack", -1)), defaults);
  assert.equal(layout.canMoveHomeSection([], "jumpBack", -1), false);
  assert.equal(layout.canMoveHomeSection([], "newReleases", 1), false);
  assert.equal(layout.canMoveHomeSection([], "listenNow", 1), true);
  assert.equal(layout.isHomeLayoutCustomized(layout.moveHomeSection([], "listenNow", -1), []), true);
});

test("hiding a section removes it from Home and keeps its place for later", () => {
  const hidden = layout.toggleHomeSectionHidden([], "mostListened");
  assert.deepEqual(plain(hidden), ["mostListened"]);
  assert.deepEqual(plain(layout.visibleHomeSections([], hidden)), ["jumpBack", "listenNow", "newReleases"]);
  assert.equal(layout.isHomeLayoutCustomized([], hidden), true);
  assert.deepEqual(plain(layout.toggleHomeSectionHidden(hidden, "mostListened")), []);
});

test("Customize Home edits the layout instead of opening Covers", () => {
  const home = read("src/features/home/HomeView.tsx");
  assert.match(home, /<HomeCustomizePanel/);
  assert.doesNotMatch(home, /className="homeCustomizeButton" type="button" onClick=\{openCoversViewWithCurrentSong\}/);
  assert.match(read("src/App.tsx"), /updateHomeLayout: \(patch\) => void updateSettingsPatch\(patch\)/);
  assert.match(read("src/features/settings/settings.constants.ts"), /homeSectionOrder:\[\],homeHiddenSections:\[\]/);
});
