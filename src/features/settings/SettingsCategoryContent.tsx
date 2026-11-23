import { memo } from "react";
import type { Song } from "../library/song.types";
import type { SettingsCategory } from "./settings.types";
import type { AppearanceSettingsProps } from "./categories/AppearanceSettings";
import type { DiscordSettingsProps } from "./categories/DiscordSettings";
import type { LibrarySettingsProps } from "./categories/LibrarySettings";
import type { AdvancedSettingsProps } from "./categories/AdvancedSettings";
import AppearanceSettings from "./categories/AppearanceSettings";
import PlaybackSettings from "./categories/PlaybackSettings";
import DiscordSettings from "./categories/DiscordSettings";
import LibrarySettings from "./categories/LibrarySettings";
import DownloadSettings from "./categories/DownloadSettings";
import DiscoverSettings from "./categories/DiscoverSettings";
import UpdateSettings from "./categories/UpdateSettings";
import AboutSettings from "./categories/AboutSettings";
import ExperimentalSettings from "./categories/ExperimentalSettings";
import LyricsSettings from "./categories/LyricsSettings";
import AdvancedSettings from "./categories/AdvancedSettings";

type SettingsCategoryContentProps =
  Pick<LibrarySettingsProps,
    "settings" | "updateSetting" | "libraryScanBusy" |
    "cleanLibraryMetadataAction" | "repairMovedSongsAction" | "metadataCleanPreview" |
    "applyMetadataCleanPreviewAction" | "cancelMetadataCleanPreviewAction" |
    "undoLastMetadataCleanAction" | "metadataUndoCount" | "rebuildSearchIndexAction" |
    "libraryScanMessage" | "pixelArtBusy" | "randomizeAllCovers"
  > &
  Pick<AdvancedSettingsProps,
    "diagnosticsInfo" | "diagnosticsCopied" | "copyDiagnosticsInfo" | "updatePrompt" |
    "manualUpdateCheck" | "askUpdaterToInstall" | "libraryRenderLimitRef" |
    "setLibraryRenderLimit" | "platformInfo" | "resetDiscordSettings" |
    "resetAppearanceSettings" | "resetPlayerLayoutSettings" |
    "resetLibraryLayoutSettings" | "resetAllSettingsSafely"
  > & {
    songs: readonly Song[];
    settingsCategory: SettingsCategory;
    setSettingsCategory?: (category: SettingsCategory) => void;
    APP_VERSION: string;
    INITIAL_LIBRARY_RENDER_LIMIT: number;
    coverColorSyncOptions: AppearanceSettingsProps["coverColorSyncOptions"];
    selectedCoverColorSyncMode: AppearanceSettingsProps["selectedCoverColorSyncMode"];
    updateCoverColorSyncMode: AppearanceSettingsProps["updateCoverColorSyncMode"];
    discordPreview: DiscordSettingsProps["discordPreview"];
    discordStyleOptions: DiscordSettingsProps["discordStyleOptions"];
    discordSecondLineOptions: DiscordSettingsProps["discordSecondLineOptions"];
    discordArtModeOptions: DiscordSettingsProps["discordArtModeOptions"];
    discordCleanupOptions: LibrarySettingsProps["cleanupOptions"];
    downloadFolderLabel: string;
    chooseDownloadFolder: () => void | Promise<void>;
    askUpdaterToDownload: () => unknown;
    openUpdateChangelog: () => unknown;
    lastUpdateCheckedLabel: string;
  };

