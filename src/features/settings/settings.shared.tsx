import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Slider } from "../../shared/ui/Slider";
import { Surface } from "../../shared/ui/Surface";

import { clampUpperFirst as clamp } from "../../shared/utils/format";
import { getLocaltifyPlatformInfo, type LocaltifyPlatformInfo } from "../../app/platform";
function SettingRow({ label, help, range = false, children }: { label: string; help?: string; range?: boolean; children: ReactNode }) {
  return <label className={range ? "rangeRow" : "toggleRow"} title={range ? `${label}: ${help || ""}` : help || label}>
    <span className={range ? "rangeRowCopy" : "toggleRowCopy"}>
      <span className="settingsLabelLine"><strong>{label}</strong></span>
      {help ? <small>{help}</small> : null}
    </span>
    {children}
  </label>;
}

export function ToggleRow({ label, help, checked, onChange, disabled }: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <SettingRow label={label} help={help}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
    </SettingRow>
  );
}

export function RangeRow({ label, value, min, max, step, suffix, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const [draftValue, setDraftValue] = useState(value);
  const [editing, setEditing] = useState(false);
  const pointerEditing = useRef(false);
  const activeValue = editing ? draftValue : value;
  const shownValue = `${activeValue}${suffix || ""}`;
  const fill = ((activeValue - min) / (max - min || 1)) * 100;

  useEffect(() => {
    if (!editing) setDraftValue(value);
  }, [editing, value]);

  function commit(nextValue = draftValue) {
    const clamped = clamp(nextValue, min, max);
    pointerEditing.current = false;
    setDraftValue(clamped);
    setEditing(false);
    if (clamped !== value) onChange(clamped);
  }

  return (
    <SettingRow label={label} help={shownValue} range>
      <Slider
        aria-label={label}
        aria-valuetext={shownValue}
        min={min}
        max={max}
        step={step}
        value={activeValue}
        style={{ ["--range-progress" as string]: `${clamp(fill, 0, 100)}%` } as CSSProperties}
        onPointerDown={() => { pointerEditing.current = true; setEditing(true); setDraftValue(value); }}
        onChange={(event) => {
          const nextValue = Number(event.currentTarget.value);
          setDraftValue(nextValue);
          if (!pointerEditing.current) commit(nextValue);
        }}
        onPointerUp={(event) => { if (pointerEditing.current) commit(Number(event.currentTarget.value)); }}
        onPointerCancel={() => { pointerEditing.current = false; setDraftValue(value); setEditing(false); }}
        onBlur={(event) => { if (pointerEditing.current) commit(Number(event.currentTarget.value)); }}
      />
    </SettingRow>
  );
}

export function SettingSection({ title, description, icon, className = "", children }: {
  title: string; description?: string; icon?: ReactNode; className?: string; children: ReactNode;
}) {
  return <Surface as="div" className={`settingsPanelCard ${className}`.trim()}>
    <div className="settingsPanelHeader"><div><strong>{title}</strong>{description ? <span>{description}</span> : null}</div>{icon}</div>
    {children}
  </Surface>;
}

export type ChoiceOption = { id: string; label?: string; name?: string; note?: string };
export type SongLike = { id?: string; title?: string; artist?: string; album?: string; [key: string]: unknown };
export type PlatformInfoLike = Partial<LocaltifyPlatformInfo>;
export type DiagnosticsInfo = { items: Array<{ label: string; value: string | number }>; copyText: string };
export type UpdateSetting = (key: string, value: unknown) => void | Promise<void>;

export function detectSettingsPlatform(): Required<PlatformInfoLike> {
  return getLocaltifyPlatformInfo();
}
