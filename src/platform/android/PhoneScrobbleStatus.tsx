import { computerName } from "../../app/platform";
import { useEffect, useState } from "react";
import type { ScrobbleService, ScrobbleStatus } from "../../features/scrobbling/scrobble.types";
import { phoneLibrary } from "./library";
import { fromMac, markMacReachable } from "./macFeatures";
import { onSyncProgress } from "./sync";
import "../../features/scrobbling/scrobbling.css";

const SERVICES: Array<[ScrobbleService, string]> = [["lastfm", "Last.fm"], ["listenbrainz", "ListenBrainz"]];
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export default function PhoneScrobbleStatus() {
  const [status, setStatus] = useState<ScrobbleStatus | null>(null);
  const [availability, setAvailability] = useState<"loading" | "ready" | "offline" | "unpaired">("loading");
  const [unsynced, setUnsynced] = useState(0);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    let generation = 0;
    const refresh = () => {
      const version = ++generation;
      setUnsynced(phoneLibrary.pendingEvents.filter(event => event.outcome !== "active").length);
      const pairing = phoneLibrary.pairing;
      if (!pairing) { setStatus(null); setAvailability("unpaired"); return; }
      setAvailability("loading");
      const stillCurrent = () => active && version === generation && phoneLibrary.pairing?.token === pairing.token && phoneLibrary.pairing?.url === pairing.url;
      void fromMac<ScrobbleStatus>("scrobble:status", null).then(next => {
        if (stillCurrent()) { if (!next?.lastfm || !next?.listenbrainz) { setStatus(null); setAvailability("offline"); return; } setStatus(next); setAvailability("ready"); }
      }).catch(() => {
        if (stillCurrent()) { setStatus(null); setAvailability("offline"); }
      });
    };
    refresh();
    const unsubscribe = onSyncProgress(next => { if (next.phase === "done" || next.phase === "error") refresh(); });
    return () => { active = false; unsubscribe(); };
  }, [retry]);

  const computer = computerName();
  return <div className="settingsPanelCard settingsFocusPanelV491">
    <div className="settingsPanelHeader"><div><strong>Scrobbling</strong><span>Your {computer} sends plays to Last.fm or ListenBrainz when you sync.</span></div></div>
    {availability === "ready" && status ? SERVICES.map(([service, name]) => (
      <div className="scrobbleService" key={service}>
        <div className="scrobbleServiceHead"><strong>{name}</strong>
          <span>{status[service].connected ? <>Connected as <b>{status[service].username}</b></> : "Not connected"}</span></div>
      </div>
    )) : <p role="status">{availability === "unpaired" ? "Pair a computer first." : availability === "offline" ? "Connection status unavailable. Check Wi-Fi and try again." : "Checking connection…"}</p>}
    {availability === "offline" ? <button type="button" className="settingsActionButton" onClick={() => { markMacReachable(); setRetry(value => value + 1); }}>Retry</button> : null}
    <p className="settingsHintText" role="status">
      {unsynced ? `${plural(unsynced, "play")} waiting for the next sync.` : "No completed plays waiting to sync."}
      {availability === "ready" && status?.lastfm.connected ? " Last.fm accepts plays from the last 14 days." : ""}
    </p>
  </div>;
}
