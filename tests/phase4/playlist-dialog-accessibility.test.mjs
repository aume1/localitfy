import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(file, "utf8");

test("playlist picker preserves keyboard focus and Escape semantics", () => {
  const picker = read("src/features/playlists/components/PlaylistPickerModal.tsx");
  assert.match(picker, /<Dialog open/);
  assert.match(picker, /aria-label="New playlist name"/);
  const dialog = read("src/shared/ui/Dialog.tsx");
  assert.match(dialog, /useModalFocus<HTMLDivElement>\(open\)/);
  assert.match(dialog, /ref=\{dialogRef\} tabIndex=\{-1\}/);
  assert.match(dialog, /event\.key === "Escape" && !event\.defaultPrevented/);
});

test("song editor and delete dialog use clean, readable copy", () => {
  const editor = read("src/features/library/components/SongEditorModal.tsx");
  const confirm = read("src/features/library/components/DeleteSongModal.tsx");
  assert.match(editor, /placeholder="artist name"/);
  assert.doesNotMatch(editor, /coderpixel \//);
  assert.match(confirm, /remove <span/);
  assert.match(confirm, /<\/span> from localtify/);
});
