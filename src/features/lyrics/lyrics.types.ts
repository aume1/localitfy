/** `time` is in seconds; plain (unsynced) lines use -1. */
export type LyricsLine = { time: number; text: string };

export type LyricsResult = {
  status: "synced" | "plain" | "instrumental" | "missing" | "offline" | "disabled" | "error";
  /** Where the lyrics came from: a `.lrc` file next to the song, LRCLIB, or nowhere. */
  source: "file" | "lrclib" | "none";
  lines: LyricsLine[];
  error?: string;
};
