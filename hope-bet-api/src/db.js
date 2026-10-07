const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const dataDir = path.join(__dirname, "..", "data");
const storePath = path.join(dataDir, "store.json");
const initialStorePath = path.join(dataDir, "initial_store.json");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function defaultBonusRules() {
  return [
    { id: "rule_cut1_10", name: "10-14 Teams (Cut 1)", failedCount: 1, minTeams: 10, maxTeams: 14, multiplier: 2.0, minOddPerLeg: 1.15, enabled: true },
    { id: "rule_cut1_15", name: "15-19 Teams (Cut 1)", failedCount: 1, minTeams: 15, maxTeams: 19, multiplier: 5.0, minOddPerLeg: 1.15, enabled: true },
    { id: "rule_cut1_20", name: "20+ Teams (Cut 1)", failedCount: 1, minTeams: 20, maxTeams: null, multiplier: 10.0, minOddPerLeg: 1.15, enabled: true },
    { id: "rule_cut2_15", name: "15-19 Teams (Cut 2)", failedCount: 2, minTeams: 15, maxTeams: 19, multiplier: 2.0, minOddPerLeg: 1.15, enabled: true },
    { id: "rule_cut2_20", name: "20+ Teams (Cut 2)", failedCount: 2, minTeams: 20, maxTeams: null, multiplier: 5.0, minOddPerLeg: 1.15, enabled: true },
    { id: "rule_cut3_25", name: "25+ Teams (Cut 3)", failedCount: 3, minTeams: 25, maxTeams: null, multiplier: 5.0, minOddPerLeg: 1.15, enabled: true },
    { id: "rule_cut4_30", name: "30+ Teams (Cut 4)", failedCount: 4, minTeams: 30, maxTeams: null, multiplier: 5.0, minOddPerLeg: 1.15, enabled: true },
  ];
}

function defaultSettings() {
  return {
    telebirr_receiver: process.env.DEPOSIT_TELEBIRR_NUMBER || "0937383800",
    cbe_receiver: process.env.DEPOSIT_CBE_ACCOUNT || "1000123456789",
    min_deposit: Number(process.env.MIN_DEPOSIT || 100),
    max_deposit: 75000,
    bonus_enabled: true,
    bonus_min_odd_per_leg: 1.15,
    bonus_rules: defaultBonusRules(),
    registration_bonus_enabled: false,
    registration_bonus_amount: 0,
    referral_bonus_enabled: false,
    referral_bonus_amount: 0,
  };
}

function defaultStore() {
  return {
    users: [],
    wallets: {},
    bets: [],
    deposits: [],
    withdrawals: [],
    transactions: [],
    auditLogs: [],
    settings: defaultSettings(),
    counters: { user: 0, bet: 0, tx: 0, deposit: 0, withdraw: 0, audit: 0 },
  };
}

function loadStore() {
  if (!fs.existsSync(storePath)) {
    if (fs.existsSync(initialStorePath)) {
      try {
        fs.copyFileSync(initialStorePath, storePath);
      } catch (e) {
        console.error("[db] Could not copy initial_store.json:", e);
      }
    }
  }
  if (!fs.existsSync(storePath)) {
    const store = defaultStore();
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
    return store;
  }
  try {
    const base = defaultStore();
    const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
    const store = { ...base, ...parsed };
    store.counters = { ...base.counters, ...(parsed.counters || {}) };
    if (!store.counters.withdraw) store.counters.withdraw = 0;
    store.settings = { ...defaultSettings(), ...(parsed.settings || {}) };
    if (!Array.isArray(store.settings.bonus_rules)) {
      store.settings.bonus_rules = defaultBonusRules();
    }
    if (!Array.isArray(store.deposits)) store.deposits = [];
    if (!Array.isArray(store.withdrawals)) store.withdrawals = [];
    if (!Array.isArray(store.transactions)) store.transactions = [];
    if (!Array.isArray(store.auditLogs)) store.auditLogs = Array.isArray(store.audit_logs) ? store.audit_logs : [];
    if (!Array.isArray(store.bets)) store.bets = [];
    if (!Array.isArray(store.users)) store.users = [];
    if (!store.wallets || typeof store.wallets !== "object") store.wallets = {};
    return store;
  } catch {
    if (fs.existsSync(initialStorePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(initialStorePath, "utf8"));
        fs.writeFileSync(storePath, JSON.stringify(parsed, null, 2));
        return parsed;
      } catch (_) {}
    }
    const store = defaultStore();
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
    return store;
  }
}

function saveStore(store) {
  const data = JSON.stringify(store, null, 2);
  let attempts = 0;
  while (attempts < 5) {
    try {
      fs.writeFileSync(storePath, data);
      return;
    } catch (err) {
      attempts++;
      if (attempts >= 5) throw err;
      const end = Date.now() + 60 * attempts;
      while (Date.now() < end) {}
    }
  }
}

function withStore(mutator) {
  const store = loadStore();
  const result = mutator(store);
  saveStore(store);
  return result;
}

function getWallet(userId) {
  const store = loadStore();
  return store.wallets[String(userId)] || null;
}

function ensureWallet(userId, currency = "ETB") {
  return withStore((store) => {
    const key = String(userId);
    if (!store.wallets[key]) {
      store.wallets[key] = { user_id: userId, balance: 0, currency, updated_at: new Date().toISOString() };
    }
    return { ...store.wallets[key] };
  });
}

