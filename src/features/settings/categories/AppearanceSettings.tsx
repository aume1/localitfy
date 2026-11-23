import { Check } from "lucide-react";
import SidebarTabsSettings from "./SidebarTabsSettings";
import { isAndroidApp } from "../../../app/platform";
import type { Settings } from "../settings.types";
import { ToggleRow, RangeRow, SettingsChoiceGroup } from "../settings.shared";
import type { ChoiceOption, UpdateSetting } from "../settings.shared";
import Button from "../../../shared/ui/Button";
import { normalizeThemeId } from "../theme.utils";

export type AppearanceSettingsProps = {
  settings: Settings;
  updateSetting: UpdateSetting;
  coverColorSyncOptions: ReadonlyArray<ChoiceOption>;
  selectedCoverColorSyncMode: string;
  updateCoverColorSyncMode: (value: string) => void | Promise<void>;
  openAdvanced: () => void;
};

export default function AppearanceSettings(props: AppearanceSettingsProps) {
  const { settings, updateSetting } = props;
  const phone = isAndroidApp();
  const selected = normalizeThemeId(settings.theme);
  return (
    <section className="settingsCategoryPage settingsAppearanceCleanV491" aria-label="Appearance settings">
      <header className="settingsCategoryHeader">
        <div><h4>Appearance</h4></div>
        <Button variant="secondary" size="sm" className="settingsTinyButton" onClick={props.openAdvanced}>Advanced options</Button>
      </header>
      <div id="settings-appearance-theme" className="settingsPanelCard">
        <div className="settingsPanelHeader"><div><strong>Theme</strong><span>Choose the appearance of Localtify.</span></div></div>
        <div className="settingsModeGrid" role="group" aria-label="App theme">
          {(["light", "dark"] as const).map(mode => (
            <button key={mode} type="button" className="settingsModeButton" aria-pressed={selected === mode}
              onClick={() => void updateSetting("theme", mode)}>
              <span className="settingsModePreview" data-preview-mode={mode} aria-hidden="true">
                <span className="settingsModePreviewNav"><i/><i/><i/></span>
                <span className="settingsModePreviewBody"><i/><span><i/><i/><i/></span><i/></span>
                {selected === mode ? <span className="settingsModeCheck"><Check size={14}/></span> : null}
              </span>
              <strong>{mode === "light" ? "Light" : "Dark"}</strong>
            </button>
          ))}
        </div>
      </div>

      <div id="settings-appearance-ambience" className="settingsPanelCard settingsCoverTintCard">
        <div className="settingsPanelHeader"><div><strong>Artwork ambience</strong><span>Use the current cover as a blurred background throughout Localtify.</span></div></div>
        <SettingsChoiceGroup label="Live cover color strength" compact
          value={props.selectedCoverColorSyncMode}
          options={props.coverColorSyncOptions.map(option => ({ value: option.id, label: option.label || option.name || option.id, description: option.note }))}
          onChange={mode => void props.updateCoverColorSyncMode(mode)} />
      </div>

      <div id="settings-appearance-layout" className="settingsPanelCard settingsLayoutControls">
        <div className="settingsPanelHeader">
          <div><strong>Layout & motion</strong><span>Customize how the app feels across all screens.</span></div>
        </div>
        <div className="settingsMiniGrid">
          {phone ? null : <ToggleRow label="Compact player" help="Use a smaller bottom playback bar." checked={settings.compactPlayer} onChange={(value) => void updateSetting("compactPlayer", value)} />}
          <ToggleRow label="Compact library" help="Fit more songs into each list." checked={settings.denseList} onChange={(value) => void updateSetting("denseList", value)} />
          <ToggleRow label="Reduce motion" help="Limit animation and transitions." checked={settings.reducedMotion} onChange={(value) => void updateSetting("reducedMotion", value)} />
          <ToggleRow label="Floating notes" help="Show small notes around the player." checked={settings.showFloatingNotes} onChange={value => void updateSetting("showFloatingNotes", value)} />
          <ToggleRow label="Show visualizer" help="Show music visualization while playing." checked={settings.showVisualizer} onChange={value => void updateSetting("showVisualizer", value)} />
          <ToggleRow label="Rounded corners" help="Use softer corners on cards and buttons." checked={settings.softCorners} onChange={(value) => void updateSetting("softCorners", value)} />
          <ToggleRow label="Animated glow" help="Show ambient player lighting." checked={settings.animatedGlow} onChange={(value) => void updateSetting("animatedGlow", value)} />
          {phone ? null : <ToggleRow label="Cat buddy" help="Show a little cat that follows the cursor." checked={settings.catBuddyEnabled === true} onChange={(value) => void updateSetting("catBuddyEnabled", value)} />}
          {phone ? null : <ToggleRow label="Idle screensaver" help={`Show the "am waiting.." screen after 5 minutes without playback.`} checked={settings.idleScreensaverEnabled !== false} onChange={(value) => void updateSetting("idleScreensaverEnabled", value)} />}
        </div>
      </div>

      {!phone ? <div id="settings-appearance-sidebar" className="settingsPanelCard">
        <div className="settingsPanelHeader"><div><strong>Sidebar layout</strong><span>Choose icons only, full labels, or expand on hover.</span></div></div>
        <SettingsChoiceGroup compact label="Sidebar layout" value={settings.sidebarBehavior}
          options={[{ value: "slim", label: "Collapsed" }, { value: "fixed", label: "Expanded" }, { value: "hover", label: "On hover" }]}
          onChange={mode => void updateSetting("sidebarBehavior", mode)} />
      </div> : null}


      <div id="settings-appearance-home" className="settingsPanelCard">
        <div className="settingsPanelHeader"><div><strong>Home & library</strong><span>Choose the layout and artwork presentation you see every day.</span></div></div>
        <SettingsChoiceGroup label="Home layout" compact value={settings.homeLayoutMode}
          options={[{value:"compact",label:"Compact"},{value:"balanced",label:"Balanced"},{value:"bigHero",label:"Large artwork"}]}
          onChange={value => void updateSetting("homeLayoutMode", value)} />
        <SettingsChoiceGroup label="Home banner" compact value={settings.homeBannerType}
          options={[{value:"dynamic",label:"Dynamic"},{value:"albumCover",label:"Album cover"},{value:"cleanBlack",label:"Minimal"},{value:"none",label:"Hidden"}]}
          onChange={value => void updateSetting("homeBannerType", value)} />
        <SettingsChoiceGroup label="Card backgrounds" compact value={settings.mediaCardBackground}
          options={[{value:"solid",label:"Solid"},{value:"glassy",label:"Soft"},{value:"oledFlat",label:"OLED"}]}
          onChange={value => void updateSetting("mediaCardBackground", value)} />
        <RangeRow label="Hero artwork brightness" value={settings.homeHeroCoverBrightness} min={0.65} max={1.55} step={0.05}
          onChange={value => void updateSetting("homeHeroCoverBrightness", value)} />
        <ToggleRow label="Show hero label" help="Display the small label on the Home hero." checked={settings.showHeroBadge}
          onChange={value => void updateSetting("showHeroBadge", value)} />
      </div>
      <div id="settings-appearance-player" className="settingsPanelCard">
        <div className="settingsPanelHeader"><div><strong>Fullscreen player</strong><span>Change its background without affecting audio or lyrics.</span></div></div>
        <SettingsChoiceGroup compact label="Player background" value={settings.playerBackgroundStyle}
          options={[{value:"flat",label:"Flat"},{value:"coverBlur",label:"Artwork blur"},{value:"oledBlack",label:"OLED black"}]}
          onChange={value => void updateSetting("playerBackgroundStyle", value)} />
        <SettingsChoiceGroup compact label="Animated artwork" value={settings.gifVisualsMode}
          options={[{value:"none",label:"Off"},{value:"loadingOnly",label:"Only while loading"},{value:"everywhere",label:"Everywhere"}]}
          onChange={value => void updateSetting("gifVisualsMode", value)} />
      </div>
      <details id="settings-appearance-tabs" className="settingsDisclosure settingsSidebarDisclosure">
        <summary>{phone ? <>Tabs <span>Choose the pages at the bottom</span></> : <>Sidebar arrangement <span>Reorder or hide sections</span></>}</summary>
        <div className="settingsDisclosureBody"><SidebarTabsSettings settings={settings} updateSetting={updateSetting} /></div>
      </details>
    </section>
  );
}
