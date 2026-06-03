/* =============================================
   ZAKAT CALCULATOR — APPLICATION LOGIC
   Morocco-focused, trilingual (FR/AR/EN)
   ============================================= */

var CURRENCY = 'MAD';

var NISAB_PRESETS = {
  silver: 6500,
  gold:   67500
};

var EMPTY_ROWS = [{ desc: '', amount: '' }];

var DATA_DEFAULTS = {
  hawlDate: '',
  nisabBasis: 'silver',
  nisabVal: NISAB_PRESETS.silver.toString(),
  madhab: 'general',
  bizName: '',
  cashRows:  [{ desc: '', amount: '' }],
  recvRows:  [{ desc: '', amount: '' }],
  invRows:   [{ desc: '', amount: '' }],
  otherRows: [{ desc: '', amount: '' }],
  liabRows:  [{ desc: '', amount: '' }]
};

var nisabBasis  = 'silver';
var currentUser = null;
var currentBiz  = null;
var saveTimeout = null;
var openMenuId  = null;

// =============================================
// LOCAL STORAGE
// =============================================

function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); }
  catch (e) { return null; }
}

function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); }
  catch (e) { showToast(t('toast.storage_full')); }
}

function simpleHash(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h = h & h;
  }
  return 'h_' + Math.abs(h).toString(36);
}

// =============================================
// FORMAT
// =============================================

