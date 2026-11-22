import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import Button from "../../shared/ui/Button";
import type { Song } from "../library/song.types";
import type { DailyMix, DailyMixesResult } from "./analysis.types";
import { CollectionLoading } from "../../shared/ui/CollectionLoading";
import { prettyMeta } from "../search";
import { mixTarget } from "../shell/appActions";
import DailyMixCard from "./DailyMixCard";
import { splitArtistCredits } from "../artists/artistCredits";
import "./daily-mixes.css";

const ARTISTS_SHOWN = 4;

export type DailyMixesShelfProps = {
  songs: Song[];
  savePlaylist: (name: string, ids: string[]) => string | null;
  openAnalysisSettings: () => void;
};
function day() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

export default function DailyMixesShelf(props: DailyMixesShelfProps) {
  const [result, setResult] = useState<DailyMixesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(0);
  const loadingRef = useRef(false);
  const songsById = useMemo(() => new Map(props.songs.map((song) => [song.id, song])), [props.songs]);
  const load = useCallback(async (refresh = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const request = ++requestRef.current;
    setLoading(true); setError("");
    try {
      const next = await window.localitfy.getDailyMixes({ refresh });
      if (request === requestRef.current) setResult(next);
    } catch {
      if (request === requestRef.current) setError("Could not generate your mixes. Please retry.");
    } finally {
      if (request === requestRef.current) { loadingRef.current = false; setLoading(false); }
    }
  }, []);
  useEffect(() => {
    void load();
    return () => { requestRef.current++; loadingRef.current = false; };
  }, [load]);
  useEffect(() => {
    const check = () => { if (result?.day !== day()) void load(); };
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = window.setTimeout(check, midnight.getTime() - now.getTime() + 1000);
    window.addEventListener("focus", check);
    return () => { window.clearTimeout(timer); window.removeEventListener("focus", check); };
  }, [load, result]);

  return <section className="dailyMixes" aria-labelledby="daily-mixes-title" aria-busy={loading}>
    <div className="panelHead dailyMixesHeader">
      <div><h3 id="daily-mixes-title">Daily mixes</h3></div>
      <Button variant="secondary" size="sm" className="dailyMixesRefresh" disabled={loading} onClick={() => void load(true)}><RefreshCw size={15} />{loading ? "Building mixes…" : "Refresh mixes"}</Button>
    </div>
    {error ? <p className="dailyMixesNotice" role="alert">{error} <button type="button" className="softButton" disabled={loading} onClick={() => void load()}>Retry</button></p> : null}
    {loading && !result ? <CollectionLoading label="Finding groups of similar sounds…" /> : null}
    {result && !result.mixes.length ? <div className="dailyMixesNotice"><p>Analyze five or more tracks to get mixes.</p><button type="button" className="softButton" onClick={props.openAnalysisSettings}>Open analysis settings</button></div> : null}
    {result?.mixes.length ? <>
      <div className="playlistShelfGrid dailyMixesGrid">{result.mixes.map((mix) => <MixCard key={`${result.day}:${result.edition}:${mix.id}`} mix={mix} songsById={songsById} />)}</div>
      <p className="dailyMixesFootnote">{result.eligible} analyzed tracks · {result.day}</p>
    </> : null}
  </section>;
}

function MixCard({ mix, songsById }: { mix: DailyMix; songsById: Map<string, Song> }) {
  const songs = mix.songIds.flatMap((id) => { const song = songsById.get(id); return song && song.fileExists !== false ? [song] : []; });
  const artists = [...new Set(songs.flatMap(song => song.artist?.trim() ? splitArtistCredits(song.artist).map(name => prettyMeta(name)) : []))];
  return <DailyMixCard mix={mix} songs={songs} target={mixTarget(mix, songs)}
    artists={(artists.slice(0, ARTISTS_SHOWN).join(", ") || "your analyzed music") + (artists.length > ARTISTS_SHOWN ? " and more" : "")} />;
}
