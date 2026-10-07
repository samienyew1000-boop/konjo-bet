const express = require("express");
const { withStore, loadStore, creditWallet, debitWallet, addAuditLog } = require("../db");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

function withdrawMethods() {
  return [
    {
      id: "cbe",
      name: "Commercial Bank of Ethiopia",
      logo: "./assets/cbebirr.png",
      fee: "Free",
      processTime: "Instant",
      minAmount: 500,
      maxAmount: 50000,
      accountLabel: "Commercial Bank Account Number",
      placeholder: "Enter 13-digit account number",
    },
    {
      id: "telebirr",
      name: "Telebirr",
      logo: "./assets/telebirr.png",
      fee: "Free",
      processTime: "Instant",
      minAmount: 500,
      maxAmount: 50000,
      accountLabel: "Telebirr Account / Mobile Number",
      placeholder: "Enter 10-digit mobile number (e.g. 09...)",
    },
  ];
}

router.get("/methods", (_req, res) => {
  const store = loadStore();
  const settings = store.settings || {};
  res.json({
    ok: true,
    minWithdraw: Number(settings.min_withdraw || 500),
    maxWithdraw: Number(settings.max_withdraw || 50000),
    currency: process.env.CURRENCY || "ETB",
    methods: withdrawMethods(),
  });
});

router.post("/request", authRequired, (req, res) => {
  try {
    const amount = Number(req.body.amount);
    const method = String(req.body.method || "").trim().toLowerCase();
    const account = String(req.body.account || "").trim();

    const minWithdraw = 500;
    const maxWithdraw = 50000;

    if (!Number.isFinite(amount) || amount < minWithdraw) {
      return res.status(400).json({ ok: false, error: `Minimum withdrawal is ${minWithdraw} ETB` });
    }
    if (amount > maxWithdraw) {
      return res.status(400).json({ ok: false, error: `Maximum withdrawal is ${maxWithdraw} ETB` });
    }
    if (!["cbe", "telebirr"].includes(method)) {
      return res.status(400).json({ ok: false, error: "Invalid withdrawal method (must be CBE or Telebirr)" });
    }
    if (account.length < 5) {
      return res.status(400).json({ ok: false, error: "Valid account or phone number is required" });
    }

    const store = loadStore();
    const wallet = (store.wallets && store.wallets[String(req.user.id)]) || { balance: 0 };
    const currentBalance = Number(wallet.balance || 0);

    if (currentBalance < amount) {
      return res.status(400).json({
        ok: false,
        error: `Insufficient balance (${currentBalance.toFixed(2)} ETB available, ${amount.toFixed(2)} ETB requested)`,
        currentBalance,
      });
    }

    const pending = (store.withdrawals || []).filter((w) => w.user_id === req.user.id && w.status === "pending");
    if (pending.length >= 3) {
      return res.status(400).json({ ok: false, error: "You already have 3 pending withdrawal requests in queue" });
    }

    let withdrawalId = "";
    const withdrawal = withStore((s) => {
      s.counters.withdraw = (s.counters.withdraw || 0) + 1;
      withdrawalId = `WTH-${String(s.counters.withdraw).padStart(6, "0")}`;
      const row = {
        id: withdrawalId,
        user_id: req.user.id,
        amount: Number(amount.toFixed(2)),
        method,
        account,
        status: "pending",
        created_at: new Date().toISOString(),
        reviewed_at: null,
        note: null,
      };
      if (!Array.isArray(s.withdrawals)) s.withdrawals = [];
      s.withdrawals.unshift(row);
      return row;
    });

    // Hold/debit the amount immediately so it cannot be double-spent
    const newBalance = debitWallet(req.user.id, amount, "withdraw_pending", withdrawalId, {
      method,
      account,
      note: `Pending withdrawal request via ${method.toUpperCase()} (${account})`,
    });

    withStore((s) =>
      addAuditLog(s, req.user, "withdrawal.request", { type: "withdrawal", id: withdrawalId }, {
        amount,
        method,
        account,
      })
    );

    res.status(201).json({
      ok: true,
      withdrawal,
      newBalance,
      message: `Withdrawal request for ${amount.toFixed(2)} ETB submitted successfully.`,
    });
  } catch (err) {
    console.error("[withdrawals] Error submitting request:", err);
    res.status(500).json({ ok: false, error: err.message || "Failed to process withdrawal request" });
  }
});

router.get("/history", authRequired, (req, res) => {
  const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 15));
  const store = loadStore();
  const rows = (store.withdrawals || []).filter((w) => w.user_id === req.user.id).slice(0, limit);
  res.json({ ok: true, withdrawals: rows });
});

module.exports = router;
