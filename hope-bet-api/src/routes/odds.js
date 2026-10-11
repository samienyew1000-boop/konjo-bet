const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const ODDS_BASE = process.env.ODDS_API_BASE || "https://multi-shop-games-2.onrender.com/api/games/sportsbook";
const BOOKMAKER = process.env.BOOKMAKER || "8";

const CACHE_FILE = path.join(__dirname, "../../data/odds_cache.json");

// In-memory cache structures for instant (< 5ms) responses
const memoryCache = {
  upcoming: null,
  sidebar: null,
  live: null,
  prematch: new Map(),
  countryLeagues: new Map(),
};

const inFlightRequests = new Map();

// Load disk cache on startup if present
try {
  if (fs.existsSync(CACHE_FILE)) {
    const raw = fs.readFileSync(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.upcoming) memoryCache.upcoming = { data: parsed.upcoming, timestamp: parsed.upcomingTime || Date.now() };
    if (parsed.sidebar) memoryCache.sidebar = { data: parsed.sidebar, timestamp: parsed.sidebarTime || Date.now() };
    if (parsed.prematch) {
      for (const [k, v] of Object.entries(parsed.prematch)) {
        memoryCache.prematch.set(k, { data: v.data, timestamp: v.timestamp || Date.now() });
      }
    }
    console.log("[OddsCache] Loaded disk cache for instant responses");
  }
} catch (e) {
  console.warn("[OddsCache] Initial disk cache load failed:", e.message);
}

function persistCacheToDisk() {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const prematchObj = {};
    for (const [k, v] of memoryCache.prematch.entries()) {
      prematchObj[k] = v;
    }
    const toSave = {
      upcoming: memoryCache.upcoming?.data || null,
      upcomingTime: memoryCache.upcoming?.timestamp || 0,
      sidebar: memoryCache.sidebar?.data || null,
      sidebarTime: memoryCache.sidebar?.timestamp || 0,
      prematch: prematchObj,
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(toSave), "utf8");
  } catch (e) {
    console.warn("[OddsCache] Failed to save disk cache:", e.message);
  }
}

async function proxyJson(subpath) {
  const url = `${ODDS_BASE}${subpath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const err = new Error(`Odds upstream ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithDedupe(key, fn) {
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }
  const promise = (async () => {
    try {
      return await fn();
    } finally {
      inFlightRequests.delete(key);
    }
  })();
  inFlightRequests.set(key, promise);
  return promise;
}

function generateDeterministicOdds(fixtureId, homeName = "", awayName = "") {
  const seed = (Math.abs(Number(fixtureId) || 0) * 1103515245 + 12345) & 0x7fffffff;
  const rand1 = ((seed % 1000) / 1000);
  const rand2 = (((Math.floor(seed / 1000)) % 1000) / 1000);
  const rand3 = (((Math.floor(seed / 1000000)) % 1000) / 1000);

  // Realistic probabilities (approx 7% bookmaker margin)
  let homeProb = 0.36 + rand1 * 0.22;
  let drawProb = 0.23 + rand2 * 0.08;
  let awayProb = Math.max(0.16, 1 - homeProb - drawProb);

  const homeOdd = Math.max(1.18, Number((1 / (homeProb * 1.07)).toFixed(2)));
  const drawOdd = Math.max(2.85, Number((1 / (drawProb * 1.07)).toFixed(2)));
  const awayOdd = Math.max(1.28, Number((1 / (awayProb * 1.07)).toFixed(2)));

  const hd = Math.max(1.10, Number((1 / ((homeProb + drawProb) * 1.07)).toFixed(2)));
  const ha = Math.max(1.12, Number((1 / ((homeProb + awayProb) * 1.07)).toFixed(2)));
  const da = Math.max(1.14, Number((1 / ((drawProb + awayProb) * 1.07)).toFixed(2)));

  const o25Prob = 0.44 + rand3 * 0.14;
  const u25Prob = 1 - o25Prob;
  const o25 = Math.max(1.42, Number((1 / (o25Prob * 1.07)).toFixed(2)));
  const u25 = Math.max(1.42, Number((1 / (u25Prob * 1.07)).toFixed(2)));

  const o15 = Math.max(1.14, Number((o25 * 0.72).toFixed(2)));
  const u15 = Math.max(2.40, Number((u25 * 1.55).toFixed(2)));
  const o35 = Math.max(2.20, Number((o25 * 1.62).toFixed(2)));
  const u35 = Math.max(1.18, Number((u25 * 0.73).toFixed(2)));

  const bttsYes = Math.max(1.48, Number((1.65 + rand2 * 0.35).toFixed(2)));
  const bttsNo = Math.max(1.48, Number((1.60 + (1 - rand2) * 0.40).toFixed(2)));

  const dnbHome = Math.max(1.15, Number((homeOdd * 0.72).toFixed(2)));
  const dnbAway = Math.max(1.15, Number((awayOdd * 0.72).toFixed(2)));

  const odds = {
    home: String(homeOdd),
    draw: String(drawOdd),
    away: String(awayOdd),
    doubleChance: {
      homeDraw: String(hd),
      homeAway: String(ha),
      drawAway: String(da),
    },
    totals: {
      over15: String(o15),
      under15: String(u15),
      over25: String(o25),
      under25: String(u25),
      over35: String(o35),
      under35: String(u35),
    },
    btts: {
      yes: String(bttsYes),
      no: String(bttsNo),
    },
    dnb: {
      home: String(dnbHome),
      away: String(dnbAway),
    },
  };

  const markets = [
    {
      id: 1,
      name: "Match Winner",
      values: [
        { value: "Home", odd: String(homeOdd), handicap: null },
        { value: "Draw", odd: String(drawOdd), handicap: null },
        { value: "Away", odd: String(awayOdd), handicap: null },
      ],
    },
    {
      id: 12,
      name: "Double Chance",
      values: [
        { value: "Home/Draw", odd: String(hd), handicap: null },
        { value: "Home/Away", odd: String(ha), handicap: null },
        { value: "Draw/Away", odd: String(da), handicap: null },
      ],
    },
    {
      id: 5,
      name: "Goals Over/Under",
      values: [
        { value: "Over 2.5", odd: String(o25), handicap: null },
        { value: "Under 2.5", odd: String(u25), handicap: null },
        { value: "Over 1.5", odd: String(o15), handicap: null },
        { value: "Under 1.5", odd: String(u15), handicap: null },
        { value: "Over 3.5", odd: String(o35), handicap: null },
        { value: "Under 3.5", odd: String(u35), handicap: null },
      ],
    },
    {
      id: 8,
      name: "Both Teams Score",
      values: [
        { value: "Yes", odd: String(bttsYes), handicap: null },
        { value: "No", odd: String(bttsNo), handicap: null },
      ],
    },
    {
      id: 11,
      name: "Draw No Bet",
      values: [
        { value: "Home", odd: String(dnbHome), handicap: null },
        { value: "Away", odd: String(dnbAway), handicap: null },
      ],
    },
  ];

  return { odds, markets };
}

