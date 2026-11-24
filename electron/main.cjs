const { registerMediaConversionIpc } = require("./ipc/media-conversion.cjs");
const { registerDownloadsIpc } = require("./ipc/downloads.cjs");
const { registerCoverIpc } = require("./ipc/covers.cjs");
const { filePathKey } = require("./runtime/path-identity.cjs");
const { app, powerMonitor, BrowserWindow, dialog, ipcMain, shell, session, Menu, Tray, nativeImage, globalShortcut, screen, protocol, net, safeStorage } = require("electron");
const { createIpcRouter } = require("./ipc/router.cjs");
const { registerAnalysisIpc, preserveExperimentalSettings } = require("./ipc/analysis.cjs");
const { registerDiscordIpc } = require("./ipc/discord.cjs");
const { registerMovedSongRepairIpc } = require("./ipc/library-relink.cjs");
const { startLibraryWatch } = require("./library-watch.cjs");
let libraryWatcher = null;
const { registerDuplicateIpc } = require("./ipc/library-duplicates.cjs");
const { registerDiscoverIpc } = require("./ipc/discover.cjs");
const { createRemoteArtworkCache } = require("./runtime/remote-artwork-cache.cjs");
let remoteArtworkCache = null;
const { startScrobbling } = require("./ipc/scrobble.cjs");
let scrobbler = null;
const { LOCALTIFY_RENDERER_PROTOCOL, MEDIA_PROTOCOL, registerPrivilegedSchemes, getLocaltifyRendererMimeType } = require("./runtime/protocols.cjs");
const { DEFAULT_WINDOW_TRANSLUCENCY, normalizeWindowTranslucencySettings, createWindowsStartupRuntime } = require("./runtime/windows.cjs");
const { createElectronServiceRuntime } = require("./runtime/services.cjs");
const { createBootstrapHandler } = require("./runtime/bootstrap.cjs");
const { loadLocaltifyEnv } = require("./runtime/environment.cjs");
const { uniquePaths, createUserDataRuntime } = require("./runtime/user-data.cjs");
const { createWindowTranslucencyRuntime } = require("./runtime/translucency.cjs");
const { createIconRuntime } = require("./runtime/icons.cjs");
const { createUpdaterRuntime } = require("./runtime/updater.cjs");
const { createSettingsFlushRuntime, createWindowCloseRuntime, createAppShutdownRuntime } = require("./runtime/settings-flush.cjs");
const settingsFlush = createSettingsFlushRuntime();
const shutdown = createAppShutdownRuntime({
  app,
  getWindow: () => mainWindow,
  settingsFlush,
  confirm: win => confirmSettingsFlush(win),
  cleanup: async () => {
    discoverCacheLifecycle?.flush();
    remoteArtworkCache?.close();
    thumbnailRuntime.stop();
    libraryWatcher?.dispose();
    scrobbler?.dispose();
    if (serviceRuntime) await serviceRuntime.stop("app-before-quit");
    else {
      try { cleanupNativeWindowsMedia(); } catch {}
      try { stopLocaltifyMediaServer(); } catch {}
    }
  }
});
const { createMediaServerRuntime } = require("./runtime/media-server.cjs");
const { createThumbnailRuntime } = require("./runtime/thumbnail-runtime.cjs");
const { createGenreMetadataBackfill } = require("./runtime/genre-backfill.cjs");
const { createSpotifyClient, SPOTIFY_BROWSER_UA } = require("./runtime/spotify-client.cjs");
const { createLibraryImportRuntime } = require("./runtime/library-import.cjs");
const { cleanAlbumFolderText, parseAlbumTrackFileName, albumTrackNumberFromFileName } = require("./runtime/album-import-utils.cjs");
const { safeProviderCover, imageExtension } = require("./runtime/remote-cover.cjs");
const { createAppMenuRuntime, createAppCommandSender } = require("./runtime/app-menu.cjs");
const { installRendererSecurityGuards, installSessionPermissionGuards, isTrustedMainFrameIpcEvent } = require("./runtime/security.cjs");
const { createDatabaseRepositories } = require("./db/repositories.cjs");
const https = require("node:https");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");

process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET || "true";
process.env.DOTENVX_QUIET = process.env.DOTENVX_QUIET || "true";

loadLocaltifyEnv(app);
registerPrivilegedSchemes(protocol);

const ffmpegStatic = require("ffmpeg-static");
const { autoUpdater } = require("electron-updater");

const databaseRepositories = createDatabaseRepositories(require("./db.cjs"));
const initDatabase = databaseRepositories.database.init;
const backupDatabase = databaseRepositories.database.backup;
const repairDatabaseNow = databaseRepositories.database.repair;
const getDatabaseStatus = databaseRepositories.database.status;
const getSongs = databaseRepositories.songs.list;
const getSong = databaseRepositories.songs.get;
const insertSongs = databaseRepositories.songs.insertMany;
const patchSong = databaseRepositories.songs.patch;
const deleteSong = databaseRepositories.songs.remove;
const clearLibrary = databaseRepositories.songs.clear;
const getSettings = databaseRepositories.settings.get;
const saveSettings = databaseRepositories.settings.save;
const getPlaylists = databaseRepositories.playlists.get;
const savePlaylists = databaseRepositories.playlists.save;

const { setDiscordActivity, clearDiscordActivity, getDiscordStatus, resetDiscordActivityCache } = require("./rpc.cjs");
const { isDownloadFileInProgress } = require("./downloader.cjs");

const { readLocalAudioMetadata } = require("./metadata-service.cjs");
const { findFolderCover, resolveSongCover } = require("./cover-service.cjs");

const ipcRouter = createIpcRouter(ipcMain, {
  isTrustedEvent: (event) => isTrustedMainFrameIpcEvent(event, mainWindow)
});

const isDev = !app.isPackaged;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

app.on("second-instance", () => {
  showMainWindow();
});

let discoverCacheLifecycle = null;

const APP_NAME = "localtify";
const APP_USER_MODEL_ID = "com.meshahid973.localitfy";

const userDataRuntime = createUserDataRuntime({
  app,
  legacyAppDataName: "localitfy",
  sqliteFileName: "localitfy.sqlite"
});
userDataRuntime.configureStableUserDataPath();
const restoreDatabaseFromOldUserDataIfNeeded = userDataRuntime.restoreDatabaseFromOldUserDataIfNeeded;

try { app.setName(APP_NAME); } catch {}
if (process.platform === "win32") {
  try { app.setAppUserModelId(APP_USER_MODEL_ID); } catch {}
}

let mainWindow = null;
let mainWindowRendererWatchdog = null;
let mainWindowRendererRecoveredOnce = false;
let startupLaunchStatus = { wasOpenedAtLogin: false, wasOpenedAsHidden: false };

const {
  getSavedWindowTranslucencySettings,
  applyWindowTranslucencyToWindow,
  restartForWindowTranslucency,
  reloadMainWindowForTranslucency
} = createWindowTranslucencyRuntime({
  app,
  getSettings,
  getMainWindow: () => mainWindow,
  setMainWindow: (win) => { mainWindow = win; },
  createWindow,
  setAllowQuit: shutdown.setAllowQuit
});

const PIXEL_ART_CACHE_TTL_MS = 30_000;
const FILE_INFO_CACHE_TTL_MS = 4_000;
const MAIN_TASK_YIELD_MS = 0;

let pixelArtDirectoryCache = { value: "", expiresAt: 0 };
let pixelArtFilesCache = { value: [], root: "", expiresAt: 0 };
const fileInfoCache = new Map();

function yieldToMainLoop() {
  return new Promise((resolve) => {
    if (typeof setImmediate === "function") setImmediate(resolve);
    else setTimeout(resolve, MAIN_TASK_YIELD_MS);
  });
}

const genreMetadataBackfill = createGenreMetadataBackfill({
  getSettings, saveSettings, getSongs, getSong, patchSong, fileExists, isAudioFile,
  readLocalAudioMetadata, yieldToMainLoop
});

function clearFileInfoCache() {
  fileInfoCache.clear();
}

function getFileInfoCached(filePath) {
  const cleanPath = String(filePath || "");
  if (!cleanPath) return { exists: false, isFile: false, size: 0, mtimeMs: 0 };

  const now = Date.now();
  const cached = fileInfoCache.get(cleanPath);
  if (cached && cached.expiresAt > now) return cached.info;

  let info = { exists: false, isFile: false, size: 0, mtimeMs: 0 };
  try {
    const stat = fs.statSync(cleanPath);
    info = { exists: true, isFile: stat.isFile(), size: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    info = { exists: false, isFile: false, size: 0, mtimeMs: 0 };
  }

  fileInfoCache.set(cleanPath, { info, expiresAt: now + FILE_INFO_CACHE_TTL_MS });
  if (fileInfoCache.size > 4500) {
    let removed = 0;
    for (const [key, entry] of fileInfoCache) {
      if (entry.expiresAt <= now || removed < 500) {
        fileInfoCache.delete(key);
        removed += 1;
      }
      if (removed >= 750) break;
    }
  }

  return info;
}

const mediaServerRuntime = createMediaServerRuntime({
  protocol,
  net,
  getFileInfoCached,
  fileExists
});
const startLocaltifyMediaServer = mediaServerRuntime.start;
const stopLocaltifyMediaServer = mediaServerRuntime.stop;
const registerLocaltifyMediaProtocol = mediaServerRuntime.registerProtocol;
const safeMediaUrl = mediaServerRuntime.safeMediaUrl;
const getMediaFileVersion = mediaServerRuntime.getMediaFileVersion;
const MEDIA_TOKEN_TTL_MS = mediaServerRuntime.tokenTtlMs;

const updaterRuntime = createUpdaterRuntime({
  app,
  autoUpdater,
  shell,
  https,
  isDev,
  appName: APP_NAME,
  getMainWindow: () => mainWindow
});
const checkForUpdates = updaterRuntime.checkForUpdates;
const getUpdateState = updaterRuntime.getUpdateState;
const downloadUpdate = updaterRuntime.downloadUpdate;
const installUpdate = updaterRuntime.installUpdate;

let tray = null;
let minimizeToTray = false;
let nativeShortcutsRegistered = false;
let nativeMediaState = {
  isPlaying: false,
  volume: 0.75,
  muted: false,
  title: "",
  artist: "",
  album: "",
  coverUrl: "",
  hasSong: false
};

const windowsStartupRuntime = createWindowsStartupRuntime({
  app,
  isDev,
  appName: APP_NAME,
  saveSettings
});
const getStartWithWindowsStatus = windowsStartupRuntime.getStatus;
const setStartWithWindows = windowsStartupRuntime.setEnabled;
const syncWindowsIntegrationSettings = windowsStartupRuntime.syncSettings;

function sendPlayerCommand(command) {
  if (!command || typeof command !== "object") return false;
  const payload = { ...command, source: command.source || "native" };
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("player:command", payload);
      return true;
    }
  } catch (error) {
    console.log("[localitfy native command error]", error?.message || error);
  }
  return false;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return true;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  return true;
}

const { loadAppIcon, loadTrayIcon, createThumbarIcon } = createIconRuntime({
  app,
  nativeImage,
  getIsPlaying: () => nativeMediaState.isPlaying
});

