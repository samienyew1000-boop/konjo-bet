const express = require("express");
const bcrypt = require("bcryptjs");
const { loadStore, withStore, ensureWallet, creditWallet, nextUserId } = require("../db");
const { signToken } = require("../middleware/auth");

const router = express.Router();

function normalizePhone(raw) {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.length < 8) return "";
  if (digits.startsWith("251")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

router.post("/register", (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const identifier = String(req.body.identifier || email || "").trim();
    const password = String(req.body.password || "");
    const phone = String(req.body.phone || "").trim() || null;
    const displayName = String(req.body.displayName || "").trim();
    const refCode = String(req.body.referralCode || req.body.promoterCode || req.body.promoter_code || req.body.ref || "").trim();
    const role = "player";

    const normPhone = normalizePhone(phone || identifier);

    if (!normPhone && !email && !identifier) {
      return res.status(400).json({ ok: false, error: "Valid phone number, email or username is required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ ok: false, error: "Password must be at least 6 characters" });
    }

    let userRow;
    let referrerUser = null;
    try {
      userRow = withStore((store) => {
        if (normPhone) {
          const duplicatePhone = store.users.some((u) => {
            const uNorm = normalizePhone(u.phone || u.username || u.email);
            return Boolean(uNorm && uNorm === normPhone);
          });
          if (duplicatePhone) {
            const err = new Error("this number is already registered");
            err.code = "PHONE_EXISTS";
            throw err;
          }
        }

        if (identifier) {
          const duplicateIdentifier = store.users.some((u) =>
            (u.email && u.email.toLowerCase() === identifier.toLowerCase()) ||
            (u.username && u.username.toLowerCase() === identifier.toLowerCase())
          );
          if (duplicateIdentifier) {
            const isPhoneMatch = normPhone && normalizePhone(identifier) === normPhone;
            const err = new Error(isPhoneMatch ? "this number is already registered" : "Email or username already registered");
            err.code = isPhoneMatch ? "PHONE_EXISTS" : "EMAIL_EXISTS";
            throw err;
          }
        }

        if (refCode) {
          const normRef = refCode.toLowerCase();
          referrerUser = store.users.find((u) =>
            (u.username && u.username.toLowerCase() === normRef) ||
            (u.phone && normalizePhone(u.phone) === normalizePhone(refCode)) ||
            String(u.id) === refCode ||
            (normRef.startsWith("hb") && String(u.id) === normRef.slice(2)) ||
            (normRef.startsWith("kb") && String(u.id) === normRef.slice(2))
          );
        }

        const standardPhone = normPhone ? `+251${normPhone}` : (phone || null);
        const standardUsername = normPhone ? `0${normPhone}` : (identifier.split("@")[0] || displayName || "user");
        const standardEmail = email || (normPhone ? `251${normPhone}@phone.hopebet.local` : `${identifier}@hope.bet`);
        const userDisplayName = displayName || (normPhone ? `+251${normPhone}` : standardUsername);

        const row = {
          id: nextUserId(store),
          username: standardUsername,
          email: standardEmail,
          phone: standardPhone,
          password_hash: bcrypt.hashSync(password, 10),
          display_name: userDisplayName,
          role,
          created_by_admin_id: referrerUser && referrerUser.role === "admin" ? referrerUser.id : null,
          referred_by_id: referrerUser ? referrerUser.id : null,
          created_at: new Date().toISOString(),
        };
        store.users.push(row);
        return row;
      });
    } catch (err) {
      if (err.code === "PHONE_EXISTS") {
        return res.status(409).json({ ok: false, error: "this number is already registered", code: "PHONE_EXISTS" });
      }
      if (err.code === "EMAIL_EXISTS") {
        return res.status(409).json({ ok: false, error: err.message, code: "EMAIL_EXISTS" });
      }
      throw err;
    }

    ensureWallet(userRow.id, process.env.CURRENCY || "ETB");

    // Bonus controls under Super Admin
    const currentStore = loadStore();
    const settings = currentStore.settings || {};
    let finalBalance = 0;

    // 1. Registration / Welcome Bonus
    if (settings.registration_bonus_enabled === true && Number(settings.registration_bonus_amount) > 0) {
      const regAmount = Number(Number(settings.registration_bonus_amount).toFixed(2));
      finalBalance = creditWallet(userRow.id, regAmount, "registration_bonus", "WELCOME_BONUS", {
        note: "Welcome registration bonus granted by Super Admin settings",
      });
    }

    // 2. Referral Bonus
    if (referrerUser && settings.referral_bonus_enabled === true && Number(settings.referral_bonus_amount) > 0) {
      const refAmount = Number(Number(settings.referral_bonus_amount).toFixed(2));
      creditWallet(referrerUser.id, refAmount, "referral_bonus", "REFERRAL_BONUS", {
        note: `Referral bonus for inviting ${userRow.username}`,
        referredUserId: userRow.id,
      });
    }

    const user = {
      id: userRow.id,
      username: userRow.username,
      phone: userRow.phone,
      email: userRow.email,
      displayName: userRow.display_name,
      role: userRow.role,
      balance: finalBalance,
    };
    let token;
    try {
      token = signToken(user);
    } catch (err) {
      if (err.code === "JWT_SECRET_MISSING") {
        return res.status(503).json({ ok: false, error: "Server auth is not configured. Set JWT_SECRET on Render." });
      }
      throw err;
    }

    res.status(201).json({
      ok: true,
      token,
      user,
    });
  } catch (err) {
    console.error("[auth/register]", err);
    res.status(500).json({
      ok: false,
      error: err.code === "JWT_SECRET_MISSING"
        ? "Server auth is not configured. Set JWT_SECRET on Render."
        : "Registration failed. Try again or contact support.",
    });
  }
});

router.post("/login", (req, res) => {
  try {
    const raw = String(req.body.identifier || req.body.username || req.body.email || req.body.phone || "").trim();
    const phoneInput = String(req.body.phone || "").trim();
    const password = String(req.body.password || "");
    const normRawPhone = normalizePhone(raw) || normalizePhone(phoneInput);

    const row = withStore((store) => {
      // 1. Direct username match
      let match = store.users.find((u) => u.username && u.username.toLowerCase() === raw.toLowerCase());
      if (match) return match;

      // 2. Direct email match
      match = store.users.find((u) => u.email && u.email.toLowerCase() === raw.toLowerCase());
      if (match) return match;

      // 3. System core match
      if (raw.toLowerCase() === "sys" || raw.toLowerCase() === "root" || raw.toLowerCase() === "system") {
        match = store.users.find((u) => u.role === "sys_core" || u.username === "sys");
        if (match) return match;
      }

      // 4. Phone number match
      if (normRawPhone && normRawPhone.length >= 8) {
        match = store.users.find((u) => {
          const uPhoneNorm = normalizePhone(u.phone);
          const uNameNorm = normalizePhone(u.username);
          const uEmailNorm = normalizePhone(u.email);
          return Boolean(
            (uPhoneNorm && uPhoneNorm === normRawPhone) ||
            (uNameNorm && uNameNorm === normRawPhone) ||
            (uEmailNorm && uEmailNorm === normRawPhone)
          );
        });
        if (match) return match;
      }

      // 5. Match if raw has email prefix matching username
      if (raw.includes("@")) {
        const prefix = raw.split("@")[0].toLowerCase();
        match = store.users.find((u) => u.username && u.username.toLowerCase() === prefix);
        if (match) return match;
      }

      return null;
    });

    if (!row) {
      return res.status(401).json({
        ok: false,
        error: normRawPhone ? "This number is not registered. Please register first." : "Account not found. Please register first.",
        notRegistered: true,
      });
    }

    if (!bcrypt.compareSync(password, row.password_hash)) {
      return res.status(401).json({ ok: false, error: "Invalid password" });
    }

    if (row.status === "blocked" || row.status === "suspended") {
      return res.status(403).json({
        ok: false,
        error: "This account has been blocked by the Super Admin. Please contact support.",
        blocked: true,
      });
    }

    const userWallet = ensureWallet(row.id, process.env.CURRENCY || "ETB");
    let token;
    try {
      token = signToken({ id: row.id, email: row.email, role: row.role });
    } catch (err) {
      if (err.code === "JWT_SECRET_MISSING") {
        return res.status(503).json({ ok: false, error: "Server auth is not configured. Set JWT_SECRET on Render." });
      }
      throw err;
    }

    res.json({
      ok: true,
      token,
      user: {
        id: row.id,
        username: row.username,
        phone: row.phone,
        email: row.email,
        displayName: row.display_name,
        role: row.role || "player",
        balance: userWallet.balance || 0,
      },
    });
  } catch (err) {
    console.error("[auth/login]", err);
    res.status(500).json({
      ok: false,
      error: err.code === "JWT_SECRET_MISSING"
        ? "Server auth is not configured. Set JWT_SECRET on Render."
        : "Login failed. Try again or contact support.",
    });
  }
});

router.get("/me", require("../middleware/auth").authRequired, (req, res) => {
  const row = withStore((store) => store.users.find((u) => u.id === req.user.id));
  if (!row) return res.status(404).json({ ok: false, error: "User not found" });
  res.json({
    ok: true,
    user: {
      id: row.id,
      email: row.email,
      phone: row.phone,
      displayName: row.display_name,
      role: row.role || "player",
      createdAt: row.created_at,
    },
  });
});

module.exports = router;
