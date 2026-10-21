export type AnalysisStatus = {
  supported: boolean;
  enabled: boolean;
  historyEnabled: boolean;
  model: { id: string; name: string; revision: string; source: string; license: string; licenseUrl: string; bytes: number; dimensions: number; sampleRate: number };
  download: { state: "not-installed" | "downloading" | "ready" | "error"; downloadedBytes: number; totalBytes: number; error: string };
  paused: boolean;
  running: boolean;
  scanning: boolean;
  queued: number;
  currentSongId: string | null;
  completed: number;
  failed: number;
  analyzed: number;
  failures: number;
  onBattery: boolean;
  allowOnBattery: boolean;
  error: string;
};

export type SimilarSongsResult = {
  seedId: string;
  status: "ready" | "seed-unavailable" | "seed-missing" | "seed-unanalyzed" | "seed-stale" | "no-history";
  matches: Array<{ songId: string; score: number; playedTogether?: boolean }>;
  compared: number;
  /** Seed songs with usable audio profiles (more than one for playlists, liked songs and recent listening). */
  seedCount: number;
};

export type DailyMix = { id: string; name: string; songIds: string[] };
export type DailyMixesResult = {
  day: string; edition: number; generatedAt: number; eligible: number; mixes: DailyMix[];
};
