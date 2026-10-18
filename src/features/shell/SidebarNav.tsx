import { useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ArrowDown, ArrowUp, EyeOff, SlidersHorizontal } from "lucide-react";
import { navItems } from "./navigation.constants";
import { canMoveSidebarItem, moveSidebarItem, resolveSidebarGroups, sidebarGroupForView, toggleSidebarItemHidden } from "./sidebarLayout";
import type { SidebarNavOrder } from "./sidebarLayout";
import type { View } from "./view.types";
import "../library/components/song-context-menu.css";

export type SidebarLayoutPatch = { sidebarNavOrder?: SidebarNavOrder; sidebarHiddenNav?: string[] };

export type SidebarNavProps = {
  view: View;
  changeView: (view: View, source?: string) => unknown;
  sidebarNavOrder: SidebarNavOrder | undefined;
  sidebarHiddenNav: string[] | undefined;
  updateSidebarLayout: (patch: SidebarLayoutPatch) => unknown;
  openSidebarSettings: () => unknown;
};

type SidebarMenuState = { view: View; x: number; y: number };

const MENU_WIDTH = 220;
const MENU_HEIGHT = 190;

export default function SidebarNav({ view, changeView, sidebarNavOrder, sidebarHiddenNav, updateSidebarLayout, openSidebarSettings }: SidebarNavProps) {
  const [menu, setMenu] = useState<SidebarMenuState | null>(null);
  const groups = resolveSidebarGroups(sidebarNavOrder, sidebarHiddenNav).filter((group) => group.visibleItems.length);

  useEffect(() => {
    if (!menu) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menu]);

  function openMenu(event: ReactMouseEvent<HTMLElement>, itemId: View) {
    if (!sidebarGroupForView(itemId)) return;
    event.preventDefault();
    const margin = 12;
    setMenu({
      view: itemId,
      x: Math.min(event.clientX, window.innerWidth - MENU_WIDTH - margin),
      y: Math.min(event.clientY, window.innerHeight - MENU_HEIGHT - margin)
    });
  }

  function move(itemId: View, delta: -1 | 1) {
    setMenu(null);
    updateSidebarLayout({ sidebarNavOrder: moveSidebarItem(sidebarNavOrder, sidebarHiddenNav, itemId, delta) });
  }

  const menuItem = menu ? navItems.find((item) => item.id === menu.view) : null;

  return (
    <>
      <div className="sidebarNavGroupsV467" aria-label="localtify navigation groups">
        {groups.map((group, groupIndex) => (
          <div key={group.id} className={`sidebarNavGroupV467 sidebarNavGroup-${group.id}`}>
            <p className="sidebarGroupLabelV467">{group.label}</p>

            <nav
              className={`nav navGroupedV467 ${group.id === "app" ? "navUtility" : "navMain"}`}
              aria-label={`${group.label} navigation`}
            >
              {group.visibleItems.map((itemId) => {
                const item = navItems.find((entry) => entry.id === itemId);
                if (!item) return null;
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    className={`navItem navItemAnimatedV468 nav-${item.id} ${view === item.id ? "active" : ""}`}
                    data-nav-id={item.id}
                    data-nav-group={group.id}
                    onClick={() => changeView(item.id, "nav")}
                    onContextMenu={(event) => openMenu(event, item.id)}
                    aria-label={`open ${item.label}`}
                    aria-current={view === item.id ? "page" : undefined}
                  >
                    <span className="navDiscordPillV468" aria-hidden="true" />
                    <span className={`navIcon navIcon-${item.id}`} aria-hidden="true">
                      <span className="navIconMotionV468">
                        <Icon className="navLucideIcon" size={22} strokeWidth={2.75} fill="none" />
                      </span>
                    </span>
                    <span className="navText">
                      <strong>{item.label}</strong>
                      <small>{item.hint}</small>
                    </span>
                  </button>
                );
              })}
            </nav>

            {groupIndex < groups.length - 1 ? <div className="navDivider" aria-hidden="true" /> : null}
          </div>
        ))}
      </div>

      {menu && menuItem ? (
        <div className="songContextMenuLayer" onClick={() => setMenu(null)} onContextMenu={(event) => { event.preventDefault(); setMenu(null); }}>
          <div
            className="songContextMenu sidebarContextMenu"
            style={{ left: menu.x, top: menu.y }}
            role="menu"
            aria-label={`${menuItem.label} tab options`}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" role="menuitem" disabled={!canMoveSidebarItem(sidebarNavOrder, sidebarHiddenNav, menu.view, -1)} onClick={() => move(menu.view, -1)}>
              <span className="songContextMenuIcon"><ArrowUp size={13} strokeWidth={3} /></span> move up
            </button>
            <button type="button" role="menuitem" disabled={!canMoveSidebarItem(sidebarNavOrder, sidebarHiddenNav, menu.view, 1)} onClick={() => move(menu.view, 1)}>
              <span className="songContextMenuIcon"><ArrowDown size={13} strokeWidth={3} /></span> move down
            </button>
            <button type="button" role="menuitem" onClick={() => {
              setMenu(null);
              updateSidebarLayout({ sidebarHiddenNav: toggleSidebarItemHidden(sidebarHiddenNav, menu.view) });
            }}>
              <span className="songContextMenuIcon"><EyeOff size={13} strokeWidth={3} /></span> hide {menuItem.label}
            </button>
            <div className="songContextMenuDivider" aria-hidden="true" />
            <button type="button" role="menuitem" onClick={() => { setMenu(null); openSidebarSettings(); }}>
              <span className="songContextMenuIcon"><SlidersHorizontal size={13} strokeWidth={3} /></span> customize sidebar
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
