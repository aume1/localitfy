import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const view = fs.readFileSync("src/features/downloads/DownloadsView.tsx", "utf8");
const css = fs.readFileSync("src/features/downloads/downloads.css", "utf8");

test("Spotify selection and retry remain separate native controls without nested buttons", () => {
  const parsed = ts.createSourceFile("DownloadsView.tsx", view, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const nestedButtons = [];
  function visit(node, inButton = false) {
    if (ts.isJsxElement(node)) {
      const isButton = node.openingElement.tagName.getText(parsed) === "button";
      if (isButton && inButton) nestedButtons.push(parsed.getLineAndCharacterOfPosition(node.pos).line + 1);
      for (const child of node.children) visit(child, inButton || isButton);
    } else if (ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(parsed) === "button" && inButton)
        nestedButtons.push(parsed.getLineAndCharacterOfPosition(node.pos).line + 1);
    } else ts.forEachChild(node, (child) => visit(child, inButton));
  }
  visit(parsed);
  assert.deepEqual(nestedButtons, [], "Nested buttons invalidate the DOM and interfere with keyboard focus");

  const start = view.indexOf('className="downloadsPreviewItems"');
  const end = view.indexOf("</TabsContent>", start);
  assert.ok(start > 0 && end > start, "Spotify track list must remain present");
  const rows = view.slice(start, end);
  assert.match(rows, /className="downloadsPreviewSelect"/);
  assert.match(rows, /aria-pressed=\{selected\}/);
  assert.match(rows, /disabled=\{spotifyDownloadBusy\}/);
  assert.match(rows, /retrySpotifyTrack\(track\)/);
  assert.doesNotMatch(rows, /role="button"/);
});

test("Spotify selection and retry preserve focus, narrow layout and disabled actions", () => {
  assert.match(css, /\.downloadsPreviewSelect\s*\{/);
  assert.match(css, /\.downloadsRowAction\s*\{/);
  assert.match(css, /:is\(button,input,textarea\):focus-visible/);
  assert.match(css, /\.downloadsPreviewCopy\s*\{[^}]*min-width: 0/);
  assert.match(css, /@media \(max-width: 460px\)/);
  assert.match(view, /disabled=\{spotifyDownloadBusy\}/);
});

test("MusicBrainz album previews keep Spotify authentication and link inputs out of the active panel", () => {
  assert.match(view, /catalogSelection\s*\?\s*<button[^>]*onClick=\{clearSpotify\}>Back to Spotify import<\/button>/);
  assert.match(view, /\{!catalogSelection \? <>\s*<label className="downloadsInputLabel" htmlFor="downloads-spotify-link">Spotify link<\/label>/);
  assert.match(view, /\{catalogSelection \? <p className="downloadsCatalogHint"/);
  assert.match(view, /disabled=\{working \|\| spotifyFetchBusy\} onClick=\{clearSpotify\}/);
  assert.match(view, /\.\.\.\(!catalogSelection \? \[\{ label: "Fetch Spotify link"/);
  assert.match(view, /\.\.\.\(!catalogSelection \? \[\{ label: spotifyLoggedIn \? "Disconnect Spotify"/);
});

test("Download activity keeps visible retry/open actions without duplicating them in the menu", () => {
  const start = view.indexOf("const actions = [", view.indexOf("visible.map(item"));
  const end = view.indexOf("];", start);
  assert.ok(start > 0 && end > start);
  const menu = view.slice(start, end);
  assert.doesNotMatch(menu, /label: "Resume download"|label: "Retry download"|label: "Open in library"/);
  assert.match(menu, /label: "Open downloads folder"/);
  assert.match(menu, /attention && item.error/);
  assert.match(view, /className="downloadsRowAction" disabled=\{working\} onClick=\{retry\}/);
});


test("Spotify credentials migrate to encrypted storage and logout removes the file", async () => {
  const {createRequire} = await import("node:module");
  const {default: os} = await import("node:os");
  const {default: path} = await import("node:path");
  const {createSpotifyClient} = createRequire(import.meta.url)("../../electron/runtime/spotify-client.cjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localtify-spotify-"));
  try {
    const file = path.join(dir, "spotify-oauth.json");
    fs.writeFileSync(file, JSON.stringify({accessToken:"old-access",refreshToken:"old-refresh",expiresAt:99999999}));
    const safeStorage = {isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from(value).reverse(),decryptString:value=>Buffer.from(value).reverse().toString()};
    const client = createSpotifyClient({app:{getPath:()=>dir},safeStorage});
    assert.equal(client.getSpotifyStatus().loggedIn,true);
    const stored=fs.readFileSync(file,"utf8");
    assert.ok(!stored.includes("old-refresh"));
    assert.equal(JSON.parse(stored).version,1);
    assert.equal(createSpotifyClient({app:{getPath:()=>dir},safeStorage}).getSpotifyStatus().loggedIn,true);
    assert.equal(client.logoutSpotify().loggedIn,false);
    assert.equal(fs.existsSync(file),false);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
