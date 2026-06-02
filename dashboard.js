(function() {
  'use strict';

  // ════════════════════════════════════════════
  // CONFIG
  // ════════════════════════════════════════════
  const CONFIG = {
    appsScriptUrl: 'https://script.google.com/macros/s/AKfycbzh7ZijvAx6LoQzR6V5u56JHoK0vIzcO2FYXYfbaG4_wN7gq2wzjT2Is1sEqJweLycNtw/exec',
    dashboardToken: 'schema2024'
  };

  const MAP = window.CLINICAL_MAP;
  const app = document.getElementById('dashboard-app');

  // ════════════════════════════════════════════
  // MAPPINGS
  // ════════════════════════════════════════════
  // YSQ schema ID → YPI parenting style name (as appears in sheet headers)
  const SCHEMA_TO_YPI_NAME = {
    ed: 'הורות חסרה רגשית / מרוחקת',
    ab: 'הורות חסרת יציבות / נטישה',
    ma: 'הורות פוגענית / חשדנית',
    vh: 'הורות מגוננת מדי / חרדתית',
    di: 'הורות תלותית / מחלישה',
    ds: 'הורות דוחה / ביקורתית',
    fa: 'הורות מחלישה הישגים',
    sb: 'הורות הכנעתית / שולטנית',
    ss: 'הורות תובענית רגשית / הורות הפוכה',
    us: 'הורות תובענית / פרפקציוניסטית',
    et: 'הורות מפנקת / ותרנית מדי',
    is: 'הורות חסרת גבולות / משמעת',
    em: 'הורות חונקת / תלות הדדית',
    np: 'הורות דאגנית / פסימית',
    ei: 'הורות מאופקת / חוסמת רגש',
    pu: 'הורות מענישה / תוקפנית',
    as: 'הורות מוכוונת סטטוס והישג חברתי'
  };

  // YSQ schema ID → YPSQ positive schema name (as appears in sheet headers)
  const SCHEMA_TO_YPSQ_NAME = {
    ed: 'הזנה רגשית',
    ab: 'היקשרות יציבה',
    si: 'שייכות חברתית',
    di: 'הסתמכות עצמית ומסוגלות בריאה',
    vh: 'בריאות בסיסית, ביטחון ואופטימיות',
    em: 'גבולות בריאים ועצמי מפותח',
    fa: 'הצלחה',
    et: 'אכפתיות והתחשבות',
    is: 'שליטה עצמית ומשמעת עצמית בריאה',
    sb: null,
    ss: 'אינטרס עצמי בריא ודאגה עצמית',
    as: 'מכוונות עצמית',
    ei: 'פתיחות רגשית וספונטניות',
    us: 'ציפיות ריאליסטיות',
    np: null,
    pu: 'חמלה עצמית',
    ma: null,
    ds: null
  };

  // ════════════════════════════════════════════
  // STATE
  // ════════════════════════════════════════════
  const state = {
    view: 'login',
    authed: false,
    loading: false,
    error: '',
    patients: {},
    patientData: null,
    currentPatient: '',
    currentTab: 'overview',
    search: '',
    overrides: {},
    notes: {},
    aliases: {},    // { sourceName: targetName } – merged patient aliases
    mergeMode: false,
    detailQuestionnaire: null  // which questionnaire detail view is open (null = overview)
  };

  // ════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════
  loadState();
  render();

  // ════════════════════════════════════════════
  // PERSISTENCE
  // ════════════════════════════════════════════
  function loadState() {
    state.authed = localStorage.getItem('dash_auth') === '1';
    try { state.overrides = JSON.parse(localStorage.getItem('dash_overrides') || '{}'); } catch(e) { state.overrides = {}; }
    try { state.notes = JSON.parse(localStorage.getItem('dash_notes') || '{}'); } catch(e) { state.notes = {}; }
    try { state.aliases = JSON.parse(localStorage.getItem('dash_aliases') || '{}'); } catch(e) { state.aliases = {}; }
    if (state.authed) {
      state.view = 'patients';
      fetchPatients();
    }
  }

  function saveOverrides() { localStorage.setItem('dash_overrides', JSON.stringify(state.overrides)); }
  function saveNotes() { localStorage.setItem('dash_notes', JSON.stringify(state.notes)); }
  function saveAliases() { localStorage.setItem('dash_aliases', JSON.stringify(state.aliases)); }

  // ════════════════════════════════════════════
  // PATIENT MERGE / ALIASES
  // ════════════════════════════════════════════
  // Get the canonical (target) name for a patient
  function getCanonicalName(name) {
    return state.aliases[name] || name;
  }

  // Get all names that are merged under a canonical name (including itself)
  function getMergedNames(canonicalName) {
    var names = [canonicalName];
    Object.keys(state.aliases).forEach(function(src) {
      if (state.aliases[src] === canonicalName) names.push(src);
    });
    return names;
  }

  // Merge sourceNames into targetName
  function mergePatients(targetName, sourceNames) {
    sourceNames.forEach(function(src) {
      if (src !== targetName) state.aliases[src] = targetName;
    });
    saveAliases();
  }

  // Unmerge a source name
  function unmergePatient(sourceName) {
    delete state.aliases[sourceName];
    saveAliases();
  }

  // Build a consolidated patient list grouped by canonical name
  function getConsolidatedPatients() {
    var consolidated = {};
    Object.keys(state.patients).forEach(function(name) {
      // Skip garbage entries where the patient name is actually a questionnaire title
      if (/^שאלון\s/.test(name)) return;
      var canonical = getCanonicalName(name);
      if (!consolidated[canonical]) {
        consolidated[canonical] = { questionnaires: [], sourceNames: [] };
      }
      consolidated[canonical].sourceNames.push(name);
      state.patients[name].questionnaires.forEach(function(q) {
        // Avoid duplicates
        var exists = consolidated[canonical].questionnaires.find(function(eq) {
          return eq.name === q.name;
        });
        if (!exists) {
          consolidated[canonical].questionnaires.push(q);
        } else if (q.lastDate > exists.lastDate) {
          exists.lastDate = q.lastDate;
          exists.entries = q.entries;
        }
      });
    });
    return consolidated;
  }

  function getOverride(patient, schemaId, field) {
    return state.overrides[patient] && state.overrides[patient][schemaId] && state.overrides[patient][schemaId][field];
  }

  function setOverride(patient, schemaId, field, value) {
    if (!state.overrides[patient]) state.overrides[patient] = {};
    if (!state.overrides[patient][schemaId]) state.overrides[patient][schemaId] = {};
    const original = MAP.schemas.find(s => s.id === schemaId);
    if (original && value === original[field]) {
      delete state.overrides[patient][schemaId][field];
    } else {
      state.overrides[patient][schemaId][field] = value;
    }
    saveOverrides();
  }

  function getNote(patient, key) {
    return (state.notes[patient] && state.notes[patient][key]) || '';
  }

  function setNote(patient, key, text) {
    if (!state.notes[patient]) state.notes[patient] = {};
    state.notes[patient][key] = text;
    saveNotes();
  }

  // ════════════════════════════════════════════
  // DATA FETCHING
  // ════════════════════════════════════════════
  function fetchJsonp(url, timeoutMs) {
    timeoutMs = timeoutMs || 10000;
    return new Promise(function(resolve, reject) {
      var cb = '_dcb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      var timer = null;
      var done = false;

      function cleanup() {
        done = true;
        clearTimeout(timer);
        delete window[cb];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      var script = document.createElement('script');
      window[cb] = function(data) {
        if (done) return;
        cleanup();
        resolve(data);
      };
      script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
      script.onerror = function() {
        if (done) return;
        cleanup();
        reject(new Error('JSONP script error'));
      };
      timer = setTimeout(function() {
        if (done) return;
        cleanup();
        reject(new Error('JSONP timeout'));
      }, timeoutMs);
      document.head.appendChild(script);
    });
  }

  async function fetchData(action, params) {
    params = params || {};
    var qs = 'action=' + encodeURIComponent(action) + '&token=' + encodeURIComponent(CONFIG.dashboardToken);
    Object.keys(params).forEach(function(k) {
      qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    });
    var url = CONFIG.appsScriptUrl + '?' + qs;
    var errors = [];

    // Strategy 1: regular fetch (works if CORS allows)
    try {
      var res = await fetch(url, { redirect: 'follow' });
      var text = await res.text();
      try { return JSON.parse(text); } catch(pe) { /* not JSON, try JSONP */ }
    } catch(e) {
      errors.push('fetch: ' + e.message);
    }

    // Strategy 2: JSONP (works around CORS via script tag)
    try {
      return await fetchJsonp(url, 10000);
    } catch(e) {
      errors.push('jsonp: ' + e.message);
    }

    throw new Error('All fetch strategies failed: ' + errors.join('; '));
  }

  async function fetchPatients() {
    state.loading = true;
    state.error = '';
    render();
    try {
      var data = await fetchData('patients');
      if (data.error === 'unauthorized') throw new Error('unauthorized');
      if (data.error) throw new Error(data.error);
      state.patients = data.patients || {};
    } catch(e) {
      if (e.message === 'unauthorized') {
        state.error = 'סיסמה שגויה או לא תואמת את הסקריפט.';
      } else {
        state.error = 'לא ניתן לטעון נתונים: ' + e.message;
      }
      state.patients = {};
    }
    state.loading = false;
    render();
  }

  async function selectPatient(name) {
    state.currentPatient = name;
    state.currentTab = 'overview';
    state.detailQuestionnaire = null;
    state.view = 'detail';
    state.loading = true;
    state.error = '';
    render();
    try {
      // Fetch data for all merged names
      var allNames = getMergedNames(name);
      var combined = { name: name, questionnaires: {} };

      for (var i = 0; i < allNames.length; i++) {
        var data = await fetchData('patient', { name: allNames[i] });
        if (data.error && data.error !== 'missing patient name') throw new Error(data.error);
        if (data.questionnaires) {
          Object.keys(data.questionnaires).forEach(function(qName) {
            if (!combined.questionnaires[qName]) {
              combined.questionnaires[qName] = data.questionnaires[qName];
            }
          });
        }
      }

      state.patientData = combined;
    } catch(e) {
      state.error = 'שגיאה בטעינת נתוני מטופל.';
      state.patientData = null;
    }
    state.loading = false;
    render();
  }

  // ════════════════════════════════════════════
  // AUTH
  // ════════════════════════════════════════════
  function login(password) {
    if (password === CONFIG.dashboardToken) {
      state.authed = true;
      state.view = 'patients';
      localStorage.setItem('dash_auth', '1');
      fetchPatients();
      return true;
    }
    return false;
  }

  function logout() {
    state.authed = false;
    state.view = 'login';
    localStorage.removeItem('dash_auth');
    render();
  }

  // ════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════
  function getQType(qName) {
    if (qName.includes('YPI')) return 'ypi';
    if (qName.includes('YPSQ')) return 'ypsq';
    if (qName.includes('YSQ')) return 'ysq';
    if (qName.includes('SMI')) return 'smi';
    return 'unknown';
  }

  function getQTypeLabel(type) {
    return { ypi: 'דפוסי הורות', ysq: 'סכמות מוקדמות', smi: 'מצבי סכמה', ypsq: 'סכמות חיוביות' }[type] || type;
  }

  function scoreColor(score, max) {
    var pct = max ? score / max : score / 6;
    if (pct >= 0.7) return '#e74c3c';
    if (pct >= 0.5) return '#f39c12';
    return '#5b7a6e';
  }

  function ysqScoreLevel(score) {
    if (score >= 3) return 'active';
    if (score >= 2) return 'moderate';
    return 'low';
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // Get top N highest-scoring items for display in clinical chain
  function getTopItems(type, itemNums, count, opts) {
    if (!itemNums || itemNums.length === 0) return [];
    var answers = getRawAnswers(type);
    var qData = window._QDATA && window._QDATA[type];
    if (!answers || !qData) return [];
    opts = opts || {};

    var scored = [];
    itemNums.forEach(function(itemNum) {
      var key = String(itemNum);
      var ans = answers[key] !== undefined ? answers[key] : answers[itemNum];
      if (ans === undefined || ans === null) return;

      if (type === 'ypi') {
        var first = 0, second = 0;
        if (typeof ans === 'object') {
          first = parseFloat(ans.first || 0);
          second = parseFloat(ans.second || 0);
        }
        var q = qData.questions.find(function(qq) { return qq.id === itemNum; });
        if (!q) return;
        // For reversed schemas (ED), low raw scores = more problematic
        var effFirst = opts.reversed ? (7 - first) : first;
        var effSecond = opts.reversed ? (7 - second) : second;
        scored.push({ num: itemNum, text: q.text, first: first, second: second,
                      effMax: Math.max(effFirst, effSecond) });
      } else if (type === 'smi') {
        var raw = typeof ans === 'number' ? ans : parseFloat(ans) || 0;
        var q = qData.questions.find(function(qq) { return qq.num === itemNum; });
        if (!q) return;
        scored.push({ num: itemNum, text: q.text, score: raw });
      } else {
        // YSQ or YPSQ - both use q.number
        var val = typeof ans === 'number' ? ans : parseFloat(ans) || 0;
        var q = qData.questions.find(function(qq) { return qq.number === itemNum; });
        if (!q) return;
        scored.push({ num: itemNum, text: q.text, score: val });
      }
    });

    // Sort by clinical relevance descending
    if (type === 'ypi') {
      scored.sort(function(a, b) { return b.effMax - a.effMax; });
    } else {
      scored.sort(function(a, b) { return b.score - a.score; });
    }

    return scored.slice(0, count);
  }

  function renderTopItems(items, type, label) {
    if (!items || items.length === 0) return '';
    var html = '<div class="chain-high-items">';
    html += '<div class="chain-high-items-label">' + label + '</div>';
    items.forEach(function(item) {
      html += '<div class="chain-high-item">';
      if (type === 'ypi') {
        html += '<span class="chain-high-item-score ypi-dual">' +
          '<span class="mom-score">👩 ' + item.first + '</span>' +
          '<span class="dad-score">👨 ' + item.second + '</span>' +
        '</span>';
      } else {
        html += '<span class="chain-high-item-score">' + item.score + '</span>';
      }
      html += '<span class="chain-high-item-text">"' + escHtml(item.text) + '"</span>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  // Get raw answers object for a questionnaire type
  function getRawAnswers(type) {
    if (!state.patientData || !state.patientData.questionnaires) return null;
    var qName = Object.keys(state.patientData.questionnaires).find(function(k) {
      return getQType(k) === type;
    });
    if (!qName) return null;
    return state.patientData.questionnaires[qName].answers || null;
  }

  // Parse patient data from sheet into structured scores
  function parseQData(qName, raw) {
    if (!raw || !raw.headers || !raw.scores) return null;
    var type = getQType(qName);
    // Skip date + name columns (new consolidated format) or just date (legacy)
    var skipCols = (raw.headers[1] === 'שם') ? 2 : 1;
    var headers = raw.headers.slice(skipCols);
    var scores = raw.scores.slice(skipCols);
    var result = { type: type, date: raw.date || '', items: {} };

    if (type === 'ypi') {
      // Dual rating: first half is mother, second half is father
      var half = headers.length / 2;
      for (var i = 0; i < half; i++) {
        var hdr = headers[i];
        // Header format: "name - אמא"
        var namePart = hdr.replace(/ - אמא$/, '').replace(/ - אבא$/, '');
        result.items[namePart] = {
          mother: parseFloat(scores[i]) || 0,
          father: parseFloat(scores[i + half]) || 0
        };
      }
    } else {
      for (var j = 0; j < headers.length; j++) {
        result.items[headers[j]] = parseFloat(scores[j]) || 0;
      }
    }

    // YSQ: always recalculate averages from raw answers to fix legacy countHigh data
    if (type === 'ysq' && raw.answers) {
      var ysqQData = window._QDATA && window._QDATA.ysq;
      if (ysqQData && ysqQData.schemas) {
        ysqQData.schemas.forEach(function(schema) {
          var sum = 0, count = 0;
          schema.items.forEach(function(itemNum) {
            var key = String(itemNum);
            var ans = raw.answers[key] !== undefined ? raw.answers[key] : raw.answers[itemNum];
            var val = parseFloat(ans);
            if (!isNaN(val) && val > 0) { sum += val; count++; }
          });
          if (count > 0) {
            result.items[schema.name] = Math.round((sum / count) * 100) / 100;
          }
        });
      }
    }

    return result;
  }

  // Get all parsed questionnaire data for current patient
  function getParsedData() {
    if (!state.patientData || !state.patientData.questionnaires) return {};
    var parsed = {};
    Object.keys(state.patientData.questionnaires).forEach(function(qName) {
      var p = parseQData(qName, state.patientData.questionnaires[qName]);
      if (p) parsed[p.type] = p;
    });
    return parsed;
  }

  // ════════════════════════════════════════════
  // RENDER ENGINE
  // ════════════════════════════════════════════
  function render() {
    switch(state.view) {
      case 'login': renderLogin(); break;
      case 'patients': renderPatients(); break;
      case 'detail': renderDetail(); break;
    }
  }

  // ── Login ──
  function renderLogin() {
    app.innerHTML =
      '<div class="dash-topbar">' +
        '<div>' +
          '<div class="dash-topbar-title">לוח מטפל</div>' +
          '<div class="dash-topbar-subtitle">שאלוני סכמה</div>' +
        '</div>' +
      '</div>' +
      '<div class="login-container">' +
        '<div class="login-card">' +
          '<div class="login-icon">&#128274;</div>' +
          '<h2>כניסת מטפל</h2>' +
          '<p>הזן סיסמה כדי לגשת ללוח המטפל</p>' +
          '<input type="password" class="login-input" id="login-pw" placeholder="סיסמה">' +
          '<button class="login-btn" id="login-btn">כניסה</button>' +
          '<div class="login-error" id="login-error">סיסמה שגויה</div>' +
        '</div>' +
      '</div>';

    var pwInput = document.getElementById('login-pw');
    var loginBtn = document.getElementById('login-btn');
    pwInput.focus();
    pwInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doLogin();
    });
    loginBtn.addEventListener('click', doLogin);

    function doLogin() {
      if (!login(pwInput.value)) {
        document.getElementById('login-error').style.display = 'block';
        pwInput.classList.add('shake');
      }
    }
  }

  // ── Patient List ──
  function renderPatients() {
    var consolidated = getConsolidatedPatients();
    var names = Object.keys(consolidated);
    var filtered = state.search ?
      names.filter(function(n) { return n.includes(state.search); }) : names;

    var mergeActive = state.mergeMode;

    var html =
      '<div class="dash-topbar">' +
        '<div>' +
          '<div class="dash-topbar-title">לוח מטפל</div>' +
          '<div class="dash-topbar-subtitle">' + names.length + ' מטופלים</div>' +
        '</div>' +
        '<div class="dash-topbar-actions">' +
          '<button class="dash-topbar-btn" id="btn-refresh">&#x21bb; רענון</button>' +
          '<button class="dash-topbar-btn" id="btn-logout">יציאה</button>' +
        '</div>' +
      '</div>' +
      '<div class="dash-content">' +
        '<div class="dash-section-header">' +
          '<h2 class="dash-section-title">מטופלים</h2>' +
          '<div style="display:flex;gap:8px;align-items:center">' +
            '<input type="text" class="dash-search" id="patient-search" placeholder="חיפוש מטופל..." value="' + escHtml(state.search) + '">' +
            '<button class="dash-topbar-btn' + (mergeActive ? ' merge-active' : '') + '" id="btn-merge-mode" style="white-space:nowrap;background:' + (mergeActive ? '#e67e22' : 'rgba(91,122,110,0.12)') + ';color:' + (mergeActive ? 'white' : '#5b7a6e') + ';border:none">' +
              (mergeActive ? '&#10005; ביטול' : '&#128279; מיזוג') +
            '</button>' +
          '</div>' +
        '</div>';

    if (mergeActive) {
      html += '<div class="merge-bar" id="merge-bar">' +
        '<div class="merge-bar-text">סמן 2 מטופלים או יותר ולחץ מזג</div>' +
        '<button class="merge-execute-btn" id="btn-merge-execute" disabled>מזג נבחרים</button>' +
      '</div>';
    }

    if (state.loading) {
      html += '<div class="dash-loading"><div class="dash-loading-spinner"></div>טוען נתונים...</div>';
    } else if (state.error) {
      html += '<div class="dash-error">' + escHtml(state.error) + '</div>' +
              '<div class="dash-empty"><div class="dash-empty-icon">&#9888;&#65039;</div>' +
              '<h3>לא ניתן להציג מטופלים</h3>' +
              '<p>בדוק את חיבור האינטרנט ואת הגדרות הסקריפט</p></div>';
    } else if (filtered.length === 0 && names.length === 0) {
      html += '<div class="dash-empty"><div class="dash-empty-icon">&#128203;</div>' +
              '<h3>אין מטופלים עדיין</h3>' +
              '<p>ברגע שמטופל ימלא שאלון, הוא יופיע כאן</p></div>';
    } else if (filtered.length === 0) {
      html += '<div class="dash-empty"><h3>לא נמצאו תוצאות</h3></div>';
    } else {
      html += '<div class="patient-grid">';
      filtered.forEach(function(name) {
        html += buildPatientCard(name, consolidated[name], mergeActive);
      });
      html += '</div>';
    }

    html += '</div>';
    app.innerHTML = html;

    // Event listeners
    document.getElementById('btn-refresh').addEventListener('click', fetchPatients);
    document.getElementById('btn-logout').addEventListener('click', logout);
    document.getElementById('btn-merge-mode').addEventListener('click', function() {
      state.mergeMode = !state.mergeMode;
      renderPatients();
    });
    document.getElementById('patient-search').addEventListener('input', function(e) {
      state.search = e.target.value;
      renderPatients();
      var el = document.getElementById('patient-search');
      if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
    });

    if (mergeActive) {
      // Merge checkboxes
      document.querySelectorAll('.merge-check').forEach(function(cb) {
        cb.addEventListener('change', updateMergeBar);
      });
      // Unmerge buttons
      document.querySelectorAll('.unmerge-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          unmergePatient(btn.dataset.source);
          renderPatients();
        });
      });
      // Execute merge
      var execBtn = document.getElementById('btn-merge-execute');
      if (execBtn) {
        execBtn.addEventListener('click', executeMerge);
      }
    }

    // Patient card clicks (not in merge mode)
    if (!mergeActive) {
      document.querySelectorAll('.patient-card').forEach(function(card) {
        card.addEventListener('click', function() {
          selectPatient(card.dataset.name);
        });
      });
    }
  }

  function updateMergeBar() {
    var checked = document.querySelectorAll('.merge-check:checked');
    var btn = document.getElementById('btn-merge-execute');
    if (btn) btn.disabled = checked.length < 2;
    var text = document.querySelector('.merge-bar-text');
    if (text) text.textContent = checked.length < 2 ?
      'סמן 2 מטופלים או יותר ולחץ מזג' :
      checked.length + ' מטופלים נבחרו';
  }

  function executeMerge() {
    var checked = document.querySelectorAll('.merge-check:checked');
    if (checked.length < 2) return;
    var names = [];
    checked.forEach(function(cb) { names.push(cb.dataset.name); });

    // Show name picker
    var pick = prompt('בחר את השם שישמר (הקלד מספר):\n' +
      names.map(function(n, i) { return (i + 1) + '. ' + n; }).join('\n'));

    var idx = parseInt(pick, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= names.length) return;

    var target = names[idx];
    mergePatients(target, names);
    state.mergeMode = false;
    renderPatients();
  }

  function buildPatientCard(name, consolidated, mergeActive) {
    var qTypes = ['YPI', 'YSQ', 'SMI', 'YPSQ'];
    var badges = '';
    qTypes.forEach(function(type) {
      var found = consolidated.questionnaires.find(function(q) { return q.name.includes(type); });
      badges += found ?
        '<span class="patient-badge done">' + type + ' &#10003;</span>' :
        '<span class="patient-badge missing">' + type + '</span>';
    });

    var dates = consolidated.questionnaires.map(function(q) { return q.lastDate; }).filter(Boolean);
    var lastDate = dates.length > 0 ? dates[dates.length - 1] : '';

    // Show merged source names
    var mergedInfo = '';
    if (consolidated.sourceNames.length > 1) {
      mergedInfo = '<div class="patient-merged-info">&#128279; מאוחד מ: ' +
        consolidated.sourceNames.map(function(sn) {
          var isSelf = sn === name;
          return '<span class="merged-source' + (isSelf ? ' primary' : '') + '">' + escHtml(sn) +
            (!isSelf && mergeActive ? ' <button class="unmerge-btn" data-source="' + escHtml(sn) + '" title="בטל מיזוג">&#10005;</button>' : '') +
          '</span>';
        }).join(', ') +
      '</div>';
    }

    return '<div class="patient-card' + (mergeActive ? ' merge-selectable' : '') + '" data-name="' + escHtml(name) + '">' +
      (mergeActive ? '<label class="merge-check-label"><input type="checkbox" class="merge-check" data-name="' + escHtml(name) + '"></label>' : '') +
      '<div class="patient-name">' + escHtml(name) + '</div>' +
      mergedInfo +
      (lastDate ? '<div class="patient-date">עדכון אחרון: ' + escHtml(lastDate) + '</div>' : '') +
      '<div class="patient-badges">' + badges + '</div>' +
    '</div>';
  }

  // ── Patient Detail ──
  function renderDetail() {
    var html =
      '<div class="dash-topbar">' +
        '<div>' +
          '<div class="dash-topbar-title">לוח מטפל</div>' +
          '<div class="dash-topbar-subtitle">' + escHtml(state.currentPatient) + '</div>' +
        '</div>' +
        '<div class="dash-topbar-actions">' +
          '<button class="dash-topbar-btn" id="btn-back-top">&#8594; חזרה</button>' +
        '</div>' +
      '</div>' +
      '<div class="dash-content">' +
        '<div class="detail-header">' +
          '<button class="back-btn" id="btn-back">&#8594; חזרה לרשימה</button>' +
          '<h1 class="detail-name">' + escHtml(state.currentPatient) + '</h1>' +
        '</div>' +
        '<div class="tab-bar">' +
          '<button class="tab-btn' + (state.currentTab === 'overview' ? ' active' : '') + '" data-tab="overview">סקירה</button>' +
          '<button class="tab-btn' + (state.currentTab === 'chain' ? ' active' : '') + '" data-tab="chain">שרשרת קלינית</button>' +
          '<button class="tab-btn' + (state.currentTab === 'notes' ? ' active' : '') + '" data-tab="notes">הערות</button>' +
        '</div>';

    if (state.loading) {
      html += '<div class="dash-loading"><div class="dash-loading-spinner"></div>טוען נתונים...</div>';
    } else if (state.error) {
      html += '<div class="dash-error">' + escHtml(state.error) + '</div>';
    } else {
      switch (state.currentTab) {
        case 'overview': html += state.detailQuestionnaire ? renderQuestionnaireDetail(state.detailQuestionnaire) : renderOverview(); break;
        case 'chain': html += renderChain(); break;
        case 'notes': html += renderNotes(); break;
      }
    }

    html += '</div>';
    app.innerHTML = html;

    // Event listeners
    var backTop = document.getElementById('btn-back-top');
    var backBtn = document.getElementById('btn-back');
    if (backTop) backTop.addEventListener('click', goBack);
    if (backBtn) backBtn.addEventListener('click', goBack);

    document.querySelectorAll('.tab-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.currentTab = btn.dataset.tab;
        state.detailQuestionnaire = null;
        renderDetail();
      });
    });

    // Tab-specific event binding
    if (!state.loading && !state.error) {
      if (state.currentTab === 'overview') bindOverviewEvents();
      if (state.currentTab === 'chain') bindChainEvents();
      if (state.currentTab === 'notes') bindNotesEvents();
    }
  }

  function goBack() {
    state.view = 'patients';
    state.patientData = null;
    state.error = '';
    state.detailQuestionnaire = null;
    render();
  }

  // ── Overview Tab ──
  function renderOverview() {
    if (!state.patientData || !state.patientData.questionnaires) {
      return '<div class="dash-empty"><h3>אין נתונים זמינים</h3></div>';
    }

    var parsed = getParsedData();
    var order = ['ypi', 'ysq', 'smi', 'ypsq'];
    var labels = { ypi: 'שאלון דפוסי הורות (YPI)', ysq: 'שאלון סכמות מוקדמות (YSQ-S3)', smi: 'שאלון מצבי סכמה (SMI)', ypsq: 'שאלון סכמות חיוביות (YPSQ)' };

    var html = '<div class="overview-grid">';

    order.forEach(function(type) {
      var data = parsed[type];
      html += '<div class="overview-card">';
      html += '<div class="overview-q-title' + (data ? ' clickable' : '') + '" data-qtype="' + type + '">' + labels[type] + (data ? ' &#8592;' : '') + '</div>';

      if (!data) {
        html += '<div class="overview-q-empty">טרם מולא</div>';
        html += '</div>';
        return;
      }

      html += '<div class="overview-q-date">תאריך: ' + escHtml(data.date) + '</div>';
      html += '<div class="overview-rows">';

      // Sort items by score descending
      var keys = Object.keys(data.items);
      if (type === 'ypi') {
        // Sort by max of mother/father
        keys.sort(function(a, b) {
          var aMax = Math.max(data.items[a].mother, data.items[a].father);
          var bMax = Math.max(data.items[b].mother, data.items[b].father);
          return bMax - aMax;
        });
      } else if (type === 'ysq') {
        // Sort by total sum (computed from raw answers when available)
        var ysqRawForSort = getRawAnswers('ysq');
        var ysqQDataForSort = window._QDATA && window._QDATA.ysq;
        keys.sort(function(a, b) {
          function getSum(schemaName) {
            if (!ysqRawForSort || !ysqQDataForSort) return data.items[schemaName] * 5;
            var sd = ysqQDataForSort.schemas.find(function(s) { return s.name === schemaName; });
            if (!sd) return data.items[schemaName] * 5;
            var s = 0;
            sd.items.forEach(function(i) {
              var key = String(i);
              var ans = ysqRawForSort[key] !== undefined ? ysqRawForSort[key] : ysqRawForSort[i];
              s += parseFloat(ans) || 0;
            });
            return s;
          }
          return getSum(b) - getSum(a);
        });
      } else {
        keys.sort(function(a, b) { return data.items[b] - data.items[a]; });
      }

      // YPI: table with אמא / אבא columns
      if (type === 'ypi') {
        html += '<div class="overview-ypi-table">';
        html += '<div class="overview-ypi-header">' +
          '<span class="overview-ypi-header-name"></span>' +
          '<span class="overview-ypi-header-col mom">אמא</span>' +
          '<span class="overview-ypi-header-col dad">אבא</span>' +
        '</div>';
        keys.forEach(function(name) {
          var scores = data.items[name];
          var momColor = scoreColor(scores.mother, 6);
          var dadColor = scoreColor(scores.father, 6);
          html += '<div class="overview-ypi-row">' +
            '<span class="overview-ypi-row-name">' + escHtml(name) + '</span>' +
            '<span class="overview-ypi-row-val" style="color:' + momColor + '">' + scores.mother.toFixed(1) + '</span>' +
            '<span class="overview-ypi-row-val" style="color:' + dadColor + '">' + scores.father.toFixed(1) + '</span>' +
          '</div>';
        });
        html += '</div>';
      }

      keys.forEach(function(name) {
        if (type === 'ypi') {
          return; // already rendered above as table
        } else if (type === 'ysq') {
          // YSQ: show both high-answer count AND total sum
          var ysqRawAnswers = getRawAnswers('ysq');
          var ysqQData = window._QDATA && window._QDATA.ysq;
          var schemaDef = ysqQData && ysqQData.schemas.find(function(s) { return s.name === name; });
          var sum = 0, highCount = 0, maxSum = 30; // 5 items × max 6
          if (ysqRawAnswers && schemaDef) {
            schemaDef.items.forEach(function(itemNum) {
              var key = String(itemNum);
              var ans = ysqRawAnswers[key] !== undefined ? ysqRawAnswers[key] : ysqRawAnswers[itemNum];
              var val = parseFloat(ans) || 0;
              sum += val;
              if (val >= 5) highCount++;
            });
            maxSum = schemaDef.items.length * 6;
          } else {
            // Fallback from average
            sum = Math.round((data.items[name] || 0) * 5);
          }
          var pct = (sum / maxSum * 100).toFixed(0);
          var barColor = sum >= maxSum * 0.6 ? '#e74c3c' : sum >= maxSum * 0.4 ? '#f39c12' : '#5b7a6e';
          html += '<div class="overview-row ysq-row">' +
            '<span class="overview-row-name">' + escHtml(name) + '</span>' +
            '<div class="overview-row-bar"><div class="overview-row-fill" style="width:' + pct + '%;background:' + barColor + '"></div></div>' +
            '<div class="ysq-score-badges">' +
              '<span class="ysq-badge-high" title="ציונים 5-6">' + highCount + '</span>' +
              '<span class="ysq-badge-sum" style="color:' + barColor + '">' + sum + '/' + maxSum + '</span>' +
            '</div>' +
          '</div>';
        } else {
          var score = data.items[name];
          var max = 6;
          var pct = (score / max * 100).toFixed(0);
          var color = scoreColor(score, max);
          html += '<div class="overview-row">' +
            '<span class="overview-row-name">' + escHtml(name) + '</span>' +
            '<div class="overview-row-bar"><div class="overview-row-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
            '<span class="overview-row-val" style="color:' + color + '">' + (Number.isInteger(score) ? score : score.toFixed(1)) + '</span>' +
          '</div>';
        }
      });

      html += '</div></div>';
    });

    html += '</div>';
    return html;
  }

  // ── Questionnaire Detail View ──
  function renderQuestionnaireDetail(type) {
    var QDATA = window._QDATA;
    if (!QDATA || !QDATA[type]) {
      return '<div class="dash-empty"><h3>אין נתוני שאלון זמינים</h3></div>';
    }

    var qData = QDATA[type];
    var qName = null;

    if (state.patientData && state.patientData.questionnaires) {
      qName = Object.keys(state.patientData.questionnaires).find(function(k) {
        return getQType(k) === type;
      });
    }

    if (!qName || !state.patientData.questionnaires[qName]) {
      return '<div class="dash-empty"><h3>המטופל טרם מילא שאלון זה</h3></div>';
    }

    var raw = state.patientData.questionnaires[qName];
    var answers = raw.answers || {};
    var parsed = parseQData(qName, raw);
    var reverseItems = (qData.scoring && qData.scoring.reverseItems) || [];
    var isDual = !!qData.dualRating;
    var isCountHigh = qData.scoring && qData.scoring.method === 'countHigh';
    var highThreshold = qData.scoring ? (qData.scoring.highThreshold || 5) : 5;
    var hasAnswers = Object.keys(answers).length > 0;

    var html = '<div class="qdetail-container">';

    // Header with back button
    html += '<div class="qdetail-header">';
    html += '<button class="qdetail-back" id="qdetail-back">&#8594; חזרה לסקירה</button>';
    html += '<h2 class="qdetail-title">' + escHtml(qData.title) + '</h2>';
    if (raw.date) html += '<div class="qdetail-date">תאריך מילוי: ' + escHtml(raw.date) + '</div>';
    html += '</div>';

    // Notice when answers aren't available
    if (!hasAnswers) {
      html += '<div class="qdetail-no-answers">' +
        '&#9432; התשובות המפורטות אינן זמינות עבור שאלון זה. ' +
        'הציונים הכלליים לכל סכמה מוצגים. כשהמטופל ימלא את השאלון שוב, התשובות לכל שאלה יוצגו כאן.' +
      '</div>';
    }

    // For YSQ: sort schemas by total sum descending
    var schemasToRender = qData.schemas.slice();
    if (type === 'ysq' && hasAnswers) {
      schemasToRender.sort(function(a, b) {
        function getSchemaSum(schema) {
          var s = 0;
          schema.items.forEach(function(itemNum) {
            var key = String(itemNum);
            var ans = answers[key] !== undefined ? answers[key] : answers[itemNum];
            s += parseFloat(ans) || 0;
          });
          return s;
        }
        return getSchemaSum(b) - getSchemaSum(a);
      });
    }

    // Iterate schemas
    schemasToRender.forEach(function(schema) {
      var schemaName = schema.name;
      var schemaScore = '';
      var schemaClass = '';

      if (parsed && parsed.items) {
        if (isDual) {
          var sc = parsed.items[schemaName];
          if (sc) {
            schemaScore = 'אמא: ' + sc.mother.toFixed(1) + ' | אבא: ' + sc.father.toFixed(1);
            var maxDual = Math.max(sc.mother, sc.father);
            if (maxDual >= 4.5) schemaClass = 'high';
            else if (maxDual >= 3.5) schemaClass = 'moderate';
          }
        } else if (type === 'ysq') {
          // YSQ: compute both high count AND total sum from raw answers
          var ysqSum = 0, ysqHigh = 0, ysqMax = schema.items.length * 6;
          if (hasAnswers) {
            schema.items.forEach(function(itemNum) {
              var key = String(itemNum);
              var ans = answers[key] !== undefined ? answers[key] : answers[itemNum];
              var val = parseFloat(ans) || 0;
              ysqSum += val;
              if (val >= 5) ysqHigh++;
            });
          } else if (parsed && parsed.items[schemaName] !== undefined) {
            ysqSum = Math.round(parsed.items[schemaName] * schema.items.length);
          }
          schemaScore = 'סה"כ ' + ysqSum + '/' + ysqMax + ' • ' + ysqHigh + '/' + schema.items.length + ' ציונים גבוהים';
          if (ysqSum >= ysqMax * 0.6) schemaClass = 'high';
          else if (ysqSum >= ysqMax * 0.4) schemaClass = 'moderate';
        } else {
          var s = parsed.items[schemaName];
          if (s !== undefined) {
            if (isCountHigh) {
              var activeThreshold = qData.scoring.activeThreshold || 2;
              schemaScore = s + '/' + schema.items.length + ' תשובות גבוהות';
              if (s >= activeThreshold) {
                schemaClass = 'active';
                schemaScore += ' — אקטיבית';
              }
            } else {
              schemaScore = 'ממוצע: ' + (Number.isInteger(s) ? s : s.toFixed(1));
              if (s >= 4.5) schemaClass = 'high';
              else if (s >= 3.5) schemaClass = 'moderate';
            }
          }
        }
      }

      html += '<div class="qdetail-schema ' + schemaClass + '">';
      html += '<div class="qdetail-schema-header">';
      html += '<div class="qdetail-schema-title">';
      html += '<span class="qdetail-schema-name">' + escHtml(schemaName) + '</span>';
      if (schema.nameEn) html += ' <span class="qdetail-schema-name-en">(' + escHtml(schema.nameEn) + ')</span>';
      html += '</div>';
      if (schemaScore) html += '<span class="qdetail-schema-score ' + schemaClass + '">' + schemaScore + '</span>';
      html += '</div>';

      if (isDual) {
        // YPI: grouped by parent — first all mom, then all dad
        var parents = [
          { key: 'first', label: 'אמא', cls: 'mom' },
          { key: 'second', label: 'אבא', cls: 'dad' }
        ];

        // Get parent-level score for this schema
        var parentScores = parsed && parsed.items ? parsed.items[schemaName] : null;

        html += '<div class="qdetail-parents-grid">';
        parents.forEach(function(parent) {
          var parentAvg = parentScores ? (parent.key === 'first' ? parentScores.mother : parentScores.father) : null;
          var parentAvgClass = parentAvg && parentAvg >= 4.5 ? 'high' : parentAvg && parentAvg >= 3.5 ? 'moderate' : '';

          html += '<div class="qdetail-parent-block ' + parent.cls + '">';
          html += '<div class="qdetail-parent-header ' + parent.cls + '">';
          html += '<span class="qdetail-parent-label">' + parent.label + '</span>';
          if (parentAvg !== null) html += '<span class="qdetail-parent-avg ' + parentAvgClass + '">' + parentAvg.toFixed(1) + '</span>';
          html += '</div>';

          html += '<div class="qdetail-questions">';
          schema.items.forEach(function(itemNum) {
            var question = qData.questions.find(function(q) {
              return (q.number || q.num || q.id) === itemNum;
            });
            if (!question) return;

            var answer = answers[itemNum];
            var val = answer && answer[parent.key] ? answer[parent.key] : null;
            var valClass = val && val >= 5 ? 'high' : val && val >= 4 ? 'moderate' : '';

            html += '<div class="qdetail-question' + (val && val >= 5 ? ' high-answer' : '') + '">';
            html += '<span class="qdetail-q-num">' + itemNum + '.</span>';
            html += '<span class="qdetail-q-text">' + escHtml(question.text) + '</span>';
            html += '<span class="qdetail-q-val ' + parent.cls + ' ' + valClass + '">' + (val || '-') + '</span>';
            html += '</div>';
          });
          html += '</div>';

          html += '</div>';
        });
        html += '</div>';
      } else {
        // Single rating: YSQ, SMI, YPSQ
        html += '<div class="qdetail-questions">';
        schema.items.forEach(function(itemNum) {
          var question = qData.questions.find(function(q) {
            return (q.number || q.num || q.id) === itemNum;
          });
          if (!question) return;

          var qText = question.text;
          var answer = answers[itemNum];
          var isReversed = reverseItems.includes(itemNum);
          var val = typeof answer === 'number' ? answer : (answer != null ? parseInt(answer) : null);
          var valClass = '';
          var isHigh = false;
          if (val !== null && !isNaN(val)) {
            if (isCountHigh) {
              isHigh = val >= highThreshold;
              if (isHigh) valClass = 'high';
            } else {
              if (val >= 5) { valClass = 'high'; isHigh = true; }
              else if (val >= 4) valClass = 'moderate';
            }
          }

          html += '<div class="qdetail-question' + (isHigh ? ' high-answer' : '') + '">';
          html += '<span class="qdetail-q-num">' + itemNum + '.</span>';
          html += '<span class="qdetail-q-text">' + escHtml(qText) + '</span>';
          html += '<span class="qdetail-q-val ' + valClass + '">' + (val !== null && !isNaN(val) ? val : '-') + '</span>';
          if (isReversed) html += '<span class="qdetail-q-reversed" title="פריט הפוך (הציון מתהפך בחישוב)">&#8635;</span>';
          html += '</div>';
        });
        html += '</div>';
      }

      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  // ── Overview Event Bindings ──
  function bindOverviewEvents() {
    // Clickable questionnaire titles → open detail view
    document.querySelectorAll('.overview-q-title.clickable').forEach(function(el) {
      el.addEventListener('click', function() {
        state.detailQuestionnaire = el.dataset.qtype;
        renderDetail();
      });
    });

    // Back button from detail view
    var backBtn = document.getElementById('qdetail-back');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        state.detailQuestionnaire = null;
        renderDetail();
      });
    }
  }

  // ── Chain Tab ──
  function renderChain() {
    var parsed = getParsedData();
    var ysqData = parsed.ysq;
    var smiData = parsed.smi;
    var ypsqData = parsed.ypsq;
    var ypiData = parsed.ypi;

    var html = '<div class="chain-intro">' +
      'השרשרת הקלינית מציגה את הזרימה: סגנון הורות &rarr; צורך שלא נענה &rarr; סכמה &rarr; מודים &rarr; קוטב חיובי &rarr; תגובה מתקנת.<br>' +
      'כל שדה ניתן לעריכה. שינויים נשמרים אוטומטית.' +
    '</div>';

    if (!ysqData) {
      html += '<div class="dash-empty"><h3>אין נתוני YSQ</h3><p>השרשרת מבוססת על סכמות מוקדמות. המטופל טרם מילא את שאלון YSQ-S3.</p></div>';
      return html;
    }

    // Sort ALL schemas by YSQ score descending (flat list, most active first)
    var allSchemas = MAP.schemas.filter(function(s) {
      return ysqData.items[s.name] !== undefined;
    });
    allSchemas.sort(function(a, b) {
      return (ysqData.items[b.name] || 0) - (ysqData.items[a.name] || 0);
    });

    html += '<div class="chain-cards">';
    allSchemas.forEach(function(schema) {
      html += buildChainCard(schema, ysqData, smiData, ypsqData, ypiData);
    });
    html += '</div>';

    return html;
  }

  function buildChainCard(schema, ysqData, smiData, ypsqData, ypiData) {
    var name = state.currentPatient;
    var ysqScore = ysqData.items[schema.name];
    var level = ysqScoreLevel(ysqScore);
    var levelClass = level;
    var levelLabel = level === 'active' ? 'אקטיבית' : level === 'moderate' ? 'בינונית' : 'לא אקטיבית';

    // Get override or original values
    function val(field) {
      return getOverride(name, schema.id, field) || schema[field] || '';
    }
    function isModified(field) {
      return !!getOverride(name, schema.id, field);
    }

    function fffBadge(mode) {
      if (!mode || !mode.fff) return '';
      var cls = mode.fff.toLowerCase();
      return '<span class="chain-fff-badge ' + cls + '">' + escHtml(mode.fff) + '</span>';
    }

    var domain = MAP.domains.find(function(d) { return d.id === schema.domain; });
    var domainLabel = domain ? domain.name : '';

    var html = '<div class="chain-card" data-schema="' + schema.id + '">' +
      '<div class="chain-card-header ' + levelClass + '">' +
        '<div class="chain-schema-info">' +
          '<div class="chain-schema-name">' + escHtml(schema.name) + '</div>' +
          '<div class="chain-schema-name-en">' + escHtml(schema.nameEn) + '</div>' +
          '<div class="chain-domain-tag">' + escHtml(domainLabel) + '</div>' +
        '</div>' +
        '<div class="chain-schema-score">' +
          '<div class="chain-score-value ' + levelClass + '">' + ysqScore + '/6</div>' +
          '<div class="chain-score-label">' + levelLabel + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="chain-card-body">';

    // Step 1: Parenting Style
    html += '<div class="chain-step">' +
      '<div class="chain-step-dot parenting"></div>' +
      '<div class="chain-step-label parenting">סגנון הורות</div>' +
      '<div class="chain-step-text' + (isModified('parentingStyle') ? ' modified' : '') + '" contenteditable="true" data-field="parentingStyle" data-schema="' + schema.id + '">' +
        escHtml(val('parentingStyle')) +
      '</div>';

    // Show YPI scores if available
    if (ypiData && SCHEMA_TO_YPI_NAME[schema.id]) {
      var ypiName = SCHEMA_TO_YPI_NAME[schema.id];
      var ypiScores = ypiData.items[ypiName];
      if (ypiScores) {
        html += '<div class="chain-ypi-scores">' +
          '<span class="chain-ypi-badge mom">אמא: ' + ypiScores.mother.toFixed(1) + '</span>' +
          '<span class="chain-ypi-badge dad">אבא: ' + ypiScores.father.toFixed(1) + '</span>' +
        '</div>';
      }
      // Show top 2 YPI items
      var ypiSchemaData = window._QDATA && window._QDATA.ypi &&
        window._QDATA.ypi.schemas.find(function(s) { return s.name === ypiName; });
      if (ypiSchemaData) {
        var ypiTopItems = getTopItems('ypi', ypiSchemaData.items, 2, { reversed: !!ypiSchemaData.reversed });
        html += renderTopItems(ypiTopItems, 'ypi', '📌 המשפטים הבולטים:');
      }
    }
    html += '</div>';

    // Step 2: Unmet Need
    html += '<div class="chain-step">' +
      '<div class="chain-step-dot need"></div>' +
      '<div class="chain-step-label need">צורך שלא נענה</div>' +
      '<div class="chain-step-text' + (isModified('unmetNeed') ? ' modified' : '') + '" contenteditable="true" data-field="unmetNeed" data-schema="' + schema.id + '">' +
        escHtml(val('unmetNeed')) +
      '</div>' +
    '</div>';

    // Step 3: Core Belief
    if (val('coreBelief')) {
      html += '<div class="chain-step">' +
        '<div class="chain-step-dot belief"></div>' +
        '<div class="chain-step-label belief">אמונה גרעינית</div>' +
        '<div class="chain-step-text' + (isModified('coreBelief') ? ' modified' : '') + '" contenteditable="true" data-field="coreBelief" data-schema="' + schema.id + '">' +
          escHtml(val('coreBelief')) +
        '</div>';

      // Show top 2 YSQ items for this schema
      if (schema.ysqItems) {
        var ysqTopItems = getTopItems('ysq', schema.ysqItems, 2);
        html += renderTopItems(ysqTopItems, 'ysq', '📌 המשפטים הבולטים:');
      }

      html += '</div>';
    }

    // Step 4: Triggers
    if (val('triggers')) {
      html += '<div class="chain-step">' +
        '<div class="chain-step-dot triggers"></div>' +
        '<div class="chain-step-label triggers">טריגרים בהווה</div>' +
        '<div class="chain-step-text' + (isModified('triggers') ? ' modified' : '') + '" contenteditable="true" data-field="triggers" data-schema="' + schema.id + '">' +
          escHtml(val('triggers')) +
        '</div>' +
      '</div>';
    }

    // Step 5: Body Experience
    if (val('bodyExperience')) {
      html += '<div class="chain-step">' +
        '<div class="chain-step-dot body"></div>' +
        '<div class="chain-step-label body">חוויה גופנית-רגשית</div>' +
        '<div class="chain-step-text' + (isModified('bodyExperience') ? ' modified' : '') + '" contenteditable="true" data-field="bodyExperience" data-schema="' + schema.id + '">' +
          escHtml(val('bodyExperience')) +
        '</div>' +
      '</div>';
    }

    // Step 6: Related Modes (with FFF badges)
    html += '<div class="chain-step">' +
      '<div class="chain-step-dot modes"></div>' +
      '<div class="chain-step-label modes">מודים קשורים</div>' +
      '<div class="chain-modes">';

    schema.relatedModes.forEach(function(modeCode) {
      var mode = MAP.modes[modeCode];
      if (!mode) return;
      var modeScore = smiData ? smiData.items[mode.name] : null;
      html += '<span class="chain-mode-badge ' + mode.type + '">' +
        fffBadge(mode) +
        escHtml(mode.name) +
        (modeScore !== null && modeScore !== undefined ?
          ' <span class="chain-mode-score">' + modeScore.toFixed(1) + '</span>' : '') +
      '</span>';
    });

    html += '</div>';

    // Show top 2 SMI items across all related modes
    if (smiData && schema.relatedModes.length > 0) {
      var smiQData = window._QDATA && window._QDATA.smi;
      if (smiQData) {
        var allModeItems = [];
        schema.relatedModes.forEach(function(modeCode) {
          var smiSchema = smiQData.schemas.find(function(s) { return s.code === modeCode; });
          if (smiSchema) {
            smiSchema.items.forEach(function(item) { allModeItems.push(item); });
          }
        });
        var smiTopItems = getTopItems('smi', allModeItems, 2);
        html += renderTopItems(smiTopItems, 'smi', '📌 המשפטים הבולטים:');
      }
    }

    html += '</div>';

    // Step 7: Positive Schema
    html += '<div class="chain-step">' +
      '<div class="chain-step-dot positive"></div>' +
      '<div class="chain-step-label positive">קוטב חיובי</div>' +
      '<div class="chain-step-text' + (isModified('positiveSchema') ? ' modified' : '') + '" contenteditable="true" data-field="positiveSchema" data-schema="' + schema.id + '">' +
        escHtml(val('positiveSchema')) +
      '</div>';

    // Show YPSQ score if available
    if (ypsqData && SCHEMA_TO_YPSQ_NAME[schema.id]) {
      var ypsqName = SCHEMA_TO_YPSQ_NAME[schema.id];
      var ypsqScore = ypsqData.items[ypsqName];
      if (ypsqScore !== undefined) {
        html += '<span class="chain-positive-score">YPSQ: ' + ypsqScore.toFixed(1) + '</span>';
      }
      // Show top 2 YPSQ items
      var ypsqSchemaData = window._QDATA && window._QDATA.ypsq &&
        window._QDATA.ypsq.schemas.find(function(s) { return s.name === ypsqName; });
      if (ypsqSchemaData) {
        var ypsqTopItems = getTopItems('ypsq', ypsqSchemaData.items, 2);
        html += renderTopItems(ypsqTopItems, 'ypsq', '📌 המשפטים הבולטים:');
      }
    }
    html += '</div>';

    // Step 8: Corrective Response
    html += '<div class="chain-step">' +
      '<div class="chain-step-dot corrective"></div>' +
      '<div class="chain-step-label corrective">תגובה מתקנת</div>' +
      '<div class="chain-step-text' + (isModified('correctiveResponse') ? ' modified' : '') + '" contenteditable="true" data-field="correctiveResponse" data-schema="' + schema.id + '">' +
        escHtml(val('correctiveResponse')) +
      '</div>' +
    '</div>';

    // Step 9: Therapy Goal
    if (val('therapyGoal')) {
      html += '<div class="chain-step">' +
        '<div class="chain-step-dot goal"></div>' +
        '<div class="chain-step-label goal">יעד הבוגר הבריא</div>' +
        '<div class="chain-step-text' + (isModified('therapyGoal') ? ' modified' : '') + '" contenteditable="true" data-field="therapyGoal" data-schema="' + schema.id + '">' +
          escHtml(val('therapyGoal')) +
        '</div>' +
      '</div>';
    }

    // Therapist note for this schema
    var noteVal = getNote(name, schema.id);
    html += '<div class="chain-note">' +
      '<div class="chain-note-label">הערת מטפל</div>' +
      '<textarea class="chain-note-input" data-note-schema="' + schema.id + '" placeholder="הוסף הערה...">' +
        escHtml(noteVal) +
      '</textarea>' +
    '</div>';

    html += '</div></div>';
    return html;
  }

  function bindChainEvents() {
    // Editable fields - save on blur
    document.querySelectorAll('.chain-step-text[contenteditable="true"]').forEach(function(el) {
      el.addEventListener('blur', function() {
        var field = el.dataset.field;
        var schemaId = el.dataset.schema;
        var value = el.textContent.trim();
        setOverride(state.currentPatient, schemaId, field, value);
        // Update modified class
        var original = MAP.schemas.find(function(s) { return s.id === schemaId; });
        if (original && value !== original[field]) {
          el.classList.add('modified');
        } else {
          el.classList.remove('modified');
        }
      });
    });

    // Schema notes - save on blur
    document.querySelectorAll('.chain-note-input').forEach(function(el) {
      el.addEventListener('blur', function() {
        setNote(state.currentPatient, el.dataset.noteSchema, el.value);
      });
    });
  }

  // ── Notes Tab ──
  function renderNotes() {
    var noteVal = getNote(state.currentPatient, 'general');
    return '<div class="notes-container">' +
      '<div class="notes-title">הערות קליניות כלליות</div>' +
      '<textarea class="notes-textarea" id="general-notes" placeholder="הקלד הערות קליניות כלליות על המטופל...">' +
        escHtml(noteVal) +
      '</textarea>' +
      '<div class="notes-save-bar">' +
        '<button class="notes-save-btn" id="notes-save">שמירה</button>' +
        '<span class="notes-saved" id="notes-saved-msg">נשמר בהצלחה</span>' +
      '</div>' +
    '</div>';
  }

  function bindNotesEvents() {
    var saveBtn = document.getElementById('notes-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        var textarea = document.getElementById('general-notes');
        setNote(state.currentPatient, 'general', textarea.value);
        var msg = document.getElementById('notes-saved-msg');
        msg.classList.add('show');
        setTimeout(function() { msg.classList.remove('show'); }, 2000);
      });
    }
  }

})();
