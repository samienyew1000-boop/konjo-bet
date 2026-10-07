/**
 * Konjo Bet - Unified Shared Balance Engine & Real-Time Wallet Guard
 * Provides single source of truth for real money wallets across all games.
 */
(function (global) {
  'use strict';

  // 1. Anti-theft Domain Security Guard
  (function verifyDomainLock() {
    const allowed = ['konjobet.com', 'www.konjobet.com', 'konjobetcom.et', 'www.konjobetcom.et', 'konjobet.com.et', 'www.konjobet.com.et', '13.140.146.163', 'localhost', '127.0.0.1'];
    const cur = (window.location.hostname || '').toLowerCase();
    if (cur && !allowed.includes(cur)) {
      document.documentElement.innerHTML = '<div style="background:#070a10;color:#ef4444;height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:20px;font-weight:700;text-align:center;padding:24px;flex-direction:column;"><div>&#128683; UNAUTHORIZED INSTALLATION DETECTED</div><div style="color:#94a3b8;font-size:14px;font-weight:400;margin-top:10px;">This game engine is licensed exclusively for konjobet.com. Execution halted.</div></div>';
      throw new Error('License check failed: Unauthorized host');
    }
  })();

  const STORAGE_KEY_REAL = 'habesha_balance';
  const STORAGE_KEY_DEMO = 'habesha_demo_balance';
  const MODE_KEY = 'habesha_wallet_mode';
  const TOKEN_KEY = 'hope-bet-token';
  const USER_KEY = 'hope-bet-user';
  const ADMIN_CONFIG_KEY = 'habesha_admin_config_v1';
  const DEFAULT_DEMO_BALANCE = 1000.0;
  const DEFAULT_REAL_BALANCE = 0.0;

  function round2(val) {
    const num = parseFloat(val);
    return isNaN(num) ? 0.0 : Math.round(num * 100) / 100;
  }

  function getApiBaseUrl() {
    try {
      const custom = localStorage.getItem('hope_bet_api_url');
      if (custom && custom.startsWith('http')) return custom.replace(/\/$/, '');
    } catch (_) {}
    return '';
  }

  function getAuthToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch (_) {
      return '';
    }
  }

  function getSessionUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  }

  function isLoggedIn() {
    return Boolean(getAuthToken() && getSessionUser());
  }

  function getDetectedGameName() {
    const p = (window.location.pathname || '').toLowerCase();
    if (p.includes('aviator')) return 'Aviator';
    if (p.includes('chicken')) return 'Chicken Road';
    if (p.includes('keno')) return 'Fast Keno';
    if (p.includes('fish')) return 'Fish';
    if (p.includes('infinity')) return 'Infinity';
    if (p.includes('bingo') && p.includes('star')) return 'Bingo Star';
    if (p.includes('bingo')) return 'Bingo';
    return 'Mini Game';
  }

  function getMode() {
    return 'real';
  }

  function setMode(mode) {
    return 'real';
  }

  // --- Real Balance Accessor ---
  function get() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_REAL);
      if (raw !== null && raw !== '' && !isNaN(parseFloat(raw))) {
        return round2(parseFloat(raw));
      }
      const u = getSessionUser();
      if (u && typeof u.balance === 'number') {
        const b = round2(u.balance);
        localStorage.setItem(STORAGE_KEY_REAL, b.toFixed(2));
        return b;
      }
      localStorage.setItem(STORAGE_KEY_REAL, DEFAULT_REAL_BALANCE.toFixed(2));
      return DEFAULT_REAL_BALANCE;
    } catch (e) {
      return DEFAULT_REAL_BALANCE;
    }
  }

  function set(amount, skipApiSync) {
    const safeAmount = Math.max(0, round2(amount));
    const previous = get();

    try {
      localStorage.setItem(STORAGE_KEY_REAL, safeAmount.toFixed(2));
      const u = getSessionUser();
      if (u && typeof u === 'object') {
        u.balance = safeAmount;
        localStorage.setItem(USER_KEY, JSON.stringify(u));
      }
    } catch (e) {
      console.warn('HabeshaWallet set error:', e);
    }

    syncLegacyStorages(safeAmount);
    notifyAll(safeAmount);

    // Sync delta with backend database if logged in and not explicitly skipped
    if (!skipApiSync && isLoggedIn() && Math.abs(safeAmount - previous) >= 0.01) {
      const delta = round2(safeAmount - previous);
      if (delta < 0) {
        apiDebit(Math.abs(delta));
      } else if (delta > 0) {
        apiCredit(delta);
      }
    }

    return safeAmount;
  }

  function showInsufficientBalanceNotice(requiredAmount) {
    let modal = document.getElementById('konjoInsufficientBalanceModal');
    const cur = get();
    const req = Number(requiredAmount) || 0;
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'konjoInsufficientBalanceModal';
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(3, 7, 18, 0.88);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        z-index: 10000001;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      `;
      modal.innerHTML = `
        <div style="background: #111827; border: 1px solid #374151; border-radius: 16px; width: 100%; max-width: 360px; padding: 24px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); box-sizing: border-box; color: #f9fafb; text-align: center;">
          <div style="font-size: 38px; margin-bottom: 8px;">⚠️</div>
          <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 800; color: #ef4444;">Insufficient Balance</h3>
          <p id="kgLowBalDesc" style="margin: 0 0 20px; font-size: 13.5px; color: #9ca3af; line-height: 1.5;"></p>
          <div style="display: flex; gap: 10px;">
            <a href="/frontend/#deposit" target="_top" style="flex: 1; background: #10b981; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px; border-radius: 8px; text-align: center;">
              Deposit ETB
            </a>
            <button type="button" id="kgCloseLowBalBtn" style="background: #374151; color: #d1d5db; border: none; font-weight: 600; font-size: 14px; padding: 12px 18px; border-radius: 8px; cursor: pointer;">
              Cancel
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector('#kgCloseLowBalBtn').addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }
    const desc = modal.querySelector('#kgLowBalDesc');
    if (desc) {
      desc.innerHTML = `You have <strong style="color: #ffffff;">${cur.toFixed(2)} ETB</strong>, but this round requires <strong style="color: #ef4444;">${req.toFixed(2)} ETB</strong>.<br/>Please deposit funds to continue playing.`;
    }
    modal.style.display = 'flex';
  }

  function modify(delta, gameName, method) {
    const num = round2(delta);
    if (num === 0) return get();

    if (!isLoggedIn()) {
      showLoginModal();
      return get();
    }

    const current = get();

    if (num < 0) {
      // Placing a bet / Stake deduction
      const stake = Math.abs(num);
      if (current < stake) {
        showInsufficientBalanceNotice(stake);
        return current;
      }
      const newBal = set(current - stake, true);
      apiDebit(stake, gameName || getDetectedGameName());
      return newBal;
    } else {
      // Winning payout
      const newBal = set(current + num, true);
      apiCredit(num, gameName || getDetectedGameName());
      return newBal;
    }
  }

  function has(amount) {
    if (!isLoggedIn()) {
      showLoginModal();
      return false;
    }
    const needed = round2(amount);
    const available = get();
    if (available < needed) {
      showInsufficientBalanceNotice(needed);
      return false;
    }
    return true;
  }

  // --- Backend API Integration ---
  async function apiDebit(amount, gameName) {
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/wallet/game-debit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: round2(amount),
          game: gameName || getDetectedGameName(),
          reference: `game_bet_${Date.now()}`
        })
      });
      const data = await res.json();
      if (data && data.ok && typeof data.balance === 'number') {
        set(data.balance, true);
      } else if (data && data.code === 'INSUFFICIENT_BALANCE') {
        if (typeof data.balance === 'number') set(data.balance, true);
        alert(data.error || 'Insufficient balance');
      }
    } catch (err) {
      console.warn('Game debit sync error:', err);
    }
  }

  async function apiCredit(amount, gameName) {
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/wallet/game-credit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: round2(amount),
          game: gameName || getDetectedGameName(),
          reference: `game_win_${Date.now()}`
        })
      });
      const data = await res.json();
      if (data && data.ok && typeof data.balance === 'number') {
        set(data.balance, true);
      }
    } catch (err) {
      console.warn('Game credit sync error:', err);
    }
  }

  async function syncBalanceWithServer() {
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/wallet/balance`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data && data.ok && typeof data.balance === 'number') {
        set(data.balance, true);
      }
    } catch (err) {
      console.warn('Balance sync error:', err);
    }
  }

  function notifyAll(safeAmount) {
    try {
      window.dispatchEvent(
        new CustomEvent('habesha_balance_updated', {
          detail: { balance: safeAmount, mode: 'real' }
        })
      );
    } catch (e) {}

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            type: 'HABESHA_BALANCE_UPDATE',
            balance: safeAmount,
            mode: 'real'
          },
          '*'
        );
      }
    } catch (e) {}
  }

  function syncLegacyStorages(val) {
    try {
      // 1. Aviator
      const avRaw = localStorage.getItem('aviator_offline_users');
      if (avRaw) {
        try {
          const avUsers = JSON.parse(avRaw);
          if (Array.isArray(avUsers) && avUsers.length > 0) {
            avUsers.forEach((u) => { u.balance = val; });
            localStorage.setItem('aviator_offline_users', JSON.stringify(avUsers));
          }
        } catch (_) {}
      } else {
        const defaultAvUser = [{
          id: 'player-1',
          username: 'player',
          displayName: 'Player',
          role: 'player',
          balance: val,
          password: '',
          createdAt: new Date().toISOString()
        }];
        localStorage.setItem('aviator_offline_users', JSON.stringify(defaultAvUser));
      }

      // 2. Fast Keno
      const kenoRaw = localStorage.getItem('fast_keno_v1');
      if (kenoRaw) {
        try {
          const kenoData = JSON.parse(kenoRaw);
          kenoData.balance = val;
          localStorage.setItem('fast_keno_v1', JSON.stringify(kenoData));
        } catch (_) {}
      }

      // 3. Fish
      localStorage.setItem('fish-balance', String(val));

      // 4. Infinity
      const infRaw = localStorage.getItem('infinity_demo_v1');
      if (infRaw) {
        try {
          const infData = JSON.parse(infRaw);
          infData.balance = val;
          localStorage.setItem('infinity_demo_v1', JSON.stringify(infData));
        } catch (_) {}
      }

      // 5. Bingo Star
      localStorage.setItem('bingo-star-balance', String(val));

      // 6. Lucky Bingo
      localStorage.setItem('lucky-bingo-balance', String(val));
    } catch (e) {
      console.warn('Error syncing legacy keys:', e);
    }
  }

  function subscribe(callback) {
    if (typeof callback !== 'function') return;

    window.addEventListener('storage', function (e) {
      if (e.key === STORAGE_KEY_REAL && e.newValue !== null) {
        callback(round2(e.newValue));
      }
    });

    window.addEventListener('habesha_balance_updated', function (e) {
      if (e.detail && typeof e.detail.balance === 'number') {
        callback(e.detail.balance);
      }
    });

    window.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'HABESHA_BALANCE_UPDATE') {
        callback(round2(e.data.balance));
      }
    });
  }

  function format(amount) {
    const val = amount !== undefined ? amount : get();
    return Number(val).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // --- In-Game Authentication Modal (Sign In & Register) ---
  let loginModalEl = null;

  function createLoginModal() {
    if (loginModalEl) return loginModalEl;

    const overlay = document.createElement('div');
    overlay.id = 'konjoGameAuthModal';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(3, 7, 18, 0.90);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      z-index: 10000000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    overlay.innerHTML = `
      <div style="background: #111827; border: 1px solid #374151; border-radius: 18px; width: 100%; max-width: 400px; padding: 26px 22px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); box-sizing: border-box; color: #f9fafb; position: relative;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 18px;">
          <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 6px;">
            <span style="font-size: 26px; font-weight: 900; letter-spacing: -0.5px; color: #ef4444;">KONJO</span>
            <span style="font-size: 26px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff;">BET</span>
          </div>
          <h2 id="kgModalTitle" style="margin: 0; font-size: 18px; font-weight: 800; color: #f3f4f6;">Sign In to Play</h2>
          <p id="kgModalSubtitle" style="margin: 4px 0 0; font-size: 13px; color: #9ca3af;">Please log in with your account to play with real ETB balance</p>
        </div>

        <!-- Auth Mode Tabs -->
        <div style="display: flex; background: #1f2937; border-radius: 10px; padding: 4px; margin-bottom: 16px;">
          <button type="button" id="kgTabLogin" style="flex: 1; background: #ef4444; color: #ffffff; border: none; border-radius: 7px; padding: 9px; font-size: 13.5px; font-weight: 700; cursor: pointer; transition: all 0.2s;">
            Log In (ግባ)
          </button>
          <button type="button" id="kgTabRegister" style="flex: 1; background: transparent; color: #9ca3af; border: none; border-radius: 7px; padding: 9px; font-size: 13.5px; font-weight: 700; cursor: pointer; transition: all 0.2s;">
            Register (ተመዝገብ)
          </button>
        </div>

        <!-- Feedback Messages -->
        <div id="kgAuthError" style="display: none; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #fca5a5; font-size: 12.5px; padding: 10px 12px; border-radius: 8px; margin-bottom: 14px; line-height: 1.4;"></div>
        <div id="kgAuthSuccess" style="display: none; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #6ee7b7; font-size: 12.5px; padding: 10px 12px; border-radius: 8px; margin-bottom: 14px; line-height: 1.4;"></div>

        <!-- Form -->
        <form id="kgAuthForm" style="display: flex; flex-direction: column; gap: 13px; margin: 0;">
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: #d1d5db; margin-bottom: 5px;">Phone Number (ስልክ ቁጥር)</label>
            <div style="display: flex; background: #1f2937; border: 1px solid #4b5563; border-radius: 8px; overflow: hidden; align-items: center;">
              <span style="padding: 10px 10px 10px 12px; color: #9ca3af; font-size: 13px; font-weight: 600; border-right: 1px solid #374151; background: #182234;">+251</span>
              <input type="text" id="kgAuthPhone" placeholder="969060459" required autocomplete="username" style="flex: 1; background: transparent; border: none; padding: 10px 12px; color: #ffffff; font-size: 14px; outline: none; width: 100%; box-sizing: border-box;" />
            </div>
          </div>

          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: #d1d5db; margin-bottom: 5px;">Password (የይለፍ ቃል)</label>
            <input type="password" id="kgAuthPass" placeholder="••••••••" required autocomplete="current-password" style="background: #1f2937; border: 1px solid #4b5563; border-radius: 8px; padding: 10px 12px; color: #ffffff; font-size: 14px; outline: none; width: 100%; box-sizing: border-box;" />
          </div>

          <div id="kgAuthPassConfirmWrap" style="display: none;">
            <label style="display: block; font-size: 12px; font-weight: 600; color: #d1d5db; margin-bottom: 5px;">Confirm Password (ድጋሚ ያረጋግጡ)</label>
            <input type="password" id="kgAuthPassConfirm" placeholder="••••••••" autocomplete="new-password" style="background: #1f2937; border: 1px solid #4b5563; border-radius: 8px; padding: 10px 12px; color: #ffffff; font-size: 14px; outline: none; width: 100%; box-sizing: border-box;" />
          </div>

          <button type="submit" id="kgAuthSubmitBtn" style="background: #ef4444; color: #ffffff; border: none; border-radius: 8px; padding: 12px; font-size: 14.5px; font-weight: 800; cursor: pointer; transition: background 0.2s; margin-top: 4px;">
            LOG IN
          </button>
        </form>

        <div style="margin-top: 16px; text-align: center; font-size: 13px; color: #9ca3af; display: flex; flex-direction: column; gap: 8px;">
          <div>
            <a href="/frontend/" style="color: #6b7280; font-size: 12px; text-decoration: none;">← Back to Sportsbook Lobby</a>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    loginModalEl = overlay;

    let authMode = 'login';
    const form = overlay.querySelector('#kgAuthForm');
    const errEl = overlay.querySelector('#kgAuthError');
    const successEl = overlay.querySelector('#kgAuthSuccess');
    const phoneInput = overlay.querySelector('#kgAuthPhone');
    const passInput = overlay.querySelector('#kgAuthPass');
    const passConfirmWrap = overlay.querySelector('#kgAuthPassConfirmWrap');
    const passConfirmInput = overlay.querySelector('#kgAuthPassConfirm');
    const submitBtn = overlay.querySelector('#kgAuthSubmitBtn');
    const tabLogin = overlay.querySelector('#kgTabLogin');
    const tabRegister = overlay.querySelector('#kgTabRegister');
    const modalTitle = overlay.querySelector('#kgModalTitle');
    const modalSubtitle = overlay.querySelector('#kgModalSubtitle');

    function setAuthMode(mode) {
      authMode = mode;
      errEl.style.display = 'none';
      successEl.style.display = 'none';
      if (mode === 'register') {
        tabRegister.style.background = '#ef4444';
        tabRegister.style.color = '#ffffff';
        tabLogin.style.background = 'transparent';
        tabLogin.style.color = '#9ca3af';
        passConfirmWrap.style.display = 'block';
        passConfirmInput.required = true;
        submitBtn.textContent = 'REGISTER & PLAY NOW';
        modalTitle.textContent = 'Create Free Account';
        modalSubtitle.textContent = 'Register instantly to play with real money';
      } else {
        tabLogin.style.background = '#ef4444';
        tabLogin.style.color = '#ffffff';
        tabRegister.style.background = 'transparent';
        tabRegister.style.color = '#9ca3af';
        passConfirmWrap.style.display = 'none';
        passConfirmInput.required = false;
        submitBtn.textContent = 'LOG IN';
        modalTitle.textContent = 'Sign In to Play';
        modalSubtitle.textContent = 'Please log in with your account to play with real ETB balance';
      }
    }

    tabLogin.addEventListener('click', () => setAuthMode('login'));
    tabRegister.addEventListener('click', () => setAuthMode('register'));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.style.display = 'none';
      successEl.style.display = 'none';

      const phoneRaw = (phoneInput.value || '').trim();
      const password = (passInput.value || '').trim();
      const passConfirm = (passConfirmInput.value || '').trim();

      if (!phoneRaw || !password) {
        errEl.textContent = 'Please enter your phone number and password.';
        errEl.style.display = 'block';
        return;
      }

      if (password.length < 6) {
        errEl.textContent = 'Password must be at least 6 characters.';
        errEl.style.display = 'block';
        return;
      }

      if (authMode === 'register') {
        if (password !== passConfirm) {
          errEl.textContent = 'Passwords do not match.';
          errEl.style.display = 'block';
          return;
        }
      }

      submitBtn.disabled = true;
      submitBtn.textContent = authMode === 'register' ? 'Creating account...' : 'Logging in...';

      try {
        const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
        const payload = authMode === 'register'
          ? { identifier: phoneRaw, phone: phoneRaw, password: password, role: 'player' }
          : { identifier: phoneRaw, phone: phoneRaw, password: password };

        const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data && data.ok && data.token && data.user) {
          localStorage.setItem(TOKEN_KEY, data.token);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));

          if (typeof data.user.balance === 'number') {
            set(data.user.balance, true);
          }

          successEl.textContent = authMode === 'register'
            ? '✓ Account created successfully! Launching game...'
            : '✓ Logged in! Loading balance...';
          successEl.style.display = 'block';

          // Sync balance from server
          await syncBalanceWithServer();

          setTimeout(() => {
            hideLoginModal();
          }, 400);
        } else {
          errEl.textContent = data.error || (authMode === 'register' ? 'Registration failed.' : 'Invalid credentials.');
          errEl.style.display = 'block';
        }
      } catch (err) {
        errEl.textContent = 'Cannot connect to server. Please check your internet connection.';
        errEl.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = authMode === 'register' ? 'REGISTER & PLAY NOW' : 'LOG IN';
      }
    });

    return overlay;
  }

  function showLoginModal() {
    const modal = createLoginModal();
    if (modal) {
      modal.style.display = 'flex';
      const phoneInput = modal.querySelector('#kgAuthPhone');
      if (phoneInput) setTimeout(() => phoneInput.focus(), 100);
    }
  }

  function hideLoginModal() {
    if (loginModalEl) {
      loginModalEl.style.display = 'none';
    }
  }

  function checkLoginRequirement() {
    if (!isLoggedIn()) {
      showLoginModal();
    } else {
      syncBalanceWithServer();
    }
  }

  // Intercept bet buttons or actions if user clicks while not logged in
  function setupInteractionGuard() {
    document.addEventListener('click', (e) => {
      if (!isLoggedIn()) {
        const target = e.target.closest('button, .action-btn, #actionBtn1, #actionBtn2, .cr-btn, #btn-bet, #btn-place-bet');
        if (target && !target.closest('#konjoGameAuthModal')) {
          e.preventDefault();
          e.stopPropagation();
          showLoginModal();
        }
      }
    }, true);
  }

  function getAdminConfig() {
    try {
      const raw = localStorage.getItem(ADMIN_CONFIG_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return {
      globalMargin: 15,
      profitControlEnabled: true,
      maxWinPayoutCap: 50000,
      games: {
        aviator: { enabled: true, targetMargin: 15, instantCrashRate: 6, maxMultiplier: 100 },
        chicken: { enabled: true, targetMargin: 15, dangerLevel: 'medium' },
        keno: { enabled: true, targetMargin: 12 },
        fish: { enabled: true, targetMargin: 15 },
        infinity: { enabled: true, targetMargin: 15 },
        bingo: { enabled: true, targetMargin: 15 }
      }
    };
  }

  function updateAdminConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    try {
      localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify(cfg));
    } catch (_) {}
  }

  async function syncAdminConfigWithServer() {
    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/wallet/game-config`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.ok && data.config) {
        updateAdminConfig(data.config);
      }
    } catch (_) {}
  }

  // Public Interface
  const HabeshaWallet = {
    KEY: STORAGE_KEY_REAL,
    STORAGE_KEY_REAL: STORAGE_KEY_REAL,
    STORAGE_KEY_DEMO: STORAGE_KEY_DEMO,
    ADMIN_CONFIG_KEY: ADMIN_CONFIG_KEY,
    get: get,
    set: set,
    getMode: getMode,
    setMode: setMode,
    modify: modify,
    has: has,
    format: format,
    subscribe: subscribe,
    isLoggedIn: isLoggedIn,
    showLoginModal: showLoginModal,
    hideLoginModal: hideLoginModal,
    showInsufficientBalanceNotice: showInsufficientBalanceNotice,
    syncBalanceWithServer: syncBalanceWithServer,
    syncLegacyStorages: syncLegacyStorages,
    getAdminConfig: getAdminConfig,
    updateAdminConfig: updateAdminConfig,
    syncAdminConfigWithServer: syncAdminConfigWithServer
  };

  global.HabeshaWallet = HabeshaWallet;
  global.FriendesWallet = HabeshaWallet;

  // Background Balance Synchronization (Every 10 seconds + on tab focus)
  setInterval(() => {
    if (isLoggedIn()) {
      syncBalanceWithServer();
    }
  }, 10000);

  window.addEventListener('focus', () => {
    if (isLoggedIn()) {
      syncBalanceWithServer();
    }
  });

  // Run on start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      checkLoginRequirement();
      setupInteractionGuard();
      syncAdminConfigWithServer();
    });
  } else {
    checkLoginRequirement();
    setupInteractionGuard();
    syncAdminConfigWithServer();
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
