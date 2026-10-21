const path = require("node:path");
const { createLyricsService } = require("../lyrics/service.cjs");

function registerLyricsIpc(router, app, repositories) {
  const service = createLyricsService({
    cacheDir: path.join(app.getPath("userData"), "lyrics-cache"),
    userAgent: `localtify/${app.getVersion()} (https://github.com/meshahid973/localitfy)`
  });
  router.handle("lyrics:get", async (_event, payload) => {
    const settings = repositories.settings.get() || {};
    if (settings.lyricsEnabled !== true) return { status: "disabled", source: "none", lines: [] };
    // Look the song up natively so the renderer cannot point us at arbitrary files.
    const song = repositories.songs.get(String(payload?.id || ""));
    return service.get(song, { online: settings.lyricsOnlineLookup !== false, refresh: payload?.refresh === true });
  });
  router.handle("lyrics:clear-cache", () => service.clearCache());
}

module.exports = { registerLyricsIpc };
