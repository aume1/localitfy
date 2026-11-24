import { computerName } from "../../app/platform";
import { useEffect, useRef, useState } from "react";
import { RefreshCw, Smartphone } from "lucide-react";
import { phoneLibrary } from "./library";
import { archivePausedPairing, forgetMac, getSyncProgress, isSyncing, onSyncProgress, pairWithMac, restorePausedPairing, syncNow, type SyncProgress } from "./sync";
import { getLiveStatus, onLiveEvent, restartLiveConnection } from "./live";
import "../../features/sync/phone-sync.css";

function formatBytes(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.max(0, Math.round(bytes / 1e6))} MB`;
}

function ago(time: number) {
  const minutes = Math.floor((Date.now() - time) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.floor(hours / 24)} days ago`;
}

/** Phone side of sync: pair with the Mac once, then sync on demand (and automatically on launch). */
export default function AndroidSyncSettings() {
  const [progress, setProgress] = useState<SyncProgress>(getSyncProgress);
  const [paired, setPaired] = useState(Boolean(phoneLibrary.pairing));
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const operation = useRef(false);

  const [live, setLive] = useState(getLiveStatus);

  useEffect(() => onSyncProgress(setProgress), []);
  useEffect(() => onLiveEvent((event) => { if (event.type === "connection") setLive(event.status); }), []);

  async function pair() {
    if (operation.current) return;
    operation.current = true;
    setBusy(true); setMessage("");
    try {
      await pairWithMac(address, code);
      restartLiveConnection();
      setPaired(true); setCode("");
      void syncNow();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Pairing failed"); }
    finally { operation.current = false; setBusy(false); }
  }

  async function unpair() {
    if (operation.current || isSyncing()) return;
    operation.current = true;
    setBusy(true); setMessage("");
    try {
      const pending = Boolean(phoneLibrary.pendingSync);
      if (pending && !window.confirm("Pause this pairing and keep its unacknowledged sync for recovery?")) return;
      await forgetMac(pending); restartLiveConnection(); setPaired(false);
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not unpair"); }
    finally { operation.current = false; setBusy(false); }
  }

  async function restore() {
    if (operation.current) return;
    operation.current = true; setBusy(true); setMessage("");
    try { await restorePausedPairing(address); restartLiveConnection(); setPaired(true); void syncNow(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not restore pairing"); }
    finally { operation.current = false; setBusy(false); }
  }

  async function archive() {
    if (operation.current || !window.confirm("Archive pending metadata and listening history instead of replaying them to another computer? The archive contains no audio files. Cached songs remain available until the next sync.")) return;
    operation.current = true;
    setBusy(true); setMessage("");
    try { await archivePausedPairing(); setAddress(""); setMessage("Recovery data saved. You can pair another computer."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save recovery data"); }
    finally { operation.current = false; setBusy(false); }
  }

  // Re-read on every render: pairing (and the first sync) tells the phone whether it is a Mac or a PC.
  const computer = computerName();
  const syncing = isSyncing() && progress.phase !== "done" && progress.phase !== "error";
  const last = phoneLibrary.lastSync;
  const transfer = progress.phase === "downloading" && progress.total
    ? `${progress.done + 1} of ${progress.total} · ${formatBytes(progress.bytesTotal - progress.bytesDone)} left`
    : "";

  return <div className="settingsPanelCard settingsFocusPanelV491">
    <div className="settingsPanelHeader"><div><strong>Sync with {computer === "computer" ? "your computer" : computer}</strong><span>Copies your whole library from localtify on your {computer} over home Wi-Fi and keeps likes, playlists and play counts the same on both. Turn on Phone sync in localtify's Settings → Library there first.</span></div></div>
    {paired ? <>
      <p className="settingsHintText">Paired with <strong>{phoneLibrary.pairing?.name}</strong> · {phoneLibrary.pairing?.url.replace(/^https?:\/\//, "")}</p>
      <div className="settingsActionRow settingsActionRowCleanV491">
        <button type="button" className="settingsActionButton settingsPrimaryAction" disabled={busy || syncing} onClick={() => { if (!operation.current) void syncNow(); }}>
          <RefreshCw size={14} /> {syncing ? "Syncing…" : "Sync now"}</button>
        <button type="button" className="settingsActionButton settingsGhostAction" disabled={busy || syncing} onClick={() => void unpair()}>Unpair</button>
      </div>
      <p className="settingsHintText" role="status" aria-live="polite">
        {syncing ? [progress.message, transfer].filter(Boolean).join(" · ") : last ? `${last.message} · ${ago(last.at)}` : "Not synced yet."}
      </p>
      {progress.phase === "error" ? <p role="alert" className="settingsHintText phoneSyncError">{progress.message}</p> : null}
      {syncing && progress.phase === "downloading" ? <p className="settingsHintText">Keep the app open until the first sync finishes.</p> : null}
      <p className="settingsHintText">{{
        connected: `Live: connected. Likes, playback and the queue follow along while both apps are open.`,
        connecting: `Live: connecting to your ${computer}…`,
        offline: `Live: your ${computer} isn't reachable right now. Changes wait for the next sync.`,
        unsupported: `Live: update localtify on your ${computer} to see and control playback from here.`,
        off: "Live: off while the app is in the background."
      }[live]}</p>
    </> : phoneLibrary.detachedPairing ? <div className="phoneSyncPairForm">
      <p className="settingsHintText">Saved pairing with {phoneLibrary.detachedPairing.pairing.name}. Your pending changes remain on this phone. Restore the original computer to finish syncing safely.</p>
      <label><span>Updated address (optional)</span><input value={address} onChange={event => setAddress(event.target.value)} placeholder={phoneLibrary.detachedPairing.pairing.url} /></label>
      <button type="button" className="settingsActionButton settingsPrimaryAction" disabled={busy} onClick={() => void restore()}>Restore pairing</button>
      <button type="button" className="settingsActionButton" disabled={busy} onClick={() => void archive()}>Archive pending sync</button>
    </div> : <form className="phoneSyncPairForm" onSubmit={(event) => { event.preventDefault(); void pair(); }}>
      <label><span>{computer === "computer" ? "Computer" : computer} address</span><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="192.168.1.20" inputMode="url" autoCapitalize="off" autoCorrect="off" /></label>
      <label><span>Pairing code</span><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6 digits" inputMode="numeric" /></label>
      <button type="submit" className="settingsActionButton settingsPrimaryAction" disabled={busy || !address.trim() || code.length !== 6}><Smartphone size={14} /> {busy ? "Pairing…" : "Pair"}</button>
      <p className="settingsHintText">Your computer shows its address and a code in localtify under Settings → Library → Phone sync → Pair a phone.</p>
    </form>}
    {phoneLibrary.recoveryArchives.length ? <div className="phoneSyncPairForm">
      <button type="button" className="settingsActionButton" onClick={() => setShowRecovery(value => !value)}>{showRecovery ? "Hide" : "View"} recovery data ({phoneLibrary.recoveryArchives.length})</button>
      {showRecovery ? <label><span>Saved metadata and listening history (select and copy to export)</span><textarea readOnly rows={6} value={JSON.stringify(phoneLibrary.recoveryArchives, null, 2)} /></label> : null}
    </div> : null}
    {message ? <p className="settingsHintText phoneSyncError" role="alert">{message}</p> : null}
  </div>;
}