function fmt(n) {
  var locale = i18n.currentLang === 'ar' ? 'ar-MA' :
               i18n.currentLang === 'fr' ? 'fr-MA' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, {
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
  var locale = i18n.currentLang === 'ar' ? 'ar-MA' :
               i18n.currentLang === 'fr' ? 'fr-MA' : 'en-US';
  try {
    return new Date(iso).toLocaleDateString(locale, {
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
  el.textContent = t('toast.saved');
  el.classList.add('show');
  setTimeout(function () { el.classList.remove('show'); }, 1500);
}

// =============================================
// AUTH
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

  if (!name)    return showAuthError('reg-error', t('auth.err_name'));
  if (!email || email.indexOf('@') === -1)
    return showAuthError('reg-error', t('auth.err_email'));
  if (pass.length < 6)
    return showAuthError('reg-error', t('auth.err_pass_short'));
  if (pass !== confirm)
    return showAuthError('reg-error', t('auth.err_pass_match'));

  var users = lsGet('zakat_users') || {};
  if (users[email]) return showAuthError('reg-error', t('auth.err_exists'));

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
  showToast(t('toast.created'));
}

function handleLogin() {
  hideAuthErrors();
  var email = document.getElementById('login-email').value.trim().toLowerCase();
  var pass  = document.getElementById('login-password').value;

  if (!email) return showAuthError('login-error', t('auth.err_email_req'));
  if (!pass)  return showAuthError('login-error', t('auth.err_pass_req'));

  var users = lsGet('zakat_users') || {};
  var user  = users[email];

  if (!user) return showAuthError('login-error', t('auth.err_not_found'));
  if (user.passwordHash !== simpleHash(pass))
    return showAuthError('login-error', t('auth.err_wrong_pass'));

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
// DASHBOARD
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
          '<button class="biz-action-item" onclick="event.stopPropagation();exportBusiness(\'' + biz.id + '\')">' + t('dash.export') + '</button>' +
          '<button class="biz-action-item danger" onclick="event.stopPropagation();deleteBusiness(\'' + biz.id + '\')" id="delbtn-' + biz.id + '">' + t('dash.delete') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="biz-card-date">' + t('dash.modified') + ' ' + formatDate(biz.lastModified) + '</div>' +
      '<div class="biz-card-stats">' +
        '<div>' +
          '<span class="biz-stat-label">' + t('dash.net_assets') + '</span>' +
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
  showToast(t('toast.biz_created'));
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
  var btn  = document.getElementById('delbtn-' + id);

  if (card && card.dataset.confirming === 'true') {
    businesses.splice(idx, 1);
    saveBusinesses(businesses);
    if (currentBiz && currentBiz.id === id) currentBiz = null;
    renderDashboard();
    showToast(t('toast.biz_deleted'));
  } else {
    if (card) card.dataset.confirming = 'true';
    if (btn) btn.textContent = t('dash.delete_confirm');
    setTimeout(function () {
      if (card) card.dataset.confirming = 'false';
      if (btn) btn.textContent = t('dash.delete');
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
  showToast(t('toast.exported'));
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
        if (!biz.name || !biz.data) throw new Error('Invalid');
        biz.data = assign({}, DATA_DEFAULTS, biz.data);
        biz.id = 'biz_' + Date.now();
        biz.lastModified = new Date().toISOString();
        var businesses = getBusinesses();
        businesses.push(biz);
        saveBusinesses(businesses);
        renderDashboard();
        showToast(t('toast.imported'));
      } catch (err) {
        showToast(t('toast.invalid_file'));
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function assign(target) {
  for (var i = 1; i < arguments.length; i++) {
    var src = arguments[i];
    if (src) {
      for (var key in src) {
        if (src.hasOwnProperty(key)) target[key] = src[key];
      }
    }
  }
  return target;
}

// =============================================
// DATA PERSISTENCE
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
  data = assign({}, DATA_DEFAULTS, data);

  document.getElementById('hawl-date').value = data.hawlDate || new Date().toISOString().slice(0, 10);
  document.getElementById('nisab-val').value = data.nisabVal || '';
  document.getElementById('madhab').value    = data.madhab || 'general';
  document.getElementById('biz-name').value  = data.bizName || '';

  nisabBasis = data.nisabBasis || 'silver';
  var pills = document.querySelectorAll('#nisab-toggle .pill');
  pills[0].classList.toggle('active', nisabBasis === 'silver');
  pills[1].classList.toggle('active', nisabBasis === 'gold');

  rebuildRows('cash-rows',  'cash-amt',  data.cashRows);
  rebuildRows('recv-rows',  'recv-amt',  data.recvRows);
  rebuildRows('inv-rows',   'inv-amt',   data.invRows);
  rebuildRows('other-rows', 'other-amt', data.otherRows);
  rebuildRows('liab-rows',  'liab-amt',  data.liabRows);

  updateTotals();
}

// =============================================
// CALCULATOR
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
    netEl.style.color = net > 0 ? '#1C1917' : '#8A7F73';
  }
}

function addAssetRow(containerId, cls) {
  var c   = document.getElementById(containerId);
  var div = document.createElement('div');
  div.className = 'asset-row';
  div.innerHTML =
    '<input type="text" placeholder="' + t('ast.cash_ph') + '" oninput="scheduleSave()" />' +
    '<input type="number" placeholder="' + t('ast.amt_ph') + '" min="0" step="0.01" class="' + cls + '" oninput="updateTotals();scheduleSave()" />' +
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

  var biz  = document.getElementById('biz-name').value || 'Business';
  var hawl = document.getElementById('hawl-date').value || new Date().toISOString().slice(0, 10);
  var yr   = new Date(hawl).getFullYear();

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
    badge.textContent = t('res.set_nisab');
    sub.textContent   = t('res.set_nisab_sub');
    document.getElementById('result-amount').textContent = fmt(0);
  } else if (net < nisab) {
    badge.className   = 'status-badge status-none';
    badge.textContent = t('res.below_nisab');
    sub.textContent   = fmt(net) + ' ' + t('res.below_sub') + ' (' + fmt(nisab) + ')';
    document.getElementById('result-amount').textContent = fmt(0);
  } else {
    badge.className   = 'status-badge status-due';
    badge.textContent = t('res.due');
    sub.textContent   = fmt(net) + ' ' + t('res.obligatory_sub');
  }

  var rows = [
    [t('tbl.cash'),        fmt(cash),        false],
    [t('tbl.recv'),        fmt(recv),        false],
    [t('tbl.inv'),         fmt(inv),         false],
    [t('tbl.other'),       fmt(other),       false],
    ['\u2500', '', false],
    [t('tbl.total'),       fmt(totalAssets), true],
    [t('tbl.less_liab'),   '\u2212' + fmt(liab), false],
    [t('tbl.net'),         fmt(net),         true],
    [t('tbl.nisab') + ' (' + nisabBasis + ')', fmt(nisab), false]
  ];

  if (net >= nisab && nisab > 0) {
    rows.push([t('tbl.zakat'), fmt(zakatDue), 'zakat']);
  }

  document.getElementById('breakdown-table').innerHTML = rows.map(function (r) {
    if (r[0] === '\u2500') {
      return '<tr><td colspan="2" style="padding:4px 0;border-bottom:none">' +
        '<hr style="border:none;border-top:1px solid #D5CFC5"/></td></tr>';
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
  goTo('auth');
})();