function getNativeMediaTitle() {
  if (!nativeMediaState.hasSong) return "localtify";
  const title = nativeMediaState.title || "unknown song";
  const artist = nativeMediaState.artist || "";
  return artist ? `${title} — ${artist}` : title;
}

function updateTrayMenu() {
  if (!tray) return;
  try {
    tray.setToolTip(getNativeMediaTitle());
    tray.setImage(loadTrayIcon());
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Open localtify", click: showMainWindow },
      { type: "separator" },
      { label: nativeMediaState.isPlaying ? "Pause" : "Play", enabled: nativeMediaState.hasSong, click: () => sendPlayerCommand({ type: "toggle" }) },
      { label: "Previous", enabled: nativeMediaState.hasSong, click: () => sendPlayerCommand({ type: "prev" }) },
      { label: "Next", enabled: nativeMediaState.hasSong, click: () => sendPlayerCommand({ type: "next" }) },
      { label: nativeMediaState.muted || nativeMediaState.volume <= 0.01 ? "Unmute" : "Mute", enabled: nativeMediaState.hasSong, click: () => sendPlayerCommand({ type: "muteToggle" }) },
      { type: "separator" },
      { label: "Quit", click: () => { shutdown.requestQuit(); } }
    ]));
  } catch (error) {
    console.log("[localitfy tray menu error]", error?.message || error);
  }
}

function ensureTray() {
  if (tray) {
    updateTrayMenu();
    return tray;
  }
  try {
    tray = new Tray(loadTrayIcon());
    tray.on("click", showMainWindow);
    tray.on("double-click", showMainWindow);
    updateTrayMenu();
  } catch (error) {
    console.log("[localitfy tray error]", error?.message || error);
  }
  return tray;
}

function updateTaskbarButtons() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (process.platform !== "win32") return;
  if (typeof mainWindow.setThumbarButtons !== "function") return;
  try {
    mainWindow.setThumbnailToolTip(nativeMediaState.hasSong ? `${getNativeMediaTitle()} - localtify` : "localtify");
    mainWindow.setThumbarButtons([
      { tooltip: "Previous", icon: createThumbarIcon("previous"), flags: ["enabled"], click: () => sendPlayerCommand({ type: "prev" }) },
      { tooltip: nativeMediaState.isPlaying ? "Pause" : "Play", icon: createThumbarIcon(nativeMediaState.isPlaying ? "pause" : "play"), flags: ["enabled"], click: () => sendPlayerCommand({ type: "toggle" }) },
      { tooltip: "Next", icon: createThumbarIcon("next"), flags: ["enabled"], click: () => sendPlayerCommand({ type: "next" }) }
    ]);
  } catch (error) {
    console.log("[localitfy thumbar error]", error?.message || error);
  }
}

function registerNativeMediaKeys() {
  if (nativeShortcutsRegistered) return;
  nativeShortcutsRegistered = true;
  // Chromium's Media Session integration owns macOS media keys. Registering
  // them again as global shortcuts fails because the OS reserves them.
  if (process.platform === "darwin") return;
  const shortcuts = [
    ["MediaPlayPause", { type: "toggle" }],
    ["MediaNextTrack", { type: "next" }],
    ["MediaPreviousTrack", { type: "prev" }],
    ["MediaStop", { type: "stop" }]
  ];
  for (const [accelerator, command] of shortcuts) {
    try {
      const ok = globalShortcut.register(accelerator, () => sendPlayerCommand(command));
      if (!ok) console.log(`[localitfy media key unavailable] ${accelerator}`);
    } catch (error) {
      console.log(`[localitfy media key error] ${accelerator}`, error?.message || error);
    }
  }
}

function cleanupNativeWindowsMedia() {
  try {
    globalShortcut.unregister("MediaPlayPause");
    globalShortcut.unregister("MediaNextTrack");
    globalShortcut.unregister("MediaPreviousTrack");
    globalShortcut.unregister("MediaStop");
  } catch {}
  if (tray) {
    try { tray.destroy(); } catch {}
    tray = null;
  }
}

const {confirmSettingsFlush, attachCloseToTray} = createWindowCloseRuntime({
  settingsFlush, dialog,
  quitApproved: shutdown.isApproved, quitPending: shutdown.isPending,
  shouldHideToTray: () => minimizeToTray && !shutdown.isQuitAllowed(), ensureTray
});

function updateNativeMediaState(payload = {}) {
  const volume = Number(payload.volume);
  nativeMediaState = {
    ...nativeMediaState,
    isPlaying: Boolean(payload.isPlaying),
    volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : nativeMediaState.volume,
    muted: Boolean(payload.muted),
    title: String(payload.title || ""),
    artist: String(payload.artist || ""),
    album: String(payload.album || ""),
    coverUrl: String(payload.coverUrl || ""),
    hasSong: Boolean(payload.hasSong)
  };
  if (Object.prototype.hasOwnProperty.call(payload, "minimizeToTray")) minimizeToTray = Boolean(payload.minimizeToTray);
  updateTrayMenu();
  updateTaskbarButtons();
  appMenu.update(nativeMediaState);
  return { ok: true, state: nativeMediaState, minimizeToTray };
}

function setupNativeWindowsMediaIpc() {
  ipcRouter.handle("localitfy:native-media-state", async (_event, payload = {}) => updateNativeMediaState(payload));
  ipcRouter.handle("localitfy:set-minimize-to-tray", async (_event, payload = {}) => {
    minimizeToTray = typeof payload === "boolean" ? payload : Boolean(payload.enabled);
    if (minimizeToTray) ensureTray();
    updateTrayMenu();
    return { ok: true, minimizeToTray };
  });
  ipcRouter.handle("localitfy:set-start-with-windows", async (_event, payload = {}) => {
    const enabled = typeof payload === "boolean" ? payload : Boolean(payload.enabled);
    const status = setStartWithWindows(enabled);
    try { saveSettings({ startWithWindows: Boolean(enabled) }); } catch (error) { console.log("[localitfy startup setting save error]", error?.message || error); }
    return { ...status, openAtLogin: Boolean(enabled) };
  });
  ipcRouter.handle("localitfy:get-start-with-windows", async () => getStartWithWindowsStatus());
  ipcRouter.handle("localitfy:native-media-status", async () => ({
    ok: true,
    state: nativeMediaState,
    minimizeToTray,
    startWithWindows: getStartWithWindowsStatus(),
    trayReady: Boolean(tray),
    mediaKeysRegistered: nativeShortcutsRegistered
  }));
}

function setupNativeWindowsMedia() {
  ensureTray();
  updateTaskbarButtons();
  registerNativeMediaKeys();
}

function appendChromiumSwitchOnce(name, value) {
  try {
    if (!name) return false;
    if (typeof app.commandLine?.hasSwitch === "function" && app.commandLine.hasSwitch(name)) return false;
    if (typeof value === "undefined" || value === null || value === "") app.commandLine.appendSwitch(name);
    else app.commandLine.appendSwitch(name, String(value));
    return true;
  } catch (error) {
    console.log("[localitfy chromium switch error]", name, error?.message || error);
    return false;
  }
}

function configureLocaltifyChromiumPerformance() {
  const switches = [];
  const add = (name, value) => {
    const applied = appendChromiumSwitchOnce(name, value);
    switches.push({ name, value: typeof value === "undefined" || value === null ? "" : String(value), applied });
    return applied;
  };

  const disableGpuTuning = process.env.LOCALTIFY_DISABLE_GPU_TUNING === "1";
  const forceOpenGl = process.env.LOCALTIFY_FORCE_OPENGL === "1";
  const forceAngleGl = process.env.LOCALTIFY_FORCE_ANGLE_GL === "1";

  add("autoplay-policy", "no-user-gesture-required");

  if (!disableGpuTuning) {
    add("ignore-gpu-blocklist");
    add("enable-gpu-rasterization");
    add("enable-zero-copy");
    add("enable-accelerated-video-decode");
    if (forceOpenGl) add("use-gl", "desktop");
    else if (process.platform === "win32") add("use-angle", forceAngleGl ? "gl" : "d3d11");
  }

  if (process.platform === "linux") {
    const linuxGpuOptIn = process.env.LOCALTIFY_LINUX_GPU === "1";
    const linuxWaylandOptIn = process.env.LOCALTIFY_ENABLE_WAYLAND === "1";
    add("disable-vulkan");
    add("disable-features", "Vulkan,VulkanFromANGLE,DefaultANGLEVulkan,VaapiVideoDecoder,UseChromeOSDirectVideoDecoder");
    add("enable-features", "UseOzonePlatform");
    if (!linuxWaylandOptIn) {
      add("ozone-platform", "x11");
      add("ozone-platform-hint", "x11");
    }
    if (app.isPackaged && !linuxGpuOptIn) add("disable-accelerated-video-decode");
  }

  return { gpuTuningEnabled: !disableGpuTuning, forceOpenGl, forceAngleGl, platform: process.platform, switches };
}

app.setName(APP_NAME);
const LOCALTIFY_CHROMIUM_PERFORMANCE = configureLocaltifyChromiumPerformance();
const appMenu = createAppMenuRuntime({ Menu, shell, appName: APP_NAME, isDev, sendPlayerCommand,
  sendAppCommand: createAppCommandSender({ ipcRouter, showMainWindow, getWindow: () => mainWindow }),
  requestQuit: () => { shutdown.requestQuit(); } });
appMenu.update();

const thumbnailRuntime = createThumbnailRuntime({
  getUserDataPath: () => app.getPath("userData"),
  getFileInfoCached, filePathKey, fileExists, isImageFile, safeMediaUrl,
  invalidateFileInfo: file => fileInfoCache.delete(file), clearFileInfoCache,
  getFfmpegPath, getSongs, getSong, getRuntimeCoverPath,
  getWarmupSongs: databaseRepositories.songs.coverCandidates,
  publish: payload => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("covers:thumbnail-ready", payload);
  }
});
const {
  getCoverThumbnailUrl, scheduleCoverThumbnailWarmup,
  queue: coverThumbnailQueue
} = thumbnailRuntime;

function getSpotifyCoverCacheDirectory() {
  const target = path.join(app.getPath("userData"), "spotify-covers");
  try { fs.mkdirSync(target, { recursive: true }); } catch {}
  return target;
}

