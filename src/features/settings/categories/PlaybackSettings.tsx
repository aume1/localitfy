import { lazy, Suspense, useEffect, useState } from "react";
import type { AudioEffectMode, Settings } from "../settings.types";
import type { UpdateSetting } from "../settings.shared";
import { RangeRow, ToggleRow, SettingSection, SettingsChoiceGroup } from "../settings.shared";
import { ArcDropdownMenu } from "../../../shared/ui/ArcDropdownMenu";
import ScrobbleSettings from "../../scrobbling/ScrobbleSettings";
import { isAndroidApp } from "../../../app/platform";

const PhoneScrobbleStatus = lazy(() => import("../../../platform/android/PhoneScrobbleStatus"));

export default function PlaybackSettings({ settings, updateSetting, sleepDeadline = 0 }: {
  settings: Settings;
  updateSetting: UpdateSetting;
  sleepDeadline?: number;
}) {
  const phone = isAndroidApp();
  const [supportsAnalysis, setSupportsAnalysis] = useState(false);
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    let active = true;
    if (!phone) void window.localitfy.getAnalysisStatus().then(status => { if (active) setSupportsAnalysis(status.supported && status.enabled); }).catch(() => undefined);
    return () => { active = false; };
  }, [phone, settings.experimentalMusicAnalysis]);
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.ceil((sleepDeadline - Date.now()) / 1000)));
    tick();
    if (!sleepDeadline) return;
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [sleepDeadline]);
  return <section className="settingsCategoryPage settingsDeclutterPageV491 settingsPlaybackCleanV491" aria-label="Playback settings">
    <div className="settingsCategoryHeader settingsCategoryHeaderCleanV491"><h4>Playback</h4></div>
    <div className="settingsTwoColumn settingsTwoColumnCleanV491 settingsPlaybackColumns">
      <div className="settingsPlaybackColumn">
      <SettingSection id="settings-playback-transitions" title="Transitions"
        className="settingsFocusPanelV491">
        <ToggleRow label="Crossfade" help="Blend between tracks."
          checked={settings.crossfadeEnabled} onChange={value => void updateSetting("crossfadeEnabled", value)} />
        <RangeRow label="Crossfade duration" value={settings.crossfadeSeconds} min={0} max={10} step={0.5}
          suffix="s" disabled={!settings.crossfadeEnabled} onChange={value => void updateSetting("crossfadeSeconds", value)} />
        <ToggleRow label="Gapless playback" help="Play consecutive tracks without added silence."
          checked={settings.gaplessPlayback} onChange={value => void updateSetting("gaplessPlayback", value)} />
      </SettingSection>
      <SettingSection id="settings-playback-sleep" title="Queue & sleep"
        className="settingsFocusPanelV491">
        {supportsAnalysis && settings.experimentalMusicAnalysis ? <ToggleRow label="Song radio"
          checked={settings.songRadio} onChange={value => void updateSetting("songRadio", value)} /> : null}
        <SettingsChoiceGroup label="Sleep timer" compact value={String(settings.sleepTimerMinutes)}
          options={[{value:"0",label:"Off"},{value:"15",label:"15 min"},{value:"30",label:"30 min"},{value:"60",label:"1 hour"},{value:"120",label:"2 hours"}]}
          onChange={value => void updateSetting("sleepTimerMinutes", Number(value))} />
        {sleepDeadline > 0 ? <small className="settingsHintText">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")} remaining</small> : null}
      </SettingSection>
      </div>
      <div className="settingsPlaybackColumn">
      <SettingSection id="settings-playback-listening" title="Listening"
        className="settingsFocusPanelV491">
        <RangeRow label="Playback speed" value={settings.playbackSpeed} min={0.75} max={1.5} step={0.05}
          suffix="×" onChange={value => void updateSetting("playbackSpeed", value)} />
        <ToggleRow label="Autoplay when selecting" help="Immediately play a song when selected."
          checked={settings.autoplayOnSelect} onChange={value => void updateSetting("autoplayOnSelect", value)} />
        <ToggleRow label="Remember last song" help="Restore your last selected track on startup."
          checked={settings.rememberLastSong} onChange={value => void updateSetting("rememberLastSong", value)} />
        <ToggleRow label="Remember playback position" help="Resume tracks where you left off."
          checked={settings.rememberPlaybackPosition} onChange={value => void updateSetting("rememberPlaybackPosition", value)} />
        <ToggleRow label="Volume normalization" help="Balance volume differences between tracks."
          checked={settings.volumeNormalization} onChange={value => void updateSetting("volumeNormalization", value)} />
        <ToggleRow label="Remember per-song volume" help="Use your saved level for each track."
          checked={settings.perSongVolumeMemory} onChange={value => void updateSetting("perSongVolumeMemory", value)} />
      </SettingSection>
      <SettingSection id="settings-playback-effects" title="Audio effects"
        className="settingsFocusPanelV491 settingsAudioEffectsPanel">
        <div className="settingsSelectField settingsSelectFieldV491">
          <span>Effect</span>
          <ArcDropdownMenu ariaLabel="Audio effect" value={settings.audioEffectMode}
            items={[
              { value: "normal" as AudioEffectMode, label: "Normal" },
              { value: "nightcore" as AudioEffectMode, label: "Nightcore" },
              { value: "daycore" as AudioEffectMode, label: "Slowed + reverb" }
            ]}
            onValueChange={effect => void updateSetting("audioEffectMode", effect)} />
        </div>
        <RangeRow label="Effect strength" value={settings.audioEffectAmount} min={0} max={100} step={5}
          suffix="%" disabled={settings.audioEffectMode === "normal"}
          onChange={value => void updateSetting("audioEffectAmount", value)} />
        {settings.audioEffectMode === "daycore" ? <RangeRow label="Reverb" value={settings.audioReverbAmount}
          min={0} max={70} step={5} suffix="%" onChange={value => void updateSetting("audioReverbAmount", value)} /> : null}
      </SettingSection>
      </div>
    </div>
    <div id="settings-playback-scrobbling">{phone ? <Suspense fallback={<p role="status">Loading scrobbling…</p>}><PhoneScrobbleStatus /></Suspense>
      : <ScrobbleSettings lastfmApiKey={settings.lastfmApiKey}
          saveLastfmApiKey={key => void updateSetting("lastfmApiKey", key)} />}</div>
  </section>;
}
