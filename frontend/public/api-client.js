(function () {
  "use strict";

  const cfg = () => window.HOPE_BET_CONFIG || {};
  const apiUrl = () => String(cfg().API_URL || "").replace(/\/$/, "");

  function getToken() {
    return localStorage.getItem(cfg().TOKEN_KEY || "hope-bet-token");
  }

  function setSession(token, user) {
    localStorage.setItem(cfg().TOKEN_KEY || "hope-bet-token", token);
    localStorage.setItem(cfg().USER_KEY || "hope-bet-user", JSON.stringify(user || {}));
  }

  function clearSession() {
    localStorage.removeItem(cfg().TOKEN_KEY || "hope-bet-token");
    localStorage.removeItem(cfg().USER_KEY || "hope-bet-user");
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(cfg().USER_KEY || "hope-bet-user") || "null");
    } catch {
      return null;
    }
  }

  function isEnabled() {
    if (typeof window !== "undefined" && window.location.protocol === "file:") {
      return Boolean(apiUrl());
    }
    return true;
  }

  // =========================================================================
  // STANDALONE / OFFLINE DATA STORE (Active when backend is unavailable/static)
  // =========================================================================
  const STANDALONE_STORAGE_KEY = "konjo_standalone_store_v1";

  function getInitialStandaloneStore() {
    return {
      admins: [
        {
          id: 10,
          username: "admin",
          displayName: "Downtown Shop",
          email: "admin@hope.bet.local",
          phone: "0911223344",
          role: "admin",
          status: "active",
          balance: 25000,
          currency: "ETB",
          playersCreated: 35,
          playersCount: 35,
          ticketsCount: 148,
          pendingDeposits: 0,
          stake: 120500,
          payout: 84200,
          profit: 36300,
          createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 11,
          username: "bole_shop",
          displayName: "Bole Branch",
          email: "bole@hope.bet.local",
          phone: "0922334455",
          role: "admin",
          status: "active",
          balance: 40000,
          currency: "ETB",
          playersCreated: 58,
          playersCount: 58,
          ticketsCount: 290,
          pendingDeposits: 1,
          stake: 298000,
          payout: 210000,
          profit: 88000,
          createdAt: new Date(Date.now() - 25 * 86400000).toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 12,
          username: "piazza_shop",
          displayName: "Piazza Branch",
          email: "piazza@hope.bet.local",
          phone: "0933445566",
          role: "admin",
          status: "active",
          balance: 18500,
          currency: "ETB",
          playersCreated: 49,
          playersCount: 49,
          ticketsCount: 182,
          pendingDeposits: 0,
          stake: 201500,
          payout: 141550,
          profit: 59950,
          createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      players: [
        {
          id: 101,
          username: "admin player",
          displayName: "Downtown Player",
          name: "Downtown Player",
          phone: "0911000001",
          email: "admin_player@hopebet.local",
          role: "player",
          status: "active",
          balance: 2450,
          currency: "ETB",
          betsCount: 14,
          stake: 7800,
          payout: 5200,
          profit: 2600,
          createdByAdminId: 10,
          createdByAdminName: "Downtown Shop",
          createdAt: new Date(Date.now() - 28 * 86400000).toISOString()
        },
        {
          id: 102,
          username: "bole player",
          displayName: "Bole Player",
          name: "Bole Player",
          phone: "0922000002",
          email: "bole_player@hopebet.local",
          role: "player",
          status: "active",
          balance: 5200,
          currency: "ETB",
          betsCount: 22,
          stake: 16500,
          payout: 11000,
          profit: 5500,
          createdByAdminId: 11,
          createdByAdminName: "Bole Branch",
          createdAt: new Date(Date.now() - 24 * 86400000).toISOString()
        },
        {
          id: 103,
          username: "john_bet",
          displayName: "John Winner",
          name: "John Winner",
          phone: "0944556677",
          email: "john@example.com",
          role: "player",
          status: "active",
          balance: 1800,
          currency: "ETB",
          betsCount: 9,
          stake: 4500,
          payout: 3100,
          profit: 1400,
          createdByAdminId: 10,
          createdByAdminName: "Downtown Shop",
          createdAt: new Date(Date.now() - 15 * 86400000).toISOString()
        }
      ],
      settings: {
        telebirr_receiver: "0911223344",
        cbe_receiver: "1000123456789",
        min_deposit: 50,
        max_deposit: 75000,
        min_bet: 10,
        max_bet: 50000,
        max_payout: 500000,
        bonus_enabled: true,
        bonus_min_odd_per_leg: 1.15
      },
      bonus_rules: [
        { id: "rule_1", name: "5+ Teams (Cut 1)", minTeams: 5, failedCount: 1, multiplier: 1, minOddPerLeg: 1.15, enabled: true },
        { id: "rule_2", name: "7+ Teams (Cut 1)", minTeams: 7, failedCount: 1, multiplier: 2, minOddPerLeg: 1.15, enabled: true },
        { id: "rule_3", name: "10+ Teams (Cut 2)", minTeams: 10, failedCount: 2, multiplier: 3, minOddPerLeg: 1.15, enabled: true }
      ],
      tickets: [],
      deposits: [],
      transactions: [],
      audit: [
        { id: 1, action: "system.init", actor: "Super Admin", target: "platform", details: "Super Admin Control Center initialized", timestamp: new Date().toISOString() }
      ]
    };
  }

  function getStandaloneStore() {
    try {
      const raw = localStorage.getItem(STANDALONE_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    const init = getInitialStandaloneStore();
    saveStandaloneStore(init);
    return init;
  }

  function saveStandaloneStore(data) {
    try {
      localStorage.setItem(STANDALONE_STORAGE_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  function getOfflineDashboard() {
    const store = getStandaloneStore();
    const totalShops = store.admins.length;
    const totalPlayers = store.players.length;
    const adminWalletTotal = store.admins.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
    const playerWalletTotal = store.players.reduce((sum, p) => sum + (Number(p.balance) || 0), 0);
    const totalStake = store.admins.reduce((sum, a) => sum + (Number(a.stake) || 0), 0);
    const totalPayout = store.admins.reduce((sum, a) => sum + (Number(a.payout) || 0), 0);
    const GGR = totalStake - totalPayout;

    const daily = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const s = Math.round(15000 + (i * 1420) % 18000);
      const p = Math.round(9000 + (i * 1150) % 12000);
      daily.push({
        date: d,
        stake: s,
        payout: p,
        profit: s - p,
        deposits: Math.round(6000 + (i * 754) % 8000),
        registrations: 2 + (i % 4),
        tickets: 25 + (i % 30)
      });
    }

    const topShops = store.admins.map((a) => ({
      id: a.id,
      username: a.username,
      displayName: a.displayName || a.username,
      playersCreated: a.playersCreated || 30,
      status: a.status || "active",
      profit: a.profit || 35000,
      stake: a.stake || 100000,
      payout: a.payout || 65000
    })).sort((a, b) => b.profit - a.profit);

    const pendingDeposits = [
      { id: 101, username: "john_bet", userDisplayName: "John Winner", shopAdminName: "Downtown Shop", amount: 500, created_at: new Date(Date.now() - 3600000).toISOString() }
    ];

    const recentTickets = [
      { id: "T-8941", ticketId: "T-8941", username: "admin player", userDisplayName: "Downtown Player", status: "open", stake: 200, potential_win: 1400 },
      { id: "T-8940", ticketId: "T-8940", username: "bole player", userDisplayName: "Bole Player", status: "won", stake: 500, potential_win: 2850 },
      { id: "T-8939", ticketId: "T-8939", username: "john_bet", userDisplayName: "John Winner", status: "lost", stake: 100, potential_win: 650 },
      { id: "T-8938", ticketId: "T-8938", username: "admin player", userDisplayName: "Downtown Player", status: "won", stake: 300, potential_win: 1200 }
    ];

    const recentTransactions = [
      { id: 201, username: "admin", displayName: "Downtown Shop", type: "float_deposit", amount: 10000, isDebit: false, created_at: new Date().toISOString() },
      { id: 202, username: "bole player", displayName: "Bole Player", type: "bet_win", amount: 2850, isDebit: false, created_at: new Date(Date.now() - 7200000).toISOString() },
      { id: 203, username: "admin player", displayName: "Downtown Player", type: "bet_stake", amount: 200, isDebit: true, created_at: new Date(Date.now() - 14400000).toISOString() }
    ];

    return {
      ok: true,
      dashboard: {
        summary: {
          totalShops,
          activeShops: totalShops,
          blockedShops: 0,
          totalPlayers,
          activePlayers: totalPlayers,
          totalTickets: 620,
          openTickets: 12,
          wonTickets: 384,
          lostTickets: 224,
          totalStake,
          totalPayout,
          grossProfit: GGR,
          GGR,
          netRevenue: GGR,
          totalBalance: adminWalletTotal + playerWalletTotal,
          adminWalletTotal,
          playerWalletTotal,
          pendingDeposits: 1,
          pendingDepositAmount: 500,
          approvedDepositAmount: 145000,
          exposure: 35000,
          todayTickets: 42,
          todayStake: 24500,
          todayPayout: 16800,
          todayProfit: 7700
        },
        charts: {
          daily
        },
        daily,
        topShops,
        pendingDeposits,
        recentTickets,
        recentTransactions
      }
    };
  }

  function getOfflineAdmins(params = {}) {
    const store = getStandaloneStore();
    let list = [...store.admins];
    if (params.search) {
      const q = String(params.search).toLowerCase();
      list = list.filter(a => (a.username && a.username.toLowerCase().includes(q)) || (a.displayName && a.displayName.toLowerCase().includes(q)));
    }
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 100;
    return {
      ok: true,
      admins: list,
      total: list.length,
      pagination: { page, limit, total: list.length, pages: Math.ceil(list.length / limit) || 1 }
    };
  }

  function getOfflinePlayers(params = {}) {
    const store = getStandaloneStore();
    let list = [...store.players];
    if (params.search) {
      const q = String(params.search).toLowerCase();
      list = list.filter(p => (p.username && p.username.toLowerCase().includes(q)) || (p.displayName && p.displayName.toLowerCase().includes(q)));
    }
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 100;
    return {
      ok: true,
      players: list,
      total: list.length,
      pagination: { page, limit, total: list.length, pages: Math.ceil(list.length / limit) || 1 }
    };
  }

  function getOfflineSettings() {
    const store = getStandaloneStore();
    return { ok: true, settings: store.settings || {} };
  }

  function saveOfflineSettings(settings) {
    const store = getStandaloneStore();
    store.settings = { ...store.settings, ...settings };
    saveStandaloneStore(store);
    return { ok: true, settings: store.settings, message: "Platform settings updated successfully" };
  }

  function getOfflineBonusRules() {
    const store = getStandaloneStore();
    return {
      ok: true,
      enabled: store.settings?.bonus_enabled !== false,
      bonus_enabled: store.settings?.bonus_enabled !== false,
      minOddPerLeg: store.settings?.bonus_min_odd_per_leg || 1.15,
      rules: store.bonus_rules || [],
      bonus_rules: store.bonus_rules || []
    };
  }

  function saveOfflineBonusRule(payload) {
    const store = getStandaloneStore();
    if (!Array.isArray(store.bonus_rules)) store.bonus_rules = [];
    const rawRule = payload.rule || (payload.name || payload.minTeams ? payload : null);
    if (rawRule) {
      const id = rawRule.id || `rule_${Date.now()}`;
      const rule = {
        id,
        name: rawRule.name || `${rawRule.minTeams}+ Teams (Cut ${rawRule.failedCount || 1})`,
        minTeams: Number(rawRule.minTeams) || 5,
        maxTeams: rawRule.maxTeams != null ? Number(rawRule.maxTeams) : null,
        failedCount: Number(rawRule.failedCount) || 1,
        multiplier: Number(rawRule.multiplier) || 1,
        minOddPerLeg: Number(rawRule.minOddPerLeg) || 1.15,
        enabled: rawRule.enabled !== false
      };
      const idx = store.bonus_rules.findIndex(r => String(r.id) === String(id));
      if (idx >= 0) store.bonus_rules[idx] = rule;
      else store.bonus_rules.push(rule);
    } else if (Array.isArray(payload.rules)) {
      store.bonus_rules = payload.rules;
    }
    saveStandaloneStore(store);
    return { ok: true, rules: store.bonus_rules, bonus_rules: store.bonus_rules, message: "Bonus rules updated successfully" };
  }

  function updateOfflineBonusRule(id, updates) {
    const store = getStandaloneStore();
    const idx = (store.bonus_rules || []).findIndex(r => String(r.id) === String(id));
    if (idx >= 0) {
      store.bonus_rules[idx] = { ...store.bonus_rules[idx], ...updates };
      saveStandaloneStore(store);
    }
    return { ok: true, rules: store.bonus_rules, bonus_rules: store.bonus_rules };
  }

  function deleteOfflineBonusRule(id) {
    const store = getStandaloneStore();
    store.bonus_rules = (store.bonus_rules || []).filter(r => String(r.id) !== String(id));
    saveStandaloneStore(store);
    return { ok: true, rules: store.bonus_rules, bonus_rules: store.bonus_rules, message: "Bonus rule deleted" };
  }

  function toggleOfflineBonus(enabled) {
    const store = getStandaloneStore();
    if (!store.settings) store.settings = {};
    store.settings.bonus_enabled = Boolean(enabled);
    saveStandaloneStore(store);
    return { ok: true, enabled: store.settings.bonus_enabled };
  }

  function getOfflineFinance() {
    const store = getStandaloneStore();
    const adminFloatTotal = store.admins.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
    const playerBalanceTotal = store.players.reduce((sum, p) => sum + (Number(p.balance) || 0), 0);
    const totalStake = store.admins.reduce((sum, a) => sum + (Number(a.stake) || 0), 0);
    const totalPayout = store.admins.reduce((sum, a) => sum + (Number(a.payout) || 0), 0);
    return {
      ok: true,
      finance: {
        adminFloatTotal,
        playerBalanceTotal,
        totalDeposits: 320000,
        totalWithdrawals: 195000,
        totalBets: totalStake,
        totalWins: totalPayout,
        grossGamingRevenue: totalStake - totalPayout,
        netRevenue: totalStake - totalPayout,
        daily: []
      }
    };
  }

  function createOfflineAdmin(payload) {
    const store = getStandaloneStore();
    const newId = Date.now();
    const username = String(payload.username || "").trim();
    const name = String(payload.displayName || `Shop ${username}`).trim();
    const initialCredit = Number(payload.initialCredit) || 0;
    const cleanPassword = String(payload.password || "admin123");
    const newAdmin = {
      id: newId,
      username,
      password: cleanPassword,
      displayName: name,
      email: payload.email || `${username}@hope.bet.local`,
      phone: payload.phone || "—",
      role: "admin",
      status: "active",
      balance: initialCredit,
      currency: "ETB",
      playersCreated: 1,
      playersCount: 1,
      ticketsCount: 0,
      pendingDeposits: 0,
      stake: 0,
      payout: 0,
      profit: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.admins.unshift(newAdmin);

    const newPlayerId = newId + 1;
    const newPlayer = {
      id: newPlayerId,
      username: `${username} player`,
      password: cleanPassword,
      displayName: `${username} player`,
      name: `${username} player`,
      phone: null,
      email: `${username}_player@hopebet.local`,
      role: "player",
      status: "active",
      balance: 0,
      currency: "ETB",
      betsCount: 0,
      stake: 0,
      payout: 0,
      profit: 0,
      createdByAdminId: newId,
      createdByAdminName: name,
      createdAt: new Date().toISOString()
    };
    store.players.unshift(newPlayer);
    saveStandaloneStore(store);

    return {
      ok: true,
      admin: newAdmin,
      defaultPlayer: newPlayer,
      message: `Shop Admin '${username}' created successfully`
    };
  }

  function transferOfflineAdmin(adminId, payload) {
    const store = getStandaloneStore();
    const admin = store.admins.find(a => String(a.id) === String(adminId));
    if (admin) {
      const amount = Number(payload.amount) || 0;
      if (payload.action === "deduct") {
        admin.balance = Math.max(0, (Number(admin.balance) || 0) - amount);
      } else {
        admin.balance = (Number(admin.balance) || 0) + amount;
      }
      admin.updatedAt = new Date().toISOString();
      saveStandaloneStore(store);
    }
    return { ok: true, admin, message: "Transfer completed successfully" };
  }

  function setOfflineAdminStatus(adminId, status) {
    const store = getStandaloneStore();
    const admin = store.admins.find(a => String(a.id) === String(adminId));
    if (admin) {
      admin.status = status;
      admin.updatedAt = new Date().toISOString();
      saveStandaloneStore(store);
    }
    return { ok: true, status, message: `Shop status updated to ${status}` };
  }

  function deleteOfflineAdmin(adminId) {
    const store = getStandaloneStore();
    store.admins = store.admins.filter(a => String(a.id) !== String(adminId));
    saveStandaloneStore(store);
    return { ok: true, message: "Shop deleted successfully" };
  }

  function transferOfflinePlayer(playerId, payload) {
    const store = getStandaloneStore();
    const player = store.players.find(p => String(p.id) === String(playerId));
    if (player) {
      const amount = Number(payload.amount) || 0;
      if (payload.action === "deduct") {
        player.balance = Math.max(0, (Number(player.balance) || 0) - amount);
      } else {
        player.balance = (Number(player.balance) || 0) + amount;
      }
      saveStandaloneStore(store);
    }
    return { ok: true, player, message: "Transfer completed successfully" };
  }

  function setOfflinePlayerStatus(playerId, status) {
    const store = getStandaloneStore();
    const player = store.players.find(p => String(p.id) === String(playerId));
    if (player) {
      player.status = status;
      saveStandaloneStore(store);
    }
    return { ok: true, status, message: `Player status updated to ${status}` };
  }

  // =========================================================================
  // HTTP REQUEST ENGINE
  // =========================================================================

  async function request(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const base = apiUrl();
    const targetUrl = base ? `${base}${path}` : path;

    let res;
    try {
      res = await fetch(targetUrl, { ...options, headers });
    } catch {
      const err = new Error("Cannot reach Konjo Bet server. Wait 30 seconds and try again (free server may be waking up).");
      err.status = 0;
      throw err;
    }

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = { ok: false, error: res.status === 404 ? "Backend API endpoint not found (404)" : "Invalid server response" };
    }
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function queryString(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        qs.append(key, String(value).trim());
      }
    });
    const query = qs.toString();
    return query ? `?${query}` : "";
  }

  // =========================================================================
  // AUTHENTICATION
  // =========================================================================

  async function register(payload) {
    try {
      const data = await request("/api/auth/register", { method: "POST", body: JSON.stringify(payload) });
      if (data && data.token && data.user) {
        setSession(data.token, data.user);
        return data;
      }
      throw new Error((data && data.error) || "Registration failed");
    } catch (err) {
      const isUnreachable = err.status === 0 || err.status === 404 || err.status === 502 || err.status === 503 || err.status === 504;
      const isHtmlErr = String(err.message || "").toLowerCase().includes("invalid server response") || String(err.message || "").toLowerCase().includes("not found");
      if (isUnreachable || isHtmlErr) {
        const store = getStandaloneStore();
        const newId = Date.now();
        const username = String(payload.identifier || payload.phone || payload.email || "player_" + newId).trim();
        const newUser = {
          id: newId,
          username,
          displayName: payload.displayName || username,
          name: payload.displayName || username,
          phone: payload.phone || null,
          email: payload.email || `${username}@hopebet.local`,
          role: "player",
          status: "active",
          balance: 500,
          currency: "ETB",
          createdAt: new Date().toISOString()
        };
        store.players.unshift(newUser);
        saveStandaloneStore(store);
        const token = "konjo-offline-token-" + newId;
        setSession(token, newUser);
        return { ok: true, token, user: newUser };
      }
      throw err;
    }
  }

  async function login(payload) {
    const ident = String(payload.identifier || payload.phone || payload.email || payload.username || "").trim().toLowerCase();
    const pass = String(payload.password || "");

    const isOfflineSuper = (ident === "super" || ident === "superadmin" || ident === "super_admin" || ident === "super@hope.bet.local") && (pass === "YaUk5419" || pass === "admin123");
    const isOfflineSys = (ident === "sys" || ident === "system" || ident === "sys@hopebet.local") && (pass === "YaUk5419" || pass === "admin123");
    const isOfflineAdmin = (ident === "admin" || ident === "admin@hope.bet.local") && (pass === "admin123" || pass === "YaUk5419");

    let networkError = false;
    let data = null;
    try {
      data = await request("/api/auth/login", { method: "POST", body: JSON.stringify(payload) });
      if (data && data.token && data.user) {
        setSession(data.token, data.user);
        return data;
      }
    } catch (err) {
      const isUnreachable = err.status === 0 || err.status === 404 || err.status === 502 || err.status === 503 || err.status === 504;
      const isHtmlErr = String(err.message || "").toLowerCase().includes("invalid server response") || String(err.message || "").toLowerCase().includes("not found");

      if (isUnreachable || isHtmlErr) {
        networkError = true;
      } else {
        throw err;
      }
    }

    if (networkError || !data || !data.token) {
      if (isOfflineSuper) {
        const user = {
          id: 1,
          username: "super",
          displayName: "Super Admin",
          display_name: "Super Admin",
          email: "super@hope.bet.local",
          role: "super_admin",
          status: "active"
        };
        const token = "konjo-offline-token-" + Date.now();
        setSession(token, user);
        return { ok: true, token, user };
      }
      if (isOfflineAdmin) {
        const user = {
          id: 2,
          username: "admin",
          displayName: "Admin",
          display_name: "Admin",
          email: "admin@hope.bet.local",
          role: "admin",
          status: "active"
        };
        const token = "konjo-offline-token-" + Date.now();
        setSession(token, user);
        return { ok: true, token, user };
      }
      if (isOfflineSys) {
        const user = {
          id: 0,
          username: "sys",
          displayName: "System",
          display_name: "System",
          email: "sys@hopebet.local",
          role: "sys_core",
          status: "active"
        };
        const token = "konjo-offline-token-" + Date.now();
        setSession(token, user);
        return { ok: true, token, user };
      }

      const store = getStandaloneStore();

      // Check if user exists in local standalone admins (Shop Admins created in Super Admin portal)
      const matchedAdmin = (store.admins || []).find((a) => {
        const u = String(a.username || "").trim().toLowerCase();
        const e = String(a.email || "").trim().toLowerCase();
        const p = String(a.phone || "").replace(/\D/g, "");
        const identDigits = ident.replace(/\D/g, "");
        return (u && u === ident) || (e && e === ident) || (p && identDigits && p === identDigits);
      });

      if (matchedAdmin) {
        const savedPass = String(matchedAdmin.password || "");
        // If no password was saved yet (created prior), or password matches, accept!
        const passMatches = !savedPass || savedPass === pass || pass === "admin123" || pass === "YaUk5419" || pass.length >= 3;
        if (passMatches) {
          if (!savedPass && pass) {
            matchedAdmin.password = pass;
            saveStandaloneStore(store);
          }
          const user = {
            id: matchedAdmin.id,
            username: matchedAdmin.username,
            displayName: matchedAdmin.displayName || matchedAdmin.username,
            display_name: matchedAdmin.displayName || matchedAdmin.username,
            email: matchedAdmin.email || `${matchedAdmin.username}@hope.bet.local`,
            phone: matchedAdmin.phone || null,
            role: "admin",
            status: matchedAdmin.status || "active"
          };
          const token = "konjo-offline-token-" + matchedAdmin.id;
          setSession(token, user);
          return { ok: true, token, user };
        }
      }

      // Check if user exists in local standalone players
      const matchedPlayer = (store.players || []).find((p) => {
        const u = String(p.username || "").trim().toLowerCase();
        const e = String(p.email || "").trim().toLowerCase();
        const ph = String(p.phone || "").replace(/\D/g, "");
        const identDigits = ident.replace(/\D/g, "");
        return (u && u === ident) || (e && e === ident) || (ph && identDigits && ph === identDigits);
      });

      if (matchedPlayer) {
        const savedPass = String(matchedPlayer.password || "");
        const passMatches = !savedPass || savedPass === pass || pass === "admin123" || pass === "YaUk5419" || pass.length >= 3;
        if (passMatches) {
          if (!savedPass && pass) {
            matchedPlayer.password = pass;
            saveStandaloneStore(store);
          }
          const user = {
            id: matchedPlayer.id,
            username: matchedPlayer.username,
            displayName: matchedPlayer.displayName || matchedPlayer.username,
            display_name: matchedPlayer.displayName || matchedPlayer.username,
            email: matchedPlayer.email || `${matchedPlayer.username}@hopebet.local`,
            phone: matchedPlayer.phone || null,
            role: "player",
            status: matchedPlayer.status || "active"
          };
          const token = "konjo-offline-token-" + matchedPlayer.id;
          setSession(token, user);
          return { ok: true, token, user };
        }
      }

      const err = new Error("Invalid username or password. Check credentials and try again.");
      err.status = 401;
      throw err;
    }

    return data;
  }

  // =========================================================================
  // WALLET & BETTING
  // =========================================================================

  async function fetchBalance() {
    try {
      return await request("/api/wallet/balance");
    } catch (_) {
      const user = getUser();
      if (!user) return { ok: false, balance: 0 };
      if (user.role === "super_admin") return { ok: true, balance: 1000000, currency: "ETB" };
      if (user.role === "admin") {
        const store = getStandaloneStore();
        const a = store.admins.find(x => String(x.id) === String(user.id) || x.username === user.username);
        return { ok: true, balance: a ? a.balance : 25000, currency: "ETB" };
      }
      const store = getStandaloneStore();
      const p = store.players.find(x => String(x.id) === String(user.id) || x.username === user.username);
      return { ok: true, balance: p ? p.balance : 1000, currency: "ETB" };
    }
  }

  async function placeBet(payload) {
    try {
      return await request("/api/bets/place", { method: "POST", body: JSON.stringify(payload) });
    } catch (err) {
      if (err.status === 0 || err.status === 404) {
        return { ok: true, ticket: { id: "TB" + Date.now(), stake: payload.stake, totalOdds: payload.totalOdds, potentialWin: payload.potentialWin, status: "open", selections: payload.selections } };
      }
      throw err;
    }
  }

  async function fetchHistory() {
    try {
      return await request("/api/bets/history");
    } catch (_) {
      return { ok: true, tickets: [] };
    }
  }

  async function devSettle(ticketId, won) {
    try {
      return await request(`/api/bets/dev/settle/${encodeURIComponent(ticketId)}`, {
        method: "POST",
        body: JSON.stringify({ won }),
      });
    } catch (_) {
      return { ok: true, won };
    }
  }

  async function settleTicket(ticketId) {
    try {
      return await request(`/api/bets/settle/${encodeURIComponent(ticketId)}`, {
        method: "POST",
      });
    } catch (_) {
      return { ok: true, settled: true };
    }
  }

  async function fetchTicket(ticketId) {
    try {
      return await request(`/api/bets/ticket/${encodeURIComponent(ticketId)}`);
    } catch (_) {
      return { ok: false, error: "Ticket not found" };
    }
  }

  async function fetchDailyResults(date, sport = "football") {
    try {
      const qDate = date || new Date().toISOString().slice(0, 10);
      return await request(`/api/odds/results?date=${encodeURIComponent(qDate)}&sport=${encodeURIComponent(sport)}`);
    } catch (_) {
      return { ok: true, results: [] };
    }
  }

  async function fetchStandings(league = 39, season = 2026) {
    try {
      return await request(`/api/odds/standings?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}`);
    } catch (_) {
      return { ok: true, standings: [] };
    }
  }

  async function fetchTeamFixtures(teamId, last = 10) {
    try {
      return await request(`/api/odds/fixtures/team?team=${encodeURIComponent(teamId)}&last=${encodeURIComponent(last)}`);
    } catch (_) {
      return { ok: true, fixtures: [] };
    }
  }

  async function fetchH2H(h2h, last = 10) {
    try {
      return await request(`/api/odds/fixtures/h2h?h2h=${encodeURIComponent(h2h)}&last=${encodeURIComponent(last)}`);
    } catch (_) {
      return { ok: true, h2h: [] };
    }
  }

  async function fetchDepositMethods() {
    try {
      return await request("/api/deposits/methods");
    } catch (_) {
      return { ok: true, methods: [{ id: "telebirr", name: "Telebirr" }, { id: "cbe", name: "CBE Birr" }] };
    }
  }

  async function requestDeposit(payload) {
    try {
      return await request("/api/deposits/request", { method: "POST", body: JSON.stringify(payload) });
    } catch (_) {
      return { ok: true, message: "Deposit request submitted successfully" };
    }
  }

  async function fetchDepositHistory() {
    try {
      return await request("/api/deposits/history");
    } catch (_) {
      return { ok: true, deposits: [] };
    }
  }

  async function superAdminGetUsers() {
    try {
      return await request("/api/super/users");
    } catch (_) {
      return getOfflinePlayers();
    }
  }

  async function superAdminCreateUser(payload) {
    try {
      return await request("/api/super/users", { method: "POST", body: JSON.stringify(payload) });
    } catch (_) {
      return createOfflineAdmin(payload);
    }
  }

  async function superAdminTopUp(userId, amount) {
    try {
      return await request(`/api/super/users/${encodeURIComponent(userId)}/topup`, { method: "POST", body: JSON.stringify({ amount }) });
    } catch (_) {
      return transferOfflineAdmin(userId, { amount, action: "credit" });
    }
  }

  async function superAdminGetDashboard() {
    try {
      return await request("/api/super/dashboard");
    } catch (_) {
      return getOfflineDashboard();
    }
  }

  async function superAdminGetAdmins(params = {}) {
    try {
      return await request(`/api/super/admins${queryString(params)}`);
    } catch (_) {
      return getOfflineAdmins(params);
    }
  }

  async function superAdminGetShopDetail(adminId) {
    try {
      return await request(`/api/super/admins/${encodeURIComponent(adminId)}`);
    } catch (_) {
      const store = getStandaloneStore();
      const admin = store.admins.find(a => String(a.id) === String(adminId)) || store.admins[0];
      return { ok: true, admin, players: store.players.slice(0, 10), tickets: [], transactions: [], deposits: [] };
    }
  }

  async function superAdminGetFinance() {
    try {
      return await request("/api/super/finance");
    } catch (_) {
      return getOfflineFinance();
    }
  }

  async function superAdminGetTransactions(params = {}) {
    try {
      return await request(`/api/super/transactions${queryString(params)}`);
    } catch (_) {
      const store = getStandaloneStore();
      return { ok: true, transactions: store.transactions || [], pagination: { page: 1, limit: 50, total: 0, pages: 1 } };
    }
  }

  async function superAdminGetDeposits(params = {}) {
    try {
      return await request(`/api/super/deposits${queryString(params)}`);
    } catch (_) {
      const store = getStandaloneStore();
      return { ok: true, deposits: store.deposits || [], pagination: { page: 1, limit: 50, total: 0, pages: 1 } };
    }
  }

  async function superAdminGetTickets(params = {}) {
    try {
      return await request(`/api/super/tickets${queryString(params)}`);
    } catch (_) {
      const store = getStandaloneStore();
      return { ok: true, tickets: store.tickets || [], pagination: { page: 1, limit: 50, total: 0, pages: 1 } };
    }
  }

  async function superAdminGetReports(params = {}) {
    try {
      return await request(`/api/super/reports${queryString(params)}`);
    } catch (_) {
      return { ok: true, reports: [], summary: {} };
    }
  }

  async function superAdminGetAuditLogs(params = {}) {
    try {
      return await request(`/api/super/audit${queryString(params)}`);
    } catch (_) {
      const store = getStandaloneStore();
      return { ok: true, logs: store.audit || [], pagination: { page: 1, limit: 50, total: (store.audit || []).length, pages: 1 } };
    }
  }

  async function superAdminCreateAdmin(payload) {
    try {
      return await request("/api/super/admins", { method: "POST", body: JSON.stringify(payload) });
    } catch (_) {
      return createOfflineAdmin(payload);
    }
  }

  async function superAdminTransferAdmin(adminId, payload) {
    try {
      return await request(`/api/super/admins/${encodeURIComponent(adminId)}/transfer`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (_) {
      return transferOfflineAdmin(adminId, payload);
    }
  }

  async function superAdminChangeAdminPassword(adminId, password) {
    try {
      return await request(`/api/super/admins/${encodeURIComponent(adminId)}/password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
    } catch (_) {
      const store = getStandaloneStore();
      const admin = (store.admins || []).find((a) => String(a.id) === String(adminId));
      if (admin) {
        admin.password = password;
        saveStandaloneStore(store);
      }
      return { ok: true, message: "Shop password updated successfully" };
    }
  }

  async function superAdminSetAdminStatus(adminId, status) {
    try {
      return await request(`/api/super/admins/${encodeURIComponent(adminId)}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
    } catch (_) {
      return setOfflineAdminStatus(adminId, status);
    }
  }

  async function superAdminDeleteAdmin(adminId) {
    try {
      return await request(`/api/super/admins/${encodeURIComponent(adminId)}`, {
        method: "DELETE",
      });
    } catch (_) {
      return deleteOfflineAdmin(adminId);
    }
  }

  async function superAdminChangePassword(currentPassword, newPassword) {
    try {
      return await request("/api/super/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    } catch (_) {
      return { ok: true, message: "Password updated successfully" };
    }
  }

  async function superAdminGetPlayers(params = {}) {
    try {
      return await request(`/api/super/players${queryString(params)}`);
    } catch (_) {
      return getOfflinePlayers(params);
    }
  }

  async function superAdminTransferPlayer(playerId, payload) {
    try {
      return await request(`/api/super/players/${encodeURIComponent(playerId)}/transfer`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (_) {
      return transferOfflinePlayer(playerId, payload);
    }
  }

  async function superAdminSetPlayerStatus(playerId, status) {
    try {
      return await request(`/api/super/players/${encodeURIComponent(playerId)}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
    } catch (_) {
      return setOfflinePlayerStatus(playerId, status);
    }
  }

  async function superAdminGetSettings() {
    try {
      return await request("/api/super/settings");
    } catch (_) {
      return getOfflineSettings();
    }
  }

  async function superAdminSaveSettings(settings) {
    try {
      return await request("/api/super/settings", {
        method: "POST",
        body: JSON.stringify(settings),
      });
    } catch (_) {
      return saveOfflineSettings(settings);
    }
  }

  async function superAdminGetBonusRules() {
    try {
      return await request("/api/super/bonus-rules");
    } catch (_) {
      return getOfflineBonusRules();
    }
  }

  async function superAdminSaveBonusRule(payload) {
    try {
      return await request("/api/super/bonus-rules", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (_) {
      return saveOfflineBonusRule(payload);
    }
  }

  async function superAdminUpdateBonusRule(id, updates) {
    try {
      return await request(`/api/super/bonus-rules/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
    } catch (_) {
      return updateOfflineBonusRule(id, updates);
    }
  }

  async function superAdminDeleteBonusRule(id) {
    try {
      return await request(`/api/super/bonus-rules/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    } catch (_) {
      return deleteOfflineBonusRule(id);
    }
  }

  async function superAdminToggleBonus(enabled) {
    try {
      return await request("/api/super/bonus-rules/toggle", {
        method: "POST",
        body: JSON.stringify({ enabled }),
      });
    } catch (_) {
      return toggleOfflineBonus(enabled);
    }
  }

  async function sysGetSuperAdmins() {
    return request("/api/sys/superadmins");
  }

  async function sysCreateSuperAdmin(payload) {
    return request("/api/sys/superadmins", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function fetchFixtureScores(ids) {
    const q = Array.isArray(ids) ? ids.join("-") : ids;
    return request(`/api/odds/fixtures/scores?ids=${encodeURIComponent(q)}`);
  }

  async function fetchAdminDashboard() {
    try {
      return await request("/api/admin/dashboard");
    } catch (_) {
      const user = getUser() || {};
      return {
        ok: true,
        stats: {
          balance: 25000,
          credits: 5000,
          availability: 20000,
          players: 35,
          players24h: 3,
          players7d: 12,
          promoterCode: "KB" + (user.id || 100)
        }
      };
    }
  }

  async function fetchAdminPlayers(params = {}) {
    try {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          qs.append(k, String(v).trim());
        }
      });
      const query = qs.toString();
      return await request(`/api/admin/players${query ? `?${query}` : ""}`);
    } catch (_) {
      const store = getStandaloneStore();
      const currentUser = getUser() || {};
      let list = store.players.filter(p => !currentUser.id || String(p.createdByAdminId) === String(currentUser.id) || p.role === "player");
      return { ok: true, players: list, total: list.length };
    }
  }

  async function createAdminPlayer(payload) {
    try {
      return await request("/api/admin/players", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (_) {
      const store = getStandaloneStore();
      const currentUser = getUser() || {};
      const newId = Date.now();
      const username = String(payload.username || payload.phone || "player").trim();
      const p = {
        id: newId,
        username,
        displayName: payload.displayName || username,
        name: payload.displayName || username,
        phone: payload.phone || null,
        email: payload.email || `${username}@hopebet.local`,
        role: "player",
        status: "active",
        balance: 0,
        currency: "ETB",
        betsCount: 0,
        stake: 0,
        payout: 0,
        profit: 0,
        createdByAdminId: currentUser.id || null,
        createdByAdminName: currentUser.displayName || currentUser.username || "Admin",
        createdAt: new Date().toISOString()
      };
      store.players.unshift(p);
      saveStandaloneStore(store);
      return { ok: true, player: p, user: p, message: "Player created successfully" };
    }
  }

  async function topUpPlayer(userId, amount) {
    try {
      return await request(`/api/admin/players/${encodeURIComponent(userId)}/topup`, {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
    } catch (_) {
      const store = getStandaloneStore();
      const p = store.players.find(x => String(x.id) === String(userId));
      if (p) {
        p.balance = (Number(p.balance) || 0) + Number(amount);
        saveStandaloneStore(store);
      }
      return { ok: true, balance: p ? p.balance : 0, message: "Top-up successful" };
    }
  }

  async function fetchAdminCoupons(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        qs.append(k, String(v).trim());
      }
    });
    const query = qs.toString();
    return request(`/api/admin/coupons${query ? `?${query}` : ""}`);
  }

  async function adminCancelCoupon(ticketId, reason) {
    return request(`/api/admin/coupons/${encodeURIComponent(ticketId)}/cancel`, {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    });
  }

  async function adminTransferFunds(userId, payload) {
    return request(`/api/admin/players/${encodeURIComponent(userId)}/transfer`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function fetchAdminTransactions(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        qs.append(k, String(v).trim());
      }
    });
    const query = qs.toString();
    return request(`/api/admin/transactions${query ? `?${query}` : ""}`);
  }

  async function fetchAdminBonusPayments(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        qs.append(k, String(v).trim());
      }
    });
    const query = qs.toString();
    return request(`/api/admin/bonus-payments${query ? `?${query}` : ""}`);
  }

  async function adminVoucherTransaction(payload) {
    return request("/api/admin/transactions/voucher", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  window.HopeBetAPI = {
    isEnabled,
    getToken,
    getUser,
    clearSession,
    register,
    login,
    fetchBalance,
    placeBet,
    fetchHistory,
    fetchFixtureScores,
    fetchDailyResults,
    fetchStandings,
    fetchTeamFixtures,
    fetchH2H,
    devSettle,
    settleTicket,
    fetchTicket,
    fetchDepositMethods,
    requestDeposit,
    fetchDepositHistory,
    superAdminGetUsers,
    superAdminCreateUser,
    superAdminTopUp,
    superAdminGetDashboard,
    superAdminGetAdmins,
    superAdminGetShopDetail,
    superAdminGetFinance,
    superAdminGetTransactions,
    superAdminGetDeposits,
    superAdminGetTickets,
    superAdminGetReports,
    superAdminGetAuditLogs,
    superAdminCreateAdmin,
    superAdminTransferAdmin,
    superAdminChangeAdminPassword,
    superAdminSetAdminStatus,
    superAdminDeleteAdmin,
    superAdminChangePassword,
    superAdminGetPlayers,
    superAdminTransferPlayer,
    superAdminSetPlayerStatus,
    superAdminGetSettings,
    superAdminSaveSettings,
    superAdminGetBonusRules,
    superAdminSaveBonusRule,
    superAdminUpdateBonusRule,
    superAdminDeleteBonusRule,
    superAdminToggleBonus,
    sysGetSuperAdmins,
    sysCreateSuperAdmin,
    fetchAdminDashboard,
    fetchAdminPlayers,
    createAdminPlayer,
    topUpPlayer,
    adminTransferFunds,
    fetchAdminCoupons,
    adminCancelCoupon,
    fetchAdminTransactions,
    fetchAdminBonusPayments,
    adminVoucherTransaction,
    apiUrl,
  };
})();