function downloadHttpsBuffer(urlString, maxBytes = 8 * 1024 * 1024, redirectLimit = 4) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(safeProviderCover(urlString)); } catch { return reject(new Error("invalid cover url")); }
    const req = https.request({
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: "GET",
      timeout: 15000,
      headers: {
        "User-Agent": SPOTIFY_BROWSER_UA || "Mozilla/5.0",
        "Accept": "image/jpeg,image/png,image/webp,image/gif",
        ...(parsed.hostname === "i.scdn.co" ? { "Referer": "https://open.spotify.com/" } : {})
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectLimit > 0) {
        res.resume();
        let nextUrl;
        try { nextUrl = safeProviderCover(new URL(res.headers.location, parsed.href).href); } catch {}
        if (!nextUrl) { reject(new Error("unapproved cover redirect")); return; }
        downloadHttpsBuffer(nextUrl, maxBytes, redirectLimit - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`cover returned HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      let total = 0;
      res.on("data", (chunk) => {
        total += chunk.length;
        if (total > maxBytes) { req.destroy(new Error("cover image too large")); return; }
        chunks.push(chunk);
      });
      res.on("end", () => resolve({ buffer: Buffer.concat(chunks), contentType: String(res.headers["content-type"] || "") }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("cover download timed out")); });
    req.end();
  });
}

async function cacheSpotifyCoverImage(coverUrl, stableKey = "") {
  const cleanUrl = safeProviderCover(coverUrl);
  if (!cleanUrl) return "";
  try {
    const hash = crypto.createHash("sha1").update(`${stableKey}::${cleanUrl}`).digest("hex").slice(0, 22);
    const cacheDir = getSpotifyCoverCacheDirectory();
    for (const ext of [".jpg", ".png", ".webp", ".gif"]) {
      const existing = path.join(cacheDir, `${hash}${ext}`);
      try { const stat = await fs.promises.stat(existing); if (stat.isFile() && stat.size >= 12) return existing; } catch {}
    }
    const image = await downloadHttpsBuffer(cleanUrl);
    const ext = imageExtension(image.buffer, image.contentType);
    if (!ext) return "";
    const targetPath = path.join(cacheDir, `${hash}${ext}`);
    const temporary = targetPath + "." + crypto.randomUUID() + ".part";
    try { await fs.promises.writeFile(temporary, image.buffer, { flag: "wx" }); await fs.promises.rename(temporary, targetPath); }
    finally { await fs.promises.rm(temporary, { force: true }).catch(() => undefined); }
    return targetPath;
  } catch (error) {
    console.log("[localtify spotify cover cache error]", error?.message || error);
    return "";
  }
}

function isAudioFile(filePath) {
  return /\.(mp3|wav|ogg|flac|m4a|aac|opus|aiff|aif)$/i.test(filePath || "");
}

function isImageFile(filePath) {
  return /\.(png|jpg|jpeg|webp|gif)$/i.test(filePath || "");
}

function fileExists(filePath) {
  const info = getFileInfoCached(filePath);
  return Boolean(info.exists && info.isFile);
}

function getDownloadDirectory(customFolder) {
  const fallback = path.join(app.getPath("downloads"), "localitfy");
  const raw = typeof customFolder === "string" ? customFolder.trim() : "";
  const target = raw && path.isAbsolute(raw) ? raw : fallback;
  try {
    fs.mkdirSync(target, { recursive: true });
    return target;
  } catch {
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

function getFfmpegPath() {
  if (!ffmpegStatic) return null;
  if (app.isPackaged && ffmpegStatic.includes("app.asar")) return ffmpegStatic.replace("app.asar", "app.asar.unpacked");
  return ffmpegStatic;
}

const { getSpotifyStatus, loginSpotifyOAuth, logoutSpotify, fetchSpotifyTracksFromUrl } = createSpotifyClient({app, BrowserWindow, safeStorage, getWindow: () => mainWindow});

function getPixelArtDirectory(options = {}) {
  const force = Boolean(options.force);
  const now = Date.now();
  if (!force && pixelArtDirectoryCache.value && pixelArtDirectoryCache.expiresAt > now) return pixelArtDirectoryCache.value;
  try {
    const appPath = app.getAppPath();
    const resourcesPath = process.resourcesPath || "";
    const executableDir = path.dirname(process.execPath || "");
    const userDataPixelDir = path.join(app.getPath("userData"), "pixelart");
    const candidates = uniquePaths([
      path.join(resourcesPath, "pixelart"),
      path.join(executableDir, "resources", "pixelart"),
      path.join(appPath, "dist", "pixelart"),
      path.join(appPath, "public", "pixelart"),
      path.join(appPath, "pixelart"),
      path.join(resourcesPath, "app.asar", "dist", "pixelart"),
      path.join(resourcesPath, "app.asar", "public", "pixelart"),
      path.join(resourcesPath, "app.asar", "pixelart"),
      path.join(resourcesPath, "app", "dist", "pixelart"),
      path.join(resourcesPath, "app", "public", "pixelart"),
      path.join(resourcesPath, "app", "pixelart"),
      path.join(process.cwd(), "public", "pixelart"),
      path.join(process.cwd(), "pixelart"),
      path.join(process.cwd(), "src", "assets", "pixelart"),
      userDataPixelDir
    ]);
    for (const candidatePath of candidates) {
      try {
        if (!candidatePath) continue;
        const candidateInfo = getFileInfoCached(candidatePath);
        if (!candidateInfo.exists) continue;
        const hasImages = fs.readdirSync(candidatePath).some((name) => isImageFile(name));
        if (hasImages) {
          if (pixelArtDirectoryCache.value !== candidatePath) console.log(`[localitfy pixelart] using ${candidatePath}`);
          pixelArtDirectoryCache = { value: candidatePath, expiresAt: now + PIXEL_ART_CACHE_TTL_MS };
          return candidatePath;
        }
      } catch {}
    }
    fs.mkdirSync(userDataPixelDir, { recursive: true });
    if (pixelArtDirectoryCache.value !== userDataPixelDir) console.log(`[localitfy pixelart] no bundled pixelart found, using empty user folder ${userDataPixelDir}`);
    pixelArtDirectoryCache = { value: userDataPixelDir, expiresAt: now + PIXEL_ART_CACHE_TTL_MS };
    return userDataPixelDir;
  } catch (error) {
    console.log("[localitfy pixelart directory error]", error?.message || error);
    pixelArtDirectoryCache = { value: "", expiresAt: now + 5_000 };
    return "";
  }
}

function getPixelArtFiles(options = {}) {
  const force = Boolean(options.force);
  const now = Date.now();
  const root = getPixelArtDirectory({ force });
  if (!root) return [];
  if (!force && pixelArtFilesCache.root === root && pixelArtFilesCache.expiresAt > now) return pixelArtFilesCache.value;
  try {
    const files = fs.readdirSync(root).map((name) => path.join(root, name)).filter(fileExists).filter(isImageFile);
    pixelArtFilesCache = { value: files, root, expiresAt: now + PIXEL_ART_CACHE_TTL_MS };
    return files;
  } catch {
    pixelArtFilesCache = { value: [], root, expiresAt: now + 5_000 };
    return [];
  }
}

const {makeSongFromFile, listAudioFilesInDirectory, makeSongFromFileWithExactSpotifyTrack, importNewAudioFilesFromDirectory, importNewAudioFiles, repairSpotifyMetadataForFolder, pickStablePixelCoverForSong, getRuntimeCoverPath: libraryCoverPath, shapeSong, listSongsShaped, repairMissingSongMetadata} = createLibraryImportRuntime({getSongs, getSong, insertSongs, patchSong, clearFileInfoCache, getFileInfoCached, getPixelArtFiles, isAudioFile, isImageFile, fileExists, isDownloadFileInProgress, cacheSpotifyCoverImage, safeMediaUrl, getCoverThumbnailUrl});

function getRuntimeCoverPath(...args) { return libraryCoverPath(...args); }

const albumFolderScanCache = new Map();
const ALBUM_FOLDER_SCAN_TTL_MS = 20 * 60 * 1000;
const ALBUM_FOLDER_MAX_ALBUMS = 260;
const ALBUM_FOLDER_MAX_TRACKS_PER_ALBUM = 420;
const ALBUM_FOLDER_LIBRARY_SCAN_MAX_DEPTH = 4;
const ALBUM_FOLDER_SCAN_YIELD_EVERY_TRACKS = 8;
const ALBUM_FOLDER_IMPORT_YIELD_EVERY_TRACKS = 12;
const ALBUM_FOLDER_IMPORT_PROGRESS_EVERY_TRACKS = 5;
const ALBUM_FOLDER_DISC_FOLDER_RE = /^(?:cd|disc|disk|side|volume|vol)\s*[-_ ]?\d{1,2}$/i;

function findAlbumFolderCoverPath(folderPath) { return findFolderCover(folderPath); }
function folderHasAudioFiles(folderPath) { return listAudioFilesInDirectory(folderPath, { maxDepth: 0, maxFiles: 8 }).length > 0; }
function isDiscLikeAlbumSubfolderName(name = "") { return ALBUM_FOLDER_DISC_FOLDER_RE.test(String(name || "").trim()); }
function folderHasDiscAudioFiles(folderPath) {
  let entries = [];
  try { entries = fs.readdirSync(folderPath, { withFileTypes: true }); } catch { return false; }
  return entries.some((entry) => entry.isDirectory() && isDiscLikeAlbumSubfolderName(entry.name) && folderHasAudioFiles(path.join(folderPath, entry.name)));
}
function isAlbumFolderCandidate(folderPath) { return folderHasAudioFiles(folderPath) || folderHasDiscAudioFiles(folderPath); }
function isIgnoredAlbumLibraryFolderName(name = "") { return String(name || "").startsWith(".") || name === "localitfy-bin" || name === "spotify-covers" || name === "node_modules" || name === "release" || name === "dist"; }
function findAlbumFoldersFromRoot(rootPath, mode = "single") {
  const root = String(rootPath || "");
  if (!root || !path.isAbsolute(root) || !fs.existsSync(root)) return [];
  const folders = [];
  const queue = [{ folderPath: root, depth: 0 }];
  const seen = new Set();
  while (queue.length && folders.length < ALBUM_FOLDER_MAX_ALBUMS) {
    const current = queue.shift();
    const folderPath = current?.folderPath || "";
    const depth = Number(current?.depth || 0);
    const folderKey = filePathKey(folderPath);
    if (!folderPath || seen.has(folderKey)) continue;
    seen.add(folderKey);
    const isRoot = folderKey === filePathKey(root);
    if (isAlbumFolderCandidate(folderPath)) { folders.push(folderPath); continue; }
    if (depth >= ALBUM_FOLDER_LIBRARY_SCAN_MAX_DEPTH) continue;
    let entries = [];
    try { entries = fs.readdirSync(folderPath, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory() || isIgnoredAlbumLibraryFolderName(entry.name)) continue;
      queue.push({ folderPath: path.join(folderPath, entry.name), depth: depth + 1 });
    }
    if (mode === "single" && isRoot && folders.length) break;
  }
  return folders.slice(0, ALBUM_FOLDER_MAX_ALBUMS);
}

async function buildAlbumFolderPreview(folderPath, index = 0) {
  const folderTitle = cleanAlbumFolderText(path.basename(folderPath), `album ${index + 1}`);
  const existingPaths = new Set(getSongs().map((song) => filePathKey(String(song.filePath || ""))).filter(Boolean));
  const audioFiles = listAudioFilesInDirectory(folderPath, { maxDepth: 1, maxFiles: ALBUM_FOLDER_MAX_TRACKS_PER_ALBUM });
  const folderCoverPath = findAlbumFolderCoverPath(folderPath);
  let albumEmbeddedCoverPath = "";
  const parsedTracks = [];
  for (let trackIndex = 0; trackIndex < audioFiles.length; trackIndex += 1) {
    if (trackIndex > 0 && trackIndex % ALBUM_FOLDER_SCAN_YIELD_EVERY_TRACKS === 0) await yieldToMainLoop();
    const filePath = audioFiles[trackIndex];
    const filenameMetadata = parseAlbumTrackFileName(filePath, folderTitle);
    const shouldReadCover = !folderCoverPath && !albumEmbeddedCoverPath && trackIndex < 12;
    const tagMetadata = await readLocalAudioMetadata(filePath, { readCover: shouldReadCover });
    const duplicate = existingPaths.has(filePathKey(String(filePath || "")));
    if (!albumEmbeddedCoverPath && tagMetadata?.embeddedCoverPath && fileExists(tagMetadata.embeddedCoverPath)) albumEmbeddedCoverPath = tagMetadata.embeddedCoverPath;
    const durationMs = Math.max(0, Number(tagMetadata?.durationMs || 0), Number(tagMetadata?.duration || 0) > 0 ? Number(tagMetadata.duration) * 1000 : 0);
    parsedTracks.push({
      id: crypto.createHash("sha1").update(`${filePath}:${trackIndex}`).digest("hex"),
      filePath,
      title: cleanAlbumFolderText(tagMetadata?.title, filenameMetadata.title),
      artist: cleanAlbumFolderText(tagMetadata?.artist, filenameMetadata.artist),
      album: cleanAlbumFolderText(tagMetadata?.album, filenameMetadata.album),
      genre: String(tagMetadata?.genre || "").trim(),
      duration: durationMs > 0 ? Math.round(durationMs / 1000) : Number(tagMetadata?.duration || 0) || 0,
      durationMs,
      disc: Number(tagMetadata?.disc || 1) || 1,
      track: Number(tagMetadata?.track || albumTrackNumberFromFileName(filePath, trackIndex)) || albumTrackNumberFromFileName(filePath, trackIndex),
      duplicate,
      metadataSource: tagMetadata?.source || "filename",
      durationSource: tagMetadata?.durationSource || "none",
      hasEmbeddedCover: Boolean(tagMetadata?.hasEmbeddedCover)
    });
  }
  parsedTracks.sort((a, b) => (a.disc || 1) - (b.disc || 1) || (a.track || 0) - (b.track || 0) || a.title.localeCompare(b.title));
  const artistCounts = new Map();
  const albumCounts = new Map();
  for (const track of parsedTracks) {
    const artist = cleanAlbumFolderText(track.artist, "unknown artist");
    const album = cleanAlbumFolderText(track.album, "");
    if (artist && artist !== "unknown artist") artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    if (album && album !== "local album") albumCounts.set(album, (albumCounts.get(album) || 0) + 1);
  }
  const albumArtist = [...artistCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "various artists";
  const tagAlbumTitle = [...albumCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  // Embedded album tags are authoritative; folder names are only a fallback
  // for files that do not contain usable album metadata.
  const albumTitle = cleanAlbumFolderText(tagAlbumTitle, folderTitle);
  const duplicateCount = parsedTracks.filter((track) => track.duplicate).length;
  const coverPath = folderCoverPath || albumEmbeddedCoverPath || "";
  const coverSource = folderCoverPath ? "folder" : albumEmbeddedCoverPath ? "embedded" : "none";
  return {
    id: crypto.createHash("sha1").update(folderPath).digest("hex"),
    title: albumTitle,
    artist: albumArtist,
    sourcePath: folderPath,
    coverPath,
    coverSource,
    folderCoverPath: folderCoverPath || "",
    embeddedCoverPath: albumEmbeddedCoverPath || "",
    coverUrl: coverPath ? safeMediaUrl(coverPath) : "",
    coverThumbUrl: coverPath ? getCoverThumbnailUrl(coverPath) : "",
    coverThumbnailUrl: coverPath ? getCoverThumbnailUrl(coverPath) : "",
    thumbnailUrl: coverPath ? getCoverThumbnailUrl(coverPath) : "",
    coverFullUrl: coverPath ? safeMediaUrl(coverPath) : "",
    trackCount: parsedTracks.length,
    duplicateCount,
    warnings: duplicateCount ? [`${duplicateCount} track${duplicateCount === 1 ? "" : "s"} already in library`] : [],
    tracks: parsedTracks
  };
}

function pruneAlbumFolderScanCache() {
  const now = Date.now();
  for (const [scanId, scan] of albumFolderScanCache) if (!scan?.createdAt || now - scan.createdAt > ALBUM_FOLDER_SCAN_TTL_MS) albumFolderScanCache.delete(scanId);
}

async function handleAlbumFolderScan(event, payload = {}) {
  const mode = payload?.mode === "library" ? "library" : "single";
  const senderWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const dialogOptions = {
    title: mode === "library" ? "Choose folder containing album folders" : "Choose one album folder",
    buttonLabel: mode === "library" ? "scan album library" : "scan album folder",
    defaultPath: app.getPath("music"),
    properties: ["openDirectory"]
  };
  const result = senderWindow && !senderWindow.isDestroyed() ? await dialog.showOpenDialog(senderWindow, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
  if (result.canceled || !result.filePaths?.[0]) return { ok: true, canceled: true, mode, albums: [], albumCount: 0, trackCount: 0, duplicateCount: 0, message: "album folder picker cancelled" };
  const rootPath = result.filePaths[0];
  event.sender.send("album-folder-import:progress", { type: "scan-start", mode, rootPath, message: "Scanning album folders..." });
  const folderPaths = findAlbumFoldersFromRoot(rootPath, mode);
  const albums = [];
  for (let index = 0; index < folderPaths.length; index += 1) {
    const folderPath = folderPaths[index];
    event.sender.send("album-folder-import:progress", { type: "scan-progress", mode, index: index + 1, total: folderPaths.length, folder: folderPath, folderPath, message: `Scanning ${path.basename(folderPath)}` });
    const preview = await buildAlbumFolderPreview(folderPath, index);
    if (preview.trackCount > 0) albums.push(preview);
    await yieldToMainLoop();
  }
  pruneAlbumFolderScanCache();
  const scanId = crypto.randomBytes(12).toString("hex");
  const trackCount = albums.reduce((total, album) => total + album.trackCount, 0);
  const duplicateCount = albums.reduce((total, album) => total + (album.duplicateCount || 0), 0);
  const scanPayload = { ok: true, canceled: false, scanId, mode, rootPath, albumCount: albums.length, trackCount, duplicateCount, albums, message: albums.length ? `Found ${albums.length} album${albums.length === 1 ? "" : "s"} with ${trackCount} track${trackCount === 1 ? "" : "s"}.` : "No audio files were found in that folder." };
  albumFolderScanCache.set(scanId, { ...scanPayload, createdAt: Date.now() });
  event.sender.send("album-folder-import:progress", { type: "scan-done", mode, index: albums.length, total: albums.length, message: scanPayload.message });
  return scanPayload;
}

async function handleAlbumFolderImport(event, payload = {}) {
  pruneAlbumFolderScanCache();
  const scanId = String(payload?.scanId || "").trim();
  const scan = albumFolderScanCache.get(scanId);
  if (!scan) return { ok: false, error: "Album scan expired. Please choose the album folder again.", songs: listSongsShaped(), albums: [] };
  const albums = Array.isArray(scan.albums) ? scan.albums : [];
  const allTracks = albums.flatMap((album) => (Array.isArray(album.tracks) ? album.tracks : []).map((track) => ({ album, track })));
  event.sender.send("album-folder-import:progress", { type: "import-start", index: 0, total: allTracks.length, message: "Adding album tracks to Localtify..." });
  const existingSongsBefore = getSongs();
  const existingSongByPath = new Map(existingSongsBefore.filter((song) => song?.filePath).map((song) => [filePathKey(String(song.filePath || "")), song]));
  const existingPaths = new Set(existingSongByPath.keys());
  const pixelArtFiles = getPixelArtFiles();
  const usedCovers = new Set();
  const importedSongs = [];
  let repairedExistingCount = 0;
  let repairedCoverCount = 0;
  let repairedDurationCount = 0;
  const importStartedAt = Date.now();

  for (let index = 0; index < allTracks.length; index += 1) {
    const { album, track } = allTracks[index];
    const filePath = String(track.filePath || "");
    const fileKey = filePathKey(filePath);
    if (index === 0 || index + 1 === allTracks.length || index % ALBUM_FOLDER_IMPORT_PROGRESS_EVERY_TRACKS === 0) {
      event.sender.send("album-folder-import:progress", { type: "import-progress", index: index + 1, total: allTracks.length, filePath, message: `Adding ${track.title || path.basename(filePath)}` });
    }
    if (index > 0 && index % ALBUM_FOLDER_IMPORT_YIELD_EVERY_TRACKS === 0) await yieldToMainLoop();
    if (!filePath || !fileExists(filePath) || !isAudioFile(filePath)) continue;
    const folderCoverPath = album.coverSource === "folder" ? album.coverPath || album.folderCoverPath || "" : album.folderCoverPath || "";
    const albumEmbeddedCoverPath = album.coverSource === "embedded" ? album.coverPath || album.embeddedCoverPath || "" : album.embeddedCoverPath || "";
    const existingSong = existingSongByPath.get(fileKey);
    if (existingSong) {
      const metadata = await readLocalAudioMetadata(filePath, { readCover: !folderCoverPath });
      const fallbackCover = pickStablePixelCoverForSong(existingSong, pixelArtFiles);
      const coverResult = await resolveSongCover({ song: existingSong, metadata, filePath, folderCoverPath, albumEmbeddedCoverPath, preferFolderCover: Boolean(folderCoverPath), fallbackCoverPath: fallbackCover });
      const durationMs = Math.max(0, Number(track.durationMs || 0), Number(metadata?.durationMs || 0), Number(track.duration || 0) > 0 ? Number(track.duration) * 1000 : 0, Number(metadata?.duration || 0) > 0 ? Number(metadata.duration) * 1000 : 0);
      const duration = durationMs > 0 ? Math.round(durationMs / 1000) : Math.max(0, Number(track.duration || 0), Number(metadata?.duration || 0), Number(existingSong.duration || 0));
      const patch = {
        title: cleanAlbumFolderText(track.title || metadata?.title, existingSong.title || "track"),
        artist: cleanAlbumFolderText(track.artist || metadata?.artist, existingSong.artist || album.artist || "unknown artist"),
        album: cleanAlbumFolderText(album.title || track.album || metadata?.album, existingSong.album || "local album"),
        genre: String(track.genre || metadata?.genre || existingSong.genre || "").trim(),
        sourceType: "local",
        sourceProvider: "album-folder",
        sourceUrl: album.sourcePath || "",
        sourceProviderUrl: album.sourcePath || ""
      };
      if (durationMs > 0) { patch.duration = duration; patch.durationMs = durationMs; }
      if (coverResult?.coverPath && existingSong.coverSource !== "custom") {
        patch.coverPath = coverResult.coverPath;
        patch.coverSource = coverResult.coverSource || "none";
        patch.coverUpdatedAt = coverResult.coverUpdatedAt || new Date().toISOString();
      }
      patchSong(existingSong.id, patch);
      repairedExistingCount += 1;
      if (durationMs > 0) repairedDurationCount += 1;
      if (coverResult?.coverPath) repairedCoverCount += 1;
      continue;
    }

    const baseSong = await makeSongFromFile(filePath, pixelArtFiles, usedCovers, { album: album.title || track.album || "", folderCoverPath, albumEmbeddedCoverPath, preferFolderCover: Boolean(folderCoverPath) });
    const durationMs = Math.max(0, Number(track.durationMs || 0), Number(baseSong.durationMs || 0), Number(track.duration || 0) > 0 ? Number(track.duration) * 1000 : 0, Number(baseSong.duration || 0) > 0 ? Number(baseSong.duration) * 1000 : 0);
    const duration = durationMs > 0 ? Math.round(durationMs / 1000) : Math.max(0, Number(track.duration || 0), Number(baseSong.duration || 0));
    importedSongs.push({ ...baseSong, title: cleanAlbumFolderText(track.title, baseSong.title || "track"), artist: cleanAlbumFolderText(track.artist, baseSong.artist || album.artist || "unknown artist"), album: cleanAlbumFolderText(album.title || track.album, baseSong.album || "local album"), genre: String(track.genre || baseSong.genre || "").trim(), coverPath: baseSong.coverPath || "", coverSource: baseSong.coverSource || "none", coverUpdatedAt: baseSong.coverUpdatedAt || new Date().toISOString(), duration, durationMs: durationMs || (duration > 0 ? duration * 1000 : 0), sourceType: "local", sourceProvider: "album-folder", sourceUrl: album.sourcePath || "", sourceProviderUrl: album.sourcePath || "" });
    existingPaths.add(fileKey);
  }

  const insertedCount = importedSongs.length ? insertSongs(importedSongs) : 0;
  clearFileInfoCache();
  const rawSongs = getSongs();
  const songById = new Map(rawSongs.map((song) => [song.id, song]));
  const songByPath = new Map(rawSongs.map((song) => [filePathKey(String(song.filePath || "")), song]));
  const importedAlbums = albums.map((album) => {
    const songIds = (album.tracks || []).map((track) => songByPath.get(filePathKey(String(track.filePath || "")))?.id).filter(Boolean);
    const albumSongs = songIds.map((id) => songById.get(id)).filter(Boolean);
    const preferredCoverSong = albumSongs.find((song) => String(song.coverSource || "") === "folder" && song.coverPath) || albumSongs.find((song) => String(song.coverSource || "") === "embedded" && song.coverPath) || albumSongs.find((song) => String(song.coverSource || "") === "custom" && song.coverPath) || albumSongs.find((song) => song.coverPath) || null;
    const stableCoverPath = preferredCoverSong?.coverPath || album.coverPath || "";
    const stableCoverSource = preferredCoverSong?.coverSource || album.coverSource || "none";
    const stableCoverUrl = stableCoverPath ? safeMediaUrl(stableCoverPath) : (preferredCoverSong?.coverUrl || album.coverUrl || "");
    return { id: album.id, manualAlbumId: crypto.createHash("sha1").update(String(album.sourcePath || album.id || album.title)).digest("hex"), title: album.title, artist: album.artist || "various artists", year: "", coverPath: stableCoverPath, coverSource: stableCoverSource, coverUrl: stableCoverUrl || "", sourceType: "folder", sourcePath: album.sourcePath || "", folderCoverPath: album.folderCoverPath || (album.coverSource === "folder" ? album.coverPath || "" : ""), embeddedCoverPath: album.embeddedCoverPath || (album.coverSource === "embedded" ? album.coverPath || "" : ""), importedAt: importStartedAt, createdAt: importStartedAt, updatedAt: Date.now(), songIds };
  }).filter((album) => album.songIds.length > 0);
  const changedCount = insertedCount + repairedExistingCount;
  const afterSongs = listSongsShaped();
  const message = `Imported ${insertedCount} new track${insertedCount === 1 ? "" : "s"} and repaired ${repairedExistingCount} existing track${repairedExistingCount === 1 ? "" : "s"} from ${importedAlbums.length} album${importedAlbums.length === 1 ? "" : "s"}.`;
  event.sender.send("album-folder-import:progress", { type: "import-done", index: allTracks.length, total: allTracks.length, changedCount, message });
  albumFolderScanCache.delete(scanId);
  return { ok: true, changedCount, insertedCount, repairedExistingCount, repairedCoverCount, repairedDurationCount, importedCount: importedSongs.length, trackCount: allTracks.length, mode: scan.mode, rootPath: scan.rootPath || "", songs: afterSongs, albums: importedAlbums, message };
}

function analyzeVolumeGain(filePath) {
  return new Promise((resolve) => {
    if (!fileExists(filePath) || !isAudioFile(filePath)) { resolve({ ok: false, volumeGain: 1, error: "file missing or unsupported" }); return; }
    const ffmpegPath = getFfmpegPath();
    if (!ffmpegPath || !fileExists(ffmpegPath)) { resolve({ ok: false, volumeGain: 1, error: "ffmpeg missing" }); return; }
    execFile(ffmpegPath, ["-hide_banner", "-nostats", "-i", filePath, "-af", "volumedetect", "-f", "null", "-"], { windowsHide: true, timeout: 45000, maxBuffer: 1024 * 1024 * 6 }, (error, stdout, stderr) => {
      const text = `${stdout || ""}\n${stderr || ""}`;
      const mean = Number((text.match(/mean_volume:\s*(-?[0-9.]+) dB/i) || [])[1]);
      const max = Number((text.match(/max_volume:\s*(-?[0-9.]+) dB/i) || [])[1]);
      if (!Number.isFinite(mean)) { resolve({ ok: false, volumeGain: 1, error: error?.message || "could not read volume" }); return; }
      let gainDb = -18 - mean;
      if (Number.isFinite(max)) gainDb = Math.min(gainDb, -1 - max);
      gainDb = Math.max(-12, Math.min(12, gainDb));
      const volumeGain = Math.max(0.25, Math.min(2.4, Math.pow(10, gainDb / 20)));
      resolve({ ok: true, meanVolumeDb: mean, maxVolumeDb: max, gainDb, volumeGain });
    });
  });
}

function openImportDialog(senderWindow) {
  const dialogOptions = { title: "Import local music files to localtify library", buttonLabel: "Add to Library", properties: ["openFile", "multiSelections"], filters: [{ name: "Audio Files", extensions: ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus", "aiff", "aif"] }] };
  return senderWindow && !senderWindow.isDestroyed() ? dialog.showOpenDialog(senderWindow, dialogOptions) : dialog.showOpenDialog(dialogOptions);
}

function filePathExistsForRenderer(filePath) {
  try { return Boolean(filePath) && fs.existsSync(filePath); } catch { return false; }
}
function getRendererIndexPath() {
  const candidates = uniquePaths([
    path.join(app.getAppPath(), "dist", "index.html"),
    path.join(__dirname, "..", "dist", "index.html"),
    path.join(__dirname, "dist", "index.html"),
    path.join(process.resourcesPath || "", "app.asar", "dist", "index.html"),
    path.join(process.resourcesPath || "", "app", "dist", "index.html")
  ].filter(Boolean));
  const found = candidates.find(filePathExistsForRenderer);
  if (found) return found;
  console.log("[localtify renderer index missing] tried", candidates);
  return candidates[0];
}

let localtifyRendererProtocolReady = false;
function safeRendererProtocolPathname(requestUrl) {
  try {
    const url = new URL(requestUrl);
    const rawPath = decodeURIComponent(url.pathname || "/");
    if (!rawPath || rawPath === "/" || rawPath === "/index.html") return "index.html";
    return rawPath.replace(/^\/+/, "");
  } catch { return "index.html"; }
}
function getRendererProtocolEntryUrl() { return `${LOCALTIFY_RENDERER_PROTOCOL}://app/index.html`; }
function isPackagedLinuxAppImageRuntime() { return Boolean(app.isPackaged && process.platform === "linux"); }
function readLocaltifyRendererFile(filePath) {
  return new Promise((resolve, reject) => fs.readFile(filePath, (error, data) => error ? reject(error) : resolve(data)));
}
function registerLocaltifyRendererProtocol() {
  if (isDev || localtifyRendererProtocolReady) return;
  localtifyRendererProtocolReady = true;
  protocol.handle(LOCALTIFY_RENDERER_PROTOCOL, async (request) => {
    const indexPath = getRendererIndexPath();
    const distDir = path.dirname(indexPath);
    const requestPath = safeRendererProtocolPathname(request.url);
    const targetPath = requestPath === "index.html" ? indexPath : path.normalize(path.join(distDir, requestPath));
    const normalizedDist = path.normalize(distDir);
    const normalizedTarget = path.normalize(targetPath);
    const insideDist = normalizedTarget === normalizedDist || normalizedTarget.startsWith(normalizedDist + path.sep);
    if (!insideDist) return new Response("Blocked localtify renderer path", { status: 403 });
    if (!filePathExistsForRenderer(normalizedTarget)) {
      console.log("[localtify renderer protocol missing asset]", request.url, normalizedTarget);
      return new Response("Localtify renderer asset missing", { status: 404 });
    }
    try {
      const data = await readLocaltifyRendererFile(normalizedTarget);
      return new Response(data, { status: 200, headers: { "content-type": getLocaltifyRendererMimeType(normalizedTarget), "cache-control": "no-cache" } });
    } catch (error) {
      console.log("[localtify renderer protocol read failed]", request.url, normalizedTarget, error?.message || error);
      return new Response("Localtify renderer asset read failed", { status: 500 });
    }
  });
}
function loadPackagedLocaltifyRenderer(win, indexPath) {
  if (!win || win.isDestroyed()) return Promise.resolve();
  registerLocaltifyRendererProtocol();
  const protocolUrl = getRendererProtocolEntryUrl();
  return win.loadURL(protocolUrl).catch((protocolError) => {
    console.log("[localtify renderer protocol load failed]", protocolError?.message || protocolError, protocolUrl, indexPath);
    if (!win || win.isDestroyed()) return;
    if (isPackagedLinuxAppImageRuntime()) throw protocolError;
    return win.loadFile(indexPath);
  });
}

function getLocaltifyGpuFeatureStatus() {
  try { return typeof app.getGPUFeatureStatus === "function" ? app.getGPUFeatureStatus() : {}; } catch (error) { return { error: error?.message || String(error || "GPU feature status unavailable") }; }
}
async function getLocaltifyPerformanceStatus() {
  let gpuInfo = null;
  try { gpuInfo = typeof app.getGPUInfo === "function" ? await app.getGPUInfo("basic") : null; } catch (error) { gpuInfo = { error: error?.message || String(error || "GPU info unavailable") }; }
  let metrics = [];
  try { metrics = typeof app.getAppMetrics === "function" ? app.getAppMetrics().map((metric) => ({ type: metric.type, pid: metric.pid, cpu: metric.cpu, memory: metric.memory, sandboxed: metric.sandboxed })) : []; } catch { metrics = []; }
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  let devToolsOpened = false;
  try { devToolsOpened = Boolean(win?.webContents?.isDevToolsOpened?.()); } catch {}
  return { ok: true, appVersion: app.getVersion(), electronVersion: process.versions.electron, chromeVersion: process.versions.chrome, nodeVersion: process.versions.node, platform: process.platform, arch: process.arch, isPackaged: Boolean(app.isPackaged), gpuTuning: LOCALTIFY_CHROMIUM_PERFORMANCE, gpuFeatureStatus: getLocaltifyGpuFeatureStatus(), gpuInfo, processMetrics: metrics, window: { exists: Boolean(win), visible: Boolean(win?.isVisible?.()), focused: Boolean(win?.isFocused?.()), devToolsOpened } };
}
function openLocaltifyDevTools(win = mainWindow, options = {}) {
  try {
    const target = win && !win.isDestroyed() ? win : mainWindow;
    if (!target || target.isDestroyed()) return { ok: false, error: "main window is not ready" };
    const mode = typeof options?.mode === "string" && options.mode ? options.mode : (isDev ? "detach" : "right");
    target.webContents.openDevTools({ mode, activate: true });
    return { ok: true, opened: true, mode, gpuFeatureStatus: getLocaltifyGpuFeatureStatus() };
  } catch (error) { return { ok: false, error: error?.message || String(error || "failed to open DevTools") }; }
}
function toggleLocaltifyDevTools(win = mainWindow) {
  try {
    const target = win && !win.isDestroyed() ? win : mainWindow;
    if (!target || target.isDestroyed()) return { ok: false, error: "main window is not ready" };
    if (target.webContents.isDevToolsOpened()) { target.webContents.closeDevTools(); return { ok: true, opened: false }; }
    return openLocaltifyDevTools(target);
  } catch (error) { return { ok: false, error: error?.message || String(error || "failed to toggle DevTools") }; }
}

function localtifyStartupShellHtml(title, message, detail = "") {
  const safe = (value) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><style>html,body{margin:0;width:100%;height:100%;background:#090012;color:#f8eaff;font-family:Inter,Segoe UI,system-ui,sans-serif;}body{display:grid;place-items:center;overflow:hidden;}.box{max-width:520px;padding:28px;border:1px solid rgba(232,94,255,.28);border-radius:26px;background:linear-gradient(135deg,rgba(42,8,56,.92),rgba(8,2,16,.96));box-shadow:0 24px 80px rgba(0,0,0,.55),0 0 42px rgba(220,76,255,.18);}h1{margin:0 0 10px;font-size:23px;letter-spacing:-.04em;}p{margin:0;color:#cbb8d8;line-height:1.55;font-size:14px;}code{display:block;margin-top:14px;padding:12px;border-radius:14px;background:rgba(255,255,255,.06);color:#f4d5ff;white-space:pre-wrap;word-break:break-word;font-size:12px;}</style></head><body><div class="box"><h1>${safe(title)}</h1><p>${safe(message)}</p>${detail ? `<code>${safe(detail)}</code>` : ""}</div></body></html>`;
}
function loadLocaltifyStartupShell(win, title, message, detail = "") {
  if (!win || win.isDestroyed()) return;
  try { win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(localtifyStartupShellHtml(title, message, detail))}`).catch(() => {}); } catch (error) { console.log("[localtify startup shell error]", error?.message || error); }
}
function hardenRendererBackground(win) {
  if (!win || win.isDestroyed()) return;
  try { win.webContents.insertCSS(`html, body, #root { min-width: 100%; min-height: 100%; background: #090012 !important; } body:empty::before { content: ""; position: fixed; inset: 0; background: #090012; }`).catch(() => {}); } catch {}
}
function verifyRendererMounted(win, indexPath) {
  if (!win || win.isDestroyed() || isDev || isPackagedLinuxAppImageRuntime()) return;
  setTimeout(async () => {
    if (!win || win.isDestroyed()) return;
    try {
      const state = await win.webContents.executeJavaScript(`(() => { const root=document.getElementById('root'); const body=document.body; return { href:location.href, rootChars:root?(root.innerHTML||'').trim().length:0, bodyChars:body?(body.innerHTML||'').trim().length:0, title:document.title||'' }; })()`, true);
      const rendererLooksEmpty = state && state.href && state.href.startsWith("file:") && state.rootChars < 16 && state.bodyChars < 64;
      if (!rendererLooksEmpty) return;
      console.log("[localtify renderer empty after startup]", state);
      if (!mainWindowRendererRecoveredOnce) { mainWindowRendererRecoveredOnce = true; win.webContents.reloadIgnoringCache(); return; }
      loadLocaltifyStartupShell(win, "localtify could not finish opening", "The window started, but the renderer stayed empty. Restart Localtify once; if this repeats, run npm run build before packaging.", `Renderer: ${indexPath}`);
    } catch (error) { console.log("[localtify renderer verify error]", error?.message || error); }
  }, 2500);
}
function armRendererLoadWatchdog(win, indexPath) {
  if (!win || win.isDestroyed() || isDev || isPackagedLinuxAppImageRuntime()) return;
  clearTimeout(mainWindowRendererWatchdog);
  mainWindowRendererWatchdog = setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    try {
      const loading = win.webContents.isLoading();
      const url = win.webContents.getURL();
      console.log("[localtify renderer startup watchdog]", { loading, url, indexPath });
      if (loading) { try { win.webContents.stop(); } catch {} }
      if (!mainWindowRendererRecoveredOnce) {
        mainWindowRendererRecoveredOnce = true;
        loadPackagedLocaltifyRenderer(win, indexPath).catch((error) => loadLocaltifyStartupShell(win, "localtify could not load", error?.message || "Renderer load failed.", indexPath));
        return;
      }
      loadLocaltifyStartupShell(win, "localtify is taking too long to open", "Windows startup may have launched the app before the renderer was ready.", indexPath);
    } catch (error) { console.log("[localtify renderer watchdog error]", error?.message || error); }
  }, 14000);
}
function clearRendererLoadWatchdog() { clearTimeout(mainWindowRendererWatchdog); mainWindowRendererWatchdog = null; }
function attachLocaltifyDevToolsShortcuts(win) {
  if (!win || win.isDestroyed() || win.__localtifyDevToolsShortcutsAttached) return;
  win.__localtifyDevToolsShortcutsAttached = true;
  win.webContents.on("before-input-event", (event, input = {}) => {
    const key = String(input.key || "").toLowerCase();
    const isCtrlOrMeta = Boolean(input.control || input.meta);
    if (!((isCtrlOrMeta && input.shift && key === "i") || key === "f12")) return;
    event.preventDefault();
    const result = toggleLocaltifyDevTools(win);
    if (!result?.ok) console.log("[localtify devtools shortcut error]", result?.error || result);
  });
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) { showMainWindow(); return; }
  const size = getSafeMainWindowSize();
  const windowTranslucency = getSavedWindowTranslucencySettings();
  const nativeWindowOptions = process.platform === "win32" ? { backgroundMaterial: "none" } : {};
  const windowChromeOptions = process.platform === "darwin"
    ? { titleBarStyle: "hiddenInset" }
    : { frame: false, titleBarStyle: "hidden" };
  mainWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    minWidth: MAIN_WINDOW_MIN_WIDTH,
    minHeight: MAIN_WINDOW_MIN_HEIGHT,
    show: false,
    transparent: false,
    backgroundColor: "#090012",
    paintWhenInitiallyHidden: true,
    ...windowChromeOptions,
    ...nativeWindowOptions,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      backgroundThrottling: false
    }
  });
  const thumbnailWindow = mainWindow;
  const syncThumbnailQueue = () => coverThumbnailQueue.setPaused(
    thumbnailWindow.isDestroyed() || !thumbnailWindow.isVisible() || thumbnailWindow.isMinimized()
  );
  for (const event of ["show", "hide", "minimize", "restore"]) thumbnailWindow.on(event, syncThumbnailQueue);
  syncThumbnailQueue();
  attachLocaltifyDevToolsShortcuts(mainWindow);
  applyWindowTranslucencyToWindow(mainWindow, windowTranslucency);
  const rendererIndexPath = isDev ? "" : getRendererIndexPath();
  installRendererSecurityGuards(mainWindow, { isDev, rendererFileRoot: rendererIndexPath ? path.dirname(rendererIndexPath) : "" });
  installSessionPermissionGuards(mainWindow.webContents?.session);
  const settingsContents = mainWindow.webContents;
  settingsContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) settingsFlush.forget(settingsContents);
  });
  settingsContents.on("render-process-gone", () => settingsFlush.forget(settingsContents));
  settingsContents.once("destroyed", () => settingsFlush.forget(settingsContents));
  mainWindow.webContents.on("dom-ready", () => hardenRendererBackground(mainWindow));
  mainWindow.webContents.once("did-finish-load", () => {
    clearRendererLoadWatchdog();
    applyWindowTranslucencyToWindow(mainWindow, getSavedWindowTranslucencySettings());
    verifyRendererMounted(mainWindow, rendererIndexPath);
  });
  if (isDev) mainWindow.loadURL("http://localhost:5173").catch((error) => console.log("[localitfy main window dev load error]", error?.message || error));
  else {
    console.log("[localitfy renderer index]", rendererIndexPath);
    armRendererLoadWatchdog(mainWindow, rendererIndexPath);
    loadPackagedLocaltifyRenderer(mainWindow, rendererIndexPath).catch((error) => {
      console.log("[localitfy main window packaged load error]", error?.message || error, rendererIndexPath);
      loadLocaltifyStartupShell(mainWindow, "localtify could not load", error?.message || "Renderer load failed.", rendererIndexPath);
    });
  }
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    console.log("[localitfy main window failed load]", { code, desc, url, isMainFrame });
    const failedUrl = String(url || "");
    const isIgnorableAbort = code === -3 && (failedUrl.startsWith("data:") || failedUrl.startsWith(`${LOCALTIFY_RENDERER_PROTOCOL}://`) || (isPackagedLinuxAppImageRuntime() && failedUrl.startsWith("file:")));
    if (!isDev && isMainFrame !== false && !isIgnorableAbort) loadLocaltifyStartupShell(mainWindow, "localtify failed to load", `${desc || "load failed"} (${code})`, url || rendererIndexPath);
  });
  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    console.log("[localitfy main window renderer gone]", details);
    if (!isDev && !mainWindowRendererRecoveredOnce && mainWindow && !mainWindow.isDestroyed()) {
      mainWindowRendererRecoveredOnce = true;
      setTimeout(() => { try { void loadPackagedLocaltifyRenderer(mainWindow, rendererIndexPath); } catch {} }, 450);
    }
  });
  mainWindow.webContents.on("console-message", (_event, ...args) => {
    const details = args.length === 1 && args[0] && typeof args[0] === "object" ? args[0] : { level: args[0], message: args[1], line: args[2], sourceId: args[3] };
    console.log("[localitfy main window console]", { level: details.level, message: details.message, line: details.line, sourceId: details.sourceId });
  });
  if (process.env.LOCALITFY_DEBUG === "1") openLocaltifyDevTools(mainWindow, { mode: "detach" });
  mainWindow.once("ready-to-show", () => { repairMainWindowBounds(mainWindow, { center: true }); mainWindow.show(); });
  if (isPackagedLinuxAppImageRuntime()) {
    setTimeout(() => {
      try {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) { repairMainWindowBounds(mainWindow, { center: true }); mainWindow.show(); }
      } catch (error) { console.log("[localtify linux delayed show error]", error?.message || error); }
    }, 1600);
  }
  mainWindow.on("closed", () => { coverThumbnailQueue.setPaused(true); clearRendererLoadWatchdog(); mainWindow = null; });
  attachCloseToTray(mainWindow);
  appMenu.attachNavigationGestures(mainWindow);
}

