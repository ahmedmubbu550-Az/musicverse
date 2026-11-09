/* =========================================================
   MUSICVERSE — app logic
   - Hash router (#/home, #/search/<q>, #/library, #/liked, #/recent,
     #/playlist/<id>, #/artist/<id>)
   - Instant search: results update as you type, from the first letter.
     Partial words match ("ari" finds "Arijit Singh").
   - Sources: Audius (free, audio-only, background play) and
     YouTube (via the /api/search serverless function).
   - Spotify / YouTube links can be added by URL.
   - Library, liked songs, playlists and history in localStorage.
   ========================================================= */
"use strict";
(function () {
  /* ---------------- helpers ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const STORE = "musicverse-v1";
  const PREFS = "musicverse-prefs";
  const AUDIUS = "https://api.audius.co/v1";
  const APP = "MUSICVERSE";
  const PAGE = 24;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (n, cls = "") => `<svg class="i ${cls}"><use href="#i-${n}"/></svg>`;
  const uid = () => Math.random().toString(36).slice(2, 10);
  const fmt = (s) => { s = Number(s); if (!isFinite(s) || s <= 0) return "0:00"; s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`; };
  const durText = (s) => (Number(s) > 0 ? fmt(s) : "");
  const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
  const decodeEntities = (s) => { const t = document.createElement("textarea"); t.innerHTML = String(s || ""); return t.value; };
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  // normalise text for matching: lowercase, strip accents & punctuation
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const tokens = (q) => norm(q).split(" ").filter(Boolean);

  /**
   * Score how well `text` matches a (possibly partial) query.
   * Every query token must appear; word-start matches score higher.
   * 0 = no match.
   */
  function matchScore(text, q) {
    const toks = tokens(q);
    if (!toks.length) return 0;
    const hay = norm(text);
    if (!hay) return 0;
    const words = hay.split(" ");
    let score = 0;
    for (const t of toks) {
      if (words.some((w) => w === t)) score += 4;
      else if (words.some((w) => w.startsWith(t))) score += 3;
      else if (hay.includes(t)) score += 1;
      else return 0;
    }
    if (hay.startsWith(toks.join(" "))) score += 3;
    return score;
  }

  // wrap matching fragments in <mark> (input must be raw text, output is safe HTML)
  function hl(text, q) {
    text = String(text || "");
    const toks = String(q || "").toLowerCase().split(/\s+/).filter((t) => t.length > 0);
    if (!toks.length) return esc(text);
    const lower = text.toLowerCase();
    const marks = new Uint8Array(text.length);
    for (const t of toks) {
      let i = lower.indexOf(t);
      while (i !== -1) { marks.fill(1, i, i + t.length); i = lower.indexOf(t, i + t.length); }
    }
    let out = "", open = false;
    for (let i = 0; i < text.length; i++) {
      if (marks[i] && !open) { out += "<mark>"; open = true; }
      if (!marks[i] && open) { out += "</mark>"; open = false; }
      out += esc(text[i]);
    }
    return out + (open ? "</mark>" : "");
  }

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  async function fetchJSON(url, signal) {
    const r = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  /* ---------------- storage ---------------- */
  function loadState() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE)); } catch (e) { /* ignore */ }
    if (!s || typeof s !== "object") s = {};
    s.tracks = Array.isArray(s.tracks) ? s.tracks.filter((t) => t && t.id) : [];
    s.playlists = Array.isArray(s.playlists) ? s.playlists.filter((p) => p && p.id) : [];
    s.recent = Array.isArray(s.recent) ? s.recent : [];
    s.favorites = Array.isArray(s.favorites) ? s.favorites : [];
    s.searches = Array.isArray(s.searches) ? s.searches : [];
    if (!s.version) {
      // migrate the original data format (one playlistId per track)
      s.tracks.forEach((t) => { t.saved = true; });
      s.playlists.forEach((p) => { p.trackIds = s.tracks.filter((t) => t.playlistId === p.id).map((t) => t.id); });
      s.version = 2;
    }
    s.playlists.forEach((p) => { if (!Array.isArray(p.trackIds)) p.trackIds = []; });
    s.tracks.forEach(normalizeTrack);
    return s;
  }
  function loadPrefs() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem(PREFS)) || {}; } catch (e) { /* ignore */ }
    return { source: p.source === "youtube" ? "youtube" : "audius", volume: typeof p.volume === "number" ? p.volume : 0.8, shuffle: !!p.shuffle, repeat: ["off", "all", "one"].includes(p.repeat) ? p.repeat : "off", genre: ["All", "English", "Pakistani", "Bollywood"].includes(p.genre) ? p.genre : "All", muted: !!p.muted };
  }
  const state = loadState();
  const prefs = loadPrefs();

  function persist() {
    // keep only tracks that are still referenced somewhere
    const keep = new Set([...state.recent.slice(0, 40), ...state.favorites, ...state.playlists.flatMap((p) => p.trackIds)]);
    if (current) keep.add(current.id);
    state.tracks = state.tracks.filter((t) => t.saved || keep.has(t.id));
    const ids = new Set(state.tracks.map((t) => t.id));
    state.recent = state.recent.filter((id) => ids.has(id)).slice(0, 40);
    state.favorites = state.favorites.filter((id) => ids.has(id));
    state.playlists.forEach((p) => { p.trackIds = p.trackIds.filter((id) => ids.has(id)); });
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { toast("Browser storage is full — remove some songs."); }
  }
  const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch (e) { /* ignore */ } };

  /* ---------------- tracks ---------------- */
  const known = new Map(); // every track seen this session (search results, trending…)
  function getTrack(id) { return state.tracks.find((t) => t.id === id) || known.get(id) || null; }
  function remember(t) {
    known.set(t.id, t);
    const existing = state.tracks.find((x) => x.id === t.id);
    if (existing) return existing;
    state.tracks.unshift(Object.assign({}, t, { saved: !!t.saved }));
    return state.tracks[0];
  }

  function ytIdFromUrl(url) {
    try {
      const u = new URL(url);
      let v = null;
      if (u.hostname === "youtu.be") v = u.pathname.slice(1).split("/")[0];
      else if (/^\/(shorts|embed|live)\//.test(u.pathname)) v = u.pathname.split("/")[2];
      else v = u.searchParams.get("v");
      return v && /^[\w-]{6,}$/.test(v) ? v : null;
    } catch (e) { return null; }
  }
  function normalizeTrack(t) {
    if (t.provider === "youtube" && !t.videoId) { const v = ytIdFromUrl(t.url); if (v) t.videoId = v; }
    if (t.provider === "youtube" && t.videoId && !t.artwork) t.artwork = `https://i.ytimg.com/vi/${t.videoId}/mqdefault.jpg`;
    if (!t.artist) t.artist = "Unknown artist";
    return t;
  }
  function parseLink(raw) {
    try {
      const u = new URL(String(raw).trim());
      const host = u.hostname.replace(/^www\./, "");
      if (host === "open.spotify.com") {
        const m = u.pathname.replace(/^\/intl-[a-z]{2}(-[a-z]{2})?/i, "").match(/^\/(track|album|playlist|artist|show|episode)\/([A-Za-z0-9]+)/);
        if (!m) return null;
        return { provider: "spotify", kind: m[1], embed: `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0` };
      }
      if (["youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com"].includes(host)) {
        const v = ytIdFromUrl(u.href);
        const list = u.searchParams.get("list");
        if (v) return { provider: "youtube", videoId: v, artwork: `https://i.ytimg.com/vi/${v}/mqdefault.jpg`, embed: `https://www.youtube-nocookie.com/embed/${v}` };
        if (list && /^[\w-]+$/.test(list)) return { provider: "youtube", embed: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}` };
      }
    } catch (e) { /* invalid URL */ }
    return null;
  }
  function audiusTrack(t) {
    const art = t.artwork || {};
    return {
      id: "au-" + t.id, provider: "audius", audiusId: t.id,
      title: t.title, artist: (t.user && t.user.name) || "Audius artist",
      artistId: t.user && t.user.id,
      url: t.permalink ? "https://audius.co" + t.permalink : "https://audius.co",
      artwork: art["480x480"] || art["150x150"] || art["1000x1000"] || "",
      duration: t.duration || 0, genre: t.genre || "", plays: t.play_count || 0
    };
  }
  const audioUrl = (t) => `${AUDIUS}/tracks/${encodeURIComponent(t.audiusId || String(t.id).replace(/^au-/, ""))}/stream?app_name=${APP}`;
  function youtubeTrack(item) {
    const v = item.id.videoId, sn = item.snippet || {}, th = sn.thumbnails || {};
    return {
      id: "yt-" + v, provider: "youtube", videoId: v,
      title: decodeEntities(sn.title || "Untitled video"), artist: decodeEntities(sn.channelTitle || "YouTube"),
      url: "https://www.youtube.com/watch?v=" + v,
      artwork: (th.medium || th.high || th.default || {}).url || `https://i.ytimg.com/vi/${v}/mqdefault.jpg`,
      embed: "https://www.youtube-nocookie.com/embed/" + v
    };
  }
  const sourceLabel = (t) => ({ audius: "Audius", youtube: "YouTube", spotify: "Spotify" }[t.provider] || "Link");
  const isLiked = (id) => state.favorites.includes(id);

  /* ---------------- rendering primitives ---------------- */
  function artHTML(t, size, extra = "") {
    const h = hue((t.title || "") + (t.artist || ""));
    const initial = esc(((t.title || "♫").trim()[0]) || "♫");
    const img = t.artwork ? `<img src="${esc(t.artwork)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : "";
    return `<div class="art art-${size} ${extra}" style="--h:${h}"><span>${initial}</span>${img}</div>`;
  }
  const lists = Object.create(null); // listKey -> tracks[] (used to build play queues)

  function likeBtn(t) {
    const on = isLiked(t.id);
    return `<button class="icon-btn like-btn ${on ? "liked" : ""}" data-action="like" data-like="${esc(t.id)}" aria-label="${on ? "Remove from" : "Add to"} Liked Songs">${icon("heart", "off")}${icon("heart-fill", "on")}</button>`;
  }
  function rowHTML(t, i, key, q) {
    const cur = current && current.id === t.id;
    return `<div class="row ${cur ? "is-current" : ""}" data-list="${key}" data-index="${i}" data-id="${esc(t.id)}">
      <div class="row-num"><span class="n">${i + 1}</span><button class="row-play" data-action="play" aria-label="Play ${esc(t.title)}">${icon("play")}</button><span class="eq"><i></i><i></i><i></i></span></div>
      <div class="row-main">${artHTML(t, "sm")}<div class="row-text"><strong>${q ? hl(t.title, q) : esc(t.title)}</strong><small>${q ? hl(t.artist, q) : esc(t.artist)}</small></div></div>
      <div class="row-src"><span class="badge badge-${esc(t.provider)}">${sourceLabel(t)}</span></div>
      <div class="row-dur">${durText(t.duration)}</div>
      <div class="row-actions">${likeBtn(t)}<button class="icon-btn more" data-action="row-menu" aria-label="More options">${icon("more")}</button></div>
    </div>`;
  }
  function tracksHTML(key, tracks, opts = {}) {
    lists[key] = tracks;
    const head = opts.compact ? "" : `<div class="tracks-head"><span>#</span><span>Title</span><span class="h-src">Source</span><span style="text-align:right">${icon("clock")}</span><span></span></div>`;
    return `<div class="tracks ${opts.compact ? "compact" : ""}" data-ctx="${esc(opts.ctx || "")}">${head}${tracks.map((t, i) => rowHTML(t, i, key, opts.q)).join("")}</div>`;
  }
  function cardHTML(t, i, key) {
    const cur = current && current.id === t.id;
    return `<article class="card ${cur ? "is-current" : ""}" data-list="${key}" data-index="${i}" data-id="${esc(t.id)}" tabindex="0">
      ${artHTML(t, "lg")}
      <button class="card-play" data-action="play" aria-label="Play ${esc(t.title)}">${icon("play")}</button>
      <strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small>
    </article>`;
  }
  function cardsHTML(key, tracks, cls = "shelf") {
    lists[key] = tracks;
    return `<div class="${cls}">${tracks.map((t, i) => cardHTML(t, i, key)).join("")}</div>`;
  }
  function playlistCover(p) {
    const arts = p.trackIds.map(getTrack).filter(Boolean).slice(0, 4);
    if (arts.length >= 4) return `<div class="collection-cover">${arts.map((t) => artHTML(t, "lg")).join("")}</div>`;
    const seed = arts[0] || { title: p.name, artist: "" };
    return `<div class="collection-cover single">${artHTML(arts[0] ? seed : { title: p.name, artist: p.id }, "lg")}</div>`;
  }
  function playlistSmallCover(p) {
    const t = p.trackIds.map(getTrack).find(Boolean);
    return artHTML(t || { title: p.name, artist: p.id }, "md", "side-cover");
  }
  const skeletonRows = (n) => Array.from({ length: n }, () => '<div class="skeleton-row"></div>').join("");
  const skeletonCards = (n) => `<div class="shelf">${Array.from({ length: n }, () => '<div class="skeleton-card"></div>').join("")}</div>`;
  const emptyHTML = (ic, title, text, actions = "") => `<div class="empty"><div class="empty-icon">${icon(ic)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${actions ? `<div class="hero-actions">${actions}</div>` : ""}</div>`;

  const GENRES = [
    { name: "Bollywood", sub: "Hindi hits & classics", q: "bollywood", c1: "#ff7a45", c2: "#a3165b", g: "ब" },
    { name: "Pakistani", sub: "Coke Studio · Pop", q: "coke studio", c1: "#16a34a", c2: "#064e3b", g: "پ" },
    { name: "English Pop", sub: "Global chart energy", q: "pop", c1: "#6d5dfc", c2: "#2c1a8f", g: "E" },
    { name: "Hip-Hop", sub: "Rap · Trap · Beats", q: "hip hop", c1: "#f59e0b", c2: "#7c2d12", g: "H" },
    { name: "Lo-fi", sub: "Study & relax", q: "lofi", c1: "#0ea5e9", c2: "#1e3a8a", g: "L" },
    { name: "Electronic", sub: "House · EDM · Techno", q: "electronic", c1: "#d946ef", c2: "#581c87", g: "⚡" },
    { name: "Chill", sub: "Easy listening", q: "chill", c1: "#14b8a6", c2: "#134e4a", g: "~" },
    { name: "Workout", sub: "High tempo", q: "workout", c1: "#ef4444", c2: "#7f1d1d", g: "W" },
    { name: "Acoustic", sub: "Unplugged", q: "acoustic", c1: "#a16207", c2: "#422006", g: "A" },
    { name: "Romantic", sub: "Love songs", q: "love songs", c1: "#ec4899", c2: "#831843", g: "♥" }
  ];
  const genreGrid = () => `<div class="genre-grid">${GENRES.map((g) => `<button class="genre" style="--c1:${g.c1};--c2:${g.c2}" data-action="search-for" data-q="${esc(g.q)}">${esc(g.name)}<small>${esc(g.sub)}</small><span class="glyph">${esc(g.g)}</span></button>`).join("")}</div>`;

  /* ---------------- router ---------------- */
  const view = $("#view");
  const main = $("#main");
  const routes = { home: renderHome, search: renderSearch, library: renderLibrary, liked: renderLiked, recent: renderRecent, playlist: renderPlaylist, artist: renderArtist };
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, "");
    const i = h.indexOf("/");
    const name = i === -1 ? h : h.slice(0, i);
    let arg = i === -1 ? "" : h.slice(i + 1);
    try { arg = decodeURIComponent(arg); } catch (e) { /* keep raw */ }
    return { name: routes[name] ? name : "home", arg };
  }
  function go(path) { const target = "#/" + path; if (location.hash === target) render(); else location.hash = target; }
  function render() {
    const r = parseHash();
    closeMenu();
    document.body.dataset.view = r.name;
    $$("[data-nav]").forEach((a) => {
      const nav = a.dataset.nav;
      a.classList.toggle("active", nav === r.name || (nav === "library" && ["playlist", "liked", "recent"].includes(r.name) && a.closest(".tabbar")));
    });
    $$("[data-playlist-link]").forEach((a) => a.classList.toggle("active", r.name === "playlist" && a.dataset.playlistLink === r.arg));
    if (r.name !== "search") { $("#searchInput").value = ""; syncSearchBox(); }
    routes[r.name](r.arg);
    main.scrollTop = 0;
  }
  window.addEventListener("hashchange", render);
  main.addEventListener("scroll", () => main.classList.toggle("scrolled", main.scrollTop > 4), { passive: true });

  /* ---------------- HOME ---------------- */
  let trending = null, trendingLoading = false, trendingError = false;
  function greeting() { const h = new Date().getHours(); return h < 5 ? "Late night vibes" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }

  function renderHome() {
    const recent = state.recent.map(getTrack).filter(Boolean);
    const feature = (trending && trending[0]) || recent[0];
    const quick = [`<div class="quick-tile" data-href="liked"><span class="side-cover cover-liked">${icon("heart-fill")}</span><strong>Liked Songs</strong><button class="play-btn" data-action="play-collection" data-collection="liked" aria-label="Play Liked Songs">${icon("play", "ic-play")}${icon("pause", "ic-pause")}</button></div>`];
    state.playlists.slice(0, 3).forEach((p) => quick.push(`<div class="quick-tile" data-href="playlist/${esc(p.id)}">${playlistSmallCover(p)}<strong>${esc(p.name)}</strong><button class="play-btn" data-action="play-collection" data-collection="playlist:${esc(p.id)}" aria-label="Play ${esc(p.name)}">${icon("play")}</button></div>`));
    lists.quick = recent.slice(0, 8 - quick.length);
    lists.quick.forEach((t, i) => quick.push(`<div class="quick-tile ${current && current.id === t.id ? "is-current" : ""}" data-list="quick" data-index="${i}" data-id="${esc(t.id)}">${artHTML(t, "md")}<strong>${esc(t.title)}</strong><button class="play-btn" data-action="play" aria-label="Play ${esc(t.title)}">${icon("play")}</button></div>`));

    view.innerHTML = `
      <section class="hero section">
        ${feature && feature.artwork ? `<div class="hero-bg" style="background-image:url('${esc(feature.artwork)}')"></div>` : ""}
        <div class="hero-copy">
          <span class="eyebrow">${esc(greeting())}</span>
          <h1>Every mood.<br><span>One universe.</span></h1>
          <p>Stream free tracks with background play, find any song on YouTube, and keep your favourites in one place.</p>
          <div class="hero-actions">
            <button class="primary-btn" data-action="play-trending">${icon("play")} Play trending</button>
            <button class="ghost-btn" data-action="focus-search">${icon("search")} Search music</button>
          </div>
        </div>
        ${trending && trending[0] ? `<div class="hero-feature" data-list="trending" data-index="0" data-id="${esc(trending[0].id)}"><small>#1 Trending</small>${artHTML(trending[0], "lg")}<div><strong>${esc(trending[0].title)}</strong><span class="by">${esc(trending[0].artist)}</span></div></div>` : ""}
      </section>
      <div class="quick-grid">${quick.join("")}</div>

      <section class="section">
        <div class="section-head"><div><h2>Trending now</h2><p>Free to stream — keeps playing with your screen locked</p></div><button class="link-btn" data-action="play-trending">Play all</button></div>
        <div id="trendingShelf">${trending ? (trending.length ? cardsHTML("trending", trending) : emptyHTML("wave", "Nothing trending right now", "Try searching for a song instead.")) : trendingError ? emptyHTML("wave", "Couldn't load trending music", "Check your connection, then try again.", `<button class="ghost-btn" data-action="retry-trending">Try again</button>`) : skeletonCards(6)}</div>
      </section>

      ${recent.length ? `<section class="section"><div class="section-head"><div><h2>Jump back in</h2><p>Your recently played</p></div><a class="link-btn" href="#/recent">Show all</a></div>${cardsHTML("recentShelf", recent.slice(0, 12))}</section>` : ""}

      <section class="section">
        <div class="section-head"><div><h2>Browse by mood &amp; genre</h2><p>Tap a tile to search instantly</p></div></div>
        ${genreGrid()}
      </section>

      ${state.playlists.length ? `<section class="section"><div class="section-head"><div><h2>Your playlists</h2></div><a class="link-btn" href="#/library">Library</a></div><div class="shelf">${state.playlists.map(playlistCardHTML).join("")}</div></section>` : ""}
    `;
    if (!trending && !trendingLoading && !trendingError) loadTrending();
  }
  function playlistCardHTML(p) {
    const first = p.trackIds.map(getTrack).find(Boolean);
    return `<article class="card" data-href="playlist/${esc(p.id)}" tabindex="0">${artHTML(first || { title: p.name, artist: p.id }, "lg")}<button class="card-play" data-action="play-collection" data-collection="playlist:${esc(p.id)}" aria-label="Play ${esc(p.name)}">${icon("play")}</button><strong>${esc(p.name)}</strong><small>Playlist · ${plural(p.trackIds.length, "song")}</small></article>`;
  }
  async function loadTrending() {
    trendingLoading = true; trendingError = false;
    try {
      const j = await fetchJSON(`${AUDIUS}/tracks/trending?${new URLSearchParams({ time: "week", limit: "24", app_name: APP })}`);
      trending = (j.data || []).filter(playableAudius).map(audiusTrack);
      trending.forEach((t) => known.set(t.id, t));
    } catch (e) { trendingError = true; }
    trendingLoading = false;
    if (parseHash().name === "home") renderHome();
  }
  const playableAudius = (t) => t && t.id && t.title && t.is_streamable !== false && !(t.access && t.access.stream === false);

  /* ---------------- SEARCH ---------------- */
  const S = { q: "", seq: 0, ctrl: null, results: [], artists: [], next: null, loading: false, error: "", filter: "all", suggestions: [], source: null };
  const searchCache = new Map();
  const suggestCache = new Map();
  let debounceT = null;
  const searchInput = $("#searchInput");
  const searchBox = $("#searchForm");

  function syncSearchBox() { searchBox.classList.toggle("has-value", !!searchInput.value); }

  function renderSearch(arg) {
    const q = arg || "";
    if (searchInput.value !== q) searchInput.value = q;
    syncSearchBox();
    view.innerHTML = `
      <div class="search-tools">
        <div class="seg" role="tablist" aria-label="Music source">
          <button class="${prefs.source === "audius" ? "on" : ""}" data-action="source" data-source="audius" role="tab" aria-selected="${prefs.source === "audius"}"><span class="dot"></span>Free music</button>
          <button class="${prefs.source === "youtube" ? "on" : ""}" data-action="source" data-source="youtube" role="tab" aria-selected="${prefs.source === "youtube"}"><span class="dot"></span>YouTube</button>
        </div>
        <div class="chips" id="filterChips"></div>
      </div>
      <div class="suggest-row" id="suggestRow"></div>
      <div id="searchBody"></div>`;
    renderFilterChips();
    if (q.trim()) { runLocalOnlyRender(q); runSearch(q); }
    else { S.q = ""; S.seq++; if (S.ctrl) S.ctrl.abort(); renderSearchBody(); }
    if (window.matchMedia("(max-width: 899px)").matches && !q) setTimeout(() => searchInput.focus(), 50);
  }
  function renderFilterChips() {
    const el = $("#filterChips"); if (!el) return;
    const filters = [["all", "All"], ["songs", "Songs"], ["artists", "Artists"], ["library", "Your library"]];
    let html = filters.filter(([f]) => !(f === "artists" && prefs.source === "youtube")).map(([f, l]) => `<button class="chip ${S.filter === f ? "on" : ""}" data-action="filter" data-filter="${f}">${l}</button>`).join("");
    if (prefs.source === "youtube") {
      html += `<span style="width:1px;background:var(--line-2);margin:0 4px"></span>` + ["All", "English", "Pakistani", "Bollywood"].map((g) => `<button class="chip ${prefs.genre === g ? "on" : ""}" data-action="genre" data-genre="${g}">${g === "All" ? "Any language" : g}</button>`).join("");
    }
    el.innerHTML = html;
  }

  function onSearchInput() {
    const q = searchInput.value;
    syncSearchBox();
    clearTimeout(debounceT);
    if (parseHash().name !== "search") { go("search/" + encodeURIComponent(q)); return; }
    history.replaceState(null, "", "#/search/" + encodeURIComponent(q));
    if (!q.trim()) { S.q = ""; S.seq++; if (S.ctrl) S.ctrl.abort(); S.results = []; S.artists = []; S.suggestions = []; renderSearchBody(); return; }
    runLocalOnlyRender(q);
    // short pause so we don't fire a request for every keystroke
    debounceT = setTimeout(() => runSearch(q), q.trim().length <= 2 ? 150 : 260);
  }
  // instant feedback from the user's own library while the network request runs
  function runLocalOnlyRender(q) {
    S.q = q.trim();
    S.loading = true;
    renderSearchBody();
  }

  function localMatches(q) {
    const seen = new Set();
    const pool = [...state.tracks, ...known.values()].filter((t) => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
    return pool
      .filter((t) => state.tracks.some((x) => x.id === t.id) && (t.saved || isLiked(t.id) || state.recent.includes(t.id) || state.playlists.some((p) => p.trackIds.includes(t.id))))
      .map((t) => ({ t, s: matchScore(`${t.title} ${t.artist}`, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.t);
  }
  function rank(items, q) {
    // keep API relevance order but lift results whose words start with what was typed
    return items
      .map((t, i) => ({ t, i, s: Math.max(matchScore(`${t.title} ${t.artist}`, q), matchScore(t.title, q) + 1) }))
      .sort((a, b) => ((b.s > 0) - (a.s > 0)) || (Math.min(b.s, 6) - Math.min(a.s, 6)) || a.i - b.i)
      .map((x) => x.t);
  }

  async function runSearch(rawQ, more = false) {
    const q = rawQ.trim();
    const seq = ++S.seq;
    if (S.ctrl) S.ctrl.abort();
    S.q = q;
    if (!q) { S.loading = false; renderSearchBody(); return; }
    const source = prefs.source;
    const key = `${source}|${source === "youtube" ? prefs.genre : ""}|${q.toLowerCase()}`;
    if (!more && searchCache.has(key)) {
      Object.assign(S, searchCache.get(key), { loading: false, error: "", source });
      renderSearchBody();
      loadSuggestions(q, seq);
      return;
    }
    const ctrl = (S.ctrl = new AbortController());
    S.loading = true; S.error = "";
    if (!more) { S.results = []; S.artists = []; S.next = null; }
    renderSearchBody();
    loadSuggestions(q, seq);
    try {
      const r = source === "youtube" ? await searchYouTube(q, more ? S.next : null, ctrl.signal) : await searchAudius(q, more ? S.next : 0, ctrl.signal);
      if (seq !== S.seq) return;
      r.items.forEach((t) => known.set(t.id, t));
      if (more) {
        const ids = new Set(S.results.map((t) => t.id));
        S.results = S.results.concat(r.items.filter((t) => !ids.has(t.id)));
      } else {
        S.results = rank(r.items, q);
        S.artists = r.artists || [];
      }
      S.next = r.next; S.source = source;
      searchCache.set(key, { results: S.results, artists: S.artists, next: S.next });
      if (searchCache.size > 60) searchCache.delete(searchCache.keys().next().value);
    } catch (e) {
      if (e.name === "AbortError" || seq !== S.seq) return;
      S.error = e.message || "Search failed. Please try again.";
    }
    S.loading = false;
    renderSearchBody();
  }

  async function searchAudius(q, offset, signal) {
    const tracksReq = fetchJSON(`${AUDIUS}/tracks/search?${new URLSearchParams({ query: q, limit: String(PAGE), offset: String(offset || 0), app_name: APP })}`, signal);
    const usersReq = offset ? Promise.resolve(null) : fetchJSON(`${AUDIUS}/users/search?${new URLSearchParams({ query: q, limit: "10", app_name: APP })}`, signal).catch((e) => { if (e.name === "AbortError") throw e; return null; });
    let tr;
    try { tr = await tracksReq; } catch (e) { if (e.name === "AbortError") throw e; throw new Error("Couldn't reach the free music service. Check your connection and try again."); }
    const us = await usersReq;
    const raw = Array.isArray(tr.data) ? tr.data : [];
    const artists = ((us && us.data) || []).filter((u) => u && u.id && (u.track_count || 0) > 0).map((u) => ({
      id: u.id, name: u.name, handle: u.handle, tracks: u.track_count || 0, followers: u.follower_count || 0,
      artwork: (u.profile_picture && (u.profile_picture["480x480"] || u.profile_picture["150x150"])) || ""
    }));
    // only artists whose name (or @handle) actually matches what was typed
    const matching = artists
      .map((a) => ({ a, s: Math.max(matchScore(a.name, q), matchScore(a.handle, q)) }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s || y.a.followers - x.a.followers)
      .map((x) => x.a);
    return { items: raw.filter(playableAudius).map(audiusTrack), artists: matching, next: raw.length >= PAGE ? (offset || 0) + PAGE : null };
  }

  async function searchYouTube(q, pageToken, signal) {
    const p = new URLSearchParams({ q, genre: prefs.genre || "All" });
    if (pageToken) p.set("pageToken", pageToken);
    let res, payload = null;
    try { res = await fetch("api/search?" + p, { signal, headers: { Accept: "application/json" } }); }
    catch (e) { if (e.name === "AbortError") throw e; throw new Error("Couldn't reach YouTube search. Check your connection and try again."); }
    const type = res.headers.get("content-type") || "";
    if (type.includes("json")) payload = await res.json().catch(() => null);
    if (!payload) throw new Error("YouTube search needs the Vercel deployment with YOUTUBE_API_KEY set. Switch to “Free music” to search here.");
    if (!res.ok) throw new Error(payload.error || "YouTube search is unavailable right now.");
    return { items: (payload.items || []).filter((x) => x && x.id && x.id.videoId).map(youtubeTrack), artists: [], next: payload.nextPageToken || null };
  }

  // autocomplete suggestions (YouTube suggest via our API; artist names for Audius)
  async function loadSuggestions(q, seq) {
    const key = prefs.source + "|" + q.toLowerCase();
    let list = suggestCache.get(key);
    if (!list && prefs.source === "youtube") {
      try {
        const res = await fetch("api/suggest?" + new URLSearchParams({ q }), { headers: { Accept: "application/json" } });
        const j = (res.headers.get("content-type") || "").includes("json") ? await res.json() : null;
        list = (j && Array.isArray(j.suggestions)) ? j.suggestions : [];
      } catch (e) { list = []; }
      suggestCache.set(key, list);
    }
    if (seq !== S.seq) return;
    S.suggestions = (list || []).filter((s) => norm(s) !== norm(q)).slice(0, 8);
    renderSuggestions();
  }
  function renderSuggestions() {
    const el = $("#suggestRow"); if (!el) return;
    let items = S.suggestions;
    if (prefs.source === "audius" && S.q) items = S.artists.filter((a) => matchScore(a.name, S.q) > 0).slice(0, 6).map((a) => a.name);
    el.innerHTML = S.q ? items.map((s) => `<button class="suggest" data-action="search-for" data-q="${esc(s)}">${icon("search")}<span>${hl(s, S.q)}</span></button>`).join("") : "";
  }

  function renderSearchBody() {
    const body = $("#searchBody");
    if (!body) return;
    renderSuggestions();
    const q = S.q;
    if (!q) {
      body.innerHTML = `
        ${state.searches.length ? `<section class="section"><div class="section-head"><div><h2>Recent searches</h2></div><button class="link-btn" data-action="clear-searches">Clear</button></div><div class="chips">${state.searches.map((s) => `<button class="chip" data-action="search-for" data-q="${esc(s)}">${icon("clock")}${esc(s)}<span class="chip-x" data-action="forget-search" data-q="${esc(s)}" aria-label="Remove">${icon("x")}</span></button>`).join("")}</div></section>` : ""}
        <section class="section"><div class="section-head"><div><h2>Browse all</h2><p>Type even one or two letters above — results appear instantly</p></div></div>${genreGrid()}</section>`;
      return;
    }
    const local = localMatches(q);
    const results = S.results;
    const f = S.filter;
    let html = "";

    if (S.error) html += `<div class="search-status" role="alert">${esc(S.error)}${prefs.source === "youtube" ? ` <button class="link-btn" data-action="source" data-source="audius">Use free music</button>` : ` <button class="link-btn" data-action="retry-search">Try again</button>`}</div>`;
    else if (S.loading && !results.length) html += `<div class="search-status"><span class="spinner"></span>Searching for “${esc(q)}”…</div>`;

    if (f === "library") {
      html += local.length ? `<section class="section">${tracksHTML("local", local, { q })}</section>` : `<section class="section">${emptyHTML("library", "Nothing in your library matches", `No saved, liked or recently played songs match “${q}”.`)}</section>`;
      body.innerHTML = html; return;
    }
    if (f === "artists") {
      html += S.artists.length ? `<section class="section"><div class="card-grid">${S.artists.map(artistCardHTML).join("")}</div></section>` : (!S.loading && !S.error ? `<section class="section">${emptyHTML("user", "No artists found", `Try a different spelling of “${q}”.`)}</section>` : `<section class="section">${skeletonCards(5)}</section>`);
      body.innerHTML = html; return;
    }
    if (f === "songs") {
      if (results.length) html += `<section class="section">${tracksHTML("search", results, { q })}${moreBtn()}</section>`;
      else if (S.loading) html += `<section class="section">${skeletonRows(6)}</section>`;
      else if (!S.error) html += noResults(q);
      body.innerHTML = html; return;
    }

    // "All"
    if (results.length) {
      const top = results[0];
      lists.top = [top];
      html += `<section class="section top-grid">
        <div><div class="section-head"><h2>Top result</h2></div>
          <div class="top-result" data-list="search" data-index="0" data-id="${esc(top.id)}">${artHTML(top, "lg")}<div><h3>${hl(top.title, q)}</h3><p>${hl(top.artist, q)} <span class="badge badge-${esc(top.provider)}">${sourceLabel(top)}</span></p></div><button class="card-play" data-action="play" aria-label="Play ${esc(top.title)}">${icon("play")}</button></div>
        </div>
        <div><div class="section-head"><h2>Songs</h2>${results.length > 5 ? `<button class="link-btn" data-action="filter" data-filter="songs">Show all</button>` : ""}</div>
          ${tracksHTML("searchTop", results.slice(0, 5), { q, compact: true })}
        </div>
      </section>`;
      lists.search = results;
    } else if (S.loading) {
      html += `<section class="section">${skeletonRows(5)}</section>`;
    }
    if (local.length) html += `<section class="section"><div class="section-head"><div><h2>From your library</h2></div>${local.length > 4 ? `<button class="link-btn" data-action="filter" data-filter="library">Show all</button>` : ""}</div>${tracksHTML("local", local.slice(0, 4), { q, compact: true })}</section>`;
    if (S.artists.length) html += `<section class="section"><div class="section-head"><div><h2>Artists</h2></div><button class="link-btn" data-action="filter" data-filter="artists">Show all</button></div><div class="shelf">${S.artists.slice(0, 8).map(artistCardHTML).join("")}</div></section>`;
    if (results.length > 5) html += `<section class="section"><div class="section-head"><div><h2>More songs</h2></div></div>${tracksHTML("searchMore", results.slice(5), { q })}${moreBtn()}</section>`;
    if (!results.length && !S.loading && !S.error && !local.length) html += noResults(q);
    body.innerHTML = html;
  }
  const moreBtn = () => (S.next ? `<div class="load-more"><button class="ghost-btn" data-action="more-results" ${S.loading ? "disabled" : ""}>${S.loading ? '<span class="spinner"></span> Loading…' : "Load more"}</button></div>` : "");
  const noResults = (q) => `<section class="section">${emptyHTML("search", `No results for “${q}”`, prefs.source === "audius" ? "Audius is mostly independent artists. Try another spelling, or switch to YouTube for mainstream songs." : "Try another spelling or a different keyword.", prefs.source === "audius" ? `<button class="ghost-btn" data-action="source" data-source="youtube">Search YouTube instead</button>` : `<button class="ghost-btn" data-action="source" data-source="audius">Search free music instead</button>`)}</section>`;
  function artistCardHTML(a) {
    return `<article class="card artist" data-href="artist/${esc(a.id)}" tabindex="0">${artHTML({ title: a.name, artist: a.handle, artwork: a.artwork }, "lg", "round")}<strong>${S.q ? hl(a.name, S.q) : esc(a.name)}</strong><small>Artist · ${plural(a.tracks, "track")}</small></article>`;
  }
  function addRecentSearch(q) {
    q = String(q || "").trim(); if (q.length < 2) return;
    state.searches = [q, ...state.searches.filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, 10);
    persist();
  }

  /* ---------------- ARTIST ---------------- */
  async function renderArtist(id) {
    view.innerHTML = `<div class="collection-head" style="--h:${hue(id)}"><div class="collection-cover single round"><div class="skeleton-card" style="width:100%;height:100%"></div></div><div class="collection-info"><span class="eyebrow">Artist</span><h1>Loading…</h1></div></div><div class="section">${skeletonRows(8)}</div>`;
    try {
      const [u, tr] = await Promise.all([
        fetchJSON(`${AUDIUS}/users/${encodeURIComponent(id)}?app_name=${APP}`),
        fetchJSON(`${AUDIUS}/users/${encodeURIComponent(id)}/tracks?${new URLSearchParams({ limit: "50", sort: "plays", app_name: APP })}`)
      ]);
      if (parseHash().name !== "artist" || parseHash().arg !== id) return;
      const a = u.data || {};
      const tracks = (tr.data || []).filter(playableAudius).map(audiusTrack);
      tracks.forEach((t) => known.set(t.id, t));
      const pic = a.profile_picture && (a.profile_picture["480x480"] || a.profile_picture["150x150"]);
      view.innerHTML = `
        <div class="collection-head" style="--h:${hue(a.name || id)}">
          <div class="collection-cover single round">${artHTML({ title: a.name || "?", artist: "", artwork: pic }, "lg")}</div>
          <div class="collection-info"><span class="eyebrow">Artist · Audius</span><h1>${esc(a.name || "Artist")}</h1><p>${plural(a.follower_count || 0, "follower")} · ${plural(tracks.length, "track")}</p></div>
        </div>
        <div class="collection-actions">
          <button class="play-btn xl" data-action="play-list" data-list-key="artist" aria-label="Play">${icon("play", "ic-play")}${icon("pause", "ic-pause")}</button>
          <button class="icon-btn" data-action="shuffle-list" data-list-key="artist" aria-label="Shuffle play" title="Shuffle play">${icon("shuffle")}</button>
        </div>
        ${tracks.length ? tracksHTML("artist", tracks) : emptyHTML("music", "No playable tracks", "This artist has no streamable tracks right now.")}`;
    } catch (e) {
      view.innerHTML = emptyHTML("user", "Couldn't load this artist", "Check your connection and try again.", `<button class="ghost-btn" data-action="reload-view">Try again</button>`);
    }
  }

  /* ---------------- LIBRARY ---------------- */
  let libTab = "playlists";
  function renderLibrary() {
    const saved = state.tracks.filter((t) => t.saved);
    const tab = (k, l) => `<button class="chip ${libTab === k ? "on" : ""}" data-action="lib-tab" data-tab="${k}">${l}</button>`;
    let body = "";
    if (libTab === "playlists") {
      body = `<div class="card-grid">
        <article class="card" data-href="liked" tabindex="0"><div class="art art-lg" style="background:linear-gradient(135deg,#5b3df5,#b78bff)">${icon("heart-fill")}</div><button class="card-play" data-action="play-collection" data-collection="liked" aria-label="Play Liked Songs">${icon("play")}</button><strong>Liked Songs</strong><small>${plural(state.favorites.length, "song")}</small></article>
        ${state.playlists.map(playlistCardHTML).join("")}
        <button class="card new-card" data-action="new-playlist"><span class="new-icon">${icon("plus")}</span><strong>New playlist</strong></button>
      </div>`;
    } else if (libTab === "songs") {
      body = saved.length ? tracksHTML("saved", saved, { ctx: "library" }) : emptyHTML("music", "No saved songs yet", "Use the ⋯ menu on any song and choose “Save to library”, or add a song by link.", `<button class="primary-btn" data-action="focus-search">${icon("search")} Find music</button><button class="ghost-btn" data-action="add-link">${icon("link")} Add by link</button>`);
    } else {
      const liked = state.favorites.map(getTrack).filter(Boolean);
      body = liked.length ? tracksHTML("likedLib", liked) : emptyHTML("heart", "No liked songs yet", "Tap the heart on any song to save it here.");
    }
    view.innerHTML = `
      <div class="section"><div class="section-head"><div><span class="eyebrow">Made by you</span><h2 style="font-size:30px;margin-top:4px">Your Library</h2></div>
        <div style="display:flex;gap:8px"><button class="ghost-btn" data-action="add-link">${icon("link")} Add by link</button><button class="primary-btn" data-action="new-playlist">${icon("plus")} Playlist</button></div></div>
        <div class="tabs">${tab("playlists", `Playlists · ${state.playlists.length + 1}`)}${tab("songs", `Saved songs · ${saved.length}`)}${tab("liked", `Liked · ${state.favorites.length}`)}</div>
        ${body}
      </div>`;
  }

  /* ---------------- COLLECTIONS (liked / recent / playlist) ---------------- */
  function collectionView({ h, cover, kind, title, meta, key, tracks, extraActions = "", empty, ctx = "" }) {
    view.innerHTML = `
      <div class="collection-head" style="--h:${h}">
        ${cover}
        <div class="collection-info"><span class="eyebrow">${esc(kind)}</span><h1>${esc(title)}</h1><p>${meta}</p></div>
      </div>
      <div class="collection-actions">
        <button class="play-btn xl" data-action="play-list" data-list-key="${key}" aria-label="Play" ${tracks.length ? "" : "disabled"}>${icon("play", "ic-play")}${icon("pause", "ic-pause")}</button>
        <button class="icon-btn" data-action="shuffle-list" data-list-key="${key}" aria-label="Shuffle play" title="Shuffle play">${icon("shuffle")}</button>
        ${extraActions}
      </div>
      ${tracks.length ? tracksHTML(key, tracks, { ctx }) : empty}`;
    lists[key] = tracks;
  }
  const totalTime = (tracks) => { const s = tracks.reduce((a, t) => a + (Number(t.duration) || 0), 0); return s ? ` · ${s >= 3600 ? Math.floor(s / 3600) + " hr " + Math.floor((s % 3600) / 60) + " min" : Math.max(1, Math.round(s / 60)) + " min"}` : ""; };
  function renderLiked() {
    const tracks = state.favorites.map(getTrack).filter(Boolean).reverse();
    collectionView({ h: 255, cover: `<div class="collection-cover liked">${icon("heart-fill")}</div>`, kind: "Collection", title: "Liked Songs", meta: plural(tracks.length, "song") + totalTime(tracks), key: "liked", tracks, empty: emptyHTML("heart", "Songs you like will appear here", "Tap the heart on any song to save it.", `<button class="primary-btn" data-action="focus-search">${icon("search")} Find songs</button>`) });
  }
  function renderRecent() {
    const tracks = state.recent.map(getTrack).filter(Boolean);
    collectionView({ h: 165, cover: `<div class="collection-cover recent">${icon("clock")}</div>`, kind: "History", title: "Recently Played", meta: plural(tracks.length, "song"), key: "recent", tracks, extraActions: tracks.length ? `<button class="ghost-btn" data-action="clear-recent">Clear history</button>` : "", empty: emptyHTML("clock", "Nothing played yet", "Songs you play will show up here.") });
  }
  function renderPlaylist(id) {
    const p = state.playlists.find((x) => x.id === id);
    if (!p) { view.innerHTML = emptyHTML("music", "Playlist not found", "It may have been deleted.", `<a class="primary-btn" href="#/library">Go to library</a>`); return; }
    const tracks = p.trackIds.map(getTrack).filter(Boolean);
    collectionView({
      h: hue(p.name + p.id), cover: playlistCover(p), kind: "Playlist", title: p.name,
      meta: plural(tracks.length, "song") + totalTime(tracks), key: "playlist:" + p.id, tracks, ctx: "playlist:" + p.id,
      extraActions: `<button class="icon-btn" data-action="rename-playlist" data-id="${esc(p.id)}" aria-label="Rename playlist" title="Rename">${icon("edit")}</button><button class="icon-btn" data-action="delete-playlist" data-id="${esc(p.id)}" aria-label="Delete playlist" title="Delete">${icon("trash")}</button>`,
      empty: emptyHTML("music", "Let's find something for this playlist", "Search for songs and use ⋯ → Add to playlist.", `<button class="primary-btn" data-action="focus-search">${icon("search")} Find songs</button><button class="ghost-btn" data-action="add-link" data-playlist="${esc(p.id)}">${icon("link")} Add by link</button>`)
    });
  }

  /* ---------------- SIDEBAR ---------------- */
  function renderSidebar() {
    $("#likedCount").textContent = plural(state.favorites.length, "song");
    const r = parseHash();
    $("#sidePlaylists").innerHTML = state.playlists.length
      ? state.playlists.map((p) => `<a class="side-item ${r.name === "playlist" && r.arg === p.id ? "active" : ""}" href="#/playlist/${esc(p.id)}" data-playlist-link="${esc(p.id)}">${playlistSmallCover(p)}<span class="side-text"><strong>${esc(p.name)}</strong><small>Playlist · ${plural(p.trackIds.length, "song")}</small></span></a>`).join("")
      : `<p class="side-empty">Create your first playlist with +</p>`;
    const sel = $("#addPlaylist");
    const v = sel.value;
    sel.innerHTML = `<option value="">— None —</option>` + state.playlists.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
    sel.value = state.playlists.some((p) => p.id === v) ? v : "";
  }
  function refresh() { renderSidebar(); renderQueue(); }
  function rerenderView() { const st = main.scrollTop; const r = parseHash(); if (r.name === "search") renderSearchBody(); else routes[r.name](r.arg); main.scrollTop = st; }

  /* =========================================================
     PLAYER ENGINE
     ========================================================= */
  const audio = new Audio();
  audio.preload = "auto";
  audio.setAttribute("playsinline", "");
  audio.id = "mvAudio";
  document.body.appendChild(audio);
  let current = null, queue = [], qi = -1, mode = null, playing = false, errStreak = 0;
  let yt = null, ytApiReady = false, ytPlayerReady = false, ytPending = null, ytTimer = null;
  const shuffleHistory = [];
  const npMedia = $("#npMedia");

  // Load the YouTube IFrame API in the background
  window.onYouTubeIframeAPIReady = function () { ytApiReady = true; if (ytPending) loadYT(ytPending); };
  function ensureYTApi() {
    if (window.YT && window.YT.Player) { ytApiReady = true; return; }
    if ($("script[data-yt-api]")) return;
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api"; s.async = true; s.dataset.ytApi = "1";
    document.head.appendChild(s);
  }

  function setPlaying(b) { playing = b; document.body.classList.toggle("is-playing", b); if (navigator.mediaSession) navigator.mediaSession.playbackState = b ? "playing" : current ? "paused" : "none"; }

  function playFrom(list, index) {
    if (!list || !list.length) return;
    queue = list.slice();
    qi = Math.max(0, Math.min(index, queue.length - 1));
    shuffleHistory.length = 0;
    errStreak = 0;
    start(queue[qi]);
  }
  function start(t) {
    if (!t) return;
    stopAll();
    t = remember(normalizeTrack(t));
    queue[qi] = t;
    current = t;
    state.recent = [t.id, ...state.recent.filter((x) => x !== t.id)].slice(0, 40);
    persist();

    if (t.provider === "audius") {
      mode = "audio";
      npMedia.dataset.mode = "art";
      audio.src = audioUrl(t);
      audio.volume = prefs.muted ? 0 : prefs.volume;
      const p = audio.play();
      if (p && p.catch) p.catch((e) => { if (e && e.name === "NotAllowedError") { setPlaying(false); toast("Tap play to start listening"); } });
    } else if (t.provider === "youtube" && t.videoId) {
      mode = "yt";
      npMedia.dataset.mode = "yt";
      loadYT(t.videoId);
    } else {
      mode = "embed";
      npMedia.dataset.mode = "embed";
      $("#npEmbed").innerHTML = `<iframe src="${esc(t.embed)}" title="${esc(t.title)}" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
      setPlaying(false);
      updateProgress(0, 0);
      openNP();
      toast(t.provider === "spotify" ? "Use the Spotify player to play" : "Use the embedded player to play");
    }
    updateNowPlaying();
    markCurrent();
    renderQueue();
    setMediaSession(t);
    renderSidebar();
  }
  function stopAll() {
    if (audio.getAttribute("src")) { audio.pause(); audio.removeAttribute("src"); try { audio.load(); } catch (e) { /* ignore */ } }
    if (yt && ytPlayerReady) { try { yt.stopVideo(); } catch (e) { /* ignore */ } }
    clearInterval(ytTimer);
    ytPending = null;
    $("#npEmbed").innerHTML = "";
    setPlaying(false);
    updateProgress(0, 0);
  }

  function loadYT(id) {
    ensureYTApi();
    if (!ytApiReady || !(window.YT && window.YT.Player)) { ytPending = id; return; }
    if (!yt) {
      ytPending = id;
      yt = new YT.Player("ytMount", {
        width: "100%", height: "100%", videoId: id,
        host: "https://www.youtube-nocookie.com",
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: (e) => {
            ytPlayerReady = true;
            e.target.setVolume(prefs.muted ? 0 : prefs.volume * 100);
            if (mode !== "yt") { e.target.stopVideo(); return; }
            if (ytPending && ytPending !== id) e.target.loadVideoById(ytPending); else e.target.playVideo();
            ytPending = null;
          },
          onStateChange: onYTState,
          onError: () => {
            if (mode !== "yt") return;
            errStreak++;
            if (errStreak >= 3 || queue.length < 2) { toast("This video can't be played here. Try another result."); setPlaying(false); return; }
            toast("Video unavailable — skipping…");
            setTimeout(() => next(true), 600);
          }
        }
      });
    } else if (!ytPlayerReady) {
      ytPending = id;
    } else {
      yt.setVolume(prefs.muted ? 0 : prefs.volume * 100);
      yt.loadVideoById(id);
    }
    clearInterval(ytTimer);
    ytTimer = setInterval(() => {
      if (mode !== "yt" || !yt || !ytPlayerReady || typeof yt.getCurrentTime !== "function") return;
      updateProgress(yt.getCurrentTime(), yt.getDuration());
    }, 500);
  }
  function onYTState(e) {
    if (mode !== "yt") return;
    const S_ = YT.PlayerState;
    if (e.data === S_.PLAYING) { errStreak = 0; setPlaying(true); }
    else if (e.data === S_.PAUSED) setPlaying(false);
    else if (e.data === S_.ENDED) { setPlaying(false); onEnded(); }
  }

  // audio element events
  audio.addEventListener("playing", () => { errStreak = 0; });
  audio.addEventListener("play", () => { if (mode === "audio") setPlaying(true); });
  audio.addEventListener("pause", () => { if (mode === "audio" && audio.getAttribute("src")) setPlaying(false); });
  audio.addEventListener("timeupdate", () => { if (mode === "audio") updateProgress(audio.currentTime, audio.duration); });
  audio.addEventListener("loadedmetadata", () => { if (mode === "audio") updateProgress(audio.currentTime, audio.duration); });
  audio.addEventListener("ended", () => { if (mode === "audio") onEnded(); });
  audio.addEventListener("error", () => {
    if (mode !== "audio" || !audio.getAttribute("src")) return;
    errStreak++;
    if (errStreak >= 3 || queue.length < 2) { toast("This track can't be played right now."); setPlaying(false); return; }
    toast("Track unavailable — skipping…");
    setTimeout(() => next(true), 600);
  });

  function onEnded() {
    if (prefs.repeat === "one") { seekTo(0); resume(); return; }
    next(true);
  }
  function pickShuffle() {
    if (queue.length < 2) return qi;
    let n = qi;
    while (n === qi) n = Math.floor(Math.random() * queue.length);
    return n;
  }
  function next(auto = false) {
    if (!queue.length) { toast("Pick a song to start listening"); return; }
    if (prefs.shuffle && queue.length > 1) { shuffleHistory.push(qi); qi = pickShuffle(); }
    else if (qi < queue.length - 1) qi++;
    else if (prefs.repeat === "all" || !auto) qi = 0;
    else { setPlaying(false); seekTo(0); pause(); return; } // end of queue
    start(queue[qi]);
  }
  function prev() {
    if (!queue.length) { toast("Pick a song to start listening"); return; }
    if (currentTime() > 3) { seekTo(0); return; }
    if (prefs.shuffle && shuffleHistory.length) qi = shuffleHistory.pop();
    else qi = qi > 0 ? qi - 1 : (prefs.repeat === "all" ? queue.length - 1 : 0);
    start(queue[qi]);
  }
  function currentTime() {
    if (mode === "audio") return audio.currentTime || 0;
    if (mode === "yt" && yt && ytPlayerReady) return yt.getCurrentTime() || 0;
    return 0;
  }
  function duration() {
    if (mode === "audio") return audio.duration || 0;
    if (mode === "yt" && yt && ytPlayerReady) return yt.getDuration() || 0;
    return 0;
  }
  function seekTo(sec) {
    if (mode === "audio" && isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(sec, audio.duration));
    else if (mode === "yt" && yt && ytPlayerReady) yt.seekTo(sec, true);
  }
  function resume() {
    if (mode === "audio") audio.play().catch(() => toast("Tap play to start listening"));
    else if (mode === "yt" && yt && ytPlayerReady) yt.playVideo();
  }
  function pause() {
    if (mode === "audio") audio.pause();
    else if (mode === "yt" && yt && ytPlayerReady) yt.pauseVideo();
  }
  function toggle() {
    if (!current) {
      const list = (trending && trending.length) ? trending : state.recent.map(getTrack).filter(Boolean);
      if (list.length) { playFrom(list, 0); return; }
      toast("Search for a song to start listening");
      return;
    }
    if (mode === "embed") { openNP(); toast("Use the embedded player's controls for this track"); return; }
    if (playing) pause(); else resume();
  }
  function setVolume(v) {
    prefs.volume = Math.max(0, Math.min(1, v));
    prefs.muted = prefs.volume === 0;
    applyVolume();
    savePrefs();
  }
  function applyVolume() {
    const v = prefs.muted ? 0 : prefs.volume;
    audio.volume = v;
    if (yt && ytPlayerReady) { try { yt.setVolume(v * 100); } catch (e) { /* ignore */ } }
    const el = $("#volume");
    el.value = String(Math.round(v * 100));
    el.style.setProperty("--p", Math.round(v * 100) + "%");
    $$('[data-action="mute"]').forEach((b) => b.classList.toggle("muted-vol", v === 0));
  }

  /* ---------------- player UI ---------------- */
  let seeking = false;
  function updateProgress(cur, dur) {
    const ok = isFinite(dur) && dur > 0;
    const pct = ok ? Math.min(100, (cur / dur) * 100) : 0;
    $$(".seek").forEach((el) => {
      el.disabled = !ok;
      if (!seeking) { el.value = String(Math.round(pct * 10)); el.style.setProperty("--p", pct + "%"); }
    });
    $$('[data-np="cur"]').forEach((el) => { el.textContent = fmt(cur); });
    $$('[data-np="dur"]').forEach((el) => { el.textContent = ok ? fmt(dur) : (current && current.duration ? fmt(current.duration) : "0:00"); });
    const mini = $('[data-np="mini-progress"]'); if (mini) mini.style.width = pct + "%";
    if (ok && navigator.mediaSession && navigator.mediaSession.setPositionState && mode === "audio") {
      try { navigator.mediaSession.setPositionState({ duration: dur, playbackRate: 1, position: Math.min(cur, dur) }); } catch (e) { /* ignore */ }
    }
  }
  function updateNowPlaying() {
    const t = current;
    $$('[data-np="title"]').forEach((el) => { el.textContent = t ? t.title : "Nothing playing"; });
    $$('[data-np="artist"]').forEach((el) => { el.textContent = t ? t.artist : "Pick a song to start listening"; });
    $$('[data-np="art-sm"]').forEach((el) => { el.innerHTML = t ? artHTML(t, "md") : `<div class="art art-md" style="--h:260">${icon("music")}</div>`; });
    $$('[data-np="art-lg"]').forEach((el) => { el.innerHTML = t ? artHTML(t, "xl") : `<div class="art art-xl" style="--h:260"><span>♫</span></div>`; });
    $$('[data-np="source"]').forEach((el) => { el.innerHTML = t ? `<span class="badge badge-${esc(t.provider)}">${sourceLabel(t)}</span>` : ""; });
    const h = t ? hue(t.title + t.artist) : 260;
    $("#npBg").style.setProperty("--h", h);
    $("#player").style.setProperty("--h", h);
    document.title = t ? `${t.title} · ${t.artist} — MUSICVERSE` : "MUSICVERSE";
    updateLikes();
  }
  function updateLikes() {
    $$("[data-like]").forEach((b) => { const on = isLiked(b.dataset.like); b.classList.toggle("liked", on); b.setAttribute("aria-label", (on ? "Remove from" : "Add to") + " Liked Songs"); });
    $$('[data-action="like-current"]').forEach((b) => b.classList.toggle("liked", !!current && isLiked(current.id)));
    $("#likedCount").textContent = plural(state.favorites.length, "song");
  }
  function markCurrent() {
    $$("[data-id]").forEach((el) => {
      const on = !!current && el.dataset.id === current.id;
      el.classList.toggle("is-current", on);
    });
  }
  function renderQueue() {
    const el = $("#npQueue"); if (!el) return;
    const upcoming = queue.slice(qi + 1, qi + 31);
    lists.queue = queue;
    $('[data-np="queue-count"]').textContent = queue.length ? `${qi + 1} of ${queue.length}` : "";
    el.innerHTML = upcoming.length
      ? upcoming.map((t, i) => `<div class="q-item" data-list="queue" data-index="${qi + 1 + i}" data-id="${esc(t.id)}">${artHTML(t, "xs")}<div class="row-text"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></div></div>`).join("")
      : `<p class="q-empty">${current ? "That's the end of the queue." : "Play something and the queue will show here."}</p>`;
  }
  function syncToggles() {
    $$('[data-action="shuffle"]').forEach((b) => { b.classList.toggle("active", prefs.shuffle); b.setAttribute("aria-pressed", prefs.shuffle); });
    $$('[data-action="repeat"]').forEach((b) => { b.classList.toggle("active", prefs.repeat !== "off"); b.classList.toggle("one", prefs.repeat === "one"); b.title = "Repeat: " + prefs.repeat; });
  }
  function openNP() { if (window.matchMedia("(max-width: 1279px)").matches) document.body.classList.add("np-open"); }
  function closeNP() { document.body.classList.remove("np-open"); }

  /* ---------------- media session (lock screen / headset) ---------------- */
  function setMediaSession(t) {
    const ms = navigator.mediaSession; if (!ms) return;
    try {
      ms.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: "MUSICVERSE", artwork: t.artwork ? [{ src: t.artwork, sizes: "480x480", type: "image/jpeg" }] : [{ src: "icon-512.png", sizes: "512x512", type: "image/png" }] });
    } catch (e) { /* ignore */ }
  }
  (function setupMediaSession() {
    const ms = navigator.mediaSession; if (!ms) return;
    const h = (a, fn) => { try { ms.setActionHandler(a, fn); } catch (e) { /* unsupported */ } };
    h("play", resume); h("pause", pause);
    h("previoustrack", prev); h("nexttrack", () => next());
    h("seekto", (d) => { if (typeof d.seekTime === "number") seekTo(d.seekTime); });
    h("seekbackward", () => seekTo(currentTime() - 10));
    h("seekforward", () => seekTo(currentTime() + 10));
  })();

  /* ---------------- library actions ---------------- */
  function toggleLike(id) {
    const t = getTrack(id); if (!t) return;
    remember(t);
    const on = !isLiked(id);
    state.favorites = on ? [...state.favorites, id] : state.favorites.filter((x) => x !== id);
    persist();
    updateLikes();
    $$("[data-like]").forEach((b) => { if (b.dataset.like === id && on) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); } });
    toast(on ? "Added to Liked Songs" : "Removed from Liked Songs");
    if (parseHash().name === "liked" || (parseHash().name === "library" && libTab === "liked")) rerenderView();
  }
  function saveToLibrary(id, on = true) {
    const found = getTrack(id); if (!found) return;
    const t = remember(found);
    t.saved = on; persist(); renderSidebar();
    toast(on ? "Saved to your library" : "Removed from your library");
    if (parseHash().name === "library") rerenderView();
  }
  function addToPlaylist(trackId, pid) {
    const p = state.playlists.find((x) => x.id === pid); const t = getTrack(trackId);
    if (!p || !t) return;
    remember(t);
    if (p.trackIds.includes(trackId)) { toast(`Already in “${p.name}”`); return; }
    p.trackIds.push(trackId); persist(); renderSidebar();
    toast(`Added to “${p.name}”`);
    if (parseHash().name === "playlist" && parseHash().arg === pid) rerenderView();
  }
  function removeFromPlaylist(trackId, pid) {
    const p = state.playlists.find((x) => x.id === pid); if (!p) return;
    p.trackIds = p.trackIds.filter((x) => x !== trackId); persist(); renderSidebar(); rerenderView();
    toast(`Removed from “${p.name}”`);
  }
  async function createPlaylist(withTrack) {
    const name = await ask({ title: "Create playlist", label: "Playlist name", value: `My Playlist #${state.playlists.length + 1}`, ok: "Create" });
    if (!name) return null;
    const p = { id: uid(), name, createdAt: Date.now(), trackIds: [] };
    state.playlists.push(p);
    if (withTrack && getTrack(withTrack)) { remember(getTrack(withTrack)); p.trackIds.push(withTrack); }
    persist(); renderSidebar();
    toast(withTrack ? `Created “${name}” and added the song` : `Created “${name}”`);
    if (!withTrack) go("playlist/" + p.id); else rerenderView();
    return p;
  }

  /* ---------------- dialogs ---------------- */
  const askDialog = $("#askDialog");
  function ask({ title, message = "", label = "", value = "", ok = "Save", confirmOnly = false, danger = false }) {
    return new Promise((resolve) => {
      $("#askTitle").textContent = title;
      $("#askMessage").textContent = message;
      $("#askField").hidden = confirmOnly;
      $("#askLabel").textContent = label;
      const input = $("#askInput"); input.value = value;
      const okBtn = $("#askOk"); okBtn.textContent = ok;
      okBtn.style.background = danger ? "linear-gradient(135deg,#ef4444,#be123c)" : "";
      let done = false;
      const finish = (v) => { if (done) return; done = true; askDialog.close(); resolve(v); };
      $("#askForm").onsubmit = (e) => { e.preventDefault(); if (confirmOnly) finish(true); else { const v = input.value.trim(); if (!v) { input.focus(); return; } finish(v); } };
      $("#askCancel").onclick = () => finish(confirmOnly ? false : null);
      askDialog.onclose = () => finish(confirmOnly ? false : null);
      askDialog.showModal();
      if (!confirmOnly) { input.focus(); input.select(); } else okBtn.focus();
    });
  }
  const addDialog = $("#addDialog");
  function openAdd(playlistId = "") {
    $("#addForm").reset();
    $("#addError").textContent = "";
    renderSidebar();
    $("#addPlaylist").value = playlistId || (parseHash().name === "playlist" ? parseHash().arg : "");
    addDialog.showModal();
    $("#addUrl").focus();
  }
  $("#addUrl").addEventListener("input", () => {
    // suggest a title for YouTube links if empty
    const parsed = parseLink($("#addUrl").value);
    $("#addError").textContent = "";
  });
  $("#addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const url = $("#addUrl").value.trim();
    const parsed = parseLink(url);
    if (!parsed) { $("#addError").textContent = "Please paste a valid Spotify (track/album/playlist/artist) or YouTube (video/playlist) link."; $("#addUrl").focus(); return; }
    const title = $("#addTitleInput").value.trim() || (parsed.provider === "spotify" ? "Spotify " + parsed.kind : "YouTube video");
    const t = Object.assign({ id: uid(), title, artist: $("#addArtist").value.trim() || (parsed.provider === "spotify" ? "Spotify" : "YouTube"), url, addedAt: Date.now(), saved: true }, parsed);
    state.tracks.unshift(t);
    const pid = $("#addPlaylist").value;
    const p = state.playlists.find((x) => x.id === pid);
    if (p) p.trackIds.push(t.id);
    persist();
    addDialog.close();
    toast(p ? `Added to “${p.name}”` : "Added to your library");
    renderSidebar();
    playFrom([t], 0);
    rerenderView();
  });
  [addDialog, askDialog].forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));
  $$("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

  /* ---------------- context menu ---------------- */
  const menu = $("#menu");
  function closeMenu() { menu.hidden = true; menu.innerHTML = ""; }
  function openRowMenu(btn, t, ctx) {
    const inPlaylist = ctx && ctx.startsWith("playlist:") ? ctx.slice(9) : "";
    const saved = !!(state.tracks.find((x) => x.id === t.id) || {}).saved;
    menu.innerHTML = `
      <div class="menu-title">${esc(t.title)}</div>
      <button data-m="queue-next">${icon("queue")} Play next</button>
      <button data-m="like">${icon(isLiked(t.id) ? "heart-fill" : "heart")} ${isLiked(t.id) ? "Remove from Liked Songs" : "Add to Liked Songs"}</button>
      <button data-m="save">${icon(saved ? "check" : "plus")} ${saved ? "Remove from library" : "Save to library"}</button>
      ${inPlaylist ? `<button data-m="remove-pl" class="danger">${icon("trash")} Remove from this playlist</button>` : ""}
      <hr><div class="menu-label">Add to playlist</div>
      <button data-m="new-pl">${icon("plus")} New playlist</button>
      ${state.playlists.map((p) => `<button data-m="pl" data-pid="${esc(p.id)}">${icon("music")} ${esc(p.name)}</button>`).join("")}
      ${t.url ? `<hr><a href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">${icon("external")} Open on ${sourceLabel(t)}</a>` : ""}`;
    menu.hidden = false;
    const r = btn.getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(window.innerWidth - mw - 8, r.right - mw)) + "px";
    menu.style.top = (r.bottom + mh + 8 > window.innerHeight ? Math.max(8, r.top - mh - 6) : r.bottom + 6) + "px";
    menu.onclick = (e) => {
      const b = e.target.closest("[data-m]"); if (!b) { if (e.target.closest("a")) closeMenu(); return; }
      const m = b.dataset.m;
      closeMenu();
      if (m === "like") toggleLike(t.id);
      else if (m === "save") saveToLibrary(t.id, !saved);
      else if (m === "remove-pl") removeFromPlaylist(t.id, inPlaylist);
      else if (m === "new-pl") createPlaylist(t.id);
      else if (m === "pl") addToPlaylist(t.id, b.dataset.pid);
      else if (m === "queue-next") {
        known.set(t.id, t);
        if (!current) { playFrom([t], 0); return; }
        queue.splice(qi + 1, 0, t); renderQueue(); toast("Will play next");
      }
    };
  }
  document.addEventListener("pointerdown", (e) => { if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('[data-action="row-menu"]')) closeMenu(); });
  main.addEventListener("scroll", () => { if (!menu.hidden && window.innerWidth >= 900) closeMenu(); }, { passive: true });

  /* =========================================================
     EVENTS (delegated)
     ========================================================= */
  function listFromCollection(c) {
    if (c === "liked") return state.favorites.map(getTrack).filter(Boolean).reverse();
    if (c.startsWith("playlist:")) { const p = state.playlists.find((x) => x.id === c.slice(9)); return p ? p.trackIds.map(getTrack).filter(Boolean) : []; }
    return [];
  }
  function playListKey(key, shuffled) {
    const list = lists[key] || [];
    if (!list.length) { toast("Nothing to play here yet"); return; }
    const isThis = current && queue.length === list.length && list.some((t) => t.id === current.id) && queue.every((t, i) => t.id === list[i].id);
    if (isThis && !shuffled) { toggle(); return; }
    if (shuffled) { prefs.shuffle = true; savePrefs(); syncToggles(); playFrom(list, Math.floor(Math.random() * list.length)); }
    else playFrom(list, 0);
  }

  document.addEventListener("click", async (e) => {
    const a = e.target.closest("[data-action]");
    const action = a && a.dataset.action;

    if (action) {
      switch (action) {
        case "play": case "row-play": {
          e.stopPropagation();
          const host = a.closest("[data-list]");
          if (host) { const list = lists[host.dataset.list]; const i = Number(host.dataset.index); if (current && list && list[i] && list[i].id === current.id) toggle(); else playFrom(list, i); }
          return;
        }
        case "toggle": toggle(); return;
        case "next": next(); return;
        case "prev": prev(); return;
        case "shuffle": prefs.shuffle = !prefs.shuffle; savePrefs(); syncToggles(); toast(prefs.shuffle ? "Shuffle on" : "Shuffle off"); return;
        case "repeat": prefs.repeat = { off: "all", all: "one", one: "off" }[prefs.repeat]; savePrefs(); syncToggles(); toast({ off: "Repeat off", all: "Repeat all", one: "Repeat one" }[prefs.repeat]); return;
        case "mute": prefs.muted = !prefs.muted; if (!prefs.muted && prefs.volume === 0) prefs.volume = 0.6; applyVolume(); savePrefs(); return;
        case "like": e.stopPropagation(); toggleLike(a.dataset.like); return;
        case "like-current": e.stopPropagation(); if (current) toggleLike(current.id); else toast("Play a song first"); return;
        case "row-menu": {
          e.stopPropagation();
          const host = a.closest("[data-id]");
          const t = host && (getTrack(host.dataset.id) || (lists[host.dataset.list] || [])[Number(host.dataset.index)]);
          if (t) { if (!menu.hidden) closeMenu(); else openRowMenu(a, t, (a.closest("[data-ctx]") || {}).dataset ? a.closest("[data-ctx]").dataset.ctx : ""); }
          return;
        }
        case "open-np":
          if (e.target.closest(".like-btn")) return;
          if (window.matchMedia("(max-width: 1279px)").matches) { document.body.classList.toggle("np-open"); }
          return;
        case "close-np": closeNP(); return;
        case "back": history.back(); return;
        case "forward": history.forward(); return;
        case "add-link": closeNP(); openAdd(a.dataset.playlist || ""); return;
        case "new-playlist": createPlaylist(); return;
        case "focus-search": go("search"); setTimeout(() => searchInput.focus(), 60); return;
        case "search-for": {
          if (e.target.closest('[data-action="forget-search"]')) { e.stopPropagation(); const q = e.target.closest('[data-action="forget-search"]').dataset.q; state.searches = state.searches.filter((s) => s !== q); persist(); renderSearchBody(); return; }
          const q = a.dataset.q;
          S.filter = "all";
          go("search/" + encodeURIComponent(q));
          addRecentSearch(q);
          return;
        }
        case "forget-search": { e.stopPropagation(); state.searches = state.searches.filter((s) => s !== a.dataset.q); persist(); renderSearchBody(); return; }
        case "clear-searches": state.searches = []; persist(); renderSearchBody(); return;
        case "source": prefs.source = a.dataset.source; savePrefs(); S.filter = "all"; S.suggestions = []; renderSearch(searchInput.value); return;
        case "filter": S.filter = a.dataset.filter; renderFilterChips(); renderSearchBody(); main.scrollTop = 0; return;
        case "genre": prefs.genre = a.dataset.genre; savePrefs(); renderFilterChips(); runSearch(searchInput.value); return;
        case "more-results": runSearch(S.q, true); return;
        case "retry-search": runSearch(S.q); return;
        case "retry-trending": trendingError = false; renderHome(); return;
        case "reload-view": render(); return;
        case "play-trending":
          if (trending && trending.length) playFrom(trending, 0);
          else { toast("Loading trending music…"); if (!trendingLoading) loadTrending(); }
          return;
        case "play-collection": {
          e.stopPropagation();
          const list = listFromCollection(a.dataset.collection);
          if (!list.length) { toast("Nothing to play here yet"); return; }
          lists.__col = list; playListKey("__col"); return;
        }
        case "play-list": playListKey(a.dataset.listKey); return;
        case "shuffle-list": playListKey(a.dataset.listKey, true); return;
        case "lib-tab": libTab = a.dataset.tab; renderLibrary(); return;
        case "clear-recent": if (await ask({ title: "Clear history?", message: "This removes all songs from Recently Played.", ok: "Clear", confirmOnly: true, danger: true })) { state.recent = []; persist(); renderRecent(); toast("History cleared"); } return;
        case "rename-playlist": {
          const p = state.playlists.find((x) => x.id === a.dataset.id); if (!p) return;
          const name = await ask({ title: "Rename playlist", label: "Playlist name", value: p.name, ok: "Save" });
          if (name) { p.name = name; persist(); renderSidebar(); renderPlaylist(p.id); toast("Playlist renamed"); }
          return;
        }
        case "delete-playlist": {
          const p = state.playlists.find((x) => x.id === a.dataset.id); if (!p) return;
          if (await ask({ title: `Delete “${p.name}”?`, message: "The playlist will be removed. Songs stay in your library and Liked Songs.", ok: "Delete", confirmOnly: true, danger: true })) {
            state.playlists = state.playlists.filter((x) => x.id !== p.id); persist(); renderSidebar(); toast("Playlist deleted"); go("library");
          }
          return;
        }
      }
    }

    // clicks on whole rows / cards / tiles
    if (e.target.closest("a, button, input, select, .menu")) return;
    const nav = e.target.closest("[data-href]");
    if (nav) { go(nav.dataset.href); return; }
    const host = e.target.closest("[data-list][data-index]");
    if (host) {
      const list = lists[host.dataset.list]; const i = Number(host.dataset.index);
      if (!list || !list[i]) return;
      if (current && list[i].id === current.id && host.dataset.list !== "queue") toggle();
      else if (host.dataset.list === "queue") { qi = i; start(queue[qi]); }
      else playFrom(list, i);
    }
  });
  // keyboard activation for focusable cards
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".card[tabindex], .quick-tile[tabindex]")) { e.preventDefault(); e.target.click(); }
  });

  /* search box */
  searchInput.addEventListener("input", onSearchInput);
  $("#searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;
    clearTimeout(debounceT);
    if (parseHash().name !== "search") go("search/" + encodeURIComponent(q)); else runSearch(q);
    addRecentSearch(q);
    if (window.innerWidth < 900) searchInput.blur();
  });
  $("#searchClear").addEventListener("click", () => { searchInput.value = ""; onSearchInput(); searchInput.focus(); });

  /* sliders */
  $$(".seek").forEach((el) => {
    const start_ = () => { seeking = true; };
    const end_ = () => { if (!seeking) return; seeking = false; const d = duration(); if (d > 0) seekTo((Number(el.value) / 1000) * d); };
    el.addEventListener("pointerdown", start_);
    el.addEventListener("input", () => { seeking = true; el.style.setProperty("--p", Number(el.value) / 10 + "%"); const d = duration(); $$('[data-np="cur"]').forEach((c) => { c.textContent = fmt((Number(el.value) / 1000) * d); }); });
    el.addEventListener("change", end_);
    el.addEventListener("pointerup", end_);
    el.addEventListener("keyup", end_);
  });
  $("#volume").addEventListener("input", (e) => setVolume(Number(e.target.value) / 100));

  /* keyboard shortcuts */
  document.addEventListener("keydown", (e) => {
    const typing = e.target.matches("input, textarea, select, [contenteditable]");
    if (e.key === "Escape") { if (!menu.hidden) closeMenu(); else if (document.body.classList.contains("np-open")) closeNP(); else if (typing && e.target === searchInput) searchInput.blur(); return; }
    if (typing || e.metaKey || e.altKey) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchInput.focus(); searchInput.select(); } return; }
    if ((e.ctrlKey && e.key.toLowerCase() === "k") || e.key === "/") { e.preventDefault(); if (window.innerWidth < 900 && parseHash().name !== "search") go("search"); searchInput.focus(); searchInput.select(); return; }
    if (e.ctrlKey) return;
    if (e.code === "Space" && !e.target.closest("button, a")) { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight" && e.shiftKey) next();
    else if (e.key === "ArrowLeft" && e.shiftKey) prev();
    else if (e.key.toLowerCase() === "l" && current) toggleLike(current.id);
  });

  /* swipe down to close the mobile player */
  (function () {
    const np = $("#np"); let y0 = null;
    np.addEventListener("touchstart", (e) => { if (e.target.closest(".np-scroll") && $(".np-scroll").scrollTop > 0) { y0 = null; return; } if (e.target.closest(".range, iframe")) { y0 = null; return; } y0 = e.touches[0].clientY; }, { passive: true });
    np.addEventListener("touchend", (e) => { if (y0 == null) return; const dy = e.changedTouches[0].clientY - y0; if (dy > 90) closeNP(); y0 = null; }, { passive: true });
  })();

  /* ---------------- boot ---------------- */
  $("#year").textContent = new Date().getFullYear();
  updateNowPlaying();
  applyVolume();
  syncToggles();
  renderSidebar();
  renderQueue();
  persist(); // writes migrated data
  if (!location.hash) history.replaceState(null, "", "#/home");
  render();
  if ("requestIdleCallback" in window) requestIdleCallback(ensureYTApi, { timeout: 3000 }); else setTimeout(ensureYTApi, 1500);
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
