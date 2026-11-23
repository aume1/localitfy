import { useEffect, useRef, useState } from "react";
import { Compass, ExternalLink, KeyRound, RefreshCw } from "lucide-react";
import type { Settings } from "../settings.types";
import { ToggleRow, SettingSection } from "../settings.shared";
import Button from "../../../shared/ui/Button";

type ProviderSource = "default" | "override" | "missing" | "checking" | "error";
type Props = {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => unknown;
};
const VALID_KEY = /^[a-f0-9]{32}$/i;

export default function DiscoverSettings({ settings, updateSetting }: Props) {
  const [source, setSource] = useState<ProviderSource>("checking");
  const [keyDraft, setKeyDraft] = useState(settings.lastfmApiKey || "");
  const [editingKey, setEditingKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [lastfmCheck, setLastfmCheck] = useState<string | null>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    const version = ++requestVersion.current;
    let cancelled = false;
    setKeyDraft(settings.lastfmApiKey || "");
    setLastfmCheck(null);
    setChecking(false);
    setSource("checking");
    void window.localitfy.getDiscoveries({ configuration: true })
      .then(response => {
        if (!cancelled && requestVersion.current === version)
          setSource(response.status === "configuration" ? response.lastfmSource : "error");
      })
      .catch(() => {
        if (!cancelled && requestVersion.current === version) setSource("error");
      });
    return () => { cancelled = true; };
  }, [settings.lastfmApiKey]);
  async function refreshProviderStatus() {
    if (checking) return;
    const version = ++requestVersion.current;
    setChecking(true);
    setLastfmCheck(null);
    try {
      const response = await window.localitfy.getDiscoveries({ configuration: true, verify: true });
      if (requestVersion.current !== version) return;
      setSource(response.status === "configuration" ? response.lastfmSource : "error");
      setLastfmCheck(response.status === "configuration" ? response.lastfmCheck || null : "error");
    } catch {
      if (requestVersion.current === version) {
        setSource("error");
        setLastfmCheck("network");
      }
    } finally {
      if (requestVersion.current === version) setChecking(false);
    }
  }
  async function saveOverride(value: string) {
    if (saving || (value && !VALID_KEY.test(value))) return;
    setSaving(true);
    try {
      await updateSetting("lastfmApiKey", value);
      setEditingKey(false);
    } finally {
      setSaving(false);
    }
  }

  const sourceLabel = source === "default" ? "Localtify default key is configured"
    : source === "override" ? "Custom key is active"
    : source === "missing" ? "No Last.fm key configured"
    : source === "checking" ? "Checking the desktop provider" : "Provider status unavailable";
  const connectionLabel = lastfmCheck === "ok" ? "Last.fm connection verified."
    : lastfmCheck === "no-match" ? "Last.fm responded, but the sample track was not found."
    : lastfmCheck === "bad-key" ? "Last.fm rejected this key. Check the configured API key."
    : lastfmCheck === "rate-limited" ? "Last.fm is rate-limiting requests. Try again later."
    : lastfmCheck === "network" ? "Could not reach Last.fm from this device."
    : lastfmCheck === "http" ? "Last.fm returned an HTTP error."
    : lastfmCheck ? "Last.fm validation could not complete." : "";

  return <section className="settingsCategoryPage discoverProviderSettings" aria-label="Discover and providers">
    <div className="settingsCategoryHeader">
      <h4>Discover</h4>
    </div>
    <SettingSection id="settings-discover-enabled" title="Music discovery" icon={<Compass size={20} aria-hidden="true" />}>
      <ToggleRow label="Enable Discover" help="When enabled, catalog and artwork searches may contact music services. Last.fm recommendations use your library metadata." checked={settings.discoverEnabled}
        onChange={value => void updateSetting("discoverEnabled", value)} />
      <p className="settingsHintText">Searches may contact music providers. Your local library works without Discover.</p>
    </SettingSection>

    <SettingSection id="settings-discover-lastfm" title="Last.fm recommendations" icon={<KeyRound size={20} aria-hidden="true" />}>
      <div className="discoverProviderStatus" role="status">
        <span className={`discoverProviderDot ${lastfmCheck === "ok" ? "ready" : ""}`} aria-hidden="true" />
        <span>{sourceLabel}</span>
        {source === "error" ? <Button variant="secondary" size="sm" type="button" disabled={checking} onClick={() => void refreshProviderStatus()}>Retry status check</Button> : null}
        {source === "default" || source === "override" ? <Button variant="secondary" size="sm" className="settingsActionButton discoverProviderTestButton" type="button" disabled={checking} onClick={() => void refreshProviderStatus()}><RefreshCw size={14} aria-hidden="true" /> {checking ? "Testing…" : "Test connection"}</Button> : null}
      </div>
      {checking ? <p className="settingsHintText" role="status">Checking Last.fm…</p> : null}
      {connectionLabel ? <p className="settingsHintText" role="status">{connectionLabel}</p> : null}
      {source === "missing" ? <p className="settingsHintText">No key configured. Add one for Last.fm recommendations.</p> : null}
      <details className="settingsDisclosure discoverProviderAdvanced" open={editingKey} onToggle={event => setEditingKey(event.currentTarget.open)}>
        <summary>API key options</summary>
        <div className="settingsDisclosureBody">
          <label className="settingsSelectField">
            <span>Last.fm API key override</span>
            <input type="password" value={keyDraft} autoComplete="off" spellCheck={false} maxLength={32}
              placeholder="32-character application key" onChange={event => setKeyDraft(event.currentTarget.value.trim())} />
          </label>
          <p className="settingsHintText">Use your API key, not the shared secret. Saved locally.</p>
          <div className="settingsActionRow discoverProviderActions">
            <Button variant="primary" size="sm" type="button" className="settingsActionButton settingsPrimaryAction" disabled={saving || !VALID_KEY.test(keyDraft)}
              onClick={() => void saveOverride(keyDraft)}>Use this key</Button>
            {settings.lastfmApiKey ? <Button variant="secondary" size="sm" type="button" className="settingsActionButton" disabled={saving}
              onClick={() => { setKeyDraft(""); void saveOverride(""); }}>Use app default</Button> : null}
            <Button variant="secondary" size="sm" type="button" className="settingsActionButton" onClick={() => void window.localitfy.openExternal("https://www.last.fm/api/account/create")}>
              Get an API key <ExternalLink size={14} />
            </Button>
          </div>
        </div>
      </details>
    </SettingSection>

  </section>;
}
