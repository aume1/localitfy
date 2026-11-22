import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(file, "utf8");

test("track editing and removal overlays expose labeled, modal dialog roles", () => {
  const editor = read("src/features/library/components/SongEditorModal.tsx");
  const remove = read("src/features/library/components/DeleteSongModal.tsx");
  assert.match(editor, /className="editorModal editorModalMotion" role="dialog" aria-modal="true" aria-labelledby="song-editor-dialog-title"/);
  assert.match(editor, /<h3 id="song-editor-dialog-title">edit track<\/h3>/);
  assert.match(remove, /<Dialog\b[\s\S]*?className="deleteModal cartoonPop"\s+role="alertdialog" labelledBy="delete-song-dialog-title" describedBy="delete-song-dialog-description"/);
  const dialog = read("src/shared/ui/Dialog.tsx");
  assert.match(dialog, /role=\{role\} aria-modal="true" aria-label=\{label\}/);
  assert.match(dialog, /aria-labelledby=\{labelledBy\} aria-describedby=\{describedBy\}/);
  assert.match(remove, /<h3 id="delete-song-dialog-title">/);
  assert.match(remove, /<p className="deleteSub" id="delete-song-dialog-description">/);
  assert.match(remove, /disabled=\{busy\}/);
});

test("existing playlist picker dialog keeps the same accessible modal convention", () => {
  const picker = read("src/features/playlists/components/PlaylistPickerModal.tsx");
  assert.match(picker, /<Dialog\b[\s\S]*?label="Add song to playlist"/);
  const dialog = read("src/shared/ui/Dialog.tsx");
  assert.match(dialog, /role = "dialog"/);
  assert.match(dialog, /role=\{role\} aria-modal="true" aria-label=\{label\}/);
});
