import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";
import type { Settings, SettingsCategory } from "./settings.types";
import { useStableCallback } from "../../shared/hooks/useStableCallback";
import { createSettingsWriter } from "./settingsWriter";
import { defaultSettings } from "./settings.constants";
import { VISUAL_CUSTOMIZATION_DEFAULTS } from "./visualCustomization";
import { normalizeThemeId, normalizeCoverColorSyncMode } from "./theme.utils";
import { clamp } from "../../shared/utils/format";
import type { CoverColorSyncMode } from "./theme.types";
import type { AppToastKind } from "../shell/view.types";

export type UseSettingsControllerOptions = {
  initialSettings: () => Settings;
  bootedRef: {current:boolean};
  volumeDraftRef: {current:number};
  setStatusText: (text:string)=>void;
  showAppToast: (message:string,kind?:AppToastKind)=>void;
  applyLiveVolumePercent: (percent:number)=>void;
  kickThemeSettle: ()=>void;
  flushExtra: () => Promise<boolean>;
};

export function useSettingsController({ initialSettings, bootedRef, volumeDraftRef, setStatusText, showAppToast, applyLiveVolumePercent, kickThemeSettle, flushExtra }: UseSettingsControllerOptions) {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const settingsRef = useRef(settings);
  const settingsSaveFailedRef = useRef(false);
  const [settingsSaveError, setSettingsSaveError] = useState(false);
  const [writeSettings] = useState(() => createSettingsWriter<Settings>(next => window.localitfy.saveSettings(next)));
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>("appearance");
  const [settingsSearch, setSettingsSearch] = useState("");
  const deferredSettingsSearch = useDeferredValue(settingsSearch);
  const [themeSettling, setThemeSettling] = useState(false);
  const [themeMotionReady, setThemeMotionReady] = useState(false);

  const saveSettingsTimerRef = useRef<number | null>(null);
  const themeSettlingTimerRef = useRef<number | null>(null);
  const themePaintIdleTimerRef = useRef<number | null>(null);
  const themeSettlingRef = useRef(false);

  const flushSettings = useStableCallback(async () => {
    if (!bootedRef.current) return true;
    for (;;) {
      const snapshot = settingsRef.current;
      if (saveSettingsTimerRef.current !== null || settingsSaveFailedRef.current) {
        if (!await saveSettingsSafely(snapshot)) return false;
      } else {
        try { await writeSettings.flush(); }
        catch { if (!await saveSettingsSafely(settingsRef.current)) return false; }
      }
      if (settingsRef.current === snapshot && saveSettingsTimerRef.current === null) return true;
    }
  });

  const flushAll = useStableCallback(async () => {
    const results = await Promise.allSettled([flushSettings(), flushExtra()]);
    return results.every(result => result.status === "fulfilled" && result.value);
  });

  useEffect(() => {
    const flush = () => { void flushAll(); };
    const onVisibility = () => { if (document.hidden) flush(); };
    const unsubscribe = window.localitfy.onSettingsFlushRequest?.(flushAll);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      unsubscribe?.();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [flushAll]);

  useEffect(() => {
    themeSettlingRef.current = themeSettling;
  }, [themeSettling]);

  function settingsAreSame(left: Settings, right: Settings) {
    const leftKeys = Object.keys(left || {});
    const rightKeys = Object.keys(right || {});
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => Object.is(left[key as keyof Settings], right[key as keyof Settings]));
  }

  function isImmediateSettingsKey(key: string) {
    return [
      "theme",
      "volume",
      "playbackSpeed",
      "crossfadeSeconds",
      "crossfadeEnabled",
      "gaplessPlayback",
      "volumeNormalization",
      "perSongVolumeMemory",
      "sleepTimerMinutes",
      "discordEnabled",
      "discordPrivacyMode",
      "discordButtons",
      "discordArtMode",
      "discordActivityStyle",
      "discordTitleCleanup",
      "discordSecondLine"
    ].includes(key);
  }

  async function saveSettingsSafely(next: Settings, debounce = false, delay = 260) {
    if (!bootedRef.current) return true;

    if (saveSettingsTimerRef.current !== null) {
      window.clearTimeout(saveSettingsTimerRef.current);
      saveSettingsTimerRef.current = null;
    }

    const save = async (snapshot: Settings) => {
      try { await writeSettings(snapshot); settingsSaveFailedRef.current = false; setSettingsSaveError(false); return true; }
      catch { settingsSaveFailedRef.current = true; setSettingsSaveError(true); showAppToast("Could not save settings. Try again.", "error"); return false; }
    };
    const runSave = () => save(settingsRef.current);

    if (debounce) {
      saveSettingsTimerRef.current = window.setTimeout(() => {
        saveSettingsTimerRef.current = null;
        void runSave();
      }, delay);
      return false;
    }

    return save(next);
  }

  async function persistSettings(next: Settings, debounce = false, priority: "immediate" | "transition" = "transition") {
    const previous = settingsRef.current;
    if (settingsAreSame(previous, next)) return flushSettings();

    settingsRef.current = next;

    if (priority === "immediate") {
      setSettings(next);
    } else {
      startTransition(() => setSettings(next));
    }

    if (!bootedRef.current) return true;

    return saveSettingsSafely(next, debounce);
  }

  async function updateSetting<K extends keyof Settings>(key: K, value: Settings[K], debounce = false) {
    const currentSettings = settingsRef.current;
    const next: Settings = {
      ...currentSettings,
      [key]: value
    };

    if (key === "volume") {
      const safeVolume = clamp(Number(value) || 0, 0, 1);
      next.volume = safeVolume;
      volumeDraftRef.current = Math.round(safeVolume * 100);
      applyLiveVolumePercent(volumeDraftRef.current);
      settingsRef.current = next;
      setSettings(next);

      void saveSettingsSafely(next, true, debounce ? 420 : 120);

      return;
    }

    if (key === "theme") {
      next.theme = normalizeThemeId(value);
      kickThemeSettle();
    }

    if (key === "coverColorSyncMode") {
      next.coverColorSyncMode = normalizeCoverColorSyncMode(value);
      next.showAmbientGradient = next.coverColorSyncMode !== "off";
      kickThemeSettle();
    }

    if (key === "showAmbientGradient") {
      next.coverColorSyncMode = value ? "normal" : "off";
      kickThemeSettle();
    }

    if (
      key === "homeBannerType" ||
      key === "mediaCardBackground" ||
      key === "homeLayoutMode" ||
      key === "libraryRowStyle" ||
      key === "sidebarBehavior" ||
      key === "playerBackgroundStyle" ||
      key === "catBuddyEnabled"
    ) {
      kickThemeSettle();
    }

    if (key === "animatedBackgrounds" || key === "animeVisuals") {
      next.animatedBackgrounds = true;
      next.animeVisuals = true;
    }

    const saved = await persistSettings(next, debounce, isImmediateSettingsKey(String(key)) ? "immediate" : "transition");

    if (saved && !debounce && bootedRef.current && settingsRef.current === next) {
      if (key === "theme") {
        showAppToast("Theme changed", "success");
      } else if (String(key).startsWith("discord")) {
        showAppToast("Discord presence updated", "success");
      } else if (key === "autoUpdateEnabled" || key === "autoUpdateNotifyOnly") {
        showAppToast("Settings saved", "success");
      }
    }
  }

  async function updateSettingsPatch(patch: Partial<Settings>, debounce = false) {
    const currentSettings = settingsRef.current;
    const next: Settings = {
      ...currentSettings,
      ...patch
    };

    if (Object.prototype.hasOwnProperty.call(patch, "coverColorSyncMode")) {
      next.coverColorSyncMode = normalizeCoverColorSyncMode(patch.coverColorSyncMode);
      next.showAmbientGradient = next.coverColorSyncMode !== "off";
    } else if (Object.prototype.hasOwnProperty.call(patch, "showAmbientGradient")) {
      next.coverColorSyncMode = patch.showAmbientGradient ? "normal" : "off";
    }

    if (patch.theme) {
      next.theme = normalizeThemeId(patch.theme);
    }


    if (Object.prototype.hasOwnProperty.call(patch, "animatedBackgrounds") || Object.prototype.hasOwnProperty.call(patch, "animeVisuals")) {
      next.animatedBackgrounds = true;
      next.animeVisuals = true;
    }
    if (patch.theme) kickThemeSettle();

    const patchKeys = Object.keys(patch || {});
    const priority = patchKeys.some((key) => isImmediateSettingsKey(key)) ? "immediate" : "transition";
    return persistSettings(next, debounce, priority);
  }

  function resetDiscordSettings() {
    void updateSettingsPatch({
      discordEnabled: defaultSettings.discordEnabled,
      discordShowPausedIdle: defaultSettings.discordShowPausedIdle,
      discordPrivacyMode: defaultSettings.discordPrivacyMode,
      discordButtons: defaultSettings.discordButtons,
      discordArtMode: defaultSettings.discordArtMode,
      discordActivityStyle: defaultSettings.discordActivityStyle,
      discordTitleCleanup: defaultSettings.discordTitleCleanup,
      discordSecondLine: defaultSettings.discordSecondLine
    }).then(saved => {
      if (!saved) return;
      setStatusText("Discord settings reset");
      showAppToast("Discord settings reset", "success");
    });
  }

  function resetAppearanceSettings() {
    void updateSettingsPatch({
      theme: defaultSettings.theme,
      showAmbientGradient: defaultSettings.showAmbientGradient,
      coverColorSyncMode: defaultSettings.coverColorSyncMode,
      showFloatingNotes: defaultSettings.showFloatingNotes,
      homeBannerType: VISUAL_CUSTOMIZATION_DEFAULTS.homeBannerType,
      mediaCardBackground: VISUAL_CUSTOMIZATION_DEFAULTS.mediaCardBackground,
      homeLayoutMode: VISUAL_CUSTOMIZATION_DEFAULTS.homeLayoutMode,
      homeHeroCoverBrightness: defaultSettings.homeHeroCoverBrightness,
      sidebarBehavior: VISUAL_CUSTOMIZATION_DEFAULTS.sidebarBehavior,
      playerBackgroundStyle: VISUAL_CUSTOMIZATION_DEFAULTS.playerBackgroundStyle,
      animeVisuals: true,
      animatedBackgrounds: true,
      gifVisualsMode: defaultSettings.gifVisualsMode,
      animatedGlow: defaultSettings.animatedGlow,
      softCorners: defaultSettings.softCorners,
      reducedMotion: defaultSettings.reducedMotion,
      catBuddyEnabled: defaultSettings.catBuddyEnabled,
      idleScreensaverEnabled: defaultSettings.idleScreensaverEnabled
    }).then(saved => {
      if (!saved) return;
      setStatusText("appearance reset");
      showAppToast("Appearance reset", "success");
    });
  }

  function resetPlayerLayoutSettings() {
    void updateSettingsPatch({
      playerSize: defaultSettings.playerSize,
      compactPlayer: defaultSettings.compactPlayer,
      showVisualizer: defaultSettings.showVisualizer,
      volume: defaultSettings.volume,
      playbackSpeed: defaultSettings.playbackSpeed
    }).then(saved => {
      if (!saved) return;
      setStatusText("player layout reset");
      showAppToast("Player layout reset", "success");
    });
  }

  function resetLibraryLayoutSettings() {
    void updateSettingsPatch({
      sidebarWidth: defaultSettings.sidebarWidth,
      denseList: defaultSettings.denseList,
      heroExpanded: defaultSettings.heroExpanded,
      showHeroBadge: defaultSettings.showHeroBadge
    }).then(saved => {
      if (!saved) return;
      setStatusText("library layout reset");
      showAppToast("Library layout reset", "success");
    });
  }

  async function resetAllSettingsSafely() {
    const confirmed = window.confirm("Reset all localtify settings? Your imported songs will stay in the library.");
    if (!confirmed) return;

    try {
      await Promise.all([window.localitfy.setAnalysisEnabled(false), window.localitfy.setAnalysisOnBattery(false), window.localitfy.setListeningHistoryEnabled(true)]);
      if (!await updateSettingsPatch(defaultSettings)) return;
    } catch {
      showAppToast("Could not reset experimental settings. Please try again.", "error");
      return;
    }
    setStatusText("all settings reset");
    showAppToast("All settings reset", "success");
  }

  function updateCoverColorSyncMode(mode: CoverColorSyncMode) {
    const safeMode = normalizeCoverColorSyncMode(mode);
    void updateSettingsPatch(
      {
        coverColorSyncMode: safeMode,
        showAmbientGradient: safeMode !== "off"
      },
      true
    );
  }

  return {
    flushSettings, saveSettingsSafely, persistSettings, updateSetting, updateSettingsPatch, resetDiscordSettings, resetAppearanceSettings, resetPlayerLayoutSettings, resetLibraryLayoutSettings, resetAllSettingsSafely, updateCoverColorSyncMode,
    settings, setSettings, settingsRef, settingsSaveError,
    retrySettingsSave: () => saveSettingsSafely(settingsRef.current),
    settingsCategory, setSettingsCategory,
    settingsSearch, setSettingsSearch, deferredSettingsSearch,
    themeSettling, setThemeSettling,
    themeMotionReady, setThemeMotionReady,
    saveSettingsTimerRef, writeSettings,
    themeSettlingTimerRef,
    themePaintIdleTimerRef,
    themeSettlingRef
  };
}
