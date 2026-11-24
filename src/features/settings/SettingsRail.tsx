import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { IconButton } from "../../shared/ui/IconButton";
import { SolidIcon } from "../../shared/ui/SolidIcon";
import { Search, X, ChevronRight } from "lucide-react";
import { matchSettingsControls } from "./settings.search";
import { settingsCategoryTabs } from "./settings.constants";
import type { SettingsCategory } from "./settings.types";

export type SettingsRailProps = {
  tabs: ReadonlyArray<(typeof settingsCategoryTabs)[number]>;
  activeCategory: SettingsCategory;
  analysisSupported?: boolean;
  search: string;
  resultLabel: string;
  onSearchChange: (value: string) => void;
  onCategoryChange: (category: SettingsCategory) => void;
};

const SETTINGS_NAV_GROUPS: ReadonlyArray<{
  label: string;
  ids: ReadonlyArray<SettingsCategory>;
}> = [
  { label: "Appearance", ids: ["appearance"] },
  { label: "Listening", ids: ["playback", "lyrics", "experimental"] },
  { label: "Your collection", ids: ["library", "downloads"] },
  { label: "Connections", ids: ["discover", "discord"] },
  { label: "Application", ids: ["updates", "advanced", "about"] }
];

export default function SettingsRail({
  tabs, activeCategory, analysisSupported = false, search, resultLabel, onSearchChange, onCategoryChange
}: SettingsRailProps) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const matches = useMemo(() => matchSettingsControls(search, settingsCategoryTabs.map(tab => tab.id), analysisSupported), [search, analysisSupported]);
  const revealTimer = useRef<number | undefined>(undefined);
  const revealCategory = useRef<SettingsCategory | null>(null);
  function cancelReveal() { window.clearTimeout(revealTimer.current); revealCategory.current = null; }
  useEffect(() => () => window.clearTimeout(revealTimer.current), []);
  useLayoutEffect(() => { if (revealCategory.current && revealCategory.current !== activeCategory) cancelReveal(); }, [activeCategory]);
  function openControl(category: SettingsCategory, target: string) {
    cancelReveal();
    revealCategory.current = category;
    onSearchChange("");
    onCategoryChange(category);
    let attempts = 0;
    const reveal = () => {
      const element = document.getElementById(target);
      if (revealCategory.current !== category) return;
      if (!element && attempts++ < 40) { revealTimer.current = window.setTimeout(reveal, 75); return; }
      revealCategory.current = null;
      if (!element) return;
      const nestedDisclosure = element instanceof HTMLDetailsElement ? element : element.firstElementChild instanceof HTMLDetailsElement ? element.firstElementChild : null;
      if (nestedDisclosure) nestedDisclosure.open = true;
      for (let disclosure = element.closest("details"); disclosure; disclosure = disclosure.parentElement?.closest("details") ?? null) disclosure.open = true;
      element.scrollIntoView({ block: "start", behavior: "auto" });
      const control = nestedDisclosure ? nestedDisclosure.querySelector<HTMLElement>("summary") : element.querySelector<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), summary");
      if (control) control.focus({ preventScroll: true });
      else { element.tabIndex = -1; element.focus({ preventScroll: true }); }
    };
    revealTimer.current = window.setTimeout(reveal, 70);
  }
  useLayoutEffect(() => {
    const selected = selectedRef.current;
    const rail = railRef.current;
    if (!selected || !rail) return;
    const rect = selected.getBoundingClientRect();
    const bounds = rail.getBoundingClientRect();
    if (rect.top < bounds.top + 8) rail.scrollTop -= bounds.top + 8 - rect.top;
    else if (rect.bottom > bounds.bottom - 8) rail.scrollTop += rect.bottom - bounds.bottom + 8;
    const nav = selected.closest("nav");
    if (!nav) return;
    const navBounds = nav.getBoundingClientRect();
    if (rect.left < navBounds.left + 8) nav.scrollLeft -= navBounds.left + 8 - rect.left;
    else if (rect.right > navBounds.right - 8) nav.scrollLeft += rect.right - navBounds.right + 8;
  }, [activeCategory]);
  return (
    <aside ref={railRef} className="settingsCategoryRail settingsCategoryRailV027 settingsCategoryRailPage" aria-label="Settings navigation">
      <div className="settingsSearchBoxV027">
        <label htmlFor="settings-section-search">Search settings</label>
        <div className="settingsSearchField">
          <Search size={15} strokeWidth={2} aria-hidden="true" />
          <input id="settings-section-search" type="search" value={search}
            onChange={(event) => { cancelReveal(); onSearchChange(event.currentTarget.value); }}
            onKeyDown={(event) => { if (event.key === "Escape" && search) { event.preventDefault(); event.stopPropagation(); onSearchChange(""); } }}
            placeholder="Find a setting..." />
          {search ? <IconButton type="button" className="settingsSearchClear" onClick={() => { onSearchChange(""); document.getElementById("settings-section-search")?.focus(); }} aria-label="Clear settings search">
            <X size={14} strokeWidth={2} aria-hidden="true" />
          </IconButton> : null}
        </div>
      </div>
      {search.trim() ? <p className="settingsSearchHintV027" role="status">{resultLabel}</p> : null}
      {search.trim() && matches.length ? <div className="settingsControlResults" role="group" aria-label="Matching controls">
        <strong className="settingsControlResultsTitle">Matching controls</strong>
        {matches.map(link => <button key={link.id} type="button" className="settingsControlResult"
          onClick={() => openControl(link.category, link.target)}>
          <span><strong>{link.label}</strong><small>{link.description}</small></span>
          <ChevronRight size={15} aria-hidden="true" />
        </button>)}
      </div> : null}
      <nav aria-label="Settings sections">
        {tabs.length ? SETTINGS_NAV_GROUPS.map((group) => {
          const items = group.ids.flatMap((id) => tabs.filter((tab) => tab.id === id));
          if (!items.length) return null;
          return <div className="settingsNavGroup" key={group.label}>
            <h3 className="settingsNavCaption">{group.label}</h3>
            {items.map((tab) => {
              const selected = activeCategory === tab.id;
              return <button key={tab.id} ref={selected ? selectedRef : undefined} className={`settingsCategoryButton ${selected ? "active" : ""}`}
                type="button" onClick={() => { cancelReveal(); onCategoryChange(tab.id); }} title={tab.description}
                aria-current={selected ? "page" : undefined}>
                <span className="settingsCategoryIcon" aria-hidden="true">
                  <SolidIcon className="settingsSolidIcon" name={tab.icon} size={20} />
                </span>
                <span className="settingsCategoryCopy"><strong>{tab.label}</strong></span>
              </button>;
            })}
          </div>;
        }) : matches.length ? null : <p className="settingsNoSearchResultsV027">No matching setting. Try another search.</p>}
      </nav>
    </aside>
  );
}
