/* =============================================
   ZAKAT CALCULATOR — APPLICATION LOGIC
   Morocco-focused business zakat portal
   All data stored in localStorage
   ============================================= */

// ---- Constants ----

var CURRENCY = 'MAD';

var NISAB_PRESETS = {
  silver: 6500,   // 612.36g silver — approximate 2025 value in MAD
  gold:   67500   // 87.48g gold — approximate 2025 value in MAD
};

var EMPTY_ROWS = [
  { desc: '', amount: '' }
];

var DATA_DEFAULTS = {
  hawlDate: '',
  nisabBasis: 'silver',
  nisabVal: NISAB_PRESETS.silver.toString(),
  madhab: 'general',
  bizName: '',
  cashRows:   [ { desc: '', amount: '' } ],
  recvRows:   [ { desc: '', amount: '' } ],
  invRows:    [ { desc: '', amount: '' } ],
  otherRows:  [ { desc: '', amount: '' } ],
  liabRows:   [ { desc: '', amount: '' } ]
};

// ---- State ----

var nisabBasis = 'silver';
var currentUser = null;
var currentBiz = null;
var saveTimeout = null;
var openMenuId = null;

// =============================================
// LOCAL STORAGE HELPERS
// =============================================

function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); }
  catch (e) { return null; }
}

function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); }
  catch (e) { showToast('Storage full — could not save'); }
}

// Simple non-cryptographic hash for password storage
// NOT secure — this is a local-only tool, not a real auth system
function simpleHash(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h = h & h;
  }
  return 'h_' + Math.abs(h).toString(36);
}

// =============================================
// FORMATTING
// =============================================

function fmt(n) {
  try {
    return new Intl.NumberFormat('ar-MA', {
      style: 'currency',
      currency: CURRENCY,
      maximumFractionDigits: 2
    }).format(n);
  } catch (e) {
    return CURRENCY + ' ' + n.toFixed(2);
  }
}

function escapeHtml(str) {
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '\u2014';
  try {
    return new Date(iso).toLocaleDateString('en-MA', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  } catch (e) { return '\u2014'; }
}

// =============================================
// UI FEEDBACK
// =============================================

function showToast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(function () { el.classList.remove('show'); }, 2500);
}

function showSaveIndicator() {
  var el = document.getElementById('save-indicator');
  el.classList.add('show');
  setTimeout(function () { el.classList.remove('show'); }, 1500);
}

// =============================================
// AUTH SYSTEM
// =============================================

function showAuthTab(tab) {
  var tabs = document.querySelectorAll('.auth-tab');
  tabs[0].classList.toggle('active', tab === 'login');
  tabs[1].classList.toggle('active', tab === 'register');
  document.getElementById('auth-login').classList.toggle('active', tab === 'login');
  document.getElementById('auth-register').classList.toggle('active', tab === 'register');
  hideAuthErrors();
}

function hideAuthErrors() {
  document.getElementById('login-error').classList.remove('show');
  document.getElementById('reg-error').classList.remove('show');
}

function showAuthError(id, msg) {
  var el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add('show');
}

function handleRegister() {
  hideAuthErrors();
  var name    = document.getElementById('reg-name').value.trim();
  var email   = document.getElementById('reg-email').value.trim().toLowerCase();
  var pass    = document.getElementById('reg-password').value;
  var confirm = document.getElementById('reg-confirm').value;

  if (!name)    return showAuthError('reg-error', 'Please enter your name.');
  if (!email || email.indexOf('@') === -1)
    return showAuthError('reg-error', 'Please enter a valid email.');
  if (pass.length < 6)
    return showAuthError('reg-error', 'Password must be at least 6 characters.');
  if (pass !== confirm)
    return showAuthError('reg-error', 'Passwords do not match.');

  var users = lsGet('zakat_users') || {};
  if (users[email]) return showAuthError('reg-error', 'An account with this email already exists.');

  users[email] = {
    name: name,
    email: email,
    passwordHash: simpleHash(pass),
    businesses: [],
    createdAt: new Date().toISOString()
  };
  lsSet('zakat_users', users);
  lsSet('zakat_session', { email: email });

  currentUser = email;
  document.getElementById('dash-name').textContent = name;
  goTo('dashboard');
  showToast('Account created');
}

