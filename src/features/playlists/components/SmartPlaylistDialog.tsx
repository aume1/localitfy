import { useMemo, useState } from "react";
import PlaylistComposer, { ComposerButton } from "./PlaylistComposer";
import SegmentedControl from "../../../vendor/arc/segmented-control/segmented-control";
import { Plus, Trash2 } from "lucide-react";
import { ArcDropdownMenu } from "../../../shared/ui/ArcDropdownMenu";
import type { Song } from "../../library/song.types";
import type { Playlist } from "../playlist.types";
import {
  SMART_FIELDS, SMART_OPS, SMART_PRESETS, SMART_SORTS, cleanSmartRules, defaultSmartRule, describeSmartRules, evaluateSmartRules,
  type ListeningCounts, type SmartField, type SmartOp, type SmartRule, type SmartRules, type SmartSort
} from "../smartPlaylist";

export type SmartPlaylistDialogProps = {
  /** The smart playlist being edited, or null to create one. */
  playlist: Playlist | null;
  songs: readonly Song[];
  listeningCounts: ListeningCounts;
  onSave: (playlistId: string | null, name: string, rules: SmartRules) => string | null;
  onClose: () => void;
};

const toItems = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const FIELD_ITEMS = Object.entries(SMART_FIELDS).map(([value, { label }]) => ({ value: value as SmartField, label }));
const SORT_ITEMS = toItems(SMART_SORTS) as { value: SmartSort; label: string }[];
const MATCH_ITEMS = [{ value: "all", label: "All rules" }, { value: "any", label: "Any rule" }];
const EMPTY_RULES: SmartRules = { match: "all", rules: [defaultSmartRule("liked")], sort: "library", limit: null };

export default function SmartPlaylistDialog({ playlist, songs, listeningCounts, onSave, onClose }: SmartPlaylistDialogProps) {
  const [name, setName] = useState(playlist?.name || "");
  const [rules, setRules] = useState<SmartRules>(() => playlist?.rules || EMPTY_RULES);
  // Preview exactly what will be saved: blank text rules are dropped.
  const saved = useMemo(() => cleanSmartRules(rules) || EMPTY_RULES, [rules]);
  const matched = useMemo(() => evaluateSmartRules(saved, songs, listeningCounts).length, [saved, songs, listeningCounts]);
  const updateRule = (index: number, patch: Partial<SmartRule>) =>
    setRules((current) => ({ ...current, rules: current.rules.map((rule, at) => at === index ? { ...rule, ...patch } : rule) }));

  return (
    <PlaylistComposer kind="smart" title={playlist ? "Edit smart playlist" : "New smart playlist"}
      description="Automatically update this playlist as your library changes." onClose={onClose}>
      <form className="playlistComposerForm" onSubmit={event => { event.preventDefault(); if (onSave(playlist?.id || null,name,rules)) onClose(); }}>
        <div className="playlistComposerBody">
          <label className="playlistComposerField"><span>Playlist name</span>
            <input aria-label="Playlist name" value={name} onChange={event => setName(event.currentTarget.value)} placeholder="My smart playlist" maxLength={120} autoFocus/>
          </label>
          {!playlist ? <div className="playlistComposerExamples"><span className="playlistComposerHint">Start with</span>
            <div className="playlistComposerChips">{SMART_PRESETS.map(preset => <ComposerButton key={preset.name} size="sm" variant="ghost"
              onClick={() => { setName(preset.name); setRules(preset.rules); }}>{preset.name}</ComposerButton>)}</div></div> : null}
          <div className="playlistComposerLine">
            <strong>Match</strong>
            <SegmentedControl label="Match" options={MATCH_ITEMS} value={rules.match}
              onValueChange={value => setRules(current => ({...current,match:value === "any" ? "any" : "all"}))}/>
          </div>
          <ol className="playlistComposerRules">
            {rules.rules.map((rule,index) => {
              const kind = SMART_FIELDS[rule.field].kind;
              return <li key={index} className="playlistComposerRule" data-kind={kind}>
                <ArcDropdownMenu ariaLabel="Field" value={rule.field} items={FIELD_ITEMS} onValueChange={field => updateRule(index,defaultSmartRule(field))}/>
                <ArcDropdownMenu ariaLabel="Condition" value={rule.op} items={toItems(SMART_OPS[kind]) as {value: SmartOp;label:string}[]} onValueChange={op => updateRule(index,{op})}/>
                {kind === "text" ? <input aria-label="Text" value={String(rule.value)} placeholder={rule.field === "genre" ? "Genre" : "Value"} onChange={event => updateRule(index,{value:event.currentTarget.value})}/>
                : kind === "flag" ? null : <label className="playlistComposerNumber"><input aria-label={kind === "days" ? "Days" : "Count"} type="number" min={0} value={String(rule.value)}
                  onChange={event => updateRule(index,{value:event.currentTarget.value === "" ? "" : Number(event.currentTarget.value)})}/>{kind === "days" ? <span>days</span> : null}</label>}
                <ComposerButton variant="ghost" size="icon" aria-label="Remove rule" onClick={() => setRules(current => ({...current,rules:current.rules.filter((_,at) => at !== index)}))}><Trash2 size={15}/></ComposerButton>
              </li>;
            })}
          </ol>
          <div className="playlistComposerLine"><ComposerButton size="sm" variant="ghost" disabled={rules.rules.length >= 12}
            onClick={() => setRules(current => ({...current,rules:[...current.rules,defaultSmartRule()]}))}><Plus size={16}/> Add rule</ComposerButton></div>
          <div className="playlistComposerOptions">
            <div className="playlistComposerField"><span>Sort by</span><ArcDropdownMenu ariaLabel="Order" value={rules.sort} items={SORT_ITEMS} onValueChange={sort => setRules(current => ({...current,sort}))}/></div>
            <label className="playlistComposerField"><span>Song limit</span><input aria-label="Song limit" type="number" min={1} max={5000} placeholder="No limit" value={rules.limit ?? ""} onChange={event => setRules(current => ({...current,limit:Number(event.currentTarget.value) || null}))}/></label>
          </div>
        </div>
        <footer className="playlistComposerFooter playlistComposerSmartFooter">
          <div role="status" className="playlistComposerCount"><strong>{matched.toLocaleString()} {matched === 1 ? "song" : "songs"}</strong><small>{describeSmartRules(saved)}</small></div>
          <ComposerButton variant="primary" type="submit">{playlist ? "Save rules" : "Create playlist"}</ComposerButton>
        </footer>
      </form>
    </PlaylistComposer>
  );
}