const MAIN_WINDOW_DEFAULT_WIDTH = 1380;
const MAIN_WINDOW_DEFAULT_HEIGHT = 860;
const MAIN_WINDOW_MIN_WIDTH = 860;
const MAIN_WINDOW_MIN_HEIGHT = 640;
function getSafeMainWindowSize() {
  const display = screen.getPrimaryDisplay();
  const workArea = display?.workAreaSize || { width: MAIN_WINDOW_DEFAULT_WIDTH, height: MAIN_WINDOW_DEFAULT_HEIGHT };
  return { width: Math.min(MAIN_WINDOW_DEFAULT_WIDTH, Math.max(MAIN_WINDOW_MIN_WIDTH, Math.floor(workArea.width * 0.94))), height: Math.min(MAIN_WINDOW_DEFAULT_HEIGHT, Math.max(MAIN_WINDOW_MIN_HEIGHT, Math.floor(workArea.height * 0.9))) };
}
function repairMainWindowBounds(win, options = {}) {
  if (!win || win.isDestroyed()) return;
  const display = screen.getDisplayMatching(win.getBounds()) || screen.getPrimaryDisplay();
  const workArea = display?.workArea;
  if (!workArea) return;
  const maxWidth = Math.max(520, workArea.width);
  const maxHeight = Math.max(420, workArea.height);
  const minWidth = Math.min(MAIN_WINDOW_MIN_WIDTH, maxWidth);
  const minHeight = Math.min(MAIN_WINDOW_MIN_HEIGHT, maxHeight);
  win.setMinimumSize(minWidth, minHeight);
  const current = win.getBounds();
  const width = Math.min(Math.max(current.width, minWidth), maxWidth);
  const height = Math.min(Math.max(current.height, minHeight), maxHeight);
  let x = current.x;
  let y = current.y;
  const offscreen = x + width < workArea.x + 180 || y + height < workArea.y + 120 || x > workArea.x + workArea.width - 180 || y > workArea.y + workArea.height - 120;
  if (options.center || offscreen) {
    x = Math.max(workArea.x, workArea.x + Math.floor((workArea.width - width) / 2));
    y = Math.max(workArea.y, workArea.y + Math.floor((workArea.height - height) / 2));
  } else {
    x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width));
    y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height));
  }
  win.setBounds({ x, y, width, height });
}

