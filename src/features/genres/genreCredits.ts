function cleanGenreCredit(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function splitGenreCredits(value: unknown) {
  const uniqueGenres = new Map<string, string>();
  for (const rawGenre of String(value ?? "").split(";")) {
    const genre = cleanGenreCredit(rawGenre);
    if (!genre) continue;
    const key = genre.toLocaleLowerCase();
    if (!uniqueGenres.has(key)) uniqueGenres.set(key, genre);
  }
  return [...uniqueGenres.values()];
}
