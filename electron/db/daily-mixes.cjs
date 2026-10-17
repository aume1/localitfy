function createDailyMixesTable(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS daily_mixes (
    day TEXT PRIMARY KEY, edition INTEGER NOT NULL, fingerprint TEXT NOT NULL,
    result TEXT NOT NULL, generatedAt INTEGER NOT NULL
  )`);
}
module.exports = { createDailyMixesTable };
