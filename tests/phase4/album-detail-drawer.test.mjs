import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/features/albums/AlbumsView.tsx", "utf8");
const styles = fs.readFileSync("src/features/albums/albums.css", "utf8");

test("album cards open their details in an owned modal drawer", () => {
  assert.match(source, /import \{ createPortal \} from "react-dom"/);
  assert.match(source, /openAlbumDetail\(album\.id, event\.currentTarget\)/);
  assert.match(source, /className="albumDetailPanelV318 albumDetailDrawerV318"/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-labelledby="album-detail-title"/);
});

test("album detail drawer traps focus, locks scrolling, and restores its trigger", () => {
  assert.match(source, /handleDialogKeys/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /event\.key !== "Tab"/);
  assert.match(source, /document\.documentElement\.style\.overflow = "hidden"/);
  assert.match(source, /albumTriggerRef/);
  assert.match(source, /if \(trigger\?\.isConnected\) trigger\.focus\(\)/);
});

test("album drawer closes before opening another modal flow", () => {
  assert.match(source, /closeAlbumDetail\(false\);\s+openPlaylistPicker\(song\)/);
  assert.match(source, /closeAlbumDetail\(false\);\s+openEditAlbumBuilder\(selectedAlbum\)/);
});

test("album detail drawer is fixed, responsive, and independently scrollable", () => {
  assert.match(styles, /\.albumDetailBackdropV318\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*z-index:\s*1600;/s);
  assert.match(styles, /\.albumDetailDrawerV318\s*\{[^}]*height:\s*100%;[^}]*overflow-y:\s*auto;/s);
  assert.match(styles, /@media \(max-width:\s*740px\)[\s\S]*\.albumDetailDrawerV318\s*\{\s*width:\s*100%;/);
});
