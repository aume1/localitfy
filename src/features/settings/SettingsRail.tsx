import { useLayoutEffect, useMemo, useRef } from "react";
import { IconButton } from "../../shared/ui/IconButton";
import { Search, X, ChevronRight } from "lucide-react";
import { matchSettingsControls } from "./settings.search";
import { settingsCategoryTabs } from "./settings.constants";
import type { SettingsCategory } from "./settings.types";

export type SettingsRailProps = {
  tabs: ReadonlyArray<(typeof settingsCategoryTabs)[number]>;
  activeCategory: SettingsCategory;
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
  tabs, activeCategory, search, resultLabel, onSearchChange, onCategoryChange
}: SettingsRailProps) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  const matches = useMemo(() => matchSettingsControls(search, settingsCategoryTabs.map(tab => tab.id)), [search]);
  function openControl(category: SettingsCategory, target: string) {
    onSearchChange("");
    onCategoryChange(category);
    let attempts = 0;
    const reveal = () => {
      const element = document.getElementById(target);
      if (!element && attempts++ < 18) { window.setTimeout(reveal, 75); return; }
      if (!element) return;
      element.scrollIntoView({ block: "start", behavior: "auto" });
      const control = element.querySelector<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), summary");
      control?.focus({ preventScroll: true });
    };
    window.setTimeout(reveal, 70);
  }
  useLayoutEffect(() => {
    // Deep-linked sections (Discover in particular) can sit below the rail fold.
    // Reveal the selected item without moving keyboard focus or resetting search.
    selectedRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeCategory]);
  return (
    <aside className="settingsCategoryRail settingsCategoryRailV027 settingsCategoryRailPage" aria-label="Settings navigation">
      <div className="settingsSearchBoxV027">
        <label htmlFor="settings-section-search">Search settings</label>
        <div className="settingsSearchField">
          <Search size={15} strokeWidth={2} aria-hidden="true" />
          <input id="settings-section-search" type="search" value={search}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
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
              const Icon = tab.icon;
              const selected = activeCategory === tab.id;
              return <button key={tab.id} ref={selected ? selectedRef : undefined} className={`settingsCategoryButton ${selected ? "active" : ""}`}
                type="button" onClick={() => onCategoryChange(tab.id)} title={tab.description}
                aria-current={selected ? "page" : undefined}>
                <span className="settingsCategoryIcon" aria-hidden="true">
                  <Icon className="settingsLucideIcon" size={20} strokeWidth={1.9} />
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