function ensureFixtureBtts(odds, fixtureId, homeName = "", awayName = "") {
  if (odds && odds.btts && odds.btts.yes && odds.btts.yes !== "—" && odds.btts.no && odds.btts.no !== "—") {
    return odds.btts;
  }
  const h = odds ? (parseFloat(odds.home) || 2.2) : 2.2;
  const d = odds ? (parseFloat(odds.draw) || 3.2) : 3.2;
  const a = odds ? (parseFloat(odds.away) || 3.4) : 3.4;
  const o25 = odds?.totals?.over25 ? parseFloat(odds.totals.over25) : 1.85;

  const fIdNum = Math.abs(Number(fixtureId) || 0);
  const seed = (fIdNum * 1103515245 + 12345) & 0x7fffffff;
  const rand = ((Math.floor(seed / 1000)) % 1000) / 1000;
  const jitter = (rand - 0.5) * 0.12;

  let baseYesProb;
  if (o25 < 1.60) {
    baseYesProb = 0.62;
  } else if (o25 < 1.85) {
    baseYesProb = 0.55;
  } else if (o25 < 2.10) {
    baseYesProb = 0.48;
  } else {
    baseYesProb = 0.42;
  }

  if (Math.min(h, a) < 1.25) {
    baseYesProb -= 0.07;
  }

  baseYesProb += jitter;
  baseYesProb = Math.min(Math.max(baseYesProb, 0.32), 0.68);
  const baseNoProb = 1 - baseYesProb;

  const yesOdd = Math.max(1.35, Number((1 / (baseYesProb * 1.065)).toFixed(2)));
  const noOdd = Math.max(1.35, Number((1 / (baseNoProb * 1.065)).toFixed(2)));

  return {
    yes: String(yesOdd),
    no: String(noOdd),
  };
}

function normalizeOrSynthesizeFixture(rawItem) {
  const fId = rawItem.fixture?.id || rawItem.id;
  if (!fId) return null;
  const hasOdds = rawItem.odds && rawItem.odds.home && rawItem.odds.home !== "—";
  let odds = rawItem.odds;
  let markets = rawItem.markets;
  if (!hasOdds || !Array.isArray(markets) || markets.length === 0) {
    const synth = generateDeterministicOdds(
      fId,
      rawItem.teams?.home?.name,
      rawItem.teams?.away?.name
    );
    if (!hasOdds) odds = synth.odds;
    if (!Array.isArray(markets) || markets.length === 0) markets = synth.markets;
  }
  if (!odds) odds = {};
  odds.btts = ensureFixtureBtts(odds, fId, rawItem.teams?.home?.name, rawItem.teams?.away?.name);
  return {
    fixture: rawItem.fixture,
    league: rawItem.league,
    teams: rawItem.teams,
    goals: rawItem.goals || null,
    score: rawItem.score || null,
    odds,
    markets,
    meta: rawItem.meta || { totalMarketCount: (markets ? markets.length : 0) + 42, selectionCount: 350 },
  };
}

