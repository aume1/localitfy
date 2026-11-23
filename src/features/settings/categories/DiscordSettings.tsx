import type { Settings } from "../settings.types";
import type { ChoiceOption, UpdateSetting } from "../settings.shared";
import { SettingsChoiceGroup, SettingSection, ToggleRow } from "../settings.shared";

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
    <div className="settingsCategoryHeader discordCategoryHeader">
      <div><h4>Discord</h4><p className="settingsHintText">Choose exactly what your friends can see while you listen.</p></div>
      <span>{settings.discordEnabled ? "Activity enabled" : "Activity hidden"}</span>
    </div>
    <div className="settingsPanelCard discordHeroCard">
      <div className="discordPreviewMock" aria-label="Discord activity preview">
        <span>{discordPreview.badge}</span>
        <strong>{discordPreview.details}</strong>
        <small>{discordPreview.state}</small>
      </div>
      <div className="discordHeroCopy">
        <strong>Live preview</strong>
        <span>{settings.discordEnabled ? "Preview of your current presence." : "Configure your presence now; nothing is shared until Discord activity is enabled."}</span>
      </div>
    </div>
    <SettingSection title="Privacy & visibility" id="settings-discord-privacy"
      description="Discord receives your listening status only while this feature is enabled."
      className="discordMainControls">
      <div className="settingsMiniGrid discordToggleGrid">
        <ToggleRow label="Enable Discord activity" help="Show Localtify in your Discord status."
          checked={settings.discordEnabled} onChange={value => void updateSetting("discordEnabled", value)} />
        <ToggleRow label="Privacy mode" help="Hide the exact song and show a generic listening status."
          checked={settings.discordPrivacyMode}
          onChange={value => void updateSetting("discordPrivacyMode", value)} />
        <ToggleRow label="Paused and idle status" help="Keep an idle status when playback pauses."
          checked={settings.discordShowPausedIdle}
          onChange={value => void updateSetting("discordShowPausedIdle", value)} />
        <ToggleRow label="Activity buttons" help="Show optional public music links in your status."
          checked={settings.discordButtons}
          onChange={value => void updateSetting("discordButtons", value)} />
      </div>
    </SettingSection>
    <div className="settingsTwoColumn discordSettingsGrid">
      <SettingSection id="settings-discord-status" title="Status style" description="How your listening activity is described.">
        <SettingsChoiceGroup label="Discord status style" value={settings.discordActivityStyle}
          options={discordStyleOptions.map(option => ({
            value: option.id as Settings["discordActivityStyle"], label: option.name || option.label || option.id, description: option.note
          }))} onChange={value => void updateSetting("discordActivityStyle", value)} />
      </SettingSection>
      <SettingSection title="Second line" description="The smaller line below the song title.">
        <SettingsChoiceGroup label="Discord secondary text" value={settings.discordSecondLine}
          options={discordSecondLineOptions.map(option => ({
            value: option.id as Settings["discordSecondLine"], label: option.name || option.label || option.id, description: option.note
          }))} onChange={value => void updateSetting("discordSecondLine", value)} />
      </SettingSection>
    </div>
    <SettingSection id="settings-discord-artwork" title="Artwork" description="The cover displayed with your Discord presence."
      className="discordArtworkCard">
      <SettingsChoiceGroup label="Discord artwork mode" value={settings.discordArtMode}
        options={discordArtModeOptions.map(option => ({
          value: option.id as Settings["discordArtMode"], label: option.name || option.label || option.id, description: option.note
        }))} onChange={value => void updateSetting("discordArtMode", value)} />
      <p className="settingsHintText">Pixel shuffle rotates through available artwork before repeating.</p>
    </SettingSection>
  </section>;
}
