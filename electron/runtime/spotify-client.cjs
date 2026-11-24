const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { bestSpotifyImage, parseSpotifyUrl, shapeSpotifyTrack, decodeHtmlEntities, uniqSpotifyIds } = require("./spotify-normalize.cjs");

const SPOTIFY_BROWSER_UA = process.platform === "win32"
  ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function createSpotifyClient({app, BrowserWindow, safeStorage, getWindow}) {
  const SPOTIFY_REDIRECT_PORT = Number(process.env.SPOTIFY_REDIRECT_PORT || 43877);
  const SPOTIFY_REDIRECT_URI = String(process.env.SPOTIFY_REDIRECT_URI || `http://127.0.0.1:${SPOTIFY_REDIRECT_PORT}/spotify/callback`);
  const SPOTIFY_CLIENT_ID = String(
    process.env.SPOTIFY_CLIENT_ID ||
    process.env.VITE_SPOTIFY_CLIENT_ID ||
    process.env.VITE_PUBLIC_SPOTIFY_CLIENT_ID ||
    "586c22791eb74d73b1c83db88f1d4c52"
  ).trim();
  const SPOTIFY_OAUTH_FILE = () => path.join(app.getPath("userData"), "spotify-oauth.json");
  let _spotifyToken = null;
  let _spotifyTokenExpiry = 0;
  let storedToken = null, tokenLoaded = false, tokenGeneration = 0;
  let refreshPending = null, loginPending = null, cancelLogin = null;

  function base64UrlEncode(value) {
    return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
  function makeSpotifyCodeVerifier() { return base64UrlEncode(crypto.randomBytes(48)); }
  function makeSpotifyCodeChallenge(verifier) { return base64UrlEncode(crypto.createHash("sha256").update(verifier).digest()); }
  function secureAvailable() {
    return safeStorage?.isEncryptionAvailable?.() === true && safeStorage?.getSelectedStorageBackend?.() !== "basic_text";
  }
  function normalizeToken(parsed) {
    if (!parsed || typeof parsed !== "object") return null;
    return { accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : "", refreshToken: typeof parsed.refreshToken === "string" ? parsed.refreshToken : "", expiresAt: Number(parsed.expiresAt || 0) };
  }
  function readSpotifyOAuthToken() {
    if (tokenLoaded) return storedToken;
    const filePath = SPOTIFY_OAUTH_FILE();
    if (!fs.existsSync(filePath)) { tokenLoaded = true; return null; }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!secureAvailable()) throw new Error("Secure credential storage is unavailable. Unlock your system keyring or use public import.");
    if (typeof parsed?.encrypted === "string") {
      storedToken = normalizeToken(JSON.parse(safeStorage.decryptString(Buffer.from(parsed.encrypted, "base64"))));
      tokenLoaded = true;
    } else {
      const legacy = normalizeToken(parsed);
      if (legacy) writeSpotifyOAuthToken(legacy);
      else tokenLoaded = true;
    }
    return storedToken;
  }
  function writeSpotifyOAuthToken(token) {
    if (!secureAvailable()) throw new Error("Secure credential storage is unavailable. Unlock your system keyring or use public import.");
    const filePath = SPOTIFY_OAUTH_FILE();
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const temporary = filePath + "." + crypto.randomUUID() + ".tmp";
    try {
      const encrypted = safeStorage.encryptString(JSON.stringify(token)).toString("base64");
      fs.writeFileSync(temporary, JSON.stringify({version: 1, encrypted}), {mode: 0o600});
      fs.renameSync(temporary, filePath);
      storedToken = token;
      tokenLoaded = true;
    } finally { fs.rmSync(temporary, {force: true}); }
  }
  function clearSpotifyOAuthToken() {
    tokenGeneration++;
    cancelLogin?.("Spotify login cancelled.");
    refreshPending = null;
    fs.rmSync(SPOTIFY_OAUTH_FILE(), {force: true});
    storedToken = null;
    tokenLoaded = true;
    _spotifyToken = null;
    _spotifyTokenExpiry = 0;
  }
  function saveSpotifyOAuthResponse(data = {}, previous = {}, generation = tokenGeneration) {
    if (generation !== tokenGeneration) throw new Error("Spotify login cancelled.");
    const expiresIn = Number(data.expires_in || 3600);
    const next = {
      accessToken: String(data.access_token || previous.accessToken || ""),
      refreshToken: String(data.refresh_token || previous.refreshToken || ""),
      expiresAt: Date.now() + Math.max(60, expiresIn - 90) * 1000
    };
    if (!next.accessToken) throw new Error("Spotify did not return an access token.");
    writeSpotifyOAuthToken(next);
    _spotifyToken = next.accessToken;
    _spotifyTokenExpiry = next.expiresAt;
    return next;
  }

  function spotifyHttpGet(urlString, extraHeaders = {}, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
      let parsed;
      try { parsed = new URL(urlString); } catch { return reject(new Error("Invalid Spotify URL")); }
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || (parsed.port && parsed.port !== "443") || !["api.spotify.com", "open.spotify.com", "accounts.spotify.com"].includes(parsed.hostname)) return reject(new Error("Invalid Spotify request host"));
      const options = {
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method: "GET",
        timeout: 15000,
        headers: {
          "User-Agent": SPOTIFY_BROWSER_UA,
          "Accept": "application/json, text/html, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Origin": "https://open.spotify.com",
          "Referer": "https://open.spotify.com/",
          "App-Platform": "WebPlayer",
          ...extraHeaders
        }
      };
      const req = https.request(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
          res.resume();
          const next = new URL(res.headers.location, urlString);
          if (extraHeaders.Authorization && next.origin !== parsed.origin) return reject(new Error("Spotify authorization redirect rejected"));
          return resolve(spotifyHttpGet(next.toString(), extraHeaders, maxRedirects - 1));
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { body += chunk; if (body.length > 16 * 1024 * 1024) { req.destroy(); reject(new Error("Spotify response too large")); } });
        res.on("end", () => resolve({ status: res.statusCode, body }));
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("Spotify request timed out")); });
      req.end();
    });
  }

  function spotifyHttpPostForm(urlString, formData = {}) {
    return new Promise((resolve, reject) => {
      let parsed;
      try { parsed = new URL(urlString); } catch { return reject(new Error(`Invalid Spotify URL: ${urlString}`)); }
      const body = new URLSearchParams(formData).toString();
      const req = https.request({
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method: "POST",
        timeout: 15000,
        headers: {
          "User-Agent": SPOTIFY_BROWSER_UA,
          "Accept": "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body)
        }
      }, (res) => {
        let responseBody = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { responseBody += chunk; if (responseBody.length > 1024 * 1024) { req.destroy(); reject(new Error("Spotify token response too large")); } });
        res.on("end", () => resolve({ status: res.statusCode, body: responseBody }));
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("Spotify request timed out")); });
      req.write(body);
      req.end();
    });
  }

  async function spotifyTokenRequest(formData) {
    const res = await spotifyHttpPostForm("https://accounts.spotify.com/api/token", formData);
    let data = {};
    try { data = JSON.parse(res.body || "{}"); } catch { data = {}; }
    if (res.status !== 200) {
      const detail = data?.error_description || data?.error || res.body?.slice?.(0, 160) || "";
      throw new Error(`Spotify OAuth returned HTTP ${res.status}${detail ? ` — ${detail}` : ""}`);
    }
    return data;
  }

  async function exchangeSpotifyAuthorizationCode(code, codeVerifier, generation) {
    const data = await spotifyTokenRequest({ grant_type: "authorization_code", code, redirect_uri: SPOTIFY_REDIRECT_URI, client_id: SPOTIFY_CLIENT_ID, code_verifier: codeVerifier });
    return saveSpotifyOAuthResponse(data, {}, generation);
  }
  function refreshSpotifyAccessToken(previous = readSpotifyOAuthToken()) {
    if (refreshPending) return refreshPending;
    if (!previous?.refreshToken) return Promise.reject(new Error("Spotify is not connected. Press Connect Spotify first."));
    const generation = tokenGeneration;
    const job = spotifyTokenRequest({ grant_type: "refresh_token", refresh_token: previous.refreshToken, client_id: SPOTIFY_CLIENT_ID })
      .then(data => saveSpotifyOAuthResponse(data, previous, generation))
      .finally(() => { if (refreshPending === job) refreshPending = null; });
    refreshPending = job;
    return job;
  }
  async function getSpotifyAccessToken() {
    if (!SPOTIFY_CLIENT_ID) throw new Error("Spotify OAuth is unavailable, but public fallback can still fetch public Spotify links.");
    const now = Date.now();
    const saved = readSpotifyOAuthToken();
    if (_spotifyToken && now < _spotifyTokenExpiry - 30_000) return _spotifyToken;
    if (saved?.accessToken && saved.expiresAt && now < saved.expiresAt - 30_000) {
      _spotifyToken = saved.accessToken;
      _spotifyTokenExpiry = saved.expiresAt;
      return saved.accessToken;
    }
    if (saved?.refreshToken) return (await refreshSpotifyAccessToken(saved)).accessToken;
    throw new Error("Spotify is not connected. Press Connect Spotify first.");
  }

  function createSpotifyCallbackWaiter(expectedState) {
    let server = null;
    let timer = null;
    let settled = false;
    let finish = null;
    const promise = new Promise((resolve, reject) => {
      finish = (error, value) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        timer = null;
        try { if (server) server.close(); } catch {}
        server = null;
        if (error) reject(error); else resolve(value);
      };
      server = http.createServer((req, res) => {
        try {
          const requestUrl = new URL(req.url || "/", SPOTIFY_REDIRECT_URI);
          if (requestUrl.pathname !== "/spotify/callback") {
            res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
            res.end("not found");
            return;
          }
          const error = requestUrl.searchParams.get("error");
          if (error) {
            res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            res.end("<html><body style='font-family:sans-serif;background:#08070f;color:white'><h2>Spotify login cancelled.</h2><p>You can close this window.</p></body></html>");
            finish(new Error(`Spotify login cancelled: ${error}`));
            return;
          }
          const state = requestUrl.searchParams.get("state") || "";
          const code = requestUrl.searchParams.get("code") || "";
          if (!code) {
            res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
            res.end("missing spotify code");
            finish(new Error("Spotify did not return a login code."));
            return;
          }
          if (state !== expectedState) {
            res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
            res.end("spotify state mismatch");
            finish(new Error("Spotify login state mismatch. Try again."));
            return;
          }
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end("<html><body style='font-family:sans-serif;background:#08070f;color:white'><h2>Spotify connected to localtify.</h2><p>You can close this window now.</p></body></html>");
          finish(null, { code });
        } catch (error) { if (typeof finish === "function") finish(error); }
      });
      server.once("error", (error) => { if (typeof finish === "function") finish(new Error(`Spotify callback server failed: ${error?.message || error}`)); });
      timer = setTimeout(() => { if (typeof finish === "function") finish(new Error("Spotify login timed out.")); }, 5 * 60 * 1000);
      server.listen(SPOTIFY_REDIRECT_PORT, "127.0.0.1");
    });
    return { promise, cancel: (reason = "Spotify login cancelled.") => { if (!settled && typeof finish === "function") finish(new Error(reason)); } };
  }

  function loginSpotifyOAuth() {
    if (loginPending) return loginPending;
    const job = performSpotifyLogin().finally(() => { if (loginPending === job) loginPending = null; });
    loginPending = job;
    return job;
  }
  async function performSpotifyLogin() {
    if (!SPOTIFY_CLIENT_ID) {
      return { ok: true, ready: true, loggedIn: false, publicOnly: true, fallbackAvailable: true, mode: "public-fallback", needsClientId: false, redirectUri: SPOTIFY_REDIRECT_URI, error: "Spotify OAuth is unavailable, but public playlist/album/track import is ready." };
    }
    if (!secureAvailable()) return {ok: false, ready: true, loggedIn: false, fallbackAvailable: true, publicOnly: true, mode: "public-fallback", error: "Secure credential storage is unavailable. Unlock your system keyring or use public import."};
    const generation = ++tokenGeneration;
    refreshPending = null;
    const codeVerifier = makeSpotifyCodeVerifier();
    const codeChallenge = makeSpotifyCodeChallenge(codeVerifier);
    const state = base64UrlEncode(crypto.randomBytes(18));
    const authUrl = new URL("https://accounts.spotify.com/authorize");
    authUrl.searchParams.set("client_id", SPOTIFY_CLIENT_ID);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", SPOTIFY_REDIRECT_URI);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("show_dialog", "false");
    const waiter = createSpotifyCallbackWaiter(state);
    cancelLogin = waiter.cancel;
    let loginWindow = null;
    try {
      loginWindow = new BrowserWindow({
        width: 540,
        height: 720,
        title: "Connect Spotify — localtify",
        parent: getWindow() || undefined,
        modal: false,
        autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
      });
      loginWindow.setMenu(null);
      loginWindow.loadURL(authUrl.toString());
      loginWindow.on("closed", () => { waiter.cancel("Spotify login cancelled."); });
      const { code } = await waiter.promise;
      await exchangeSpotifyAuthorizationCode(code, codeVerifier, generation);
      try { if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close(); } catch {}
      return { ok: true, ready: true, loggedIn: true, publicOnly: true, mode: "oauth-pkce", redirectUri: SPOTIFY_REDIRECT_URI, message: "Spotify connected. Public playlists, albums, and tracks can be imported." };
    } catch (error) {
      const message = error?.message || "Spotify login failed.";
      return { ok: false, ready: Boolean(SPOTIFY_CLIENT_ID), loggedIn: false, cancelled: /cancel/i.test(message), publicOnly: true, mode: "oauth-pkce", redirectUri: SPOTIFY_REDIRECT_URI, error: message };
    } finally {
      if (cancelLogin === waiter.cancel) cancelLogin = null;
      waiter.cancel();
      try { if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close(); } catch {}
    }
  }

  async function spotifyApiGet(endpoint) {
    const url = endpoint.startsWith("https://") ? endpoint : `https://api.spotify.com/v1${endpoint}`;
    if (new URL(url).origin !== "https://api.spotify.com") throw new Error("Invalid Spotify API endpoint");
    const generation = tokenGeneration;
    const token = await getSpotifyAccessToken();
    const fetchOnce = value => spotifyHttpGet(url, { Authorization: `Bearer ${value}`, Accept: "application/json" });
    let res = await fetchOnce(token);
    if (generation !== tokenGeneration) throw new Error("Spotify login cancelled.");
    if (res.status === 401) {
      const current = readSpotifyOAuthToken();
      const refreshed = current?.accessToken && current.accessToken !== token ? current : await refreshSpotifyAccessToken(current);
      if (generation !== tokenGeneration) throw new Error("Spotify login cancelled.");
      res = await fetchOnce(refreshed.accessToken);
    }
    if (res.status === 403 || res.status === 404) throw new Error("Spotify could not read this link. Make sure the playlist is public, then copy the link again.");
    if (res.status === 429) throw new Error("Spotify rate-limited this request. Wait a little and try again.");
    if (res.status !== 200) throw new Error(`Spotify API returned HTTP ${res.status}.`);
    try { return JSON.parse(res.body); } catch { throw new Error("Could not parse Spotify API response."); }
  }

  async function fetchSpotifyOembed(trackUrl) {
    const res = await spotifyHttpGet(`https://open.spotify.com/oembed?url=${encodeURIComponent(trackUrl)}`, { Accept: "application/json" });
    if (res.status !== 200) return null;
    try { return JSON.parse(res.body || "{}"); } catch { return null; }
  }

  async function fetchSpotifyPublicTrackFallback(trackId) {
    const trackUrl = `https://open.spotify.com/track/${trackId}`;
    try {
      const apiTrack = await spotifyApiGet(`/tracks/${trackId}`);
      const shaped = shapeSpotifyTrack(apiTrack);
      if (shaped?.name) return shaped;
    } catch {}

    let title = "";
    let artist = "";
    let coverUrl = "";
    try {
      const oembed = await fetchSpotifyOembed(trackUrl);
      const rawTitle = decodeHtmlEntities(oembed?.title || "").trim();
      coverUrl = String(oembed?.thumbnail_url || oembed?.thumbnailUrl || "");
      if (rawTitle) {
        const dashIndex = rawTitle.indexOf(" - ");
        title = dashIndex >= 0 ? rawTitle.slice(0, dashIndex).trim() : rawTitle;
        artist = dashIndex >= 0 ? rawTitle.slice(dashIndex + 3).trim() : "";
      }
    } catch {}
    try {
      const htmlRes = await spotifyHttpGet(trackUrl, { Accept: "text/html" });
      if (htmlRes.status === 200) {
        const html = htmlRes.body || "";
        if (!title) {
          const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (titleMatch?.[1]) {
            const raw = decodeHtmlEntities(titleMatch[1]).replace(/\s*\|\s*Spotify\s*$/i, "").trim();
            const dashIndex = raw.indexOf(" - ");
            title = dashIndex >= 0 ? raw.slice(0, dashIndex).trim() : raw;
            if (!artist && dashIndex >= 0) artist = raw.slice(dashIndex + 3).trim();
          }
        }
        if (!coverUrl) {
          const imageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
          coverUrl = decodeHtmlEntities(imageMatch?.[1] || "").trim();
        }
        if (!artist) {
          const descriptionMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
          const desc = decodeHtmlEntities(descriptionMatch?.[1] || "").trim();
          if (desc) artist = desc.split("·")[0].trim();
        }
      }
    } catch {}

    title = title || `Spotify track ${trackId}`;
    return { id: trackId, title, name: title, artist, artists: artist, albumName: "", coverUrl, albumCoverUrl: coverUrl, spotifyCoverUrl: coverUrl, duration: 0, durationMs: 0, spotifyUrl: trackUrl };
  }

  async function fetchSpotifyPublicPlaylistFallback(playlistId) {
    const playlistUrl = `https://open.spotify.com/playlist/${playlistId}`;
    let playlistName = "Spotify Playlist";
    const ids = [];
    try {
      const oembed = await fetchSpotifyOembed(playlistUrl);
      const rawName = decodeHtmlEntities(oembed?.title || "").trim();
      if (rawName) playlistName = rawName.replace(/\s*\|\s*Spotify\s*$/i, "").trim() || playlistName;
    } catch {}
    const urlsToTry = [playlistUrl, `https://open.spotify.com/embed/playlist/${playlistId}`, `https://open.spotify.com/playlist/${playlistId}?nd=1`];
    for (const url of urlsToTry) {
      try {
        const res = await spotifyHttpGet(url, { Accept: "text/html" });
        if (res.status !== 200) continue;
        const html = res.body || "";
        const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (ogTitle?.[1]) {
          const raw = decodeHtmlEntities(ogTitle[1]).replace(/\s*\|\s*Spotify\s*$/i, "").trim();
          if (raw && !/^spotify$/i.test(raw)) playlistName = raw;
        }
        for (const match of html.matchAll(/spotify:track:([A-Za-z0-9]+)/g)) ids.push(match[1]);
        for (const match of html.matchAll(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/g)) ids.push(match[1]);
        for (const match of html.matchAll(/\/track\/([A-Za-z0-9]{18,24})/g)) ids.push(match[1]);
        for (const match of html.matchAll(/"uri"\s*:\s*"spotify:track:([A-Za-z0-9]+)"/g)) ids.push(match[1]);
        if (ids.length) break;
      } catch (error) { console.log("[localtify spotify fallback page error]", error?.message || error); }
    }
    const trackIds = uniqSpotifyIds(ids);
    if (!trackIds.length) throw new Error("Spotify could not expose tracks for this playlist. Make sure it is public on your profile, not only shareable by link, then try again.");
    const tracks = [];
    const limitedIds = trackIds.slice(0, 250);
    for (let index = 0; index < limitedIds.length; index += 8) {
      const shaped = await Promise.all(limitedIds.slice(index, index + 8).map((trackId) => fetchSpotifyPublicTrackFallback(trackId).catch(() => null)));
      for (const track of shaped) if (track?.name) tracks.push(track);
    }
    return { name: playlistName, playlistName, type: "playlist", publicOnly: true, fallback: true, tracks };
  }

  async function fetchSpotifyPublicAlbumFallback(albumId) {
    const albumUrl = `https://open.spotify.com/album/${albumId}`;
    let albumName = "Spotify Album";
    const ids = [];
    try {
      const oembed = await fetchSpotifyOembed(albumUrl);
      const rawName = decodeHtmlEntities(oembed?.title || "").trim();
      if (rawName) albumName = rawName.replace(/\s*\|\s*Spotify\s*$/i, "").trim() || albumName;
    } catch {}
    try {
      const res = await spotifyHttpGet(`https://open.spotify.com/embed/album/${albumId}`, { Accept: "text/html" });
      if (res.status === 200) {
        const html = res.body || "";
        for (const match of html.matchAll(/spotify:track:([A-Za-z0-9]+)/g)) ids.push(match[1]);
        for (const match of html.matchAll(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/g)) ids.push(match[1]);
        for (const match of html.matchAll(/\/track\/([A-Za-z0-9]{18,24})/g)) ids.push(match[1]);
      }
    } catch {}
    const trackIds = uniqSpotifyIds(ids);
    if (!trackIds.length) throw new Error("Spotify could not expose tracks for this album. Try connecting again or use the track links directly.");
    const tracks = [];
    for (let index = 0; index < trackIds.length; index += 8) {
      const shaped = await Promise.all(trackIds.slice(index, index + 8).map((trackId) => fetchSpotifyPublicTrackFallback(trackId).catch(() => null)));
      for (const track of shaped) if (track?.name) tracks.push({ ...track, albumName });
    }
    return { name: albumName, playlistName: albumName, type: "album", publicOnly: true, fallback: true, tracks };
  }

  async function fetchSpotifyPublicFallback(rawUrl, reason = "") {
    const parsed = parseSpotifyUrl(rawUrl);
    if (!parsed) throw new Error("Paste a valid Spotify playlist, album, or track link.");
    console.log("[localtify spotify] using public fallback", { type: parsed.type, reason });
    if (parsed.type === "track") {
      const track = await fetchSpotifyPublicTrackFallback(parsed.id);
      return { name: track.title, playlistName: track.title, type: "track", publicOnly: true, fallback: true, tracks: [track] };
    }
    if (parsed.type === "album") return fetchSpotifyPublicAlbumFallback(parsed.id);
    if (parsed.type === "playlist") return fetchSpotifyPublicPlaylistFallback(parsed.id);
    throw new Error(`Unsupported Spotify link type: ${parsed.type}`);
  }

  async function fetchSpotifyTracksFromUrl(rawUrl) {
    const parsed = parseSpotifyUrl(rawUrl);
    if (!parsed) throw new Error("Paste a valid Spotify playlist, album, or track link.");
    if (!SPOTIFY_CLIENT_ID) return fetchSpotifyPublicFallback(rawUrl, "spotify client id unavailable");
    const { type, id } = parsed;
    try {
      if (type === "track") {
        const track = await spotifyApiGet(`/tracks/${id}`);
        const shaped = shapeSpotifyTrack(track);
        return { name: shaped?.title || "Spotify Track", playlistName: shaped?.title || "Spotify Track", type: "track", publicOnly: true, tracks: shaped ? [shaped] : [] };
      }
      if (type === "album") {
        const album = await spotifyApiGet(`/albums/${id}`);
        const tracks = [];
        let next = `/albums/${id}/tracks?limit=50&offset=0`;
        while (next) {
          const page = await spotifyApiGet(next);
          for (const track of page.items || []) {
            const shaped = shapeSpotifyTrack(track, album.name || "", bestSpotifyImage(album.images));
            if (shaped) tracks.push(shaped);
          }
          next = page.next || null;
        }
        return { name: album.name || "Spotify Album", playlistName: album.name || "Spotify Album", type: "album", publicOnly: true, tracks };
      }
      if (type === "playlist") {
        const info = await spotifyApiGet(`/playlists/${id}?fields=name,public,owner(display_name)`);
        if (info && info.public === false) throw new Error("This playlist is link-shareable but not public to the Spotify API. Add it to your public profile, or try the fallback fetch again.");
        const tracks = [];
        let offset = 0;
        while (true) {
          const page = await spotifyApiGet(`/playlists/${id}/tracks?limit=100&offset=${offset}&fields=items(track(id,name,artists,album(name,images(url,width,height)),duration_ms,is_local,external_urls,external_ids(isrc))),next`);
          const items = page.items || [];
          for (const item of items) {
            const track = item?.track;
            if (!track?.name || track.is_local) continue;
            const shaped = shapeSpotifyTrack(track);
            if (shaped) tracks.push(shaped);
          }
          if (!page.next || items.length < 100) break;
          offset += 100;
        }
        return { name: info.name || "Spotify Playlist", playlistName: info.name || "Spotify Playlist", type: "playlist", publicOnly: true, tracks };
      }
      throw new Error(`Unsupported Spotify link type: ${type}`);
    } catch (error) {
      const message = error?.message || String(error || "");
      const canFallback = /could not read this link|public profile|private|403|404|not expose|spotify api returned http|spotify is not connected|oauth is unavailable|secure credential storage|client id/i.test(message);
      if (!canFallback) throw error;
      return fetchSpotifyPublicFallback(rawUrl, message);
    }
  }

  function getSpotifyStatus() {
    let saved = null, error = "";
    try { saved = readSpotifyOAuthToken(); } catch (failure) { error = failure?.message || "Could not read Spotify credentials."; }
    return {ok: true, ready: true, loggedIn: Boolean(saved?.refreshToken), publicOnly: true, fallbackAvailable: true, mode: SPOTIFY_CLIENT_ID ? "oauth-pkce" : "public-fallback", needsClientId: false, redirectUri: SPOTIFY_REDIRECT_URI, error};
  }
  function logoutSpotify() {
    try { clearSpotifyOAuthToken(); return getSpotifyStatus(); }
    catch (error) { return {...getSpotifyStatus(), ok: false, error: error?.message || "Could not remove Spotify credentials."}; }
  }
  return {getSpotifyStatus, loginSpotifyOAuth, logoutSpotify, fetchSpotifyTracksFromUrl};
}

module.exports = {createSpotifyClient, SPOTIFY_BROWSER_UA};
