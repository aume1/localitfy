import { PageHeader } from "../../shared/ui/PageHeader";
import "./settings.css";
import "./settings-premium.css";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import SettingsRail from "./SettingsRail";
import type { SettingsRailProps } from "./SettingsRail";
import type { SettingsCategory } from "./settings.types";
import { settingsCategoryTabs } from "./settings.constants";

export type SettingsViewProps = {
  renderSettingsCategoryContent: () => ReactNode;
  settingsRail: SettingsRailProps;
  settingsCategory: SettingsCategory;
};

export default function SettingsView({
  renderSettingsCategoryContent, settingsRail, settingsCategory
}: SettingsViewProps) {
  const selectedTab = settingsCategoryTabs.find((tab) => tab.id === settingsCategory);
  const pageRef = useRef<HTMLElement>(null);
  const lastCategory = useRef(settingsCategory);

  useLayoutEffect(() => {
    if (lastCategory.current === settingsCategory) return;
    lastCategory.current = settingsCategory;
    pageRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [settingsCategory]);

  return (
    <section ref={pageRef} data-page-section="settings" className="settingsPage settingsPageV027">
      <PageHeader title="Settings" />
      <div className="settingsLayout settingsPageLayoutV027">
        <SettingsRail {...settingsRail} />
        <div className="settingsCategoryContent settingsCategoryContentV027" role="region" aria-label={`${selectedTab?.label || "Application"} settings`}>
          <div key={settingsCategory} className={`settingsCategoryMotion settingsCategoryMotion-${settingsCategory}`}
            data-settings-category={settingsCategory}>
            {renderSettingsCategoryContent()}
          </div>
        </div>
      </div>
    </section>
  );
}
