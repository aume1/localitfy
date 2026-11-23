import type { PlatformInfoLike, SongLike } from "../settings.shared";
import Button from "../../../shared/ui/Button";
export default function AboutSettings({appVersion,platformInfo,songs,onViewChangelog}:{appVersion:string;platformInfo:Required<PlatformInfoLike>;songs:ReadonlyArray<SongLike>;onViewChangelog?:()=>unknown}) {
  return <section className="settingsCategoryPage settingsDeclutterPageV491 settingsAboutCleanV491" aria-label="About localtify">
    <div className="settingsCategoryHeader settingsCategoryHeaderCleanV491"><div><p className="eyebrow">About</p><h4>Localtify</h4></div><span>version {appVersion}</span></div>
    <div className="settingsPanelCard settingsFocusPanelV491 settingsAboutCardV491"><div className="settingsPanelHeader"><div><strong>Local-first music</strong></div></div>
      <div className="settingsMiniStatusV491"><span><strong>{appVersion}</strong><small>Version</small></span><span><strong>{platformInfo.label}</strong><small>Platform</small></span><span><strong>{songs.length}</strong><small>Songs</small></span></div>
      {onViewChangelog?<Button variant="secondary" size="sm" onClick={()=>void onViewChangelog()}>View what's new</Button>:null}
    </div>
  </section>;
}