function handleLogin() {
  hideAuthErrors();
  var email = document.getElementById('login-email').value.trim().toLowerCase();
  var pass  = document.getElementById('login-password').value;

  if (!email) return showAuthError('login-error', 'Please enter your email.');
  if (!pass)  return showAuthError('login-error', 'Please enter your password.');

  var users = lsGet('zakat_users') || {};
  var user  = users[email];

  if (!user) return showAuthError('login-error', 'No account found with this email.');
  if (user.passwordHash !== simpleHash(pass))
    return showAuthError('login-error', 'Incorrect password.');

  lsSet('zakat_session', { email: email });
  currentUser = email;
  currentBiz = null;
  document.getElementById('dash-name').textContent = user.name;
  goTo('dashboard');
}

function handleLogout() {
  localStorage.removeItem('zakat_session');
  currentUser = null;
  currentBiz = null;
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  showAuthTab('login');
  goTo('auth');
}

// =============================================
// DASHBOARD & BUSINESS MANAGEMENT
// =============================================

function getBusinesses() {
  if (!currentUser) return [];
  var users = lsGet('zakat_users') || {};
  return (users[currentUser] && users[currentUser].businesses) || [];
}

function saveBusinesses(businesses) {
  var users = lsGet('zakat_users') || {};
  if (users[currentUser]) {
    users[currentUser].businesses = businesses;
    lsSet('zakat_users', users);
  }
}

