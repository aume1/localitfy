import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { runInNewContext } from "node:vm";

const read = (relative) => fs.readFileSync(relative, "utf8");

function loadCommonJs(relative, requireShim) {
  const { outputText } = ts.transpileModule(read(relative), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const module = { exports: {} };
  runInNewContext(outputText, { module, exports: module.exports, require: requireShim });
  return module.exports;
}

const navigation = loadCommonJs("src/features/shell/navigation.constants.ts", (specifier) => {
  if (specifier === "lucide-react") return new Proxy({}, { get: (_, name) => String(name) });
  throw new Error(`unexpected import ${specifier}`);
});
const layout = loadCommonJs("src/features/shell/sidebarLayout.ts", (specifier) => {
  if (specifier === "./navigation.constants") return navigation;
  throw new Error(`unexpected import ${specifier}`);
});
const plain = (value) => JSON.parse(JSON.stringify(value));
const group = (groups, id) => plain(groups.find((item) => item.id === id));

test("sidebar defaults match the navigation constants", () => {
  const groups = layout.resolveSidebarGroups(undefined, undefined);
  for (const defaults of navigation.sidebarNavGroups) {
    assert.deepEqual(group(groups, defaults.id).visibleItems, plain(defaults.itemIds));
  }
});

test("saved order wins, unknown ids are dropped and new tabs are appended", () => {
  const groups = layout.resolveSidebarGroups({ tools: ["analytics", "bogus", "downloads", "analytics"] }, []);
  assert.deepEqual(group(groups, "tools").orderedItems, ["analytics", "downloads"]);
});

test("hidden tabs leave the visible list but keep their slot; settings cannot be hidden", () => {
  const hidden = layout.normalizeSidebarHidden(["discover", "settings", "library", "genres", "nope", "discover"]);
  assert.deepEqual(plain(hidden), ["discover"]);
  const library = group(layout.resolveSidebarGroups(undefined, hidden), "library");
  assert.ok(library.orderedItems.includes("discover"));
  assert.ok(!library.visibleItems.includes("discover"));
  assert.deepEqual(group(layout.resolveSidebarGroups(undefined, ["settings"]), "app").visibleItems, ["settings"]);
});

test("moving swaps with the next visible neighbour and stops at the edges", () => {
  const order = layout.moveSidebarItem(undefined, [], "home", 1);
  assert.deepEqual(plain(order.library), ["library", "home", "albums", "discover"]);
  assert.equal(layout.canMoveSidebarItem(undefined, [], "home", -1), false);
  assert.equal(layout.canMoveSidebarItem(undefined, [], "analytics", 1), false);
  assert.equal(layout.canMoveSidebarItem(undefined, [], "settings", 1), false);
  assert.deepEqual(plain(layout.moveSidebarItem(undefined, [], "home", -1)), {});
});

test("toggling visibility adds and removes the tab", () => {
  const hidden = layout.toggleSidebarItemHidden([], "downloads");
  assert.deepEqual(plain(hidden), ["downloads"]);
  assert.deepEqual(plain(layout.toggleSidebarItemHidden(hidden, "downloads")), []);
});

test("sidebar renders resolved groups and exposes a customization menu", () => {
  const shell = read("src/features/shell/AppShell.tsx");
  const nav = read("src/features/shell/SidebarNav.tsx");
  assert.match(shell, /<SidebarNav/);
  assert.match(nav, /resolveSidebarGroups\(sidebarNavOrder, sidebarHiddenNav\)/);
  assert.match(nav, /onContextMenu=\{\(event\) => openMenu\(event, item\.id\)\}/);
  assert.match(read("src/features/settings/categories/AppearanceSettings.tsx"), /<SidebarTabsSettings/);
});

test("player bar links the song, artist, like state, context menu and queue", () => {
  const bar = read("src/features/player/components/PlayerBar.tsx");
  assert.match(bar, /onClick=\{revealNowPlaying\}/);
  assert.match(bar, /splitArtistCredits\(currentSong\.artist\)\.map/);
  assert.match(bar, /onClick=\{\(\) => openArtistPage\(artistName\)\}/);
  assert.match(bar, /onClick=\{\(\) => toggleLike\(currentSong\.id\)\}/);
  assert.match(bar, /openSongContextMenu\(event, currentSong\)/);
  assert.match(bar, /className=\{`playerQueueButton/);
  assert.match(read("src/features/shell/AppShell.tsx"), /<PlayerSurfaces player=\{playerBar\} queue=\{modals\.queuePanel\}/);
  assert.match(read("src/features/player/components/PlayerSurfaces.tsx"), /<QueuePanel \{\.\.\.queue\} \/>/);
});

test("now-playing context prefers the playlist, then the started source, then the library", () => {
  const { resolveNowPlayingContext } = loadCommonJs("src/features/player/playbackSource.ts", (specifier) => {
    if (specifier === "../library/library.utils") return { isPlayableSong: () => true };
    throw new Error(`unexpected import ${specifier}`);
  });
  const song = { id: "song-1" };
  const playlist = { id: "playlist-1", name: "Favorites", songIds: [song.id] };
  const source = { kind: "artist", id: "artist-1", label: "artist: Example", songIds: [song.id] };
  assert.deepEqual(plain(resolveNowPlayingContext(song, playlist, source)), { kind: "playlist", id: playlist.id, label: "playlist: Favorites" });
  assert.deepEqual(plain(resolveNowPlayingContext(song, { ...playlist, songIds: [] }, source)), { kind: source.kind, id: source.id, label: source.label });
  assert.deepEqual(plain(resolveNowPlayingContext(song, null, { ...source, songIds: [] })), { kind: "library", id: "", label: "library" });
  assert.deepEqual(plain(resolveNowPlayingContext(null, playlist, source)), { kind: "library", id: "", label: "" });
});

test("repeat-all loops the artist/genre a queue was started from", () => {
  const helpers = read("src/features/player/playbackSource.ts");
  const loop = helpers.slice(helpers.indexOf("export function getSourceLoopRestart"), helpers.indexOf("export function getSourcePreviousStep"));
  assert.match(loop, /repeatMode !== "all" \|\| !source \|\| inPlaylist/);
  assert.match(loop, /rest: ids\.slice\(1\)/);
  const app = read("src/App.tsx");
  const playNext = app.slice(app.indexOf("function playNext("), app.indexOf("function playPrevious("));
  // Queued songs play first; the loop only restarts once the queue is empty.
  assert.ok(playNext.indexOf("playQueue.findIndex") < playNext.indexOf("sourceLoopRestart()"));
  assert.match(read("src/features/player/resolveAutoTransitionTarget.ts"), /kind: "source-loop" as const, rest: sourceLoop\.rest/);
  assert.match(app, /target\.kind === "source-loop"\) \{\s*setPlayQueue\(target\.rest\);/);
  const shell = read("src/features/shell/useCollectionActions.ts");
  assert.match(shell, /target\.kind === "artist" \|\| target\.kind === "genre" \? playbackSourceRef\(target\.kind, target\.title\)/);
  assert.match(app, /collections:\s*\{\s*playSongs:\s*playCollectionSongs,/);
  assert.match(shell, /target\.kind === "album" \? playbackSourceRef\("album", target\.title, target\.id\)/);
  // Leaving the context through a normal song pick stops the loop.
  assert.match(app, /else if \(!playbackContext\?\.keepSource && !playbackContext\?\.keepPlaylistContext\) \{\s*setPlaybackSource\(null\);/);
});

test("queue panel shows repeat state", () => {
  const panel = read("src/features/player/components/QueuePanel.tsx");
  assert.match(panel, /repeatMode === "one"/);
  assert.match(panel, /repeatMode === "all" && repeatPreview/);
  assert.match(read("src/App.tsx"), /repeatPreview: queuePanelOpen\s*\? getRepeatPreview\(/);
});

test("the player bar and song menus open artist and genre pages", () => {
  const nav = read("src/features/shell/useNavigationHistory.ts");
  assert.match(nav, /openArtistPage: \(artistName: string\) => open\(\{ kind: "artist", id: artistDetailId\(artistName\) \}\)/);
  assert.match(nav, /else open\(\{ kind: context\.kind, id:/);
  const app = read("src/App.tsx");
  assert.match(app, /goToArtist: nav\.openArtistPage/);
  assert.match(app, /openArtistPage: nav\.openArtistPage/);
});

test("song context menu is styled and offers queue and navigation actions", () => {
  const menu = read("src/features/library/components/SongContextMenu.tsx");
  assert.match(menu, /import "\.\/song-context-menu\.css";/);
  assert.match(menu, /queueSong\(song\.id, false\)/);
  assert.match(menu, /goToArtist\(artistName\)/);
  assert.match(read("src/features/library/components/song-context-menu.css"), /\.songContextMenuLayer\{\s*position: fixed;/);
});

test("view action buttons pair an icon with their text", () => {
  for (const file of [
    "src/features/library/LibraryView.tsx"
  ]) {
    const source = read(file);
    assert.match(source, /<ActionLabel icon=\{Shuffle\}>shuffle<\/ActionLabel>/, file);
    assert.doesNotMatch(source, />\s*(?:play|shuffle|queue)\s*<\/button>/, file);
  }
});

test("queue avoids a misleading next-up track during repeat-one and keeps copy concise", () => {
  const app = read("src/App.tsx");
  const queue = read("src/features/player/components/QueuePanel.tsx");
  const mixes = read("src/features/analysis/DailyMixesShelf.tsx");
  assert.match(app, /repeatMode === "one"\) return null;/);
  assert.doesNotMatch(queue, /nothing queued, so this plays next/);
  assert.doesNotMatch(queue, /repeat one is on, so the current song keeps playing/);
  assert.doesNotMatch(mixes, /Familiar sounds, a fresh selection each day/);
  assert.match(queue, /aria-label="now playing"/);
  assert.match(queue, /aria-label="next in queue"/);
});

test("sleep deadline expires once after suspension, reschedules early callbacks, and cancels cleanly", () => {
  const { createSleepTimer } = loadCommonJs("src/features/player/sleepTimer.ts");
  let now = 0, nextId = 0, expired = 0;
  const pending = new Map();
  const clock = { now: () => now, schedule: (fn, delay) => { pending.set(++nextId, { fn, delay }); return nextId; }, clear: id => pending.delete(id) };
  const timer = createSleepTimer(1000, () => expired++, clock);
  assert.equal([...pending.values()][0].delay, 1000);
  now = 250;
  [...pending.values()][0].fn();
  assert.equal([...pending.values()][0].delay, 750);
  now = 1400;
  timer.check();
  timer.check();
  assert.equal(expired, 1);
  assert.equal(pending.size, 0);
  const cancelled = createSleepTimer(2000, () => expired++, clock);
  cancelled.cancel();
  now = 3000;
  cancelled.check();
  assert.equal(expired, 1);
  assert.equal(pending.size, 0);
});
