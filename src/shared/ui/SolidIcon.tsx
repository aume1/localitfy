import type { ReactNode, SVGProps } from "react";

export type SolidIconName =
  | "home" | "library" | "album" | "discover" | "analytics" | "download"
  | "settings" | "palette" | "playback" | "lyrics" | "discord" | "analysis"
  | "updates" | "advanced" | "about" | "play" | "pause" | "equalizer" | "heart" | "add";

type Props = Omit<SVGProps<SVGSVGElement>, "children"> & {
  name: SolidIconName;
  size?: number;
};

const icons: Record<SolidIconName, ReactNode> = {
  home: <path d="M3 10.3 12 3l9 7.3V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z" />,
  library: <><rect x="3" y="4" width="4" height="16" rx="1.3" /><rect x="9" y="4" width="4" height="16" rx="1.3" /><path d="m16 4 3.5-.9L23 19l-3.5.9z" /></>,
  album: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3.2" fill="var(--lt-bg)" /><circle cx="12" cy="12" r="1" /></>,
  discover: <><circle cx="12" cy="12" r="10" /><path d="m16.7 7.3-3.1 6.3-6.3 3.1 3.1-6.3z" fill="var(--lt-bg)" /><circle cx="12" cy="12" r="1.1" /></>,
  analytics: <><rect x="3" y="12" width="4" height="9" rx="1.2" /><rect x="10" y="7" width="4" height="14" rx="1.2" /><rect x="17" y="3" width="4" height="18" rx="1.2" /></>,
  download: <><path d="M10 3h4v10h4l-6 6-6-6h4z" /><path d="M3 19h18v2H3z" /></>,
  settings: <><path d="m10.5 2-.6 2.1-2.2.9-1.9-1.1-2 2 1.1 1.9-.9 2.2-2 .5v3l2 .5.9 2.2-1.1 1.9 2 2 1.9-1.1 2.2.9.6 2.1h3l.5-2.1 2.2-.9 1.9 1.1 2-2-1.1-1.9.9-2.2 2.1-.5v-3l-2.1-.5-.9-2.2 1.1-1.9-2-2-1.9 1.1-2.2-.9-.5-2.1z" /><circle cx="12" cy="12" r="3.3" fill="var(--lt-bg)" /></>,
  palette: <><path d="M12 2a10 10 0 0 0-2.7 19.6c1.9.6 3.7-.5 3.7-2.3 0-1.4-.6-2.5.9-2.5h2.6C20.7 16.8 22 14.3 22 12A10 10 0 0 0 12 2Z" /><circle cx="7.3" cy="12.7" r="1.4" fill="var(--lt-bg)" /><circle cx="9.2" cy="7.2" r="1.4" fill="var(--lt-bg)" /><circle cx="15" cy="7.1" r="1.4" fill="var(--lt-bg)" /><circle cx="18.3" cy="11.7" r="1.3" fill="var(--lt-bg)" /></>,
  playback: <><circle cx="12" cy="12" r="10" /><path d="m9.5 7.4 7.2 4.6-7.2 4.6z" fill="var(--lt-bg)" /></>,
  lyrics: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M6 11h2a4 4 0 0 0 8 0h2a6 6 0 0 1-5 5.9V20h4v2H7v-2h4v-3.1A6 6 0 0 1 6 11Z" /></>,
  discord: <><path d="M5 3h14a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H10l-6 4v-4a3 3 0 0 1-2-3V6a3 3 0 0 1 3-3Z" /><rect x="7" y="8" width="10" height="2" rx="1" fill="var(--lt-bg)" /><rect x="7" y="12" width="7" height="2" rx="1" fill="var(--lt-bg)" /></>,
  analysis: <><rect x="2" y="10" width="3" height="5" rx="1.5" /><rect x="7" y="5" width="3" height="14" rx="1.5" /><rect x="12" y="2" width="3" height="20" rx="1.5" /><rect x="17" y="7" width="3" height="10" rx="1.5" /><rect x="22" y="10" width="2" height="4" rx="1" /></>,
  updates: <><path d="M12 2a10 10 0 0 1 9.9 11h-3a7 7 0 1 0-2.1 4.5L14 15h8v8l-3-3A10 10 0 1 1 12 2Z" /></>,
  advanced: <><rect x="3" y="5" width="18" height="3" rx="1.5" /><rect x="3" y="11" width="18" height="3" rx="1.5" /><rect x="3" y="17" width="18" height="3" rx="1.5" /><circle cx="8" cy="6.5" r="2.5" fill="var(--lt-bg)" /><circle cx="16" cy="12.5" r="2.5" fill="var(--lt-bg)" /><circle cx="10" cy="18.5" r="2.5" fill="var(--lt-bg)" /></>,
  about: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="7" r="1.5" fill="var(--lt-bg)" /><path d="M11 11h2v7h-2z" fill="var(--lt-bg)" /></>,
  play: <path d="M8 4.6a1.6 1.6 0 0 0-2.4 1.4v12a1.6 1.6 0 0 0 2.4 1.4l10.2-6a1.6 1.6 0 0 0 0-2.8Z" />,
  add: <path d="M10.5 3h3v7.5H21v3h-7.5V21h-3v-7.5H3v-3h7.5z" />,
  pause: <><rect x="5" y="4" width="5" height="16" rx="1.3" /><rect x="14" y="4" width="5" height="16" rx="1.3" /></>,
  equalizer: <><rect x="3" y="9" width="3" height="6" rx="1.5" /><rect x="8" y="5" width="3" height="14" rx="1.5" /><rect x="13" y="7" width="3" height="10" rx="1.5" /><rect x="18" y="10" width="3" height="4" rx="1.5" /></>,
  heart: <path d="M12 21s-9.5-5.8-9.5-12A5.5 5.5 0 0 1 12 5.2 5.5 5.5 0 0 1 21.5 9C21.5 15.2 12 21 12 21Z" />
};

export function SolidIcon({ name, size = 20, style, ...props }: Props) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"
    aria-hidden="true" focusable="false" style={{ display: "block", flexShrink: 0, ...style }} {...props}>
    {icons[name]}
  </svg>;
}
