import type { Playlist as SyncPlaylist } from "./playlist.types";

function samePlaylist(a: SyncPlaylist, b: SyncPlaylist) {
  return a.name === b.name && (a.coverArtwork || "") === (b.coverArtwork || "") &&
    a.songIds.length === b.songIds.length && a.songIds.every((id, index) => id === b.songIds[index]);
}

/** Keeps the Mac's order, drops songs the phone removed and inserts songs the phone added after their phone neighbours. */
export function mergeSongIds(base: string[], mac: string[], phone: string[]) {
  const phoneSet = new Set(phone);
  const baseSet = new Set(base);
  const removed = new Set(base.filter((id) => !phoneSet.has(id)));
  const result = [...new Set(mac.filter((id) => !removed.has(id)))];
  const present = new Set(result);
  phone.forEach((id, index) => {
    if (baseSet.has(id) || present.has(id)) return;
    // After the nearest earlier phone song that is still in the list (its direct neighbour may be gone).
    let previous = -1;
    for (let back = index - 1; back >= 0 && previous === -1; back -= 1) previous = result.indexOf(phone[back]);
    result.splice(previous + 1, 0, id);
    present.add(id);
  });
  return result;
}

export function phonePlaylistChanges(base: SyncPlaylist[], mac: SyncPlaylist[], phone: SyncPlaylist[]) {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const macById = new Map(mac.map((item) => [item.id, item]));
  const phoneById = new Map(phone.map((item) => [item.id, item]));
  const put: SyncPlaylist[] = [];
  const remove: string[] = [];
  for (const id of new Set([...baseById.keys(), ...macById.keys(), ...phoneById.keys()])) {
    const b = baseById.get(id);
    const m = macById.get(id);
    const p = phoneById.get(id);
    if (!p) {
      // Deleted on the phone: delete on the Mac too, unless the Mac edited it since.
      if (b && m && samePlaylist(m, b)) remove.push(id);
      continue;
    }
    if (!b) {
      if (!m) put.push(p);
      else if (!samePlaylist(m, p)) put.push({...m, songIds: mergeSongIds([], m.songIds, p.songIds)});
      continue;
    }
    if (samePlaylist(p, b)) continue;
    // Edited on the phone. If the Mac deleted it meanwhile, the phone's edits bring it back.
    if (!m || samePlaylist(m, b)) {
      put.push(p);
      continue;
    }
    put.push({
      ...m,
      name: p.name !== b.name ? p.name : m.name,
      ...((p.coverArtwork || "") !== (b.coverArtwork || "") ? { coverArtwork: p.coverArtwork } : {}),
      songIds: mergeSongIds(b.songIds, m.songIds, p.songIds)
    });
  }
  return { put, delete: remove };
}

export function rebasePlaylists(sent: SyncPlaylist[], current: SyncPlaylist[], received: SyncPlaylist[]) {
  const later = phonePlaylistChanges(sent, received, current);
  const put = new Map(later.put.map((playlist) => [playlist.id, playlist]));
  const removed = new Set(later.delete);
  const known = new Set(received.map((playlist) => playlist.id));
  return {
    playlists: [
      ...later.put.filter((playlist) => !known.has(playlist.id)),
      ...received.filter((playlist) => !removed.has(playlist.id)).map((playlist) => put.get(playlist.id) || playlist)
    ],
    changed: Boolean(later.put.length || later.delete.length)
  };
}
