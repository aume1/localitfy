import { useEffect, useState } from "react";
import { Compass, ExternalLink, KeyRound, RefreshCw } from "lucide-react";
import type { Settings } from "../settings.types";
import { ToggleRow } from "../settings.shared";

type ProviderSource = "default" | "override" | "missing" | "checking" | "error";
type Props = {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => unknown;
};
const VALID_KEY = /^[a-f0-9]{32}$/i;

/** Public discovery is free to search; the Last.fm default is resolved only
 * inside Electron. Neither the key nor the .env file enters the React bundle. */
export default function DiscoverSettings({ settings, updateSetting }: Props) {
  const [source, setSource] = useState<ProviderSource>("checking");
  const [keyDraft, setKeyDraft] = useState(settings.lastfmApiKey || "");
  const [editingKey, setEditingKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => setKeyDraft(settings.lastfmApiKey || ""), [settings.lastfmApiKey]);
  async function refreshProviderStatus() {
    try {
      const response = await window.localitfy.getDiscoveries({ configuration: true });
      setSource(response.status === "configuration" ? response.lastfmSource : "error");
    } catch {
      setSource("error");
    }
  }
  useEffect(() => {
    let cancelled = false;
    void window.localitfy.getDiscoveries({ configuration: true })
      .then(response => {
        if (!cancelled) setSource(response.status === "configuration" ? response.lastfmSource : "error");
      })
      .catch(() => { if (!cancelled) setSource("error"); });
    return () => { cancelled = true; };
  }, []);

  async function saveOverride(value: string) {
    if (saving || (value && !VALID_KEY.test(value))) return;
    setSaving(true);
    try {
      await updateSetting("lastfmApiKey", value);
      await refreshProviderStatus();
      setEditingKey(false);
    } finally {
      setSaving(false);
    }
  }

  const sourceLabel = source === "default" ? "Localtify default key is configured"
    : source === "override" ? "Custom key is active"
    : source === "missing" ? "No Last.fm key configured"
    : source === "checking" ? "Checking the desktop provider" : "Provider status unavailable";

  return <section className="settingsCategoryPage discoverProviderSettings" aria-label="Discover and providers">
    <div className="settingsCategoryHeader">
      <div><p className="eyebrow">discovery</p><h4>Discover & providers</h4></div>
      <span>Music beyond your library, on your terms</span>
    </div>
    <div className="settingsPanelCard">
      <div className="settingsPanelHeader">
        <div><strong>Music discovery</strong><span>Search music without an account. Personalized suggestions are optional and use your library's track and artist names.</span></div>
        <Compass size={20} aria-hidden="true" />
      </div>
      <ToggleRow label="Enable Discover" help="When enabled, catalog and artwork searches may contact music services. Last.fm recommendations use your library metadata." checked={settings.discoverEnabled}
        onChange={value => void updateSetting("discoverEnabled", value)} />
      <p className="settingsHintText">Local music and your existing playlists remain available when Discover is off.</p>
    </div>

    <div className="settingsPanelCard">
      <div className="settingsPanelHeader">
        <div><strong>Last.fm recommendations</strong><span>Localtify uses the app's configured key by default. A personal key is optional, not required for public catalog search.</span></div>
        <KeyRound size={20} aria-hidden="true" />
      </div>
      <div className="discoverProviderStatus" role="status">
        <span className={`discoverProviderDot ${source === "default" || source === "override" ? "ready" : ""}`} aria-hidden="true" />
        <span>{sourceLabel}</span>
        <button className="settingsTinyButton" type="button" onClick={() => void refreshProviderStatus()} aria-label="Refresh provider status"><RefreshCw size={14} /></button>
      </div>
      {source === "missing" ? <p className="settingsHintText">The application has no configured default key. Your copy can still search public music, but personalized Last.fm recommendations need an application key.</p> : null}
      <details className="settingsDisclosure discoverProviderAdvanced" open={editingKey} onToggle={event => setEditingKey(event.currentTarget.open)}>
        <summary>Advanced · use a personal Last.fm key</summary>
        <div className="settingsDisclosureBody">
          <label className="settingsSelectField">
            <span>Last.fm API key override</span>
            <input type="password" value={keyDraft} autoComplete="off" spellCheck={false} maxLength={32}
              placeholder="32-character application key" onChange={event => setKeyDraft(event.currentTarget.value.trim())} />
          </label>
          <p className="settingsHintText">Only enter a Last.fm API key, never the shared secret. This override is saved in your local settings.</p>
          <div className="settingsActionRow discoverProviderActions">
            <button type="button" className="settingsActionButton settingsPrimaryAction" disabled={saving || !VALID_KEY.test(keyDraft)}
              onClick={() => void saveOverride(keyDraft)}>Use this key</button>
            {settings.lastfmApiKey ? <button type="button" className="settingsActionButton" disabled={saving}
              onClick={() => { setKeyDraft(""); void saveOverride(""); }}>Use app default</button> : null}
            <button type="button" className="settingsActionButton" onClick={() => void window.localitfy.openExternal("https://www.last.fm/api/account/create")}>
              Get an API key <ExternalLink size={14} />
            </button>
          </div>
        </div>
      </details>
    </div>

    <div className="settingsPanelCard">
      <div className="settingsPanelHeader"><div><strong>Data and privacy</strong><span>Discover is opt-in. Third-party music searches receive the terms you choose; personalized requests may send track and artist names.</span></div></div>
      <p className="settingsHintText">Default keys bundled with an installed desktop app are public identifiers, not protected secrets. Truly private credentials require a server-side proxy.</p>
    </div>
  </section>;
}
