import { memo, useMemo } from "react";
import AppearanceSettings from "./categories/AppearanceSettings";
import PlaybackSettings from "./categories/PlaybackSettings";
import DiscordSettings from "./categories/DiscordSettings";
import LibrarySettings from "./categories/LibrarySettings";
import DownloadSettings from "./categories/DownloadSettings";
import DiscoverSettings from "./categories/DiscoverSettings";
import UpdateSettings from "./categories/UpdateSettings";
import AboutSettings from "./categories/AboutSettings";
import ExperimentalSettings from "./categories/ExperimentalSettings";
import AdvancedSettings from "./categories/AdvancedSettings";
import { detectSettingsPlatform } from "./settings.shared";
import type { PlatformInfoLike } from "./settings.shared";

// Temporary flat-prop adapter for App.tsx. Feature components below receive only
// the data they own; this adapter disappears when App becomes composition-only.
type LegacySettingsAdapterProps = { settingsCategory: string; setSettingsCategory?: (value: string) => void; [key: string]: any };

const SettingsCategoryContent = memo(function SettingsCategoryContent(p: LegacySettingsAdapterProps) {
  const fallbackPlatform = useMemo(() => detectSettingsPlatform(), []);
  const platformInfo = { ...fallbackPlatform, ...(p.platformInfo || {}) } as Required<PlatformInfoLike>;

  switch (p.settingsCategory) {
    case "appearance": return <AppearanceSettings settings={p.settings} updateSetting={p.updateSetting} coverColorSyncOptions={p.coverColorSyncOptions} selectedCoverColorSyncMode={p.selectedCoverColorSyncMode} updateCoverColorSyncMode={p.updateCoverColorSyncMode} openAdvanced={() => p.setSettingsCategory?.("advanced")} />;
    case "playback": return <PlaybackSettings settings={p.settings} updateSetting={p.updateSetting} />;
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
