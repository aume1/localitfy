import { getLocaltifyPlatformInfo } from "../platform";
import { START_WITH_WINDOWS_DEFAULT_KEY, V013_DEFAULTS_KEY } from "../../core/app.constants";
import { V013_RELEASE_DEFAULTS, defaultSettings } from "../../features/settings/settings.constants";
import { migrateVisualSettings } from "../../features/settings/visualCustomization";
import type { Settings } from "../../features/settings/settings.types";
import { applyLibraryOrder } from "../../features/library/library.utils";
import { sanitizeSongList } from "../../features/search";
import { cleanPlaylistList } from "../../features/playlists";
import { PLAYLIST_STORAGE_KEY, PLAYLIST_MIGRATION_KEY } from "../../features/playlists/playlist.constants";
import type { Playlist } from "../../features/playlists/playlist.types";
import { readLocalJson } from "../../shared/storage/localStorage";

export async function prepareBootstrap(payload: Awaited<ReturnType<Window["localitfy"]["bootstrap"]>>, platformInfo: ReturnType<typeof getLocaltifyPlatformInfo>, writeSettings: (next: Settings) => Promise<unknown>, showAppToast: (message: string, type: "error") => void) {
  const storedSettings = payload.settings || {};
  const shouldApplyV013Defaults = window.localStorage.getItem(V013_DEFAULTS_KEY) !== "true";
  const shouldApplyStartWithWindowsDefault = platformInfo.startupSettingSupported && typeof storedSettings.startWithWindows === "undefined";
  const { settings: nextSettings, changed: visualSettingsChanged } = migrateVisualSettings(storedSettings, {
    ...defaultSettings,
    ...(shouldApplyV013Defaults ? V013_RELEASE_DEFAULTS : {})
  }, shouldApplyV013Defaults ? V013_RELEASE_DEFAULTS : undefined);

  // The redesigned desktop opens as an icon rail once. Preserve later explicit
  // choices, and never modify Android navigation or an existing hover layout.
  const sidebarMigrationKey = "localitfy.sidebar-rail-v1";
  const migrateSidebar = platformInfo.id !== "android" && window.localStorage.getItem(sidebarMigrationKey) !== "true";
  if (migrateSidebar && storedSettings.sidebarBehavior === undefined && nextSettings.sidebarBehavior === "fixed") nextSettings.sidebarBehavior = "slim";

  if (shouldApplyStartWithWindowsDefault) {
    nextSettings.startWithWindows = true;
  }

  if (!platformInfo.startupSettingSupported) {
    nextSettings.startWithWindows = false;
  }

  const hadSleepTimer = Number(nextSettings.sleepTimerMinutes) > 0;
  nextSettings.sleepTimerMinutes = 0;
  const shouldPersistBootSettings = hadSleepTimer ||
    shouldApplyV013Defaults || shouldApplyStartWithWindowsDefault ||
    visualSettingsChanged || (migrateSidebar && nextSettings.sidebarBehavior !== storedSettings.sidebarBehavior);

  if (shouldPersistBootSettings) {
    writeSettings(nextSettings).then(() => {
      if (shouldApplyV013Defaults) window.localStorage.setItem(V013_DEFAULTS_KEY, "true");
      if (shouldApplyStartWithWindowsDefault) window.localStorage.setItem(START_WITH_WINDOWS_DEFAULT_KEY, "true");
      if (migrateSidebar) window.localStorage.setItem(sidebarMigrationKey, "true");
    }).catch(() => showAppToast("Could not save settings migration. It will be retried next time.", "error"));
  } else if (migrateSidebar) {
    window.localStorage.setItem(sidebarMigrationKey, "true");
  }

  const nextSongs = applyLibraryOrder(sanitizeSongList(payload.songs || []));
  let initialPlaylists = cleanPlaylistList(payload.playlists || []);
  if (storedSettings.playlistMigrationCompleted !== true && window.localitfy.savePlaylists) {
    // Keep the original local backup untouched. The database marker and any imported playlists commit together.
    const legacy = cleanPlaylistList(readLocalJson<Playlist[]>(PLAYLIST_STORAGE_KEY, []));
    const restore = !readLocalJson<boolean>(PLAYLIST_MIGRATION_KEY, false) && !initialPlaylists.length && legacy.length > 0 &&
      window.confirm("Restore playlists from the old local backup? Choose Cancel to keep the database empty. The original backup is retained.");
    try {
      initialPlaylists = cleanPlaylistList(await window.localitfy.savePlaylists(restore ? legacy : initialPlaylists, initialPlaylists, true));
      nextSettings.playlistMigrationCompleted = true;
      try { window.localStorage.setItem(PLAYLIST_MIGRATION_KEY, "true"); } catch { /* The database is authoritative. */ }
    } catch (error) {
      if (!/playlist conflict/i.test(String(error))) throw error;
      const remote = await window.localitfy.getPlaylists?.();
      if (!remote) throw error;
      initialPlaylists = cleanPlaylistList(await window.localitfy.savePlaylists(remote, remote, true));
      nextSettings.playlistMigrationCompleted = true;
    }
  }

  const initialSongId =
    nextSettings.rememberLastSong &&
    nextSettings.lastSongId &&
    nextSongs.some((song) => song.id === nextSettings.lastSongId)
      ? nextSettings.lastSongId
      : nextSongs[0]?.id || "";
  const initialSong = nextSongs.find((song) => song.id === initialSongId);
  const savedTime = Number(initialSong?.playbackPosition || 0);
  const resumePosition =
    nextSettings.rememberLastSong && nextSettings.rememberPlaybackPosition &&
    initialSong && Number.isFinite(savedTime) && savedTime > 1 &&
    (!initialSong.duration || savedTime < initialSong.duration - 2)
      ? { songId: initialSongId, time: savedTime }
      : null;

  return {nextSettings, nextSongs, initialPlaylists, initialSongId, resumePosition};
}
