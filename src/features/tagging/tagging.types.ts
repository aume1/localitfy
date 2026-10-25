/** Songs of one album folder (or one artist's singles when the album is "local files"). */
export type TagAlbumGroup = { key: string; album: string; artist: string; folder: string; songIds: string[]; untaggedIds: string[]; releaseCount: number };

export type TagAudit = { total: number; tagged: number; missing: number; untaggedCount: number; untagged: TagAlbumGroup[]; splitAlbums: TagAlbumGroup[] };

export type ProposedTags = {
  title: string; artist: string; album: string; albumArtist: string; date: string; year: string;
  trackNumber: number; trackTotal: number; discNumber: number; discTotal: number; genre: string;
  releaseType: string; releaseStatus: string; releaseCountry: string;
};

export type TagProposal = {
  songId: string;
  /** Matches TagAlbumGroup.key, so restored proposals land under the right album. */
  groupKey: string;
  confidence: number;
  current: { title: string; artist: string; album: string; genre: string };
  tags: ProposedTags;
  /** Local media URL of the downloaded cover, or "" when the release has none. */
  coverUrl: string;
  musicbrainzUrl: string;
  /** False for formats other than MP3/FLAC: only the library is updated. */
  writable: boolean;
};

export type TagLookupResult = { proposals: TagProposal[]; missed: string[] };

export type TagApplyResult = { applied: number; written: number; failed: { songId: string; title: string; error: string }[] };