const SettingsCategoryContent = memo(function SettingsCategoryContent(p: SettingsCategoryContentProps) {
  const platformInfo = p.platformInfo;

  switch (p.settingsCategory) {
    case "appearance": return <AppearanceSettings settings={p.settings} updateSetting={p.updateSetting} coverColorSyncOptions={p.coverColorSyncOptions} selectedCoverColorSyncMode={p.selectedCoverColorSyncMode} updateCoverColorSyncMode={p.updateCoverColorSyncMode} openAdvanced={() => p.setSettingsCategory?.("advanced")} />;
    case "playback": return <PlaybackSettings settings={p.settings} updateSetting={p.updateSetting} />;
    case "lyrics": return <LyricsSettings settings={p.settings} songs={p.songs || []} updateSetting={p.updateSetting} />;
    case "discord": return <DiscordSettings settings={p.settings} updateSetting={p.updateSetting} discordPreview={p.discordPreview} discordStyleOptions={p.discordStyleOptions} discordSecondLineOptions={p.discordSecondLineOptions} discordArtModeOptions={p.discordArtModeOptions} />;
    case "covers":
    case "library":
    case "metadata": return <LibrarySettings settings={p.settings} updateSetting={p.updateSetting} songs={p.songs} libraryScanBusy={p.libraryScanBusy} cleanLibraryMetadataAction={p.cleanLibraryMetadataAction} repairMovedSongsAction={p.repairMovedSongsAction} pixelArtBusy={p.pixelArtBusy} randomizeAllCovers={p.randomizeAllCovers} metadataCleanPreview={p.metadataCleanPreview} applyMetadataCleanPreviewAction={p.applyMetadataCleanPreviewAction} cancelMetadataCleanPreviewAction={p.cancelMetadataCleanPreviewAction} undoLastMetadataCleanAction={p.undoLastMetadataCleanAction} metadataUndoCount={p.metadataUndoCount || 0} rebuildSearchIndexAction={p.rebuildSearchIndexAction} libraryScanMessage={p.libraryScanMessage} cleanupOptions={p.discordCleanupOptions} />;
    case "discover": return <DiscoverSettings settings={p.settings} updateSetting={p.updateSetting} />;
    case "downloads": return <DownloadSettings settings={p.settings} updateSetting={p.updateSetting} downloadFolderLabel={p.downloadFolderLabel} chooseDownloadFolder={p.chooseDownloadFolder} />;
    case "updates": return <UpdateSettings settings={p.settings} updateSetting={p.updateSetting} appVersion={p.APP_VERSION} lastUpdateCheckedLabel={p.lastUpdateCheckedLabel} updatePrompt={p.updatePrompt} manualUpdateCheck={p.manualUpdateCheck} askUpdaterToDownload={p.askUpdaterToDownload} askUpdaterToInstall={p.askUpdaterToInstall} openUpdateChangelog={p.openUpdateChangelog} />;
    case "about": return <AboutSettings appVersion={p.APP_VERSION} platformInfo={platformInfo} songs={p.songs} onViewChangelog={p.openUpdateChangelog} />;
    case "experimental": return <ExperimentalSettings settings={p.settings} songs={p.songs || []} updateSetting={p.updateSetting} />;
    case "advanced": return <AdvancedSettings settings={p.settings} updateSetting={p.updateSetting} appVersion={p.APP_VERSION} diagnosticsInfo={p.diagnosticsInfo} diagnosticsCopied={p.diagnosticsCopied} copyDiagnosticsInfo={p.copyDiagnosticsInfo} updatePrompt={p.updatePrompt} manualUpdateCheck={p.manualUpdateCheck} askUpdaterToInstall={p.askUpdaterToInstall} libraryScanBusy={p.libraryScanBusy} rebuildSearchIndexAction={p.rebuildSearchIndexAction} libraryRenderLimitRef={p.libraryRenderLimitRef} initialLibraryRenderLimit={p.INITIAL_LIBRARY_RENDER_LIMIT} setLibraryRenderLimit={p.setLibraryRenderLimit} platformInfo={platformInfo} resetDiscordSettings={p.resetDiscordSettings} resetAppearanceSettings={p.resetAppearanceSettings} resetPlayerLayoutSettings={p.resetPlayerLayoutSettings} resetLibraryLayoutSettings={p.resetLibraryLayoutSettings} resetAllSettingsSafely={p.resetAllSettingsSafely} />;
    default: return null;
  }
});
export default SettingsCategoryContent;
