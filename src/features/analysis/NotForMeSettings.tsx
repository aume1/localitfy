import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { normalizeSearchText, prettyMeta, prettyTitle } from "../search";
import type { Song } from "../library/song.types";
import type { Settings } from "../settings/settings.types";
import { readNotForMe, toggleNotForMe, type NotForMeKind } from "./notForMe";
import "./not-for-me.css";

type NotForMeSettingsProps = {
  settings: Settings;
  songs: readonly Song[];
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => unknown;
};

type Row = { key: string; title: string; detail: string; search: string };

/** Everything marked "not for me", most recent first, with a way to bring each one back. */
export default function NotForMeSettings({ settings, songs, updateSetting }: NotForMeSettingsProps) {
  const [tab, setTab] = useState<NotForMeKind>("artist");
  const [filter, setFilter] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const marks = readNotForMe(settings);
  const songsById = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs]);
  // Marks are appended, so reversing puts the newest first. Songs removed from the library are not listed.
  const rows: Record<NotForMeKind, Row[]> = {
    artist: [...marks.artists].reverse().map((artist) => ({ key: artist, title: prettyMeta(artist), detail: "artist", search: artist })),
    song: [...marks.songs].reverse().flatMap((id) => {
      const song = songsById.get(id);
      return song ? [{ key: id, title: prettyTitle(song.title, 8), detail: prettyMeta(song.artist), search: `${song.title} ${song.artist} ${song.album || ""}` }] : [];
    })
  };
  const query = normalizeSearchText(filter);
  const shown = query ? rows[tab].filter((row) => normalizeSearchText(row.search).includes(query)) : rows[tab];
  const save = (kind: NotForMeKind, next: string[]) => void updateSetting(kind === "song" ? "notForMeSongs" : "notForMeArtists", next);
  const label = tab === "artist" ? "artists" : "songs";

  return <div className="settingsPanelCard settingsFocusPanelV491">
    <div className="settingsPanelHeader"><div><strong>Not for me</strong><span>Left out of daily mixes, similar songs, song radio and Discover. They still play everywhere else. Mark songs and artists from a song’s menu.</span></div></div>
    <div className="notForMeTools">
      <div className="notForMeTabs" role="group" aria-label="Show">
        {(["artist", "song"] as const).map((kind) => (
          <button key={kind} type="button" className={`settingsChoicePillV491 ${tab === kind ? "active" : ""}`} aria-pressed={tab === kind}
            onClick={() => { setTab(kind); setConfirmClear(false); }}>
            <strong>{kind === "artist" ? "Artists" : "Songs"} ({rows[kind].length})</strong>
          </button>
        ))}
      </div>
      <label className="notForMeFilter">
        <Search size={14} aria-hidden="true" />
        <input type="search" value={filter} onChange={(event) => setFilter(event.currentTarget.value)}
          placeholder={tab === "artist" ? "Filter artists" : "Filter by title, artist or album"} aria-label={`Filter ${label}`} />
      </label>
    </div>
    {!rows[tab].length ? <p>No {label} marked yet.</p> : !shown.length ? <p>No marked {label} match “{filter.trim()}”.</p> : (
      <ul className="notForMeList" aria-label={`${label} not for me`}>
        {shown.map((row) => <li key={row.key}><span><strong>{row.title}</strong><small>{row.detail}</small></span>
          <button type="button" className="settingsTinyButton" aria-label={`Recommend ${row.title} again`}
            onClick={() => save(tab, (tab === "song" ? toggleNotForMe(marks, "song", row.key).songs : toggleNotForMe(marks, "artist", row.key).artists))}>
            <X size={13} />
          </button></li>)}
      </ul>
    )}
    {rows[tab].length ? <div className="settingsActionRow settingsActionRowCleanV491">
      {confirmClear ? <>
        <span>Recommend all {rows[tab].length} {label} again?</span>
        <button type="button" className="settingsActionButton settingsPrimaryAction" onClick={() => { save(tab, []); setConfirmClear(false); }}>Clear all {label}</button>
        <button type="button" className="settingsActionButton" onClick={() => setConfirmClear(false)}>Cancel</button>
      </> : <button type="button" className="settingsActionButton" onClick={() => setConfirmClear(true)}>Clear all {label}…</button>}
    </div> : null}
  </div>;
}
