import type { ChoiceOption, SongLike, UpdateSetting } from "../settings.shared";
import Button from "../../../shared/ui/Button";
import { SettingSection } from "../settings.shared";
import type { Settings } from "../settings.types";
import WatchedFoldersSettings from "../../library/WatchedFoldersSettings";
import { lazy, Suspense } from "react";
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
  metadataCleanPreview?: { changedCount?: number; skippedCount?: number; titleFixCount?: number; artistFixCount?: number; albumFixCount?: number; items?: Array<{ id: string; before?: {title?:string;artist?:string}; after?: {title?:string;artist?:string} }> } | null;
  applyMetadataCleanPreviewAction?: () => void | Promise<void>;
  cancelMetadataCleanPreviewAction?: () => void;
  undoLastMetadataCleanAction?: () => void | Promise<void>;
  metadataUndoCount: number;
  rebuildSearchIndexAction: () => void;
  libraryScanMessage: string;
  cleanupOptions: ReadonlyArray<ChoiceOption>;
};
export default function LibrarySettings(p: LibrarySettingsProps) {
  const preview = p.metadataCleanPreview;
  return <section className="settingsCategoryPage" aria-label="Library settings"><div className="settingsCategoryHeader"><div><h4>{isAndroidApp() ? `sync with your ${computerName()}` : "Library"}</h4></div></div>{isAndroidApp() ? <Suspense fallback={null}><AndroidSyncSettings /></Suspense> : <><div id="settings-library-folders"><WatchedFoldersSettings settings={p.settings} updateSetting={p.updateSetting} /></div><PhoneSyncSettings /></>}{!isAndroidApp() ? <SettingSection title="Artwork" id="settings-library-artwork"><Button disabled={p.pixelArtBusy || !p.songs.length} onClick={() => { if (window.confirm("Replace all song covers with random artwork?")) void p.randomizeAllCovers(); }}>{p.pixelArtBusy ? "Rerolling…" : "Reroll all covers"}</Button></SettingSection> : null}{isAndroidApp() ? null : <div id="settings-library-cleanup" className="settingsPanelCard metadataCleanerPanelV441"><div className="settingsPanelHeader metadataCleanerHeaderV440"><div><strong>Clean title tool</strong></div></div><div className="metadataCleanerModeGridV441">{p.cleanupOptions.map((option) => <button key={option.id} className={`cleanerOptionV440 ${p.settings.discordTitleCleanup === option.id ? "active" : ""}`} type="button" aria-pressed={p.settings.discordTitleCleanup === option.id} onClick={() => void p.updateSetting("discordTitleCleanup", option.id as Settings["discordTitleCleanup"])}><strong>{option.name}</strong><small>{option.note}</small></button>)}</div><div className="settingsActionRow metadataCleanerActionRowV440"><button className="settingsActionButton settingsPrimaryAction" type="button" disabled={p.libraryScanBusy} onClick={p.cleanLibraryMetadataAction}>preview all fixes</button><button className="settingsActionButton" type="button" disabled={p.libraryScanBusy || !p.metadataUndoCount} onClick={() => void p.undoLastMetadataCleanAction?.()}>undo last clean {p.metadataUndoCount ? `(${p.metadataUndoCount})` : ""}</button><button className="settingsActionButton" type="button" disabled={p.libraryScanBusy} onClick={() => void p.repairMovedSongsAction()}>relink moved songs</button><button className="settingsActionButton settingsGhostAction" type="button" disabled={p.libraryScanBusy} onClick={p.rebuildSearchIndexAction}>rebuild search</button></div>
    {preview ? <div className="metadataCleanerPreviewBoxV425 metadataCleanerPreviewBoxV440" role="status" aria-live="polite"><div className="metadataCleanerPreviewHeadV425 metadataCleanerPreviewHeadV440"><span>preview before applying</span><strong>{preview.changedCount || 0} fix{(preview.changedCount || 0) === 1 ? "" : "es"} ready</strong><small>{preview.skippedCount || 0} skipped · {preview.titleFixCount || 0} titles · {preview.artistFixCount || 0} artists · {preview.albumFixCount || 0} albums</small></div><div className="metadataCleanerPreviewListV425 metadataCleanerPreviewListV440">{(preview.items || []).slice(0, 6).map((item) => <div className="metadataCleanerPreviewItemV425 metadataCleanerPreviewItemV440" key={item.id}><span><small>before</small><strong>{item.before?.title || "untitled"}</strong><em>{item.before?.artist || "unknown artist"}</em></span><b className="metadataCleanerArrowV440" aria-hidden="true"><i /></b><span><small>after</small><strong>{item.after?.title || "untitled"}</strong><em>{item.after?.artist || "unknown artist"}</em></span></div>)}</div><div className="metadataCleanerPreviewActionsV425 metadataCleanerPreviewActionsV440"><button className="settingsActionButton settingsPrimaryAction" type="button" disabled={p.libraryScanBusy || !(preview.changedCount || 0)} onClick={() => void p.applyMetadataCleanPreviewAction?.()}>apply preview</button><button className="settingsActionButton settingsGhostAction" type="button" disabled={p.libraryScanBusy} onClick={() => p.cancelMetadataCleanPreviewAction?.()}>cancel</button></div></div> : null}
    {p.libraryScanMessage ? <p className="settingsHintText">{p.libraryScanMessage}</p> : null}</div>}</section>;
}
