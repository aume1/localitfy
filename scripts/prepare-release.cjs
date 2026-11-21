"use strict";

const fs = require("node:fs");
const path = require("node:path");

const NATIVE_FILENAME = /^localtify_rust_kernels\.[a-z0-9_-]+\.[a-z0-9_-]+\.node$/i;

function prepareRelease(root, includeRust = false) {
  const nativeDirectory = path.join(root, "electron", "native");
  const currentAddon = `localtify_rust_kernels.${process.platform}.${process.arch}.node`;
  if (includeRust && !fs.existsSync(path.join(nativeDirectory, currentAddon))) {
    throw new Error("The native release requires a built addon for this OS and architecture");
  }

  fs.rmSync(path.join(root, "release"), { recursive: true, force: true });
  // Only the Last.fm APPLICATION API key may be packaged. Never include a
  // shared secret, arbitrary .env fields, or credentials in the renderer.
  // This is a distributed public client identifier, not a private credential:
  // users can extract all data shipped inside a desktop executable.
  const providerFile = path.join(root, "build", "provider-defaults.json");
  const localEnv = path.join(root, ".env");
  const parsed = fs.existsSync(localEnv) ? require("dotenv").parse(fs.readFileSync(localEnv)) : {};
  const key = String(process.env.LOCALTIFY_LASTFM_API_KEY || parsed.LOCALTIFY_LASTFM_API_KEY || "").trim();
  if (key && !/^[0-9a-f]{32}$/i.test(key)) throw new Error("LOCALTIFY_LASTFM_API_KEY must be a 32-character hexadecimal application key");
  fs.mkdirSync(path.dirname(providerFile), { recursive: true });
  fs.writeFileSync(providerFile, JSON.stringify({ lastfmApiKey: key || "" }) + "\n", { mode: 0o600 });
  if (!fs.existsSync(nativeDirectory)) return;

  for (const filename of fs.readdirSync(nativeDirectory)) {
    if (!NATIVE_FILENAME.test(filename) || (includeRust && filename === currentAddon)) continue;
    fs.rmSync(path.join(nativeDirectory, filename));
  }
}

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const includeRust = process.env.LOCALTIFY_INCLUDE_RUST_ADDON === "1";
  prepareRelease(root, includeRust);
  console.log("[localtify release] clean output; optional Rust addon " +
    (includeRust ? "retained for explicit native package" : "excluded from standard package"));
}

module.exports = { prepareRelease };
