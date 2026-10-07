const express = require("express");
const { ensureWallet, debitWallet, creditWallet, loadStore } = require("../db");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/balance", authRequired, (req, res) => {
  const wallet = ensureWallet(req.user.id, process.env.CURRENCY || "ETB");
  res.json({
    ok: true,
    balance: wallet.balance,
    currency: wallet.currency || process.env.CURRENCY || "ETB",
  });
});

// Fast configuration endpoint for games to read current house margin & max win
router.get("/game-config", (_req, res) => {
  try {
    const store = loadStore();
    const cfg = store.gameProfitControl || {
      globalProfitMargin: 15.0,
      globalMarginEnabled: true,
      maxWinPerRound: 50000.0,
      maintenanceMode: false,
      games: {
        aviator: { margin: 15.0, instantCrashRate: 6.0, maxMultiplier: 100.0, enabled: true },
        chickenRoad: { margin: 15.0, dangerLevel: "medium", enabled: true },
        fastKeno: { margin: 12.0, enabled: true },
        fish: { margin: 15.0, enabled: true },
        infinity: { margin: 15.0, enabled: true },
        bingo: { margin: 15.0, enabled: true },
        bingoStar: { margin: 15.0, enabled: true },
      },
    };
    res.json({ ok: true, config: cfg });
  } catch (_) {
    res.json({
      ok: true,
      config: {
        globalProfitMargin: 15.0,
        globalMarginEnabled: true,
        maxWinPerRound: 50000.0,
        maintenanceMode: false,
      },
    });
  }
});

// Deduct bet amount for mini-games (Aviator, Keno, Chicken Road, Fish, etc.)
router.post("/game-debit", authRequired, (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ ok: false, error: "Invalid bet amount" });
  }

  const game = String(req.body.game || "mini_game");
  const reference = String(req.body.reference || `bet_${Date.now()}`);

  try {
    const newBalance = debitWallet(req.user.id, Math.round(amount * 100) / 100, "game_bet", reference, { game });
    return res.json({
      ok: true,
      balance: newBalance,
      currency: process.env.CURRENCY || "ETB",
    });
  } catch (err) {
    if (err.code === "INSUFFICIENT_BALANCE") {
      const wallet = ensureWallet(req.user.id);
      return res.status(400).json({
        ok: false,
        error: "Insufficient balance to place bet.",
        code: "INSUFFICIENT_BALANCE",
        balance: wallet.balance,
      });
    }
    return res.status(500).json({ ok: false, error: "Failed to process bet" });
  }
});

// Credit win amount for mini-games
router.post("/game-credit", authRequired, (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return res.status(400).json({ ok: false, error: "Invalid win amount" });
  }

  const game = String(req.body.game || "mini_game");
  const reference = String(req.body.reference || `win_${Date.now()}`);

  try {
    const safeWin = Math.round(amount * 100) / 100;
    let newBalance;
    if (safeWin > 0) {
      newBalance = creditWallet(req.user.id, safeWin, "game_win", reference, { game });
    } else {
      const wallet = ensureWallet(req.user.id);
      newBalance = wallet.balance;
    }
    return res.json({
      ok: true,
      balance: newBalance,
      currency: process.env.CURRENCY || "ETB",
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Failed to credit winnings" });
  }
});

module.exports = router;