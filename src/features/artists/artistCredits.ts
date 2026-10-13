const ARTIST_CREDIT_SEPARATOR = /;|\s+feat\.?\s+/gi;

function cleanArtistCredit(value: unknown) {
  return String(value || "unknown artist").trim().replace(/\s+/g, " ") || "unknown artist";
}

export function splitArtistCredits(value: unknown) {
  const names = cleanArtistCredit(value).split(ARTIST_CREDIT_SEPARATOR).map(cleanArtistCredit);
  const uniqueNames = new Map<string, string>();
  for (const name of names) uniqueNames.set(name.toLocaleLowerCase(), name);
  return [...uniqueNames.values()];
}
