import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import {runInNewContext} from "node:vm";

const app = fs.readFileSync("src/App.tsx", "utf8");

test("missing-file counts come directly from the current library", () => {
  assert.match(app, /const effectiveMissingFileCount = missingSongs\.length;/);
  assert.doesNotMatch(app, /useAnalyticsRuntime/);
});

test("database saves reject failures and optimistic song edits roll back", () => {
  const db = fs.readFileSync("electron/db.cjs", "utf8");
  const main = fs.readFileSync("electron/main.cjs", "utf8");
  const actions = fs.readFileSync("src/features/library/useLibraryActions.ts", "utf8");
  const queue = fs.readFileSync("src/features/library/songMutationQueue.ts", "utf8");
  assert.match(db, /settings save failed:[^\n]*\n\s*throw error;/);
  assert.match(db, /playlist save failed:[^\n]*\n\s*throw error;/);
  assert.match(main, /playlists:save[^\n]*=> savePlaylists\(playlists, expected, finishMigration === true\)/);
  assert.match(queue, /Object\.is\(current\[key\], patch\[key\]\)/, "only still-matching optimistic fields are rolled back");
  assert.match(actions, /Could not save song changes/);
});

test("rapid song edits serialize, and a failed newer edit restores the last committed value", async () => {
  const exports = {};
  runInNewContext(ts.transpileModule(fs.readFileSync("src/features/library/songMutationQueue.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
  let song={id:"a",title:"original",liked:false};
  let resolveFirst;
  let requests=0;
  const queue=exports.createSongMutationQueue({get:()=>song,apply:(_id,patch)=>{song={...song,...patch};},write:async(_id,patch)=>{
    if (++requests === 1) return new Promise(resolve=>{resolveFirst=()=>resolve({id:"a",title:"original",liked:patch.liked});});
    throw Error("disk failure");
  },failed:()=>{}});
  const first=queue.patchSong("a",{liked:true});
  const second=queue.patchSong("a",{liked:false});
  await Promise.resolve();
  assert.equal(requests,1);
  assert.equal(song.liked,false);
  resolveFirst();
  assert.equal(await first,true);
  assert.equal(await second,false);
  assert.equal(song.liked,true);
  assert.equal(await queue.flush(),true);
});
