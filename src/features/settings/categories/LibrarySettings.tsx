import { lazy, Suspense } from "react";
import type { ChoiceOption, SongLike, UpdateSetting } from "../settings.shared";
import { SettingSection } from "../settings.shared";
import type { Settings } from "../settings.types";
import WatchedFoldersSettings from "../../library/WatchedFoldersSettings";
import PhoneSyncSettings from "../../sync/PhoneSyncSettings";
import { isAndroidApp, computerName } from "../../../app/platform";

const AndroidSyncSettings = lazy(() => import("../../../platform/android/AndroidSyncSettings"));

export type LibrarySettingsProps = {
  settings: Settings;
  updateSetting: UpdateSetting;
  songs: ReadonlyArray<SongLike>;
  libraryScanBusy: boolean;
  cleanLibraryMetadataAction: () => void;
  repairMovedSongsAction: () => void | Promise<void>;
  pixelArtBusy: boolean;
  randomizeAllCovers: () => unknown;
  metadataCleanPreview?: {
    changedCount?: number; skippedCount?: number; titleFixCount?: number; artistFixCount?: number; albumFixCount?: number;
    items?: Array<{ id: string; before?: { title?: string; artist?: string }; after?: { title?: string; artist?: string } }>;
  } | null;
  applyMetadataCleanPreviewAction?: () => void | Promise<void>;
  cancelMetadataCleanPreviewAction?: () => void;
  undoLastMetadataCleanAction?: () => void | Promise<void>;
  metadataUndoCount: number;
  rebuildSearchIndexAction: () => void;
  libraryScanMessage: string;
  cleanupOptions: ReadonlyArray<ChoiceOption>;
};

export default function LibrarySettings(p: LibrarySettingsProps) {
  const phone = isAndroidApp();
  const preview = p.metadataCleanPreview;
  return <section className="settingsCategoryPage settingsLibraryClean" aria-label="Library settings">
    <header className="settingsCategoryHeader"><h4>{phone ? `Sync with your ${computerName()}` : "Library"}</h4></header>
    {phone ? <div id="settings-library-sync"><Suspense fallback={<p role="status">Loading sync…</p>}><AndroidSyncSettings /></Suspense></div> : <>
      <div id="settings-library-folders"><WatchedFoldersSettings settings={p.settings} updateSetting={p.updateSetting} /></div>
      <div id="settings-library-sync"><PhoneSyncSettings /></div>
      <SettingSection title="Artwork" id="settings-library-artwork" className="settingsArtworkSection">
        <div className="settingsActionRow">
          <button className="settingsActionButton" type="button" disabled={p.pixelArtBusy || !p.songs.length}
            onClick={() => { if (window.confirm("Replace all song covers with random artwork?")) void p.randomizeAllCovers(); }}>
            {p.pixelArtBusy ? "Updating covers…" : "Shuffle artwork"}
          </button>
        </div>
      </SettingSection>
      <details id="settings-library-cleanup" className="settingsDisclosure settingsMaintenanceDisclosure">
        <summary>Library maintenance</summary>
        <div className="settingsDisclosureBody">
          <div className="settingsPanelHeader"><div><strong>Title cleanup</strong></div></div>
          <div className="metadataCleanerModeGridV441" role="group" aria-label="Title cleanup strength">
            {p.cleanupOptions.map(option => <button key={option.id} type="button"
              className={`cleanerOptionV440 ${p.settings.discordTitleCleanup === option.id ? "active" : ""}`}
              aria-pressed={p.settings.discordTitleCleanup === option.id}
              title={option.note || option.name}
              onClick={() => void p.updateSetting("discordTitleCleanup", option.id as Settings["discordTitleCleanup"])}>
              <strong>{option.name}</strong>
            </button>)}
          </div>
          <div className="settingsActionRow metadataCleanerActionRowV440">
            <button className="settingsActionButton settingsPrimaryAction" type="button" disabled={p.libraryScanBusy}
              onClick={p.cleanLibraryMetadataAction}>Preview cleanup</button>
            <button className="settingsActionButton" type="button" disabled={p.libraryScanBusy || !p.metadataUndoCount}
              onClick={() => void p.undoLastMetadataCleanAction?.()}>Undo{p.metadataUndoCount ? ` (${p.metadataUndoCount})` : ""}</button>
            <button className="settingsActionButton" type="button" disabled={p.libraryScanBusy}
              onClick={() => void p.repairMovedSongsAction()}>Relink files</button>
            <button className="settingsActionButton" type="button" disabled={p.libraryScanBusy}
              onClick={p.rebuildSearchIndexAction}>Rebuild search</button>
          </div>
          {preview ? <div className="metadataCleanerPreviewBoxV425 metadataCleanerPreviewBoxV440" role="status" aria-live="polite">
            <div className="metadataCleanerPreviewHeadV425 metadataCleanerPreviewHeadV440">
              <strong>{preview.changedCount || 0} changes</strong>
              <small>{preview.skippedCount || 0} skipped · {preview.titleFixCount || 0} titles · {preview.artistFixCount || 0} artists · {preview.albumFixCount || 0} albums</small>
            </div>
            <div className="metadataCleanerPreviewListV425 metadataCleanerPreviewListV440">
              {(preview.items || []).slice(0, 6).map(item => <div className="metadataCleanerPreviewItemV425 metadataCleanerPreviewItemV440" key={item.id}>
                <span><small>Before</small><strong>{item.before?.title || "Untitled"}</strong><em>{item.before?.artist || "Unknown artist"}</em></span>
                <span><small>After</small><strong>{item.after?.title || "Untitled"}</strong><em>{item.after?.artist || "Unknown artist"}</em></span>
              </div>)}
            </div>
            <div className="metadataCleanerPreviewActionsV425 metadataCleanerPreviewActionsV440">
              <button className="settingsActionButton settingsPrimaryAction" type="button" disabled={p.libraryScanBusy || !(preview.changedCount || 0)}
                onClick={() => void p.applyMetadataCleanPreviewAction?.()}>Apply changes</button>
              <button className="settingsActionButton" type="button" disabled={p.libraryScanBusy}
                onClick={() => p.cancelMetadataCleanPreviewAction?.()}>Cancel</button>
            </div>
          </div> : null}
          {p.libraryScanMessage ? <p className="settingsHintText" role="status">{p.libraryScanMessage}</p> : null}
        </div>
      </details>
    </>}
  </section>;
}
