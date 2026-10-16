import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const app = fs.readFileSync("src/App.tsx", "utf8");
const shell = fs.readFileSync("src/features/shell/AppShell.tsx", "utf8");

test("changing pages resets the shared content scroller before paint", () => {
  assert.match(shell, /<section className="content" ref=\{contentRef\}>/);
  assert.match(
    app,
    /useLayoutEffect\(\(\) => \{\s+contentRef\.current\?\.scrollTo\(\{ top: 0, left: 0, behavior: "instant" \}\);\s+\}, \[view\]\);/
  );
});