let serviceRuntime = null;

app.whenReady().then(async () => {
  if (shutdown.isStarted()) return;
  registerLocaltifyRendererProtocol();
  registerLocaltifyMediaProtocol();
  serviceRuntime = createElectronServiceRuntime({
    userDataPath: app.getPath("userData"),
    ffmpegPath: getFfmpegPath(),
    startMediaServer: startLocaltifyMediaServer,
    stopMediaServer: stopLocaltifyMediaServer,
    cleanupNativeWindowsMedia
  });
  await serviceRuntime.start();
  if (shutdown.isStarted()) return;
  const databaseRecovery = restoreDatabaseFromOldUserDataIfNeeded();
  initDatabase(databaseRecovery.dbPath || path.join(app.getPath("userData"), userDataRuntime.sqliteFileName));
  try {
    const savedSettings = getSettings();
    minimizeToTray = Boolean(savedSettings?.minimizeToTray);
    syncWindowsIntegrationSettings(savedSettings, { persistDefault: true });
    startupLaunchStatus = getStartWithWindowsStatus();
  } catch {
    minimizeToTray = false;
    setStartWithWindows(true);
    startupLaunchStatus = getStartWithWindowsStatus();
  }
  setupNativeWindowsMediaIpc();

  ipcRouter.handle("localitfy:open-devtools", async (event, payload = {}) => openLocaltifyDevTools(BrowserWindow.fromWebContents(event.sender) || mainWindow, payload));
  ipcRouter.handle("localitfy:toggle-devtools", async (event) => toggleLocaltifyDevTools(BrowserWindow.fromWebContents(event.sender) || mainWindow));
  ipcRouter.handle("localitfy:performance-status", async () => getLocaltifyPerformanceStatus());
  ipcRouter.handle("localitfy:gpu-status", async () => getLocaltifyPerformanceStatus());

  ipcRouter.handle("app:bootstrap", createBootstrapHandler({
    yieldToMainLoop,
    backfillGenres: () => genreMetadataBackfill.run(),
    scheduleCoverWarmup: scheduleCoverThumbnailWarmup,
    listSongs: listSongsShaped,
    getSettings,
    getPlaylists,
    getDiagnostics: () => ({
      windowsIntegration: getStartWithWindowsStatus(),
      windowTranslucency: getSavedWindowTranslucencySettings(),
      database: { ...getDatabaseStatus(), userDataPath: app.getPath("userData"), dataFolderName: userDataRuntime.dataFolderName },
      discord: getDiscordStatus()
    })
  }));

  ipcRouter.handle("playback:resolve-url", async (_event, payload = {}) => {
    try {
      const filePath = String(payload?.filePath || "").trim();
      if (!filePath || !path.isAbsolute(filePath)) return { ok: false, fileExists: false, error: "invalid audio file path" };
      if (!isAudioFile(filePath)) return { ok: false, filePath, fileExists: fileExists(filePath), error: "unsupported audio file type" };
      if (!fileExists(filePath)) return { ok: false, filePath, fileExists: false, error: "audio file not found" };
      const serverReady = await startLocaltifyMediaServer();
      if (!serverReady || !mediaServerRuntime.getPort()) return { ok: false, filePath, fileExists: true, error: "local media server unavailable" };
      const versionInfo = getMediaFileVersion(filePath);
      return { ok: true, filePath, url: safeMediaUrl(filePath), fileExists: true, sizeBytes: versionInfo.sizeBytes, mtimeMs: versionInfo.mtimeMs, cacheTtlMs: MEDIA_TOKEN_TTL_MS };
    } catch (error) {
      console.log("[localtify playback resolve error]", error?.message || error);
      return { ok: false, fileExists: undefined, error: error?.message || "could not resolve playback url" };
    }
  });

  registerCoverIpc(ipcRouter, {
    getPixelArtFiles, safeMediaUrl, thumbnailRuntime, patchSong, shapeSong, getSong, fileExists, isImageFile
  });
  ipcRouter.handle("song:analyze-volume", async (_event, id) => {
    const target = (typeof id === "string" ? getSong(id) : null);
    if (!target) return { ok: false, volumeGain: 1, error: "song not in library database" };
    const analysis = await analyzeVolumeGain(target.filePath);
    if (!analysis?.ok) return analysis;
    const updated = patchSong(id, { volumeGain: analysis.volumeGain });
    return { ...analysis, song: updated ? shapeSong(updated) : shapeSong(target) };
  });
  ipcRouter.handle("library:import", async (event) => {
    try {
      const senderWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;
      const result = await openImportDialog(senderWindow);
      if (result.canceled || !result.filePaths?.length) return listSongsShaped();
      const validAudioFiles = result.filePaths.filter((f) => fileExists(f) && isAudioFile(f) && !isDownloadFileInProgress(f));
      if (!validAudioFiles.length) return listSongsShaped();
      const pixelArtFiles = getPixelArtFiles();
      const usedCovers = new Set();
      // Limit concurrent tag extraction and image decoding for large manual imports.
      const uniqueFiles = [...new Map(validAudioFiles.map(file => [filePathKey(file), file])).values()];
      const importedSongs = [];
      for (let offset = 0; offset < uniqueFiles.length; offset += 4) {
        importedSongs.push(...await Promise.all(uniqueFiles.slice(offset, offset + 4).map(file => makeSongFromFile(file, pixelArtFiles, usedCovers))));
        await yieldToMainLoop();
      }
      const changedCount = insertSongs(importedSongs);
      clearFileInfoCache();
      const afterSongs = listSongsShaped();
      console.log(`[localitfy import] selected=${validAudioFiles.length}, changed=${changedCount}, after=${afterSongs.length}`);
      return afterSongs;
    } catch (error) { console.log("[localitfy import error]", error?.stack || error?.message); return listSongsShaped(); }
  });
  ipcRouter.handle("library:repair-missing-metadata", async (_event, payload = {}) => { try { return await repairMissingSongMetadata(payload); } catch (error) { console.log("[localtify metadata repair error]", error?.stack || error?.message || error); return { ok: false, error: error?.message || "metadata repair failed", songs: listSongsShaped() }; } });
  libraryWatcher = startLibraryWatch(ipcRouter, { dialog, isAudioFile, getSongs, getSettings, listSongsShaped,
    importFiles: (files) => importNewAudioFiles(files), getWindow: () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null) });
  scrobbler = startScrobbling(ipcRouter, { file: path.join(app.getPath("userData"), "scrobbles.json"), getSong: databaseRepositories.songs.get, listPlays: databaseRepositories.listening.list, safeStorage, shell });
  const musicBrainzClient = require("./musicbrainz/client.cjs").createMusicBrainzClient({ userAgent: `localtify/${app.getVersion()} ( https://github.com/meshahid973/localtify )` });
  remoteArtworkCache = createRemoteArtworkCache({
    dir: path.join(app.getPath("userData"), "disposable-remote-artwork-v1"),
    maxBytes: Math.max(16, Math.min(512, Number(process.env.LOCALTIFY_ARTWORK_CACHE_MB) || 128)) * 1024 * 1024
  });
  ipcRouter.handle("covers:resolve-remote", async (_event, url) => {
    if (getSettings().discoverEnabled !== true) return null;
    const file = await remoteArtworkCache.resolve(url);
    if (!file || getSettings().discoverEnabled !== true) return null;
    const local = safeMediaUrl(file);
    return local ? { url: local, cacheTtlMs: remoteArtworkCache.remainingTtl(url) } : null;
  });
  discoverCacheLifecycle = registerDiscoverIpc(ipcRouter, { musicBrainzClient, searchYouTubeMusic: require("./discover/youtube-music.cjs").createYouTubeMusicSearch(), searchYouTubeMusicRadio: require("./discover/youtube-music.cjs").createYouTubeMusicRadio(), searchYouTubeArtwork: require("./discover/youtube-music.cjs").createYouTubeMusicSearch(globalThis.fetch, Date.now, 4), searchStore: require("./discover/catalog.cjs").createStoreSearch(),
    lookupDeezer: require("./discover/extra-artwork.cjs").createDeezerArtwork(), lookupFanart: require("./discover/extra-artwork.cjs").createFanartArtwork({apiKey:process.env.LOCALTIFY_FANART_API_KEY}),
    lookupAudioDb: require("./discover/audiodb.cjs").createAudioDbArtwork({ apiKey: process.env.LOCALTIFY_AUDIODB_API_KEY || (!app.isPackaged ? "123" : "") }), getSongs, getSettings, cacheFile: path.join(app.getPath("userData"), "discover-cache.json"), bioFile: path.join(app.getPath("userData"), "artist-bios.json") });
  registerMovedSongRepairIpc(ipcRouter, {
    dialog, BrowserWindow, getWindow: () => mainWindow,
    getSongs, fileExists, isAudioFile, readMetadata: readLocalAudioMetadata,
    backupDatabase, relinkSongPaths: databaseRepositories.songs.relinkPaths,
    clearFileInfoCache, listSongsShaped
  });
  registerDuplicateIpc(ipcRouter, { shell, getSongs, getAudioProfiles: databaseRepositories.analysis.profiles,
    mergeDuplicates: databaseRepositories.songs.mergeDuplicates, backupDatabase, clearFileInfoCache, listSongsShaped });
  ipcRouter.handle("album:scan-folder", async (event, payload = {}) => { try { return await handleAlbumFolderScan(event, payload); } catch (error) { console.log("[localtify album folder scan error]", error?.stack || error?.message || error); return { ok: false, error: error?.message || "album folder scan failed", songs: listSongsShaped(), albums: [] }; } });
  ipcRouter.handle("album:import-folder", async (event, payload = {}) => { try { return await handleAlbumFolderImport(event, payload); } catch (error) { console.log("[localtify album folder import error]", error?.stack || error?.message || error); return { ok: false, error: error?.message || "album folder import failed", songs: listSongsShaped(), albums: [] }; } });

  registerMediaConversionIpc(ipcRouter, { dialog, getWindow: event => BrowserWindow.fromWebContents(event.sender) || mainWindow,
    getDownloadDirectory, fileExists, isAudioFile, importFiles: importNewAudioFiles, listSongsShaped });

  registerDownloadsIpc(ipcRouter, {
    dialog, shell, getWindow: () => mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    getDownloadDirectory, getPixelArtFiles, getSongs, insertSongs, patchSong, fileExists, isAudioFile,
    makeSongFromFile, makeSongFromFileWithExactSpotifyTrack, importNewAudioFilesFromDirectory,
    clearFileInfoCache, listSongsShaped
  });
  registerAnalysisIpc(ipcRouter, { app, powerMonitor, repositories: databaseRepositories, ffmpegPath: ffmpegStatic?.replace("app.asar", "app.asar.unpacked") });
  require("./ipc/lyrics.cjs").registerLyricsIpc(ipcRouter, app, databaseRepositories);
  require("./ipc/tagging.cjs").registerTaggingIpc(ipcRouter, { app, musicBrainzClient, songs: databaseRepositories.songs, getSettings, readLocalAudioMetadata, listSongsShaped, safeMediaUrl, clearFileInfoCache, getWindow: () => mainWindow });
  require("./ipc/sync.cjs").registerSyncIpc(ipcRouter, { app, repositories: databaseRepositories, coverPath: (s) => getRuntimeCoverPath(s), listSongsShaped, shapeSong, getWindow: () => mainWindow, observePlay: (e) => scrobbler?.observe(e) });
  ipcRouter.handle("listening:record", (_event, payload) => {
    const recorded = databaseRepositories.listening.record(payload);
    if (recorded) { try { scrobbler?.observe(payload); } catch (error) { console.log("[localtify scrobble observation]", error?.message || error); } }
    return recorded;
  });
  ipcRouter.handle("song:delete", async (_event, id) => { try { deleteSong(id); return listSongsShaped(); } catch (error) { console.log("[localitfy delete song error]", error?.message); return listSongsShaped(); } });
  ipcRouter.handle("library:clear", async () => { clearLibrary(); return []; });
  ipcRouter.handle("library:refresh-download-folder", async (_event, payload = {}) => {
    const target = getDownloadDirectory(payload?.folder || payload?.downloadFolder || "");
    const tracks = Array.isArray(payload?.tracks) ? payload.tracks : [];
    const refresh = await importNewAudioFilesFromDirectory(target, tracks);
    const repair = tracks.length ? await repairSpotifyMetadataForFolder(target, tracks) : { changedCount: 0, songs: refresh.songs };
    return { ok: true, downloadFolder: target, changedCount: refresh.changedCount + repair.changedCount, importedCount: refresh.importedCount, repairedCount: repair.changedCount, songs: repair.songs || refresh.songs };
  });

  ipcRouter.handle("settings:flush-ready", async event => { settingsFlush.ready(event.sender); return true; });
  ipcRouter.handle("settings:flush-complete", async (event, id, saved) => settingsFlush.complete(event.sender, id, saved));
  ipcRouter.handle("settings:get", async () => getSettings());
  ipcRouter.handle("settings:save", async (_event, settings) => {
    try {
      if (!settings || typeof settings !== "object") return getSettings();
      if (Array.isArray(settings.watchedFolders)) libraryWatcher?.setFolders(settings.watchedFolders);
      if (Object.prototype.hasOwnProperty.call(settings, "startWithWindows")) setStartWithWindows(Boolean(settings.startWithWindows));
      if (Object.prototype.hasOwnProperty.call(settings, "minimizeToTray")) {
        minimizeToTray = Boolean(settings.minimizeToTray);
        if (minimizeToTray) ensureTray();
        updateTrayMenu();
      }
      return saveSettings(preserveExperimentalSettings(settings, getSettings()));
    } catch (error) { console.log("[localitfy settings save error]", error?.message); throw error; }
  });

  ipcRouter.handle("localitfy:get-window-translucency", async () => getSavedWindowTranslucencySettings());
  ipcRouter.handle("localitfy:set-window-translucency", async (_event, payload = {}) => {
    try {
      const current = getSavedWindowTranslucencySettings();
      const next = normalizeWindowTranslucencySettings({ ...current, ...(payload || {}) });
      const transparentModeChanged = Boolean(current.translucentWindow) !== Boolean(next.translucentWindow);
      saveSettings({ translucentWindow: next.translucentWindow, windowTransparency: next.windowTransparency, windowBlur: next.windowBlur, transparentAppBackground: next.transparentAppBackground });
      if (mainWindow && !mainWindow.isDestroyed()) applyWindowTranslucencyToWindow(mainWindow, next);
      return { ok: true, restartRequired: false, windowReloadRequired: false, changedNativeMaterial: transparentModeChanged, ...next };
    } catch (error) { console.log("[localitfy translucent window save error]", error?.message || error); return { ok: false, error: error?.message || "could not update translucent window", ...getSavedWindowTranslucencySettings() }; }
  });
  ipcRouter.handle("localitfy:restart-app", async () => {
    if (!await confirmSettingsFlush(mainWindow)) return false;
    restartForWindowTranslucency();
    return true;
  });
  ipcRouter.handle("localitfy:open-logs", async () => {
    try {
      const logsPath = app.getPath("logs");
      fs.mkdirSync(logsPath, { recursive: true });
      const openError = await shell.openPath(logsPath);
      return openError ? { ok: false, path: logsPath, error: openError } : { ok: true, path: logsPath };
    } catch (error) { return { ok: false, error: error?.message || "could not open logs folder" }; }
  });
  ipcRouter.handle("playlists:get", async () => getPlaylists());
  ipcRouter.handle("playlists:save", async (_event, playlists, expected, finishMigration) => savePlaylists(playlists, expected, finishMigration === true));
  ipcRouter.handle("database:backup-now", async () => { try { return { ok: backupDatabase() }; } catch (e) { return { ok: false, error: e?.message }; } });
  ipcRouter.handle("database:repair-now", async () => {
    try {
      repairDatabaseNow();
      mediaServerRuntime.clearTokens();
      thumbnailRuntime.clearUrlCache();
      return { ok: true, status: getDatabaseStatus(), songs: listSongsShaped() };
    } catch (e) { return { ok: false, error: e?.message }; }
  });
  ipcRouter.handle("database:status", async () => getDatabaseStatus());

  registerDiscordIpc(ipcRouter, { setDiscordActivity, clearDiscordActivity, getDiscordStatus, resetDiscordActivityCache });

  const runSpotifyFetch = async (payload = {}) => {
    try {
      const url = typeof payload === "string" ? payload : payload?.url;
      if (!url || typeof url !== "string") return { ok: false, tracks: [], error: "No Spotify URL provided." };
      const result = await fetchSpotifyTracksFromUrl(url.trim());
      console.log(`[localitfy spotify] fetched ${result.tracks.length} public track(s) from ${result.type} "${result.name}"`, {
        withArtists: result.tracks.filter((track) => track?.artist || track?.artists).length,
        withCovers: result.tracks.filter((track) => track?.coverUrl || track?.spotifyCoverUrl || track?.albumCoverUrl).length
      });
      return { ok: true, ...result };
    } catch (error) {
      console.log("[localtify spotify fetch error]", error?.message || error);
      return { ok: false, publicOnly: true, tracks: [], error: error?.message || "Failed to fetch Spotify tracks.", hint: "Spotify has two visibility states: shareable by link and public on profile. If fetch fails, open the playlist menu in Spotify and make it public/add it to profile." };
    }
  };
  ipcRouter.handle("spotify-fetch", async (_event, payload = {}) => runSpotifyFetch(payload));
  ipcRouter.handle("spotify-fetch-tracks", async (_event, url) => runSpotifyFetch({ url }));
  ipcRouter.handle("spotify-check", async () => getSpotifyStatus());
  ipcRouter.handle("spotify-login", async () => loginSpotifyOAuth());
  ipcRouter.handle("spotify-logout", async () => logoutSpotify());
  ipcRouter.handle("spotdl-check", async () => ({ ok: true, installed: true, engine: "localtify-ytdlp-bridge", message: "Spotify downloads use localtify's bundled yt-dlp bridge after metadata is fetched." }));

  ipcRouter.handle("localitfy:check-for-updates", async (_event, payload) => checkForUpdates(payload));
  ipcRouter.handle("localitfy:get-update-state", async () => getUpdateState());
  ipcRouter.handle("localitfy:download-update", async () => downloadUpdate());
  ipcRouter.handle("localitfy:install-update", async () => {
    if (!await confirmSettingsFlush(mainWindow)) return false;
    const installed = await installUpdate();
    if (installed && !updaterRuntime.linuxUpdaterIsManualOnly()) shutdown.approveQuit();
    return installed;
  });
  ipcRouter.handle("localitfy:open-external", async (_event, url) => {
    const targetUrl = String(url || "").trim();
    if (!/^https?:\/\//i.test(targetUrl)) return { ok: false, reason: "invalid-url" };
    await shell.openExternal(targetUrl);
    return { ok: true };
  });
  ipcRouter.handle("window:minimize", async (event) => { BrowserWindow.fromWebContents(event.sender)?.minimize(); return true; });
  ipcRouter.handle("window:toggle-maximize", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    win.isMaximized() ? win.unmaximize() : win.maximize();
    return true;
  });
  ipcRouter.handle("window:close", async (event) => { BrowserWindow.fromWebContents(event.sender)?.close(); return true; });

  const startupCreateDelayMs = process.platform === "win32" && startupLaunchStatus?.wasOpenedAtLogin ? 1600 : 0;
  shutdown.scheduleStartup(() => { createWindow(); setupNativeWindowsMedia(); }, startupCreateDelayMs);
  // Renderer owns the update-check schedule so the user's disabled setting is respected.
  app.on("activate", () => { if (!shutdown.isStarted() && BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("before-quit", shutdown.beforeQuit);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