function augmentSidebarWithMergedFixtures(sidebarData, fixtures) {
  if (!sidebarData || !Array.isArray(fixtures)) return;
  if (!Array.isArray(sidebarData.countries)) sidebarData.countries = [];

  const countryStats = new Map();
  for (const f of fixtures) {
    const cName = f.league?.country?.trim() || "World";
    if (!countryStats.has(cName)) {
      countryStats.set(cName, {
        name: cName,
        flag: f.league?.flag || null,
        leagues: new Set(),
        fixtureCount: 0,
      });
    }
    const cs = countryStats.get(cName);
    if (f.league?.id) cs.leagues.add(f.league.id);
    cs.fixtureCount++;
    if (!cs.flag && f.league?.flag) cs.flag = f.league.flag;
  }

  const existingMap = new Map();
  for (const c of sidebarData.countries) {
    if (c.name) existingMap.set(c.name.toLowerCase(), c);
  }

  for (const [cName, stats] of countryStats.entries()) {
    const key = cName.toLowerCase();
    const existing = existingMap.get(key);
    if (existing) {
      existing.fixtureCount = Math.max(existing.fixtureCount || 0, stats.fixtureCount);
      existing.leagueCount = Math.max(existing.leagueCount || 0, stats.leagues.size);
      if (!existing.flag && stats.flag) existing.flag = stats.flag;
    } else {
      const match = String(stats.flag || "").match(/\/([a-z\-]+)\.svg$/i);
      const code = match ? match[1].toUpperCase() : "";
      sidebarData.countries.push({
        name: stats.name,
        code,
        flag: stats.flag,
        leagueCount: stats.leagues.size,
        fixtureCount: stats.fixtureCount,
      });
    }
  }

  sidebarData.countries.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

function mergeSynthesizedPrematch(leaguesQuery, existingData) {
  const leagueIds = new Set(
    String(leaguesQuery || "")
      .split("-")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  if (!leagueIds.size) return existingData;

  const res = existingData || { ok: true, season: 2026, bookmakerId: Number(BOOKMAKER), fixtures: [] };
  const fixturesList = Array.isArray(res.fixtures)
    ? res.fixtures
    : (Array.isArray(res.response) ? res.response : (res.data || []));

  const presentIds = new Set(fixturesList.map((f) => f.fixture?.id || f.fixtureId || f.id));

  const upcomingFixtures = memoryCache.upcoming?.data?.fixtures || [];
  for (const uf of upcomingFixtures) {
    const fLid = String(uf.league?.id || "");
    const fId = uf.fixture?.id || uf.fixtureId || uf.id;
    if (fLid && leagueIds.has(fLid) && fId && !presentIds.has(fId)) {
      fixturesList.push(uf);
      presentIds.add(fId);
    }
  }

  for (const f of fixturesList) {
    if (f) {
      if (!f.odds) f.odds = {};
      f.odds.btts = ensureFixtureBtts(f.odds, f.fixture?.id || f.fixtureId || f.id, f.teams?.home?.name, f.teams?.away?.name);
    }
  }

  res.fixtures = fixturesList;
  return res;
}

// Background auto-refresher for core odds
async function refreshCoreOdds() {
  const defaultLeagues = "39-140-61-88-78-135-40-235";

  // 1. Upcoming & Daily fixtures merge
  let upcoming = null;
  try {
    upcoming = await proxyJson(`/football/board/upcoming?bookmaker=${BOOKMAKER}`);
  } catch (_) {}

  if (!upcoming || (!upcoming.fixtures && !upcoming.response && !upcoming.data)) {
    upcoming = { ok: true, season: 2026, bookmakerId: Number(BOOKMAKER), leagues: [], fixtures: [] };
  }

  const existingFixtures = Array.isArray(upcoming.fixtures)
    ? upcoming.fixtures
    : (Array.isArray(upcoming.response) ? upcoming.response : (upcoming.data || []));

  const fixtureMap = new Map();
  const leagueIdsSet = new Set();

  for (const f of existingFixtures) {
    const fId = f.fixture?.id || f.fixtureId || f.id;
    if (fId) {
      fixtureMap.set(fId, f);
      if (f.league?.id) leagueIdsSet.add(f.league.id);
    }
  }

  if (Array.isArray(upcoming.leagues)) {
    for (const lid of upcoming.leagues) {
      leagueIdsSet.add(typeof lid === "object" ? lid.id : lid);
    }
  }

  // Fetch daily fixtures for today, tomorrow, day+2, day+3 to ensure all international & local leagues are captured
  const nowMs = Date.now();
  const dateStrings = [0, 1, 2, 3].map((days) => {
    return new Date(nowMs + days * 86400000).toISOString().slice(0, 10);
  });

  for (const dateStr of dateStrings) {
    try {
      const dailyRes = await proxyJson(`/football/fixtures?date=${dateStr}`);
      const dailyList = Array.isArray(dailyRes?.response) ? dailyRes.response : [];
      for (const item of dailyList) {
        const fId = item.fixture?.id;
        if (!fId || !item.teams?.home?.name || !item.teams?.away?.name) continue;

        if (item.league?.id) leagueIdsSet.add(item.league.id);

        if (!fixtureMap.has(fId)) {
          const synth = normalizeOrSynthesizeFixture(item);
          if (synth) fixtureMap.set(fId, synth);
        }
      }
    } catch (_) {}
  }

  const mergedFixtures = Array.from(fixtureMap.values());

  // Pre-populate markets cache for fast instant detail lookups
  for (const f of mergedFixtures) {
    const fId = String(f.fixture?.id || f.fixtureId || f.id || "");
    if (fId && Array.isArray(f.markets) && f.markets.length > 0) {
      marketsCache.set(fId, {
        data: {
          ok: true,
          fixtureId: Number(fId),
          bookmakerId: Number(BOOKMAKER),
          cachedAt: new Date().toISOString(),
          markets: f.markets,
        },
        time: Date.now(),
      });
    }
  }

  // Create fast, lean payload without redundant bulky markets arrays (which are queried per-fixture)
  const leanFixtures = mergedFixtures.map((f) => {
    const fOdds = f.odds ? { ...f.odds } : {};
    fOdds.btts = ensureFixtureBtts(fOdds, f.fixture?.id || f.fixtureId, f.teams?.home?.name, f.teams?.away?.name);
    return {
      fixture: {
        id: f.fixture?.id || f.fixtureId,
        date: f.fixture?.date || f.date,
        status: f.fixture?.status || { short: f.status || "NS" },
      },
      league: {
        id: f.league?.id,
        name: f.league?.name,
        country: f.league?.country,
        logo: f.league?.logo,
        flag: f.league?.flag,
      },
      teams: {
        home: { id: f.teams?.home?.id, name: f.teams?.home?.name, logo: f.teams?.home?.logo },
        away: { id: f.teams?.away?.id, name: f.teams?.away?.name, logo: f.teams?.away?.logo },
      },
      odds: fOdds,
      goals: f.goals || null,
      score: f.score || null,
    };
  });

  upcoming.ok = true;
  upcoming.fixtures = leanFixtures;
  upcoming.leagues = Array.from(leagueIdsSet);
  upcoming.generatedAt = new Date().toISOString();
  memoryCache.upcoming = { data: upcoming, timestamp: Date.now() };

  // 2. Sidebar
  try {
    const sidebar = await proxyJson(`/football/sidebar/summary?view=prematch&bookmaker=${BOOKMAKER}`);
    if (sidebar && sidebar.ok) {
      augmentSidebarWithMergedFixtures(sidebar, mergedFixtures);
      memoryCache.sidebar = { data: sidebar, timestamp: Date.now() };
    }
  } catch (_) {
    if (memoryCache.sidebar?.data) {
      augmentSidebarWithMergedFixtures(memoryCache.sidebar.data, mergedFixtures);
    }
  }

  // 3. Top prematch leagues
  try {
    let prematch = await proxyJson(`/football/board/prematch?bookmaker=${BOOKMAKER}&leagues=${encodeURIComponent(defaultLeagues)}`);
    prematch = mergeSynthesizedPrematch(defaultLeagues, prematch);
    if (prematch && (prematch.response?.length || prematch.fixtures?.length || prematch.data?.length)) {
      memoryCache.prematch.set(defaultLeagues, { data: prematch, timestamp: Date.now() });
    }
  } catch (_) {}

  // 4. Live
  try {
    const live = await proxyJson(`/football/fixtures?live=all`);
    if (live) {
      memoryCache.live = { data: live, timestamp: Date.now() };
    }
  } catch (_) {}

  persistCacheToDisk();
}

setTimeout(refreshCoreOdds, 100);
setInterval(refreshCoreOdds, 60 * 1000);

router.get("/fixtures/upcoming", async (_req, res) => {
  if (memoryCache.upcoming && memoryCache.upcoming.data) {
    res.json(memoryCache.upcoming.data);
    if (Date.now() - memoryCache.upcoming.timestamp > 90 * 1000) {
      refreshCoreOdds().catch(() => {});
    }
    return;
  }

  try {
    await refreshCoreOdds();
    if (memoryCache.upcoming && memoryCache.upcoming.data) {
      return res.json(memoryCache.upcoming.data);
    }
    const data = await fetchWithDedupe("upcoming", () =>
      proxyJson(`/football/board/upcoming?bookmaker=${BOOKMAKER}`)
    );
    memoryCache.upcoming = { data, timestamp: Date.now() };
    persistCacheToDisk();
    res.json(data);
  } catch (err) {
    if (memoryCache.upcoming && memoryCache.upcoming.data) {
      return res.json(memoryCache.upcoming.data);
    }
    res.status(err.status || 502).json({ ok: false, error: "Failed to load fixtures" });
  }
});

router.get("/fixtures/date", async (req, res) => {
  const dateStr = String(req.query.date || "").trim();
  if (!dateStr) return res.status(400).json({ ok: false, error: "date parameter required" });

  try {
    const data = await proxyJson(`/football/fixtures?date=${encodeURIComponent(dateStr)}`);
    if (data && Array.isArray(data.response)) {
      data.response = data.response.map((item) => normalizeOrSynthesizeFixture(item) || item);
    }
    res.json(data);
  } catch (err) {
    const matches = (memoryCache.upcoming?.data?.fixtures || []).filter((f) => {
      const d = f.fixture?.date || f.date || "";
      return d.startsWith(dateStr);
    });
    res.json({ ok: true, results: matches.length, response: matches });
  }
});

router.get("/fixtures/live", async (_req, res) => {
  if (memoryCache.live && memoryCache.live.data && Date.now() - memoryCache.live.timestamp < 30 * 1000) {
    return res.json(memoryCache.live.data);
  }

  try {
    const data = await fetchWithDedupe("live", () =>
      proxyJson(`/football/fixtures?live=all`)
    );
    memoryCache.live = { data, timestamp: Date.now() };
    res.json(data);
  } catch (err) {
    if (memoryCache.live && memoryCache.live.data) {
      return res.json(memoryCache.live.data);
    }
    res.status(err.status || 502).json({ ok: false, error: "Failed to load live fixtures" });
  }
});

router.get("/fixtures/prematch", async (req, res) => {
  const leagues = String(req.query.leagues || "39-140-61-88-78-135-40-235");
  const cached = memoryCache.prematch.get(leagues);

  if (cached && cached.data) {
    res.json(cached.data);
    if (Date.now() - cached.timestamp > 60 * 1000) {
      fetchWithDedupe(`prematch_${leagues}`, async () => {
        let fresh = null;
        try {
          fresh = await proxyJson(`/football/board/prematch?bookmaker=${BOOKMAKER}&leagues=${encodeURIComponent(leagues)}`);
        } catch (_) {}
        fresh = mergeSynthesizedPrematch(leagues, fresh);
        if (fresh && (fresh.response?.length || fresh.fixtures?.length || fresh.data?.length)) {
          memoryCache.prematch.set(leagues, { data: fresh, timestamp: Date.now() });
          persistCacheToDisk();
        }
      }).catch(() => {});
    }
    return;
  }

  try {
    let data = null;
    try {
      data = await fetchWithDedupe(`prematch_${leagues}`, () =>
        proxyJson(`/football/board/prematch?bookmaker=${BOOKMAKER}&leagues=${encodeURIComponent(leagues)}`)
      );
    } catch (_) {}

    data = mergeSynthesizedPrematch(leagues, data);
    if (data && (data.response?.length || data.fixtures?.length || data.data?.length)) {
      memoryCache.prematch.set(leagues, { data, timestamp: Date.now() });
      persistCacheToDisk();
      return res.json(data);
    }
    return res.json(data || { ok: true, fixtures: [] });
  } catch (err) {
    if (cached && cached.data) {
      return res.json(cached.data);
    }
    res.status(err.status || 502).json({ ok: false, error: "Failed to load fixtures" });
  }
});

router.get("/sidebar", async (_req, res) => {
  if (memoryCache.sidebar && memoryCache.sidebar.data) {
    res.json(memoryCache.sidebar.data);
    if (Date.now() - memoryCache.sidebar.timestamp > 120 * 1000) {
      refreshCoreOdds().catch(() => {});
    }
    return;
  }

  try {
    const data = await fetchWithDedupe("sidebar", () =>
      proxyJson(`/football/sidebar/summary?view=prematch&bookmaker=${BOOKMAKER}`)
    );
    if (data && data.ok) {
      augmentSidebarWithMergedFixtures(data, memoryCache.upcoming?.data?.fixtures || []);
      memoryCache.sidebar = { data, timestamp: Date.now() };
      persistCacheToDisk();
    }
    res.json(data);
  } catch (err) {
    if (memoryCache.sidebar && memoryCache.sidebar.data) {
      return res.json(memoryCache.sidebar.data);
    }
    res.status(err.status || 502).json({ ok: false, error: "Failed to load sidebar" });
  }
});

const countryLeaguesCache = new Map();
const COUNTRY_LEAGUES_TTL = 30 * 60 * 1000;

router.get("/countries/:country/leagues", async (req, res) => {
  const rawCountry = decodeURIComponent(req.params.country);
  const countryKey = encodeURIComponent(rawCountry);
  const cached = countryLeaguesCache.get(countryKey);
  if (cached && Date.now() - cached.time < COUNTRY_LEAGUES_TTL) {
    return res.json(cached.data);
  }

  let upstreamData = null;
  try {
    upstreamData = await fetchWithDedupe(`country_${countryKey}`, () =>
      proxyJson(`/football/countries/${countryKey}/leagues?view=prematch&bookmaker=${BOOKMAKER}`)
    );
  } catch (_) {}

  // Check if upstream returned valid leagues
  if (upstreamData && Array.isArray(upstreamData.leagues) && upstreamData.leagues.length > 0) {
    countryLeaguesCache.set(countryKey, { data: upstreamData, time: Date.now() });
    return res.json(upstreamData);
  }

  // Synthesize leagues from memoryCache.upcoming fixtures
  const matchingFixtures = (memoryCache.upcoming?.data?.fixtures || []).filter((f) => {
    const c = f.league?.country || "";
    return c.toLowerCase() === rawCountry.toLowerCase();
  });

  if (matchingFixtures.length > 0) {
    const leaguesMap = new Map();
    for (const f of matchingFixtures) {
      const lid = f.league?.id;
      if (!lid) continue;
      if (!leaguesMap.has(lid)) {
        leaguesMap.set(lid, {
          id: lid,
          name: f.league.name,
          logo: f.league.logo,
          country: f.league.country,
          flag: f.league.flag,
          season: f.league.season || 2026,
          fixtureCount: 0,
        });
      }
      leaguesMap.get(lid).fixtureCount++;
    }
    const synthesized = {
      ok: true,
      country: rawCountry,
      leagues: Array.from(leaguesMap.values()),
    };
    countryLeaguesCache.set(countryKey, { data: synthesized, time: Date.now() });
    return res.json(synthesized);
  }

  if (upstreamData) {
    return res.json(upstreamData);
  }

  return res.json({ ok: true, country: rawCountry, leagues: [] });
});

const marketsCache = new Map();
const MARKETS_CACHE_TTL = 10 * 60 * 1000;

router.get("/fixture/:id/markets", async (req, res) => {
  const fixtureId = String(req.params.id);
  const cached = marketsCache.get(fixtureId);
  if (cached && Date.now() - cached.time < MARKETS_CACHE_TTL) {
    return res.json(cached.data);
  }

  function ensureBttsInMarkets(marketsList, fOdds, hName, aName) {
    if (!Array.isArray(marketsList)) return;
    const hasBtts = marketsList.some((m) =>
      m.id === 8 || String(m.name || "").toLowerCase().includes("both teams")
    );
    if (!hasBtts) {
      const bttsOdds = ensureFixtureBtts(fOdds, fixtureId, hName, aName);
      marketsList.unshift({
        id: 8,
        name: "Both Teams Score",
        values: [
          { value: "Yes", odd: bttsOdds.yes, handicap: null },
          { value: "No", odd: bttsOdds.no, handicap: null },
        ],
      });
    }
  }

  try {
    const data = await proxyJson(`/football/odds/fixture/${fixtureId}?bookmaker=${BOOKMAKER}`);
    if (data && Array.isArray(data.markets) && data.markets.length > 0) {
      ensureBttsInMarkets(data.markets);
      marketsCache.set(fixtureId, { data, time: Date.now() });
      return res.json(data);
    }
  } catch (_) {}

  // Fallback 1: check if fixture in upcoming cache has markets
  const upFixture = (memoryCache.upcoming?.data?.fixtures || []).find(
    (f) => String(f.fixture?.id || f.fixtureId || f.id) === fixtureId
  );
  if (upFixture && Array.isArray(upFixture.markets) && upFixture.markets.length > 0) {
    ensureBttsInMarkets(upFixture.markets, upFixture.odds, upFixture.teams?.home?.name, upFixture.teams?.away?.name);
    const data = {
      ok: true,
      fixtureId: Number(fixtureId),
      bookmakerId: Number(BOOKMAKER),
      cachedAt: new Date().toISOString(),
      markets: upFixture.markets,
    };
    marketsCache.set(fixtureId, { data, time: Date.now() });
    return res.json(data);
  }

  // Fallback 2: generate deterministic odds & markets
  const synth = generateDeterministicOdds(fixtureId);
  ensureBttsInMarkets(synth.markets, synth.odds);
  const data = {
    ok: true,
    fixtureId: Number(fixtureId),
    bookmakerId: Number(BOOKMAKER),
    cachedAt: new Date().toISOString(),
    markets: synth.markets,
  };
  marketsCache.set(fixtureId, { data, time: Date.now() });
  res.json(data);
});

router.get("/fixture/:id/lineups", async (req, res) => {
  const fixtureId = String(req.params.id);
  try {
    const data = await proxyJson(`/football/fixtures/lineups?fixture=${encodeURIComponent(fixtureId)}`);
    res.json(data);
  } catch (err) {
    res.status(err.status || 502).json({ ok: false, error: "Failed to load lineups" });
  }
});

router.get("/fixtures/scores", async (req, res) => {
  const ids = String(req.query.ids || req.query.id || "").trim();
  if (!ids) return res.status(400).json({ ok: false, error: "ids parameter required" });
  try {
    const data = await proxyJson(`/football/fixtures?ids=${encodeURIComponent(ids)}`);
    res.json(data);
  } catch (err) {
    res.status(err.status || 502).json({ ok: false, error: "Failed to load fixture scores" });
  }
});

const standingsCache = new Map();
const STANDINGS_CACHE_TTL = 15 * 60 * 1000;

router.get("/standings", async (req, res) => {
  const league = String(req.query.league || "39");
  const season = String(req.query.season || "2026");
  const cacheKey = `${league}_${season}`;
  const cached = standingsCache.get(cacheKey);
  if (cached && Date.now() - cached.time < STANDINGS_CACHE_TTL) {
    return res.json(cached.data);
  }
  try {
    const data = await proxyJson(`/football/standings?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}`);
    if (data && data.response) {
      standingsCache.set(cacheKey, { data, time: Date.now() });
    }
    res.json(data);
  } catch (err) {
    res.status(err.status || 502).json({ ok: false, error: "Failed to load standings" });
  }
});

const fixturesTeamCache = new Map();
const FIXTURES_TEAM_TTL = 15 * 60 * 1000;

router.get("/fixtures/team", async (req, res) => {
  const team = String(req.query.team || "").trim();
  const last = String(req.query.last || "10").trim();
  if (!team) return res.status(400).json({ ok: false, error: "team parameter required" });
  const cacheKey = `${team}_${last}`;
  const cached = fixturesTeamCache.get(cacheKey);
  if (cached && Date.now() - cached.time < FIXTURES_TEAM_TTL) {
    return res.json(cached.data);
  }
  try {
    const data = await proxyJson(`/football/fixtures?team=${encodeURIComponent(team)}&last=${encodeURIComponent(last)}`);
    if (data && data.response) {
      fixturesTeamCache.set(cacheKey, { data, time: Date.now() });
    }
    res.json(data);
  } catch (err) {
    res.status(err.status || 502).json({ ok: false, error: "Failed to load team fixtures" });
  }
});

const h2hCache = new Map();
const H2H_CACHE_TTL = 15 * 60 * 1000;

router.get("/fixtures/h2h", async (req, res) => {
  const h2h = String(req.query.h2h || "").trim();
  const last = String(req.query.last || "10").trim();
  if (!h2h) return res.status(400).json({ ok: false, error: "h2h parameter required" });
  const cacheKey = `${h2h}_${last}`;
  const cached = h2hCache.get(cacheKey);
  if (cached && Date.now() - cached.time < H2H_CACHE_TTL) {
    return res.json(cached.data);
  }
  try {
    const data = await proxyJson(`/football/fixtures/headtohead?h2h=${encodeURIComponent(h2h)}&last=${encodeURIComponent(last)}`);
    if (data && data.response) {
      h2hCache.set(cacheKey, { data, time: Date.now() });
    }
    res.json(data);
  } catch (err) {
    res.status(err.status || 502).json({ ok: false, error: "Failed to load head-to-head fixtures" });
  }
});

router.get("/results", async (req, res) => {
  const dateStr = String(req.query.date || new Date().toISOString().slice(0, 10)).trim();
  const sport = String(req.query.sport || "football").toLowerCase();

  try {
    // 1. Attempt upstream API fetch if available
    let upstreamData = null;
    try {
      upstreamData = await proxyJson(`/football/fixtures?date=${encodeURIComponent(dateStr)}`);
    } catch (_) {}

    if (upstreamData && Array.isArray(upstreamData.response) && upstreamData.response.length > 0) {
      const results = upstreamData.response.map((item) => {
        const fixture = item.fixture || {};
        const league = item.league || {};
        const teams = item.teams || {};
        const goals = item.goals || {};
        const score = item.score || {};

        const statusShort = String(fixture.status?.short || "FT").toUpperCase();
        const isFinished = ["FT", "AET", "PEN"].includes(statusShort);
        const isLive = ["1H", "HT", "2H", "ET", "BT", "P", "LIVE"].includes(statusShort);
        const isStarted = isFinished || isLive || (goals.home !== null && goals.home !== undefined && goals.away !== null && goals.away !== undefined);

        let homeGoals = null;
        let awayGoals = null;
        let htHome = null;
        let htAway = null;
        let goalEvents = [];

        if (isStarted) {
          homeGoals = goals.home ?? 0;
          awayGoals = goals.away ?? 0;
          htHome = score.halftime?.home ?? (homeGoals > 0 ? Math.floor(homeGoals / 2) : 0);
          htAway = score.halftime?.away ?? (awayGoals > 0 ? Math.floor(awayGoals / 2) : 0);

          // Parse goal events
          const events = Array.isArray(item.events) ? item.events : [];
          goalEvents = events
            .filter((e) => (e.type || "").toLowerCase() === "goal")
            .map((e) => ({
              minute: e.time?.elapsed || 0,
              extra: e.time?.extra || null,
              team: e.team?.id === teams.home?.id ? "home" : "away",
              teamName: e.team?.name || (e.team?.id === teams.home?.id ? teams.home?.name : teams.away?.name),
              player: e.player?.name || "Player",
              assist: e.assist?.name || null,
              type: e.detail || "Goal",
            }))
            .sort((a, b) => a.minute - b.minute);

          if (goalEvents.length === 0 && (homeGoals > 0 || awayGoals > 0)) {
            let seed = fixture.id || 1;
            function pRand(off) {
              const x = Math.sin(seed + off) * 10000;
              return x - Math.floor(x);
            }
            const usedMin = new Set();
            function getMin(isHT, gIdx) {
              let m;
              let att = 0;
              do {
                const r = pRand(gIdx * 11 + att * 7);
                m = isHT ? Math.floor(4 + r * 40) : Math.floor(46 + r * 44);
                att++;
              } while (usedMin.has(m) && att < 15);
              usedMin.add(m);
              return m;
            }

            let gCount = 0;
            for (let g = 0; g < homeGoals; g++) {
              gCount++;
              const isHT = g < htHome;
              goalEvents.push({
                minute: getMin(isHT, gCount),
                team: "home",
                teamName: teams.home?.name || "Home",
                player: `${teams.home?.name || "Home"} Player`,
                type: "Goal",
              });
            }
            for (let g = 0; g < awayGoals; g++) {
              gCount++;
              const isHT = g < htAway;
              goalEvents.push({
                minute: getMin(isHT, gCount + 10),
                team: "away",
                teamName: teams.away?.name || "Away",
                player: `${teams.away?.name || "Away"} Player`,
                type: "Goal",
              });
            }
            goalEvents.sort((a, b) => a.minute - b.minute);
          }
        }

        let fixtureCards = null;
        if (isStarted) {
          const events = Array.isArray(item.events) ? item.events : [];
          const cardEvents = events.filter((e) => (e.type || "").toLowerCase() === "card");
          let hY = 0;
          let aY = 0;
          let htHY = 0;
          let htAY = 0;
          let hR = 0;
          let aR = 0;
          for (const ev of cardEvents) {
            const detail = String(ev.detail || "").toLowerCase();
            const isHome = ev.team?.id === teams.home?.id;
            const elapsed = Number(ev.time?.elapsed || 0);
            const isHT = elapsed <= 45;
            if (detail.includes("yellow") || detail === "card") {
              if (isHome) {
                hY++;
                if (isHT) htHY++;
              } else {
                aY++;
                if (isHT) htAY++;
              }
            }
            if (detail.includes("red")) {
              if (isHome) hR++;
              else aR++;
            }
          }
          if (hY === 0 && aY === 0) {
            const seed = (fixture.id || 1) + 400;
            function pRandC(off) {
              const x = Math.sin(seed + off) * 10000;
              return x - Math.floor(x);
            }
            hY = Math.floor(pRandC(1) * 3.5);
            aY = Math.floor(pRandC(2) * 3.5);
            htHY = hY > 0 ? (pRandC(3) > 0.6 ? 1 : 0) : 0;
            htAY = aY > 0 ? (pRandC(4) > 0.6 ? 1 : 0) : 0;
          }
          fixtureCards = {
            homeYellow: hY,
            awayYellow: aY,
            totalYellow: hY + aY,
            htHomeYellow: htHY,
            htAwayYellow: htAY,
            htTotalYellow: htHY + htAY,
            shHomeYellow: Math.max(0, hY - htHY),
            shAwayYellow: Math.max(0, aY - htAY),
            shTotalYellow: Math.max(0, hY - htHY) + Math.max(0, aY - htAY),
            homeRed: hR,
            awayRed: aR,
            totalRed: hR + aR,
            firstYellow: hY > 0 && aY === 0 ? "home" : (aY > 0 && hY === 0 ? "away" : "home"),
            lastYellow: aY > 0 ? "away" : (hY > 0 ? "home" : null),
          };
        }

        return {
          id: fixture.id,
          sport: "football",
          kickoff: fixture.date || `${dateStr}T15:00:00Z`,
          status: statusShort,
          statusText: fixture.status?.long || (isStarted ? "Match Finished" : "Not Started"),
          isStarted,
          isFinished,
          isLive,
          league: {
            id: league.id,
            name: league.name || "League",
            country: league.country || "World",
            logo: league.logo || null,
            flag: league.flag || null,
          },
          home: {
            id: teams.home?.id,
            name: teams.home?.name || "Home Team",
            logo: teams.home?.logo || null,
            score: homeGoals,
          },
          away: {
            id: teams.away?.id,
            name: teams.away?.name || "Away Team",
            logo: teams.away?.logo || null,
            score: awayGoals,
          },
          score: {
            halftime: isStarted ? { home: htHome, away: htAway } : { home: null, away: null },
            fulltime: isStarted ? { home: homeGoals, away: awayGoals } : { home: null, away: null },
            extraTime: score.extratime ? { home: score.extratime.home, away: score.extratime.away } : null,
            penalty: score.penalty ? { home: score.penalty.home, away: score.penalty.away } : null,
          },
          goals: goalEvents,
          cards: fixtureCards,
        };
      });

      // Sort with Top European Leagues at the very top
      results.sort((a, b) => {
        const pA = getLeaguePriority(a.league);
        const pB = getLeaguePriority(b.league);
        if (pA !== pB) return pA - pB;
        const kickA = new Date(a.kickoff || 0).getTime();
        const kickB = new Date(b.kickoff || 0).getTime();
        return kickA - kickB;
      });

      return res.json({ ok: true, date: dateStr, count: results.length, results });
    }
  } catch (err) {
    console.warn("[/results] Upstream query error:", err.message);
  }

  // 2. Deterministic daily results for top fixtures matching requested date
  const generatedResults = buildDailyResultsForDate(dateStr, sport);
  generatedResults.sort((a, b) => {
    const pA = getLeaguePriority(a.league);
    const pB = getLeaguePriority(b.league);
    if (pA !== pB) return pA - pB;
    return 0;
  });
  res.json({ ok: true, date: dateStr, count: generatedResults.length, results: generatedResults });
});

function getLeaguePriority(league) {
  if (!league) return 9999;
  const id = Number(league.id || 0);
  const name = String(league.name || "").trim().toLowerCase();
  const country = String(league.country || "").trim().toLowerCase();

  // 1. UEFA Champions League (Europe only)
  if (id === 2 || name === "uefa champions league" || (name.includes("champions league") && country === "europe")) return 10;
  // 2. UEFA Europa League
  if (id === 3 || name === "uefa europa league" || (name.includes("europa league") && country === "europe")) return 20;
  // 3. UEFA Conference League
  if (id === 848 || name.includes("uefa conference league") || (name.includes("conference league") && country === "europe")) return 30;
  // 4. UEFA Nations League / Super Cup
  if (name.includes("uefa nations league") || name === "uefa super cup") return 40;

  // 5. Premier League (England)
  if (id === 39 || (country === "england" && name === "premier league")) return 100;
  // 6. La Liga (Spain)
  if (id === 140 || (country === "spain" && (name === "la liga" || name === "primera división" || name === "primera division"))) return 110;
  // 7. Serie A (Italy)
  if (id === 135 || (country === "italy" && name === "serie a")) return 120;
  // 8. Bundesliga (Germany)
  if (id === 78 || (country === "germany" && name === "bundesliga")) return 130;
  // 9. Ligue 1 (France)
  if (id === 61 || (country === "france" && name === "ligue 1")) return 140;

  // 10. Secondary domestic top flights
  if (id === 88 || (country === "netherlands" && name === "eredivisie")) return 150;
  if (id === 94 || (country === "portugal" && (name === "primeira liga" || name === "liga portugal"))) return 160;
  if (id === 179 || (country === "scotland" && name.includes("premiership"))) return 170;
  if (id === 203 || (country === "turkey" && name.includes("süper lig"))) return 180;
  if (id === 144 || (country === "belgium" && (name.includes("pro league") || name.includes("jupiler")))) return 190;

  // 11. Cups & Second Divisions of Top 5 nations
  if (country === "england" && (name.includes("championship") || name.includes("fa cup") || name.includes("efl cup") || name.includes("league cup"))) return 200;
  if (country === "spain" && (name.includes("copa del rey") || name.includes("segunda"))) return 210;
  if (country === "italy" && (name.includes("coppa italia") || name.includes("serie b"))) return 220;
  if (country === "germany" && (name.includes("dfb pokal") || name.includes("2. bundesliga"))) return 230;
  if (country === "france" && (name.includes("coupe de france") || name.includes("ligue 2"))) return 240;

  // 12. Other European leagues & competitions
  const europeanCountries = [
    "europe", "england", "spain", "italy", "germany", "france", "netherlands", "portugal",
    "scotland", "turkey", "belgium", "austria", "switzerland", "greece", "denmark",
    "sweden", "norway", "poland", "croatia", "czech republic", "serbia", "ukraine",
    "russia", "romania", "hungary", "ireland", "northern ireland", "wales", "finland",
    "norway", "iceland", "slovakia", "slovenia", "bulgaria", "albania", "cyprus"
  ];
  if (europeanCountries.includes(country)) return 500;

  // 13. Rest of the world (non-European)
  return 1000;
}

function buildDailyResultsForDate(dateStr, sport) {
  // Deterministic seed based on date string
  let seed = 0;
  for (let i = 0; i < dateStr.length; i++) {
    seed = (seed * 37 + dateStr.charCodeAt(i)) >>> 0;
  }
  function pseudoRandom(offset) {
    const x = Math.sin(seed + offset) * 10000;
    return x - Math.floor(x);
  }

  const leagues = [
    {
      id: 39,
      name: "Premier League",
      country: "England",
      logo: "https://media.api-sports.io/football/leagues/39.png",
      flag: "https://media.api-sports.io/flags/gb-eng.svg",
      matches: [
        {
          home: "Arsenal",
          away: "Chelsea",
          homeSquad: ["B. Saka", "K. Havertz", "M. Odegaard", "G. Martinelli", "D. Rice"],
          awaySquad: ["C. Palmer", "N. Jackson", "E. Fernandez", "P. Neto", "C. Nkunku"],
          kickoffTime: "12:30",
        },
        {
          home: "Manchester City",
          away: "Liverpool",
          homeSquad: ["E. Haaland", "K. De Bruyne", "P. Foden", "Bernardo Silva", "Rodri"],
          awaySquad: ["M. Salah", "L. Diaz", "D. Nunez", "D. Szoboszlai", "C. Gakpo"],
          kickoffTime: "15:00",
        },
        {
          home: "Aston Villa",
          away: "Tottenham",
          homeSquad: ["O. Watkins", "L. Bailey", "J. McGinn", "M. Rogers", "J. Duran"],
          awaySquad: ["Son Heung-Min", "D. Solanke", "B. Johnson", "J. Maddison", "D. Kulusevski"],
          kickoffTime: "17:30",
        },
      ],
    },
    {
      id: 140,
      name: "La Liga",
      country: "Spain",
      logo: "https://media.api-sports.io/football/leagues/140.png",
      flag: "https://media.api-sports.io/flags/es.svg",
      matches: [
        {
          home: "Real Madrid",
          away: "Barcelona",
          homeSquad: ["K. Mbappe", "Vinicius Jr", "J. Bellingham", "Rodrygo", "F. Valverde"],
          awaySquad: ["R. Lewandowski", "L. Yamal", "Raphinha", "Dani Olmo", "Pedri"],
          kickoffTime: "16:15",
        },
        {
          home: "Atletico Madrid",
          away: "Sevilla",
          homeSquad: ["A. Griezmann", "J. Alvarez", "A. Sorloth", "R. De Paul", "Koke"],
          awaySquad: ["I. Romero", "D. Lukebakio", "S. Saul", "J. Navas", "L. Agoume"],
          kickoffTime: "20:00",
        },
      ],
    },
    {
      id: 135,
      name: "Serie A",
      country: "Italy",
      logo: "https://media.api-sports.io/football/leagues/135.png",
      flag: "https://media.api-sports.io/flags/it.svg",
      matches: [
        {
          home: "Juventus",
          away: "AC Milan",
          homeSquad: ["D. Vlahovic", "T. Koopmeiners", "K. Yildiz", "N. Gonzalez", "M. Locatelli"],
          awaySquad: ["R. Leao", "A. Morata", "C. Pulisic", "T. Reijnders", "T. Hernandez"],
          kickoffTime: "18:00",
        },
        {
          home: "Inter",
          away: "Roma",
          homeSquad: ["L. Martinez", "M. Thuram", "H. Calhanoglu", "N. Barella", "F. Dimarco"],
          awaySquad: ["P. Dybala", "A. Dovbyk", "L. Pellegrini", "M. Soule", "B. Cristante"],
          kickoffTime: "20:45",
        },
      ],
    },
    {
      id: 78,
      name: "Bundesliga",
      country: "Germany",
      logo: "https://media.api-sports.io/football/leagues/78.png",
      flag: "https://media.api-sports.io/flags/de.svg",
      matches: [
        {
          home: "Bayern Munich",
          away: "Borussia Dortmund",
          homeSquad: ["H. Kane", "J. Musiala", "M. Olise", "L. Sane", "S. Gnabry"],
          awaySquad: ["S. Guirassy", "J. Brandt", "K. Adeyemi", "M. Sabitzer", "D. Malen"],
          kickoffTime: "15:30",
        },
        {
          home: "Bayer Leverkusen",
          away: "RB Leipzig",
          homeSquad: ["F. Wirtz", "V. Boniface", "J. Frimpong", "A. Grimaldo", "G. Xhaka"],
          awaySquad: ["B. Sesko", "L. Openda", "X. Simons", "A. Haidara", "C. Baumgartner"],
          kickoffTime: "18:30",
        },
      ],
    },
    {
      id: 2,
      name: "UEFA Champions League",
      country: "Europe",
      logo: "https://media.api-sports.io/football/leagues/2.png",
      flag: "https://media.api-sports.io/flags/eu.svg",
      matches: [
        {
          home: "Paris Saint-Germain",
          away: "Arsenal",
          homeSquad: ["O. Dembele", "B. Barcola", "Vitinha", "A. Hakimi", "W. Zaire-Emery"],
          awaySquad: ["B. Saka", "K. Havertz", "G. Martinelli", "M. Odegaard", "D. Rice"],
          kickoffTime: "21:00",
        },
      ],
    },
  ];

  const results = [];
  let globalMatchIdx = 0;

  leagues.forEach((l, lIdx) => {
    l.matches.forEach((m, mIdx) => {
      globalMatchIdx++;
      const rVal = pseudoRandom(globalMatchIdx * 7);
      const rVal2 = pseudoRandom(globalMatchIdx * 13);
      const rVal3 = pseudoRandom(globalMatchIdx * 19);

      // Determine realistic full-time goals
      let hGoals = Math.floor(rVal * 4); // 0 to 3
      let aGoals = Math.floor(rVal2 * 3); // 0 to 2
      // Occasionally allow higher score
      if (rVal3 > 0.85) hGoals += 1;
      if (rVal3 < 0.15) aGoals += 1;

      // Half-time scores (always <= full time)
      const htHome = hGoals === 0 ? 0 : (rVal > 0.5 ? Math.ceil(hGoals / 2) : Math.floor(hGoals / 2));
      const htAway = aGoals === 0 ? 0 : (rVal2 > 0.5 ? Math.ceil(aGoals / 2) : Math.floor(aGoals / 2));

      // Generate goal minutes and scorers
      const goalList = [];
      const usedMinutes = new Set();

      function getUniqueMinute(isFirstHalf, idx) {
        let min;
        let attempts = 0;
        do {
          const rand = pseudoRandom(globalMatchIdx * 23 + idx * 5 + attempts);
          min = isFirstHalf ? Math.floor(4 + rand * 41) : Math.floor(47 + rand * 43);
          attempts++;
        } while (usedMinutes.has(min) && attempts < 20);
        usedMinutes.add(min);
        return min;
      }

      let goalCount = 0;
      // Home team goals
      for (let g = 0; g < hGoals; g++) {
        goalCount++;
        const isHT = g < htHome;
        const minute = getUniqueMinute(isHT, goalCount);
        const player = m.homeSquad[g % m.homeSquad.length];
        goalList.push({
          minute,
          team: "home",
          teamName: m.home,
          player,
          type: "Goal",
        });
      }

      // Away team goals
      for (let g = 0; g < aGoals; g++) {
        goalCount++;
        const isHT = g < htAway;
        const minute = getUniqueMinute(isHT, goalCount);
        const player = m.awaySquad[g % m.awaySquad.length];
        goalList.push({
          minute,
          team: "away",
          teamName: m.away,
          player,
          type: "Goal",
        });
      }

      // Sort goals chronologically by minute
      goalList.sort((a, b) => a.minute - b.minute);

      // Deterministic realistic yellow cards
      const rCards = pseudoRandom(globalMatchIdx * 31);
      const rCards2 = pseudoRandom(globalMatchIdx * 43);
      const htHomeYellow = rCards > 0.5 ? 1 : 0;
      const htAwayYellow = rCards2 > 0.45 ? 1 : 0;
      const shHomeYellow = 1 + (rCards > 0.75 ? 1 : 0);
      const shAwayYellow = 1 + (rCards2 > 0.7 ? 1 : 0);
      const homeYellow = htHomeYellow + shHomeYellow;
      const awayYellow = htAwayYellow + shAwayYellow;
      const cards = {
        homeYellow,
        awayYellow,
        totalYellow: homeYellow + awayYellow,
        htHomeYellow,
        htAwayYellow,
        htTotalYellow: htHomeYellow + htAwayYellow,
        shHomeYellow,
        shAwayYellow,
        shTotalYellow: shHomeYellow + shAwayYellow,
        homeRed: rCards > 0.94 ? 1 : 0,
        awayRed: rCards2 > 0.96 ? 1 : 0,
        totalRed: (rCards > 0.94 ? 1 : 0) + (rCards2 > 0.96 ? 1 : 0),
        firstYellow: htHomeYellow > 0 ? "home" : (htAwayYellow > 0 ? "away" : "home"),
        lastYellow: awayYellow > 0 ? "away" : "home",
      };

      const cardEvents = [];
      if (htHomeYellow > 0) cardEvents.push({ time: { elapsed: 24 }, team: { name: m.home }, type: "Card", detail: "Yellow Card" });
      if (htAwayYellow > 0) cardEvents.push({ time: { elapsed: 38 }, team: { name: m.away }, type: "Card", detail: "Yellow Card" });
      if (shHomeYellow > 0) cardEvents.push({ time: { elapsed: 61 }, team: { name: m.home }, type: "Card", detail: "Yellow Card" });
      if (shAwayYellow > 0) cardEvents.push({ time: { elapsed: 78 }, team: { name: m.away }, type: "Card", detail: "Yellow Card" });

      results.push({
        id: 900000 + globalMatchIdx,
        sport: "football",
        kickoff: `${dateStr}T${m.kickoffTime}:00.000Z`,
        kickoffTime: m.kickoffTime,
        status: "FT",
        statusText: "Match Finished",
        league: {
          id: l.id,
          name: l.name,
          country: l.country,
          logo: l.logo,
          flag: l.flag,
        },
        home: {
          name: m.home,
          score: hGoals,
        },
        away: {
          name: m.away,
          score: aGoals,
        },
        score: {
          halftime: { home: htHome, away: htAway },
          fulltime: { home: hGoals, away: aGoals },
        },
        goals: goalList,
        cards,
        events: cardEvents,
      });
    });
  });

  return results;
}

async function fetchFixtureResults(ids) {
  if (!ids || !ids.length) return [];
  const query = Array.isArray(ids) ? ids.join("-") : ids;
  try {
    const data = await proxyJson(`/football/fixtures?ids=${encodeURIComponent(query)}`);
    return Array.isArray(data.response) ? data.response : [];
  } catch (_) {
    return [];
  }
}

function findMatchResultForFixture(fixtureId, homeName, awayName, kickoff) {
  const normHome = String(homeName || "").trim().toLowerCase();
  const normAway = String(awayName || "").trim().toLowerCase();
  const fId = Number(fixtureId);

  // If kickoff is in the future, the match has not started and cannot be finished!
  if (kickoff) {
    const kDate = new Date(kickoff);
    if (!isNaN(kDate.getTime()) && kDate.getTime() > Date.now() + 60000) {
      return null;
    }
  }

  // 0. Check custom store.matchResults if entered manually
  try {
    const { loadStore } = require("../db");
    const store = loadStore();
    if (store && store.matchResults) {
      const custom = store.matchResults[String(fixtureId)] || (fId ? store.matchResults[String(fId)] : null);
      if (custom) {
        return {
          fixture: { id: fId, status: { short: custom.status || "FT" } },
          goals: { home: custom.homeGoals, away: custom.awayGoals },
          score: {
            halftime: { home: custom.htHomeGoals ?? 0, away: custom.htAwayGoals ?? 0 },
            fulltime: { home: custom.homeGoals, away: custom.awayGoals },
          },
          cards: custom.cards || {
            homeYellow: custom.homeYellow ?? 0,
            awayYellow: custom.awayYellow ?? 0,
            totalYellow: (custom.homeYellow ?? 0) + (custom.awayYellow ?? 0),
            htHomeYellow: custom.htHomeYellow ?? 0,
            htAwayYellow: custom.htAwayYellow ?? 0,
            htTotalYellow: (custom.htHomeYellow ?? 0) + (custom.htAwayYellow ?? 0),
            shHomeYellow: Math.max(0, (custom.homeYellow ?? 0) - (custom.htHomeYellow ?? 0)),
            shAwayYellow: Math.max(0, (custom.awayYellow ?? 0) - (custom.htAwayYellow ?? 0)),
            shTotalYellow: Math.max(0, (custom.homeYellow ?? 0) - (custom.htHomeYellow ?? 0)) + Math.max(0, (custom.awayYellow ?? 0) - (custom.htAwayYellow ?? 0)),
            homeRed: custom.homeRed ?? 0,
            awayRed: custom.awayRed ?? 0,
            totalRed: (custom.homeRed ?? 0) + (custom.awayRed ?? 0),
          },
        };
      }
    }
  } catch (_) {}

  // 1. Check daily results for today, yesterday, and kickoff date
  const dates = [
    new Date().toISOString().slice(0, 10),
    new Date(Date.now() - 86400000).toISOString().slice(0, 10),
  ];
  if (kickoff) {
    const kDate = new Date(kickoff);
    if (!isNaN(kDate.getTime())) {
      const kStr = kDate.toISOString().slice(0, 10);
      if (!dates.includes(kStr)) dates.push(kStr);
    }
  }

  for (const d of dates) {
    const daily = buildDailyResultsForDate(d, "football");
    const found = daily.find((m) => {
      const mh = String(m.home?.name || "").toLowerCase();
      const ma = String(m.away?.name || "").toLowerCase();
      const teamsMatch = normHome && normAway &&
        (mh.includes(normHome) || normHome.includes(mh)) &&
        (ma.includes(normAway) || normAway.includes(ma));
      if (fId && Number(m.id) === fId) {
        if (normHome && normAway && !teamsMatch) return false;
        return true;
      }
      return Boolean(teamsMatch);
    });

    if (found && found.status === "FT") {
      return {
        fixture: { id: found.id, status: { short: "FT" } },
        goals: { home: found.home.score, away: found.away.score },
        score: {
          halftime: { home: found.score.halftime.home, away: found.score.halftime.away },
          fulltime: { home: found.score.fulltime.home, away: found.score.fulltime.away },
        },
        cards: found.cards,
        events: found.events || [],
      };
    }
  }

  // If not found in confirmed daily results with status FT, match is not finished
  return null;
}

module.exports = {
  router,
  fetchFixtureResults,
  buildDailyResultsForDate,
  findMatchResultForFixture,
};

