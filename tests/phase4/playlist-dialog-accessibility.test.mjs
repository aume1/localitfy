import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(file, "utf8");

test("playlist picker and prompt builder share keyboard focus and Escape semantics", () => {
  const picker = read("src/features/playlists/components/PlaylistPickerModal.tsx");
  const prompt = read("src/features/playlists/components/PromptPlaylistDialog.tsx");
  assert.match(picker, /useModalFocus\(Boolean\(song\)\)/);
  assert.match(picker, /ref=\{dialogRef\} tabIndex=\{-1\}/);
  assert.match(picker, /event\.key === "Escape" && !event\.defaultPrevented/);
  assert.match(picker, /aria-label="New playlist name"/);
  assert.match(prompt, /useModalFocus\(true\)/);
  assert.match(prompt, /ref=\{dialogRef\} tabIndex=\{-1\}/);
  assert.match(prompt, /event\.key === "Escape" && !event\.defaultPrevented/);
});

test("song editor and delete dialog use clean, readable copy", () => {
  const editor = read("src/features/library/components/SongEditorModal.tsx");
  const confirm = read("src/features/library/components/DeleteSongModal.tsx");
  assert.match(editor, /placeholder="artist name"/);
  assert.doesNotMatch(editor, /coderpixel \//);
  assert.match(confirm, /remove <span/);
  assert.match(confirm, /<\/span> from localtify/);
});
test("both playlist composers use the same OLED surface and focus trap", () => {
  const prompt = read("src/features/playlists/components/PromptPlaylistDialog.tsx");
  const smart = read("src/features/playlists/components/SmartPlaylistDialog.tsx");
  const palette = read("src/features/playlists/playlist-oled.css");
  assert.match(prompt, /localtifyPlaylistDialog/);
  assert.match(smart, /useModalFocus<HTMLFormElement>\(true\)/);
  assert.match(smart, /localtifyPlaylistDialog/);
  assert.match(palette, /--lt-surface: #0d0e11/);
  assert.match(palette, /background: var\(--lt-surface\)/);
  assert.match(palette, /:focus-visible/);
});
