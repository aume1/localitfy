import { useState } from "react";
import type { Settings } from "../settings.types";
import type { UpdateSetting } from "../settings.shared";
import { SettingSection, ToggleRow } from "../settings.shared";
import Button from "../../../shared/ui/Button";
import type { Song } from "../../library/song.types";
import TaggingSettings from "../../tagging/TaggingSettings";

export default function LyricsSettings({ settings, songs, updateSetting }: {
  settings: Settings; songs: readonly Song[]; updateSetting: UpdateSetting;
}) {
  const [cacheStatus, setCacheStatus] = useState("");
  const [clearing, setClearing] = useState(false);
  async function clearLyricsCache() {
    if (clearing) return;
    setClearing(true);
    setCacheStatus("");
    try {
      await window.localitfy.clearLyricsCache();
      setCacheStatus("Cached lyrics cleared.");
    } catch {
      setCacheStatus("Could not clear cached lyrics. Try again.");
    } finally {
      setClearing(false);
    }
  }
  return <section className="settingsCategoryPage" aria-label="Lyrics and tagging settings">
    <div className="settingsCategoryHeader"><h4>Lyrics & tags</h4></div>
    <SettingSection title="Lyrics" id="settings-lyrics-display"
      description="Show synced local lyrics and optionally look up missing lyrics online.">
      <ToggleRow label="Show lyrics" help="Adds lyrics controls to the player."
        checked={settings.lyricsEnabled} onChange={value => void updateSetting("lyricsEnabled", value)} />
      <ToggleRow label="Look up lyrics online"
        help="Sends track title, artist, album and duration to LRCLIB. Results are saved locally."
        checked={settings.lyricsOnlineLookup} disabled={!settings.lyricsEnabled}
        onChange={value => void updateSetting("lyricsOnlineLookup", value)} />
      <div className="settingsActionRow">
        <Button variant="secondary" size="sm" disabled={clearing} onClick={() => void clearLyricsCache()}>{clearing ? "Clearing…" : "Clear lyrics cache"}</Button>
        <Button variant="ghost" size="sm" onClick={() => void window.localitfy.openExternal("https://lrclib.net")}>About LRCLIB</Button>
      </div>
      {cacheStatus ? <p role="status" className="settingsHintText">{cacheStatus}</p> : null}
    </SettingSection>
    <details id="settings-lyrics-tagging" className="settingsDisclosure">
      <summary>MusicBrainz tagging</summary>
      <div className="settingsDisclosureBody"><TaggingSettings settings={settings} songs={songs} updateSetting={updateSetting} /></div>
    </details>
  </section>;
}
