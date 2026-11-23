import type { Settings } from "../settings.types";
import type { UpdateSetting } from "../settings.shared";
import { SettingsChoiceGroup, SettingSection, ToggleRow } from "../settings.shared";
import Button from "../../../shared/ui/Button";

export default function DownloadSettings({ settings, updateSetting, downloadFolderLabel, chooseDownloadFolder }: {
  settings: Settings;
  updateSetting: UpdateSetting;
  downloadFolderLabel: string;
  chooseDownloadFolder: () => void | Promise<void>;
}) {
  return <section className="settingsCategoryPage settingsDeclutterPageV491 settingsDownloadsCleanV491" aria-label="Download settings">
    <div className="settingsCategoryHeader"><h4>Downloads</h4></div>
    <div id="settings-downloads-quality" className="settingsGrid twoCols downloadSettingsGridV031">
      <SettingSection title="Audio quality" description="Output bitrate when conversion is enabled."
        className="settingsFocusPanelV491">
        <SettingsChoiceGroup<Settings["downloadQuality"]> label="Audio quality" value={settings.downloadQuality}
          disabled={settings.downloadKeepOriginal}
          options={[
            { value: "best", label: "Best", description: "Highest available" },
            { value: "320", label: "320 kbps", description: "High bitrate" },
            { value: "256", label: "256 kbps", description: "Balanced" },
            { value: "192", label: "192 kbps", description: "Smaller files" }
          ]}
          onChange={value => void updateSetting("downloadQuality", value)} />
      </SettingSection>
      <SettingSection title="Output format" description="Converting can't restore quality missing from the source."
        className="settingsFocusPanelV491">
        <SettingsChoiceGroup<Settings["downloadFormat"]> label="Download format" value={settings.downloadFormat}
          disabled={settings.downloadKeepOriginal}
          options={[
            { value: "mp3", label: "MP3", description: "Compatible" },
            { value: "flac", label: "FLAC", description: "Lossless container" },
            { value: "wav", label: "WAV", description: "Uncompressed" }
          ]}
          onChange={value => void updateSetting("downloadFormat", value)} />
      </SettingSection>
    </div>
    <SettingSection id="settings-downloads-import" title="Import behavior" description="Choose what happens when a download completes."
      className="downloadToggleStackV031 settingsFocusPanelV491">
      <ToggleRow label="Keep original audio" help="Save Opus or M4A without converting. Quality and format options are disabled."
        checked={settings.downloadKeepOriginal} onChange={value => void updateSetting("downloadKeepOriginal", value)} />
      <ToggleRow label="Automatically add to library" help="Import completed audio into your local music library."
        checked={settings.downloadAutoAdd} onChange={value => void updateSetting("downloadAutoAdd", value)} />
      <ToggleRow label="Clean downloaded titles" help="Remove common source labels and unnecessary filename clutter."
        checked={settings.downloadCleanTitle} onChange={value => void updateSetting("downloadCleanTitle", value)} />
    </SettingSection>
    <SettingSection id="settings-downloads-folder" title="Download location" description="Where downloaded files are saved."
      className="downloadFolderGroupV031 settingsFocusPanelV491">
      <div className="folderPickerRow">
        <code title={settings.downloadFolder || downloadFolderLabel || "Default downloads folder"}>
          {settings.downloadFolder || downloadFolderLabel || "Default downloads folder"}
        </code>
        <Button variant="secondary" size="sm" onClick={() => void chooseDownloadFolder()}>Choose folder</Button>
        {settings.downloadFolder ? <Button variant="ghost" size="sm"
          onClick={() => void updateSetting("downloadFolder", "")}>Use default</Button> : null}
      </div>
      <p className="settingsHintText">Leave the path empty to use Localtify's default downloads folder.</p>
    </SettingSection>
  </section>;
}