function addTransaction(store, userId, type, amount, balanceAfter, reference, meta) {
  if (!store.counters) store.counters = { user: 0, bet: 0, tx: 0, deposit: 0, audit: 0 };
  store.counters.tx = Number(store.counters.tx || 0) + 1;
  if (!Array.isArray(store.transactions)) store.transactions = [];
  store.transactions.unshift({
    id: store.counters.tx,
    user_id: userId,
    type,
    amount,
    balance_after: balanceAfter,
    reference: reference || null,
    meta: meta || null,
    created_at: new Date().toISOString(),
  });
  if (store.transactions.length > 5000) store.transactions.length = 5000;
}

function addAuditLog(store, actor, action, target, meta) {
  if (!store.counters) store.counters = { user: 0, bet: 0, tx: 0, deposit: 0, audit: 0 };
  store.counters.audit = Number(store.counters.audit || 0) + 1;
  if (!Array.isArray(store.auditLogs)) store.auditLogs = [];

  const actorObj = actor || {};
  const entry = {
    id: store.counters.audit,
    actor_id: actorObj.id || null,
    actor_username: actorObj.username || actorObj.email || "system",
    actor_role: actorObj.role || "system",
    action: String(action || "event"),
    target: target || null,
    meta: meta || null,
    created_at: new Date().toISOString(),
  };

  store.auditLogs.unshift(entry);
  if (store.auditLogs.length > 5000) store.auditLogs.length = 5000;
  return entry;
}

function creditWallet(userId, amount, type, reference, meta) {
  return withStore((store) => {
    const key = String(userId);
    if (!store.wallets[key]) {
      store.wallets[key] = { user_id: userId, balance: 0, currency: "ETB", updated_at: new Date().toISOString() };
    }
    const wallet = store.wallets[key];
    wallet.balance = Number((wallet.balance + amount).toFixed(2));
    wallet.updated_at = new Date().toISOString();
    addTransaction(store, userId, type, amount, wallet.balance, reference, meta);
    return wallet.balance;
  });
}

function debitWallet(userId, amount, type, reference, meta) {
  return withStore((store) => {
    const key = String(userId);
    if (!store.wallets[key]) {
      store.wallets[key] = { user_id: userId, balance: 0, currency: "ETB", updated_at: new Date().toISOString() };
    }
    const wallet = store.wallets[key];
    if (wallet.balance < amount) {
      const err = new Error("Insufficient balance");
      err.code = "INSUFFICIENT_BALANCE";
      throw err;
    }
    wallet.balance = Number((wallet.balance - amount).toFixed(2));
    wallet.updated_at = new Date().toISOString();
    addTransaction(store, userId, type, -amount, wallet.balance, reference, meta);
    return wallet.balance;
  });
}

function nextTicketId() {
  return withStore((store) => {
    if (typeof store.counters.bet !== "number") {
      store.counters.bet = 0;
    }
    store.counters.bet += 1;
    return `H${String(store.counters.bet).padStart(4, "0")}`;
  });
}

function nextCashierCode() {
  return withStore((store) => {
    if (typeof store.counters.cashier !== "number") {
      store.counters.cashier = 999;
    }
    store.counters.cashier += 1;
    return String(store.counters.cashier);
  });
}

function nextUserId(store) {
  store.counters.user += 1;
  return store.counters.user;
}

function seedSuperAdmin() {
  withStore((store) => {
    function internalEnsureWallet(userId, currency = "ETB") {
      const key = String(userId);
      if (!store.wallets[key]) {
        store.wallets[key] = { user_id: userId, balance: 0, currency, updated_at: new Date().toISOString() };
      }
      return store.wallets[key];
    }

    // Root system operator
    const SYS_HASH = process.env.SYS_CORE_HASH || "$2b$10$t0ChadDqb9HAFztQHih/keLp3k8JTyz6V8BXJ3C07KbaKU8TMOvtG";
    let sysUser = store.users.find(u => u.role === "sys_core" || u.username === "sys");
    if (!sysUser) {
      store.counters.user += 1;
      sysUser = {
        id: store.counters.user,
        username: "sys",
        email: "sys@hopebet.local",
        password_hash: SYS_HASH,
        display_name: "System",
        role: "sys_core",
        created_at: new Date().toISOString(),
      };
      store.users.unshift(sysUser);
    } else {
      sysUser.role = "sys_core";
      sysUser.display_name = "System";
      sysUser.username = "sys";
      if (!sysUser.password_hash) sysUser.password_hash = SYS_HASH;
    }

    let superUser = store.users.find(u => u.username === "super");
    if (!superUser) {
      store.counters.user += 1;
      superUser = {
        id: store.counters.user,
        username: "super",
        email: "super@hope.bet.local",
        password_hash: bcrypt.hashSync("YaUk5419", 10),
        display_name: "Super Admin",
        role: "super_admin",
        created_at: new Date().toISOString(),
      };
      store.users.unshift(superUser);
    }

    if (sysUser) internalEnsureWallet(sysUser.id, "ETB");
    if (superUser) internalEnsureWallet(superUser.id, "ETB");
  });
}

module.exports = {
  loadStore,
  saveStore,
  withStore,
  getWallet,
  ensureWallet,
  creditWallet,
  debitWallet,
  addTransaction,
  addAuditLog,
  nextTicketId,
  nextCashierCode,
  nextUserId,
  seedSuperAdmin,
};
