import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Save, Trash2, X } from "lucide-react";
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
const MATCH_ITEMS = [{ value: "all", label: "all of these" }, { value: "any", label: "any of these" }] as const;
const EMPTY_RULES: SmartRules = { match: "all", rules: [defaultSmartRule("liked")], sort: "library", limit: null };

export default function SmartPlaylistDialog({ playlist, songs, listeningCounts, onSave, onClose }: SmartPlaylistDialogProps) {
  const [name, setName] = useState(playlist?.name || "");
  const [rules, setRules] = useState<SmartRules>(() => playlist?.rules || EMPTY_RULES);
  // Preview exactly what will be saved: blank text rules are dropped.
  const saved = useMemo(() => cleanSmartRules(rules) || EMPTY_RULES, [rules]);
  const matched = useMemo(() => evaluateSmartRules(saved, songs, listeningCounts).length, [saved, songs, listeningCounts]);
  const updateRule = (index: number, patch: Partial<SmartRule>) =>
    setRules((current) => ({ ...current, rules: current.rules.map((rule, at) => at === index ? { ...rule, ...patch } : rule) }));

  // Portaled to the app root: the playlists page is a transformed container, which would trap a fixed overlay.
  return createPortal(
    <div className="modalWrap smartPlaylistWrap" onClick={onClose}>
      <form className="smartPlaylistModal" role="dialog" aria-modal="true" aria-labelledby="smart-playlist-title"
        onClick={(event) => event.stopPropagation()}
        // An open dropdown handles (and prevents) its own Escape.
        onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) onClose(); }}
        onSubmit={(event) => { event.preventDefault(); if (onSave(playlist?.id || null, name, rules)) onClose(); }}>
        <div className="modalHead">
          <div>
            <p className="eyebrow">smart playlist</p>
            <h3 id="smart-playlist-title">{playlist ? "edit rules" : "new smart playlist"}</h3>
            <span className="editorHeadSub">Fills itself from your library and keeps up as you listen and import.</span>
          </div>
          <button className="closeModalButton" type="button" onClick={onClose} aria-label="Close smart playlist"><X size={18} strokeWidth={2.4} /></button>
        </div>

        {!playlist ? (
          <div className="smartPlaylistPresets" aria-label="Start from an example">
            {SMART_PRESETS.map((preset) => (
              <button key={preset.name} type="button" className="settingsTinyButton"
                onClick={() => { setName(preset.name); setRules(preset.rules); }}>{preset.name}</button>
            ))}
          </div>
        ) : null}

        <label className="smartPlaylistField">
          <span>name</span>
          <input value={name} onChange={(event) => setName(event.currentTarget.value)} placeholder="smart playlist" maxLength={120} autoFocus />
        </label>

        <div className="smartPlaylistMatch">
          <span>songs matching</span>
          <ArcDropdownMenu ariaLabel="Match" value={rules.match} items={MATCH_ITEMS}
            onValueChange={(match) => setRules((current) => ({ ...current, match }))} />
        </div>

        <ol className="smartPlaylistRules">
          {rules.rules.map((rule, index) => {
            const kind = SMART_FIELDS[rule.field].kind;
            return (
              <li key={index} className="smartPlaylistRule">
                <ArcDropdownMenu ariaLabel="Field" value={rule.field} items={FIELD_ITEMS}
                  onValueChange={(field) => updateRule(index, defaultSmartRule(field))} />
                <ArcDropdownMenu ariaLabel="Condition" value={rule.op} items={toItems(SMART_OPS[kind]) as { value: SmartOp; label: string }[]}
                  onValueChange={(op) => updateRule(index, { op })} />
                {kind === "text" ? (
                  <input aria-label="Text" value={String(rule.value)} placeholder={rule.field === "genre" ? "e.g. hip hop" : "text"}
                    onChange={(event) => updateRule(index, { value: event.currentTarget.value })} />
                ) : kind === "flag" ? <span /> : (
                  <span className="smartPlaylistNumber">
                    <input aria-label={kind === "days" ? "Days" : "Count"} type="number" min={0} value={String(rule.value)}
                      onChange={(event) => updateRule(index, { value: event.currentTarget.value === "" ? "" : Number(event.currentTarget.value) })} />
                    {kind === "days" ? <small>days</small> : null}
                  </span>
                )}
                <button className="settingsTinyButton" type="button" aria-label="Remove rule"
                  onClick={() => setRules((current) => ({ ...current, rules: current.rules.filter((_, at) => at !== index) }))}>
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ol>
        <button className="settingsTinyButton" type="button" disabled={rules.rules.length >= 12}
          onClick={() => setRules((current) => ({ ...current, rules: [...current.rules, defaultSmartRule()] }))}>
          <Plus size={14} /> add rule
        </button>

        <div className="smartPlaylistMatch">
          <span>order</span>
          <ArcDropdownMenu ariaLabel="Order" value={rules.sort} items={SORT_ITEMS}
            onValueChange={(sort) => setRules((current) => ({ ...current, sort }))} />
          <label className="smartPlaylistNumber">
            <span>limit</span>
            <input aria-label="Song limit" type="number" min={1} max={5000} placeholder="none" value={rules.limit ?? ""}
              onChange={(event) => setRules((current) => ({ ...current, limit: Number(event.currentTarget.value) || null }))} />
            <small>songs</small>
          </label>
        </div>

        <div className="smartPlaylistFooter">
          <p role="status">{matched} song{matched === 1 ? "" : "s"} · {describeSmartRules(saved)}</p>
          <button className="heroMain" type="submit"><Save size={15} strokeWidth={2.4} /><span>{playlist ? "save rules" : "create"}</span></button>
        </div>
      </form>
    </div>,
    document.querySelector(".app") || document.body
  );
}
