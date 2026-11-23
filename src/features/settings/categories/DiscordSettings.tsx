import type { Settings } from "../settings.types";
import type { ChoiceOption, UpdateSetting } from "../settings.shared";
import { SettingsChoiceGroup, SettingSection, ToggleRow } from "../settings.shared";
import { SolidIcon } from "../../../shared/ui/SolidIcon";

export type DiscordSettingsProps = {
  settings: Settings;
  updateSetting: UpdateSetting;
  discordPreview: { badge: string; details: string; state: string };
  discordStyleOptions: ReadonlyArray<ChoiceOption>;
  discordSecondLineOptions: ReadonlyArray<ChoiceOption>;
  discordArtModeOptions: ReadonlyArray<ChoiceOption>;
};

export default function DiscordSettings({
  settings, updateSetting, discordPreview, discordStyleOptions,
  discordSecondLineOptions, discordArtModeOptions
}: DiscordSettingsProps) {
  return <section className="settingsCategoryPage discordSettingsPage" aria-label="Discord settings">
    <header className="settingsCategoryHeader discordCategoryHeader">
      <h4>Discord</h4>
      <span className="settingsConnectionState">{settings.discordEnabled ? "Activity on" : "Activity off"}</span>
    </header>
    <SettingSection title="Activity" id="settings-discord-privacy" className="discordMainControls">
      <div className="settingsMiniGrid discordToggleGrid">
        <ToggleRow label="Share listening activity" checked={settings.discordEnabled}
          onChange={value => void updateSetting("discordEnabled", value)} />
        <ToggleRow label="Privacy mode" help="Hide song details in your Discord status."
          checked={settings.discordPrivacyMode} onChange={value => void updateSetting("discordPrivacyMode", value)} />
        <ToggleRow label="Show paused status" checked={settings.discordShowPausedIdle}
          onChange={value => void updateSetting("discordShowPausedIdle", value)} />
        <ToggleRow label="Activity buttons" checked={settings.discordButtons}
          onChange={value => void updateSetting("discordButtons", value)} />
      </div>
    </SettingSection>
    <div className="settingsPanelCard discordHeroCard">
      <div className="settingsPanelHeader"><div><strong>Preview</strong></div></div>
      <div className="discordPreviewMock" aria-label="Discord activity preview">
        <span className="discordPreviewIcon"><SolidIcon name="playback" size={20} /></span>
        <div className="discordPreviewText">
          <span className="discordPreviewBadge">{discordPreview.badge}</span>
          <strong title={discordPreview.details}>{discordPreview.details}</strong>
          <small title={discordPreview.state}>{discordPreview.state}</small>
        </div>
      </div>
    </div>
    <details className="settingsDisclosure settingsDiscordExtras">
      <summary>Customize Discord status</summary>
      <div className="settingsDisclosureBody">
        <SettingSection id="settings-discord-status" title="Style">
          <SettingsChoiceGroup compact label="Discord status style" value={settings.discordActivityStyle}
            options={discordStyleOptions.map(option => ({
              value: option.id as Settings["discordActivityStyle"], label: option.name || option.label || option.id, description: option.note
            }))} onChange={value => void updateSetting("discordActivityStyle", value)} />
        </SettingSection>
        <SettingSection title="Second line">
          <SettingsChoiceGroup compact label="Discord secondary text" value={settings.discordSecondLine}
            options={discordSecondLineOptions.map(option => ({
              value: option.id as Settings["discordSecondLine"], label: option.name || option.label || option.id, description: option.note
            }))} onChange={value => void updateSetting("discordSecondLine", value)} />
        </SettingSection>
        <SettingSection id="settings-discord-artwork" title="Artwork">
          <SettingsChoiceGroup compact label="Discord artwork mode" value={settings.discordArtMode}
            options={discordArtModeOptions.map(option => ({
              value: option.id as Settings["discordArtMode"], label: option.name || option.label || option.id, description: option.note
            }))} onChange={value => void updateSetting("discordArtMode", value)} />
        </SettingSection>
      </div>
    </details>
  </section>;
}
