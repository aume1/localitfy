"use strict";
const path = require("node:path");
function registerCoverIpc(ipcRouter, { getPixelArtFiles, safeMediaUrl, thumbnailRuntime, patchSong, shapeSong, getSong, fileExists, isImageFile }) {
  const pixelListHandler = async () => getPixelArtFiles().map(filePath => ({ name: path.parse(filePath).name, key: path.parse(filePath).name, path: filePath, url: safeMediaUrl(filePath) }));
  ipcRouter.handle("pixel:list", pixelListHandler);
  ipcRouter.handle("art:list-pixel", pixelListHandler);
  ipcRouter.handle("covers:request-thumbnail", async (_event, payload) => thumbnailRuntime.requestThumbnail(payload));
  ipcRouter.handle("covers:cancel-thumbnail", async (_event, payload) => thumbnailRuntime.cancelThumbnail(payload));
  ipcRouter.handle("song:set-cover", async (_event, id, coverPath) => {
    const song = typeof id === "string" ? getSong(id) : null;
    if (!song) return null;
    if (typeof coverPath !== "string" || !path.isAbsolute(coverPath) || !isImageFile(coverPath) || !fileExists(coverPath)) return shapeSong(song);
    const updated = patchSong(id, { coverPath, coverSource: "custom", coverUpdatedAt: new Date().toISOString() });
    return updated ? shapeSong(updated) : null;
  });
}
module.exports = { registerCoverIpc };
