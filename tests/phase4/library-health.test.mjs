import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const app = fs.readFileSync("src/App.tsx", "utf8");

test("library health is derived from live songs, not the lagging worker snapshot", () => {
  assert.doesNotMatch(app, /libraryHealthPercent = localtifyAnalyticsNumber\(analyticsAudienceSnapshot, "library_health_percent"\)/);
  assert.match(app, /const effectiveMissingFileCount = Math\.max\(missingFileCount, missingSongs\.length\);/);
});

// Run the real expression from App.tsx so rounding regressions are caught.
test("library health stays below 100% while any file is missing", () => {
  const expression = app.match(/const libraryHealthPercent = ([\s\S]*?);\r?\n/)?.[1];
  assert.ok(expression, "libraryHealthPercent expression not found");
  const health = (songCount, effectiveMissingFileCount) =>
    runInNewContext(expression, { songs: { length: songCount }, effectiveMissingFileCount, Math });

  assert.equal(health(0, 0), 0);
  assert.equal(health(1000, 0), 100);
  assert.equal(health(1000, 1), 99);
  assert.equal(health(1000, 10), 99);
  assert.equal(health(1000, 1000), 0);
  assert.equal(health(4, 1), 75);
});
