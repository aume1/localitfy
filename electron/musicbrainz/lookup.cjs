"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { fetchCoverArt } = require("./client.cjs");
const { similarity, primaryArtist, releaseRank, formatGenres, buildProposal, pickRecording, matchReleaseTracks } = require("./match.cjs");

const DEFAULT_ALBUM = "local files";
const NOISE = /\s*[([](?:&|(?:feat\.?|ft\.?|with|prod\.?|official|audio|video|lyrics?|visuali[sz]er|explicit|hq|hd)\b)[^)\]]*[)\]]/gi;
const searchTitle = (title) => String(title || "").replace(NOISE, "").trim() || String(title || "");

/**
 * Looks songs up on MusicBrainz and downloads each release's front cover once into coverDir,
 * so previews and applied covers never load from the network afterwards.
 */
function createTaggingLookup({ client, coverDir, userAgent, fetchImpl = fetch }) {
  const genreCache = new Map();
  const coverCache = new Map();

  async function genresFor(releaseGroupId, artistIds = []) {
    const key = `${releaseGroupId || ""}|${artistIds[0] || ""}`;
    if (!genreCache.has(key)) {
      genreCache.set(key, (async () => {
        const group = releaseGroupId ? formatGenres(await client.getReleaseGroupGenres(releaseGroupId).catch(() => [])) : "";
        return group || (artistIds[0] ? formatGenres(await client.getArtistGenres(artistIds[0]).catch(() => [])) : "");
      })());
    }
    return genreCache.get(key);
  }

  async function coverFor(releaseId, releaseGroupId) {
    if (!releaseId) return "";
    if (!coverCache.has(releaseId)) {
      coverCache.set(releaseId, (async () => {
        for (const ext of [".jpg", ".png"]) { const existing = path.join(coverDir, releaseId + ext); if (fs.existsSync(existing)) return existing; }
        const art = await fetchCoverArt({ releaseId, releaseGroupId, userAgent, fetchImpl }).catch(() => null);
        if (!art) return "";
        fs.mkdirSync(coverDir, { recursive: true });
        const target = path.join(coverDir, releaseId + art.ext);
        fs.writeFileSync(target + ".part", art.data);
        fs.renameSync(target + ".part", target);
        return target;
      })());
    }
    return coverCache.get(releaseId);
  }

  async function finish(proposal) {
    proposal.tags.genre = await genresFor(proposal.genreFromArtist ? "" : proposal.ids.releaseGroupId, proposal.ids.artistIds);
    proposal.coverPath = await coverFor(proposal.ids.releaseId, proposal.ids.releaseGroupId);
    return proposal;
  }

  async function lookupSong(song) {
    const title = searchTitle(song.title);
    const artist = primaryArtist(song.artist);
    let recordings = await client.searchRecordings(title, artist);
    if (!recordings.length && artist) recordings = await client.searchRecordings(title, "");
    const picked = pickRecording({ ...song, title }, recordings);
    return picked ? finish(buildProposal(song, picked)) : null;
  }

  /** Matches a whole album to one release so every track shares the same release and cover. */
  async function lookupAlbum(songs) {
    const album = songs[0].album;
    const releases = await client.searchReleases(album, primaryArtist(songs[0].artist));
    const candidates = releases
      .filter((release) => similarity(release.title, album) >= 0.8)
      .map((release) => ({ release, rank: releaseRank(release) - Math.abs((release["track-count"] || 0) - songs.length) * 0.3 - ((release["track-count"] || 0) < songs.length ? 2 : 0) }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 3);
    let best = null;
    for (const { release } of candidates) {
      const full = await client.getRelease(release.id).catch((error) => { if (error?.code === "MUSICBRAINZ_UNREACHABLE") throw error; return null; });
      if (!full) continue;
      const matches = matchReleaseTracks(songs, full);
      const quality = matches.length + matches.reduce((sum, match) => sum + match.score, 0) / Math.max(1, matches.length);
      if (!best || quality > best.quality) best = { full, matches, quality };
      if (matches.length === songs.length) break;
    }
    if (!best) return { proposals: [], unmatched: songs };
    const proposals = [];
    for (const match of best.matches) {
      const recording = { ...match.recording, title: match.track.title || match.recording.title, "artist-credit": match.track["artist-credit"] || match.recording["artist-credit"] };
      proposals.push(await finish(buildProposal(match.song, { recording, release: best.full, track: match.track, medium: match.medium, score: match.score })));
    }
    const matched = new Set(proposals.map((proposal) => proposal.songId));
    return { proposals, unmatched: songs.filter((song) => !matched.has(song.id)) };
  }

  /** One album folder (or one artist's singles); songs an album lookup cannot place are looked up alone. */
  async function lookupGroup(songs) {
    const isAlbum = songs.length > 1 && String(songs[0].album || DEFAULT_ALBUM).toLocaleLowerCase() !== DEFAULT_ALBUM;
    const { proposals, unmatched } = isAlbum ? await lookupAlbum(songs) : { proposals: [], unmatched: songs };
    const missed = [];
    for (const song of unmatched) {
      const proposal = await lookupSong(song).catch((error) => { if (error?.code === "MUSICBRAINZ_UNREACHABLE") throw error; return null; });
      if (proposal) proposals.push(proposal); else missed.push(song.id);
    }
    return { proposals, missed };
  }

  return { lookupSong, lookupAlbum, lookupGroup };
}

module.exports = { createTaggingLookup, searchTitle };
