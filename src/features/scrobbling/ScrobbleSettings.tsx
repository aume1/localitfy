import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { ScrobbleAnswer, ScrobbleService, ScrobbleStatus } from "./scrobble.types";
import "./scrobbling.css";

const openLink = (url: string) => { void window.localitfy.openExternal?.(url); };
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const HEX32 = /^[0-9a-f]{32}$/i;

type ScrobbleSettingsProps = { lastfmApiKey: string; saveLastfmApiKey: (key: string) => unknown };

/** Connect Last.fm and/or ListenBrainz. Secrets go straight to the main process and are never shown again. */
export default function ScrobbleSettings({ lastfmApiKey, saveLastfmApiKey }: ScrobbleSettingsProps) {
  const [status, setStatus] = useState<ScrobbleStatus | null>(null);
  // Starts from the Discover key; a key and secret from a new API account replace it for both.
  const [apiKey, setApiKey] = useState(lastfmApiKey || "");
  const [secret, setSecret] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<"" | ScrobbleService | "send" | "cancel" | `history-${ScrobbleService}`>("");
  const [error, setError] = useState("");

  const pendingStatusRef = useRef(false);
  const operationRef = useRef(0);
  const busyRef = useRef(false);
  const [statusError, setStatusError] = useState(false);
  const statusGenerationRef = useRef(0);
  const refresh = useCallback(() => {
    if (pendingStatusRef.current || busyRef.current || document.hidden) return;
    pendingStatusRef.current = true;
    const generation = statusGenerationRef.current;
    void window.localitfy.getScrobbleStatus()
      .then(next => { if (generation === statusGenerationRef.current) { setStatus(next); setStatusError(false); } })
      .catch(() => { if (generation === statusGenerationRef.current) setStatusError(true); })
      .finally(() => { pendingStatusRef.current = false; });
  }, []);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refresh]);

  async function run(kind: typeof busy, task: () => Promise<ScrobbleAnswer>) {
    if (busyRef.current) return false;
    busyRef.current = true;
    const operation = ++operationRef.current;
    statusGenerationRef.current++;
    setBusy(kind); setError("");
    try {
      const answer = await task();
      if (operation !== operationRef.current) return false;
      setStatus(answer.status);
      setStatusError(false);
      if (!answer.ok) setError(answer.error || "Something went wrong.");
      return answer.ok;
    } catch {
      if (operation === operationRef.current) setError("Scrobbling request failed. Try again.");
      return false;
    } finally { if (operation === operationRef.current) { busyRef.current = false; setBusy(""); } }
  }
  async function connectLastfm() {
    const key = apiKey.trim();
    if (!await run("lastfm", () => window.localitfy.connectLastfmScrobbling({ apiKey: key, sharedSecret: secret }))) return;
    setSecret("");
    if (key !== lastfmApiKey) saveLastfmApiKey(key);
  }

  const disconnect = (service: ScrobbleService) => run(service, async () => ({ ok: true, status: await window.localitfy.disconnectScrobbling(service) }));
  const cancelConnect = async () => {
    if (busyRef.current && busy !== "lastfm") return;
    const operation = ++operationRef.current;
    statusGenerationRef.current++;
    busyRef.current = true;
    setBusy("cancel");
    setError("");
    try { const next = await window.localitfy.cancelScrobbleConnect(); if (operation === operationRef.current) setStatus(next); }
    catch { if (operation === operationRef.current) setError("Could not cancel the connection. Try again."); }
    finally { if (operation === operationRef.current) { busyRef.current = false; setBusy(""); } }
  };
  if (!status) return <details className="settingsDisclosure settingsScrobbleDisclosure"><summary>Scrobbling</summary><div className="settingsDisclosureBody"><p role={statusError ? "alert" : "status"}>{statusError ? "Could not load scrobbling status." : "Loading scrobbling…"}</p>{statusError ? <button type="button" className="settingsActionButton" onClick={refresh}>Retry</button> : null}</div></details>;
  const waiting = status.lastfm.waiting + status.listenbrainz.waiting;
  const history = (service: ScrobbleService) => status[service].history ? <div className="scrobbleRow">
    <span className="settingsHintText">{plural(status[service].history, "earlier play")} from this device {status[service].history === 1 ? "hasn’t" : "haven’t"} been sent{service === "lastfm" ? " (Last.fm only takes the last 14 days)" : ""}.</span>
    <button type="button" className="settingsActionButton" disabled={Boolean(busy)}
      onClick={() => void run(`history-${service}`, () => window.localitfy.sendScrobbleHistory(service))}>{busy === `history-${service}` ? "Sending…" : "Send history"}</button>
  </div> : null;

  return <details className="settingsDisclosure settingsScrobbleDisclosure">
    <summary>Scrobbling</summary>
    <div className="settingsDisclosureBody">
      <div className="settingsPanelCard settingsFocusPanelV491">

    <div className="scrobbleService">
      <div className="scrobbleServiceHead"><strong>Last.fm</strong>
        {status.lastfm.connected ? <span>Connected as <b>{status.lastfm.username}</b></span> : null}</div>
      {status.lastfm.connected ? (
        <>{history("lastfm")}<button type="button" className="settingsActionButton" disabled={Boolean(busy)} onClick={() => void disconnect("lastfm")}>Disconnect</button></>
      ) : status.connecting === "lastfm" || busy === "lastfm" || busy === "cancel" ? (
        <div className="scrobbleRow"><span role="status">Approve localtify on the Last.fm page that just opened in your browser…</span>
          <button type="button" className="settingsActionButton" disabled={busy === "cancel"} onClick={() => void cancelConnect()}>Cancel</button></div>
      ) : (
        <div className="scrobbleRow">
          <input className="scrobbleInput" value={apiKey} onChange={(event) => setApiKey(event.currentTarget.value)} placeholder="API key"
            aria-label="Last.fm API key" spellCheck={false} autoComplete="off" />
          <input className="scrobbleInput" value={secret} onChange={(event) => setSecret(event.currentTarget.value)} placeholder="Shared secret"
            aria-label="Last.fm shared secret" spellCheck={false} autoComplete="off" type="password" />
          <button type="button" className="settingsActionButton settingsPrimaryAction" disabled={Boolean(busy) || !HEX32.test(apiKey.trim()) || !HEX32.test(secret.trim())}
            onClick={() => void connectLastfm()}>Connect</button>
          <button type="button" className="scrobbleLink" onClick={() => openLink("https://www.last.fm/api/account/create")}>New API account <ExternalLink size={12} /></button>
        </div>
      )}
      {!status.lastfm.connected ? <small>Use the API key and secret from the same Last.fm application. You'll approve the connection in your browser.</small> : null}
    </div>

    <div className="scrobbleService">
      <div className="scrobbleServiceHead"><strong>ListenBrainz</strong>
        {status.listenbrainz.connected ? <span>Connected as <b>{status.listenbrainz.username}</b></span> : null}</div>
      {status.listenbrainz.connected ? (
        <>{history("listenbrainz")}<button type="button" className="settingsActionButton" disabled={Boolean(busy)} onClick={() => void disconnect("listenbrainz")}>Disconnect</button></>
      ) : (
        <div className="scrobbleRow">
          <input className="scrobbleInput" value={token} onChange={(event) => setToken(event.currentTarget.value)} placeholder="User token"
            aria-label="ListenBrainz user token" spellCheck={false} autoComplete="off" type="password" />
          <button type="button" className="settingsActionButton settingsPrimaryAction" disabled={!token.trim() || Boolean(busy)}
            onClick={() => void run("listenbrainz", () => window.localitfy.connectListenbrainz({ token })).then((ok) => { if (ok) setToken(""); })}>Connect</button>
          <button type="button" className="scrobbleLink" onClick={() => openLink("https://listenbrainz.org/settings/")}>Find it <ExternalLink size={12} /></button>
        </div>
      )}
    </div>

    {status.lastfm.connected || status.listenbrainz.connected ? <div className="scrobbleRow">
      <span className="settingsHintText" role="status">{waiting ? `${plural(waiting, "scrobble")} waiting to send` : `${plural(status.sent, "scrobble")} sent`}</span>
      {waiting ? <button type="button" className="settingsActionButton" disabled={Boolean(busy)} onClick={() => void run("send", () => window.localitfy.sendScrobblesNow())}>Send now</button> : null}
    </div> : null}
    {statusError ? <p role="alert">Could not refresh status. <button type="button" className="settingsActionButton" onClick={refresh}>Retry</button></p> : null}
    {error || status.lastError ? <p role="alert">{error || status.lastError}</p> : null}
      </div>
    </div>
  </details>;
}
