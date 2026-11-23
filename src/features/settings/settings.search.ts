import type { SettingsCategory } from "./settings.types";
import { settingsCategoryTabs } from "./settings.constants";
import { getLocaltifyPlatformInfo, isAndroidApp } from "../../app/platform";

export function normalizeSettingsSearch(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function settingsTabMatchesSearch(tab: (typeof settingsCategoryTabs)[number], value: string) {
  const query = normalizeSettingsSearch(value);
  if (!query) return true;
  const haystack = normalizeSettingsSearch(`${tab.id} ${tab.label} ${tab.description} ${tab.keywords}`);
  return query.split(" ").every((part) => haystack.includes(part));
}

export type SettingsControlLink = {
  id: string;
  label: string;
  description: string;
  category: SettingsCategory;
  target: string;
  keywords: string;
  desktopOnly?: boolean;
  macOnly?: boolean;
};

export const SETTINGS_CONTROL_LINKS: readonly SettingsControlLink[] = [
  { id: "theme", label: "Light or dark theme", description: "Appearance", category: "appearance", target: "settings-appearance-theme", keywords: "colors dark light palette" },
  { id: "ambience", label: "Artwork ambience", description: "Appearance", category: "appearance", target: "settings-appearance-ambience", keywords: "blur background cover gradient strength" },
  { id: "home", label: "Home layout and cards", description: "Appearance", category: "appearance", target: "settings-appearance-home", keywords: "banner hero artwork card size density" },
  { id: "player-background", label: "Player background", description: "Appearance", category: "appearance", target: "settings-appearance-player", keywords: "fullscreen oled blur flat" },
  { id: "sidebar", label: "Sidebar layout", description: "Appearance", category: "appearance", target: "settings-appearance-sidebar", keywords: "collapsed expanded compact hover navigation", desktopOnly: true },
  { id: "tabs", label: "Arrange navigation tabs", description: "Appearance", category: "appearance", target: "settings-appearance-tabs", keywords: "hide show reorder sidebar bottom bar navigation tabs" },
  { id: "motion", label: "Motion and animations", description: "Appearance", category: "appearance", target: "settings-appearance-layout", keywords: "reduce glow gif visuals floating notes" },
  { id: "crossfade", label: "Crossfade and gapless", description: "Playback", category: "playback", target: "settings-playback-transitions", keywords: "transition gap fade between tracks" },
  { id: "playback", label: "Speed and volume", description: "Playback", category: "playback", target: "settings-playback-listening", keywords: "normalization resume autoplay remember volume speed" },
  { id: "effects", label: "Audio effects", description: "Playback", category: "playback", target: "settings-playback-effects", keywords: "nightcore daycore slowed reverb pitch strength" },
  { id: "sleep", label: "Queue and sleep timer", description: "Playback", category: "playback", target: "settings-playback-sleep", keywords: "song radio autoplay sleep timer stop queue" },
  { id: "lyrics", label: "Lyrics and online lookup", description: "Lyrics & tags", category: "lyrics", target: "settings-lyrics-display", keywords: "lrclib karaoke synced cache song lyrics" },
  { id: "tagging", label: "MusicBrainz tag editor", description: "Lyrics & tags", category: "lyrics", target: "settings-lyrics-tagging", keywords: "id3 metadata album cover write file" },
  { id: "folders", label: "Watched music folders", description: "Library", category: "library", target: "settings-library-folders", keywords: "import auto scan sync files", desktopOnly: true },
  { id: "cleanup", label: "Clean and repair metadata", description: "Library", category: "library", target: "settings-library-cleanup", keywords: "broken songs missing relink rename rebuild index", desktopOnly: true },
  { id: "artwork", label: "Reroll library artwork", description: "Library", category: "library", target: "settings-library-artwork", keywords: "cover images art random covers library", desktopOnly: true },
  { id: "quality", label: "Download quality and format", description: "Downloads", category: "downloads", target: "settings-downloads-quality", keywords: "bitrate mp3 flac wav original opus m4a" },
  { id: "download-folder", label: "Download location", description: "Downloads", category: "downloads", target: "settings-downloads-folder", keywords: "folder location save auto add filenames clean" },
  { id: "download-import", label: "Import completed downloads", description: "Downloads", category: "downloads", target: "settings-downloads-import", keywords: "keep original audio add to library filename clean title import" },
  { id: "lastfm", label: "Last.fm connection", description: "Discover", category: "discover", target: "settings-discover-lastfm", keywords: "provider api key test network discovery" },
  { id: "discover-enable", label: "Enable Discover", description: "Discover", category: "discover", target: "settings-discover-enabled", keywords: "activate catalog search privacy external providers" },
  { id: "discord", label: "Discord presence and privacy", description: "Discord", category: "discord", target: "settings-discord-privacy", keywords: "rpc status activity buttons hide" },
  { id: "discord-style", label: "Discord status text", description: "Discord", category: "discord", target: "settings-discord-status", keywords: "rich presence status style second line text" },
  { id: "discord-artwork", label: "Discord artwork", description: "Discord", category: "discord", target: "settings-discord-artwork", keywords: "rpc rich presence cover images pixel art" },
  { id: "analysis", label: "Audio similarity model", description: "Audio analysis", category: "experimental", target: "settings-analysis-model", keywords: "local ai inference embeddings battery", macOnly: true },
  { id: "history", label: "Listening history", description: "Audio analysis", category: "experimental", target: "settings-analysis-history", keywords: "privacy delete listen scrobble record" },
  { id: "updates", label: "Automatic updates", description: "Updates", category: "updates", target: "settings-updates", keywords: "check restart install version" },
  { id: "reset", label: "Reset settings", description: "Advanced", category: "advanced", target: "settings-advanced-reset", keywords: "defaults factory restore appearance player discord" },
  { id: "diagnostics", label: "Copy diagnostics", description: "Advanced", category: "advanced", target: "settings-advanced-diagnostics", keywords: "technical system app info debugging log platform" }
];

export function matchSettingsControls(query: string, allowed: readonly SettingsCategory[]) {
  const words = normalizeSettingsSearch(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  const available = new Set(allowed);
  return SETTINGS_CONTROL_LINKS.filter(link =>
    available.has(link.category) && (!link.desktopOnly || !isAndroidApp()) && (!link.macOnly || getLocaltifyPlatformInfo().id === "mac") &&
    words.every(word => normalizeSettingsSearch(`${link.label} ${link.description} ${link.keywords}`).includes(word))
  );
}