function renderDashboard() {
  var businesses = getBusinesses();
  var grid  = document.getElementById('biz-grid');
  var empty = document.getElementById('empty-state');

  if (businesses.length === 0) {
    grid.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  grid.style.display = 'grid';
  empty.style.display = 'none';

  grid.innerHTML = businesses.map(function (biz) {
    var status = getBizStatus(biz);
    var net = getBizNetAssets(biz);
    var dotClass = status === 'due' ? 'due' : 'pending';
    var dotHtml = status !== 'empty'
      ? '<span class="biz-status-dot ' + dotClass + '"></span>'
      : '';
    return '<div class="biz-card" data-biz-id="' + biz.id + '" onclick="openBusiness(\'' + biz.id + '\')">' +
      '<div class="biz-card-header">' +
        '<div class="biz-card-name">' + dotHtml + escapeHtml(biz.name) + '</div>' +
        '<button class="biz-menu-btn" onclick="event.stopPropagation();toggleBizMenu(\'' + biz.id + '\')" aria-label="Options">&#8943;</button>' +
        '<div class="biz-card-actions" id="menu-' + biz.id + '">' +
          '<button class="biz-action-item" onclick="event.stopPropagation();exportBusiness(\'' + biz.id + '\')">Export data</button>' +
          '<button class="biz-action-item danger" onclick="event.stopPropagation();deleteBusiness(\'' + biz.id + '\')">Delete business</button>' +
        '</div>' +
      '</div>' +
      '<div class="biz-card-date">Modified ' + formatDate(biz.lastModified) + '</div>' +
      '<div class="biz-card-stats">' +
        '<div>' +
          '<span class="biz-stat-label">Net assets</span>' +
          '<span class="biz-stat-val">' + fmt(net) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function getBizStatus(biz) {
  var net = getBizNetAssets(biz);
  var nisab = parseFloat(biz.data.nisabVal) || 0;
  var hasData = biz.data.cashRows.some(function (r) { return parseFloat(r.amount) > 0; }) ||
                biz.data.recvRows.some(function (r) { return parseFloat(r.amount) > 0; }) ||
                biz.data.invRows.some(function (r)  { return parseFloat(r.amount) > 0; }) ||
                biz.data.otherRows.some(function (r) { return parseFloat(r.amount) > 0; });
  if (!hasData) return 'empty';
  if (nisab > 0 && net >= nisab) return 'due';
  return 'pending';
}

function getBizNetAssets(biz) {
  var sum = function (arr) {
    return arr.reduce(function (a, r) { return a + (parseFloat(r.amount) || 0); }, 0);
  };
  var assets = sum(biz.data.cashRows) + sum(biz.data.recvRows) +
               sum(biz.data.invRows) + sum(biz.data.otherRows);
  var liab = sum(biz.data.liabRows);
  return Math.max(0, assets - liab);
}

function toggleBizMenu(id) {
  document.querySelectorAll('.biz-card-actions.open').forEach(function (m) {
    m.classList.remove('open');
  });
  if (openMenuId === id) {
    openMenuId = null;
  } else {
    document.getElementById('menu-' + id).classList.add('open');
    openMenuId = id;
  }
}

// Close menus when clicking outside
document.addEventListener('click', function () {
  document.querySelectorAll('.biz-card-actions.open').forEach(function (m) {
    m.classList.remove('open');
  });
  openMenuId = null;
});

function showNewBizForm() {
  document.getElementById('new-biz-card').style.display = 'block';
  document.getElementById('new-biz-name').value = '';
  document.getElementById('new-biz-name').focus();
}

function cancelNewBusiness() {
  document.getElementById('new-biz-card').style.display = 'none';
}

function confirmNewBusiness() {
  var input = document.getElementById('new-biz-name');
  var name  = input.value.trim();
  if (!name) {
    input.classList.add('error-border');
    input.focus();
    setTimeout(function () { input.classList.remove('error-border'); }, 2000);
    return;
  }

  var biz = {
    id: 'biz_' + Date.now(),
    name: name,
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    data: assign({}, DATA_DEFAULTS, {
      hawlDate: new Date().toISOString().slice(0, 10),
      bizName: name
    })
  };

  var businesses = getBusinesses();
  businesses.push(biz);
  saveBusinesses(businesses);

  cancelNewBusiness();
  currentBiz = biz;
  loadBusinessData(biz.data);
  goTo(0);
  showToast('Business created');
}

function openBusiness(id) {
  var businesses = getBusinesses();
  var biz = businesses.find(function (b) { return b.id === id; });
  if (!biz) return;
  currentBiz = biz;
  loadBusinessData(biz.data);
  goTo(0);
}

function deleteBusiness(id) {
  var businesses = getBusinesses();
  var idx = businesses.findIndex(function (b) { return b.id === id; });
  if (idx === -1) return;

  var card = document.querySelector('[data-biz-id="' + id + '"]');
  var btn  = card ? card.querySelector('.biz-action-item.danger') : null;

  if (card && card.dataset.confirming === 'true') {
    businesses.splice(idx, 1);
    saveBusinesses(businesses);
    if (currentBiz && currentBiz.id === id) currentBiz = null;
    renderDashboard();
    showToast('Business deleted');
  } else {
    if (card) card.dataset.confirming = 'true';
    if (btn) btn.textContent = 'Click again to confirm';
    setTimeout(function () {
      if (card) card.dataset.confirming = 'false';
      if (btn) btn.textContent = 'Delete business';
    }, 3000);
  }
}

function exportBusiness(id) {
  var businesses = getBusinesses();
  var biz = businesses.find(function (b) { return b.id === id; });
  if (!biz) return;

  var blob = new Blob([JSON.stringify(biz, null, 2)], { type: 'application/json' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = (biz.name || 'business').replace(/\s+/g, '_') + '_zakat.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Data exported');
}

function importBusiness() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var biz = JSON.parse(ev.target.result);
        if (!biz.name || !biz.data) throw new Error('Invalid format');
        // Ensure all required fields exist (migration for older exports)
        biz.data = assign({}, DATA_DEFAULTS, biz.data);
        biz.id = 'biz_' + Date.now();
        biz.lastModified = new Date().toISOString();
        var businesses = getBusinesses();
        businesses.push(biz);
        saveBusinesses(businesses);
        renderDashboard();
        showToast('Business imported');
      } catch (err) {
        showToast('Invalid file format');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// Simple Object.assign polyfill-style helper
function assign(target) {
  for (var i = 1; i < arguments.length; i++) {
    var src = arguments[i];
    if (src) {
      for (var key in src) {
        if (src.hasOwnProperty(key)) {
          target[key] = src[key];
        }
      }
    }
  }
  return target;
}

// =============================================
// DATA PERSISTENCE (Save / Load)
// =============================================

function getRowsData(containerId) {
  return Array.from(document.querySelectorAll('#' + containerId + ' .asset-row')).map(function (row) {
    var inputs = row.querySelectorAll('input');
    return { desc: inputs[0].value, amount: inputs[1].value };
  });
}

function serializeBusiness() {
  return {
    hawlDate:   document.getElementById('hawl-date').value,
    nisabBasis: nisabBasis,
    nisabVal:   document.getElementById('nisab-val').value,
    madhab:     document.getElementById('madhab').value,
    bizName:    document.getElementById('biz-name').value,
    cashRows:   getRowsData('cash-rows'),
    recvRows:   getRowsData('recv-rows'),
    invRows:    getRowsData('inv-rows'),
    otherRows:  getRowsData('other-rows'),
    liabRows:   getRowsData('liab-rows')
  };
}

function saveCurrentBusiness() {
  if (!currentUser || !currentBiz) return;
  var data = serializeBusiness();
  var businesses = getBusinesses();
  var idx = businesses.findIndex(function (b) { return b.id === currentBiz.id; });
  if (idx !== -1) {
    businesses[idx].data = data;
    businesses[idx].name = data.bizName || businesses[idx].name;
    businesses[idx].lastModified = new Date().toISOString();
    saveBusinesses(businesses);
    currentBiz = businesses[idx];
  }
}

function scheduleSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(function () {
    saveCurrentBusiness();
    showSaveIndicator();
  }, 800);
}

function rebuildRows(containerId, cls, rowsData) {
  var container = document.getElementById(containerId);
  container.innerHTML = '';
  var count = (rowsData && rowsData.length) ? rowsData.length : 1;
  for (var i = 0; i < count; i++) {
    addAssetRow(containerId, cls);
    if (rowsData && rowsData[i]) {
      var lastRow = container.lastElementChild;
      var inputs = lastRow.querySelectorAll('input');
      inputs[0].value = rowsData[i].desc || '';
      inputs[1].value = rowsData[i].amount || '';
    }
  }
}

function loadBusinessData(data) {
  // Migrate: fill in any missing fields with defaults
  data = assign({}, DATA_DEFAULTS, data);

  document.getElementById('hawl-date').value   = data.hawlDate || new Date().toISOString().slice(0, 10);
  document.getElementById('nisab-val').value   = data.nisabVal || '';
  document.getElementById('madhab').value      = data.madhab || 'general';
  document.getElementById('biz-name').value    = data.bizName || '';

  // Set nisab basis pills
  nisabBasis = data.nisabBasis || 'silver';
  var pills = document.querySelectorAll('#nisab-toggle .pill');
  pills[0].classList.toggle('active', nisabBasis === 'silver');
  pills[1].classList.toggle('active', nisabBasis === 'gold');

  // Rebuild all asset/liability rows
  rebuildRows('cash-rows',  'cash-amt',  data.cashRows);
  rebuildRows('recv-rows',  'recv-amt',  data.recvRows);
  rebuildRows('inv-rows',   'inv-amt',   data.invRows);
  rebuildRows('other-rows', 'other-amt', data.otherRows);
  rebuildRows('liab-rows',  'liab-amt',  data.liabRows);

  updateTotals();
}

// =============================================
// CALCULATOR LOGIC
// =============================================

function sumClass(cls) {
  return Array.from(document.querySelectorAll('.' + cls))
    .reduce(function (acc, el) {
      return acc + (Math.max(0, parseFloat(el.value)) || 0);
    }, 0);
}

function setNisab(val, btn) {
  nisabBasis = val;
  document.querySelectorAll('#nisab-toggle .pill').forEach(function (b) {
    b.classList.remove('active');
  });
  btn.classList.add('active');
  document.getElementById('nisab-val').value = NISAB_PRESETS[val] || '';
  scheduleSave();
}

function updateTotals() {
  var cash  = sumClass('cash-amt');
  var recv  = sumClass('recv-amt');
  var inv   = sumClass('inv-amt');
  var other = sumClass('other-amt');
  var liab  = sumClass('liab-amt');
  var total = cash + recv + inv + other;
  var net   = Math.max(0, total - liab);

  var setT = function (id, v) {
    var el = document.getElementById(id);
    if (el) el.textContent = fmt(v);
  };

  setT('total-cash', cash);
  setT('total-recv', recv);
  setT('total-inv',  inv);
  setT('total-other', other);
  setT('total-assets-display', total);
  setT('total-liab', liab);

  var netEl = document.getElementById('net-display');
  if (netEl) {
    netEl.textContent = fmt(net);
    netEl.style.color = net > 0 ? 'var(--ink)' : 'var(--text-muted)';
  }
}

function addAssetRow(containerId, cls) {
  var c   = document.getElementById(containerId);
  var div = document.createElement('div');
  div.className = 'asset-row';
  div.innerHTML =
    '<input type="text" placeholder="Description" oninput="scheduleSave()" />' +
    '<input type="number" placeholder="0.00" min="0" step="0.01" class="' + cls + '" oninput="updateTotals();scheduleSave()" />' +
    '<button class="remove-btn" onclick="removeRow(this)" aria-label="Remove row">&times;</button>';
  c.appendChild(div);
}

function removeRow(btn) {
  var row       = btn.parentElement;
  var container = row.parentElement;
  if (container.children.length > 1) {
    row.remove();
    updateTotals();
    scheduleSave();
  } else {
    var inputs = row.querySelectorAll('input');
    inputs[0].value = '';
    inputs[1].value = '';
    updateTotals();
    scheduleSave();
  }
}

function calculate() {
  var cash        = sumClass('cash-amt');
  var recv        = sumClass('recv-amt');
  var inv         = sumClass('inv-amt');
  var other       = sumClass('other-amt');
  var liab        = sumClass('liab-amt');
  var totalAssets = cash + recv + inv + other;
  var net         = Math.max(0, totalAssets - liab);
  var nisab       = parseFloat(document.getElementById('nisab-val').value) || 0;
  var zakatDue    = (net >= nisab && nisab > 0) ? net * 0.025 : 0;

  var biz  = document.getElementById('biz-name').value || 'Your Business';
  var hawl = document.getElementById('hawl-date').value || new Date().toISOString().slice(0, 10);
  var yr   = new Date(hawl).getFullYear();

  // Save before showing result
  saveCurrentBusiness();

  document.getElementById('res-year').textContent    = biz + ' \u2014 ' + yr;
  document.getElementById('res-assets').textContent   = fmt(totalAssets);
  document.getElementById('res-liab').textContent     = fmt(liab);
  document.getElementById('res-net').textContent      = fmt(net);
  document.getElementById('res-nisab-basis').textContent = nisabBasis;
  document.getElementById('result-amount').textContent   = fmt(zakatDue);

  var badge = document.getElementById('status-badge');
  var sub   = document.getElementById('result-sub');

  if (nisab === 0) {
    badge.className   = 'status-badge status-none';
    badge.textContent = 'Set nisab to calculate';
    sub.textContent   = 'Return to settings and enter nisab value';
    document.getElementById('result-amount').textContent = fmt(0);
  } else if (net < nisab) {
    badge.className   = 'status-badge status-none';
    badge.textContent = 'Below nisab \u2014 no zakat due';
    sub.textContent   = 'Net wealth (' + fmt(net) + ') is below nisab (' + fmt(nisab) + ')';
    document.getElementById('result-amount').textContent = fmt(0);
  } else {
    badge.className   = 'status-badge status-due';
    badge.textContent = 'Zakat is obligatory';
    sub.textContent   = fmt(net) + ' \u00D7 2.5% \u2014 hawl completed';
  }

  // Build breakdown table
  var rows = [
    ['Cash & bank balances',        fmt(cash),        false],
    ['Trade receivables',           fmt(recv),        false],
    ['Inventory (market value)',     fmt(inv),         false],
    ['Other liquid assets',         fmt(other),       false],
    ['\u2500', '', false],
    ['Total zakatable assets',      fmt(totalAssets), true],
    ['Less: liabilities',           '\u2212' + fmt(liab), false],
    ['Net zakatable wealth',        fmt(net),         true],
    ['Nisab threshold (' + nisabBasis + ')', fmt(nisab), false]
  ];

  if (net >= nisab && nisab > 0) {
    rows.push(['Zakat due (2.5%)', fmt(zakatDue), 'zakat']);
  }

  document.getElementById('breakdown-table').innerHTML = rows.map(function (r) {
    if (r[0] === '\u2500') {
      return '<tr><td colspan="2" style="padding:4px 0;border-bottom:none">' +
        '<hr style="border:none;border-top:1px solid var(--parchment-dark)"/></td></tr>';
    }
    var cls = r[2] === 'zakat' ? 'zakat-row' : r[2] ? 'total-row' : 'subtotal';
    return '<tr class="' + cls + '"><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>';
  }).join('');

  goTo(3);
}

// =============================================
// NAVIGATION
// =============================================

function goTo(screen) {
  document.querySelectorAll('.screen').forEach(function (s) {
    s.classList.remove('active');
  });

  if (screen === 'auth') {
    document.getElementById('screen-auth').classList.add('active');
    document.body.className = 'on-auth';

  } else if (screen === 'dashboard') {
    document.getElementById('screen-dashboard').classList.add('active');
    document.body.className = 'on-dashboard';
    renderDashboard();

  } else {
    document.getElementById('screen-' + screen).classList.add('active');
    document.body.className = 'on-calc';
    document.querySelectorAll('.step').forEach(function (s, i) {
      s.classList.toggle('active', i === screen);
      s.classList.toggle('done', i < screen);
    });
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =============================================
// INIT
// =============================================

(function init() {
  // Check for existing session
  var session = lsGet('zakat_session');
  if (session && session.email) {
    var users = lsGet('zakat_users') || {};
    var user  = users[session.email];
    if (user) {
      currentUser = session.email;
      document.getElementById('dash-name').textContent = user.name;
      goTo('dashboard');
      return;
    }
  }
  // No valid session — show auth
  goTo('auth');
})();
