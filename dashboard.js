(function() {
  'use strict';

  // ════════════════════════════════════════════
  // CONFIG
  // ════════════════════════════════════════════
  const CONFIG = {
    appsScriptUrl: 'https://script.google.com/macros/s/AKfycbxOUe28vIRZuv4bkOb-E9QvIE1_YMczw-zyjSCMrwbz1zO7PBRzLcY1uzNaH9arqXyhgQ/exec',
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
    notes: {}
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
    if (state.authed) {
      state.view = 'patients';
      fetchPatients();
    }
  }

  function saveOverrides() { localStorage.setItem('dash_overrides', JSON.stringify(state.overrides)); }
  function saveNotes() { localStorage.setItem('dash_notes', JSON.stringify(state.notes)); }

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
  function fetchJsonp(url) {
    return new Promise(function(resolve, reject) {
      var cb = '_dcb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      var script = document.createElement('script');
      window[cb] = function(data) {
        delete window[cb];
        if (script.parentNode) script.parentNode.removeChild(script);
        resolve(data);
      };
      script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
      script.onerror = function() {
        delete window[cb];
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(new Error('JSONP failed'));
      };
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

    try {
      var res = await fetch(url);
      return await res.json();
    } catch(e) {
      return await fetchJsonp(url);
    }
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
        state.error = 'לא ניתן לטעון נתונים. ודא שעדכנת את הסקריפט בגוגל ופרסמת מחדש.';
      }
      state.patients = {};
    }
    state.loading = false;
    render();
  }

  async function selectPatient(name) {
    state.currentPatient = name;
    state.currentTab = 'overview';
    state.view = 'detail';
    state.loading = true;
    state.error = '';
    render();
    try {
      var data = await fetchData('patient', { name: name });
      if (data.error) throw new Error(data.error);
      state.patientData = data;
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

  // Parse patient data from sheet into structured scores
  function parseQData(qName, raw) {
    if (!raw || !raw.headers || !raw.scores) return null;
    var type = getQType(qName);
    var headers = raw.headers.slice(1); // remove date column
    var scores = raw.scores.slice(1);
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
    var names = Object.keys(state.patients);
    var filtered = state.search ?
      names.filter(function(n) { return n.includes(state.search); }) : names;

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
          '<input type="text" class="dash-search" id="patient-search" placeholder="חיפוש מטופל..." value="' + escHtml(state.search) + '">' +
        '</div>';

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
        html += buildPatientCard(name);
      });
      html += '</div>';
    }

    html += '</div>';
    app.innerHTML = html;

    // Event listeners
    document.getElementById('btn-refresh').addEventListener('click', fetchPatients);
    document.getElementById('btn-logout').addEventListener('click', logout);
    document.getElementById('patient-search').addEventListener('input', function(e) {
      state.search = e.target.value;
      renderPatients();
      var el = document.getElementById('patient-search');
      if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
    });

    // Patient card clicks
    document.querySelectorAll('.patient-card').forEach(function(card) {
      card.addEventListener('click', function() {
        selectPatient(card.dataset.name);
      });
    });
  }

  function buildPatientCard(name) {
    var patient = state.patients[name];
    var qTypes = ['YPI', 'YSQ', 'SMI', 'YPSQ'];
    var badges = '';
    qTypes.forEach(function(type) {
      var found = patient.questionnaires.find(function(q) { return q.name.includes(type); });
      badges += found ?
        '<span class="patient-badge done">' + type + ' &#10003;</span>' :
        '<span class="patient-badge missing">' + type + '</span>';
    });

    var dates = patient.questionnaires.map(function(q) { return q.lastDate; }).filter(Boolean);
    var lastDate = dates.length > 0 ? dates[dates.length - 1] : '';

    return '<div class="patient-card" data-name="' + escHtml(name) + '">' +
      '<div class="patient-name">' + escHtml(name) + '</div>' +
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
        case 'overview': html += renderOverview(); break;
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
        renderDetail();
      });
    });

    // Tab-specific event binding
    if (!state.loading && !state.error) {
      if (state.currentTab === 'chain') bindChainEvents();
      if (state.currentTab === 'notes') bindNotesEvents();
    }
  }

  function goBack() {
    state.view = 'patients';
    state.patientData = null;
    state.error = '';
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
      html += '<div class="overview-q-title">' + labels[type] + '</div>';

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
      } else {
        keys.sort(function(a, b) { return data.items[b] - data.items[a]; });
      }

      keys.forEach(function(name) {
        if (type === 'ypi') {
          var scores = data.items[name];
          var maxScore = Math.max(scores.mother, scores.father);
          html += '<div class="overview-row">' +
            '<span class="overview-row-name">' + escHtml(name) + '</span>' +
            '<div class="overview-dual-vals">' +
              '<span class="overview-dual-val mom" title="אמא">' + scores.mother.toFixed(1) + '</span>' +
              '<span class="overview-dual-val dad" title="אבא">' + scores.father.toFixed(1) + '</span>' +
            '</div>' +
          '</div>';
        } else {
          var score = data.items[name];
          var max = type === 'ysq' ? 5 : 6;
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

    // Group schemas by domain
    var domains = MAP.domains;
    domains.forEach(function(domain) {
      var domainSchemas = MAP.schemas.filter(function(s) { return s.domain === domain.id; });
      // Filter to schemas that have YSQ data
      var activeSchemas = domainSchemas.filter(function(s) {
        return ysqData.items[s.name] !== undefined;
      });
      if (activeSchemas.length === 0) return;

      // Sort by score descending
      activeSchemas.sort(function(a, b) {
        return (ysqData.items[b.name] || 0) - (ysqData.items[a.name] || 0);
      });

      html += '<div class="chain-domain-header">' + escHtml(domain.name) + ' (' + domain.nameEn + ')</div>';
      html += '<div class="chain-cards">';

      activeSchemas.forEach(function(schema) {
        html += buildChainCard(schema, ysqData, smiData, ypsqData, ypiData);
      });

      html += '</div>';
    });

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
      return getOverride(name, schema.id, field) || schema[field];
    }
    function isModified(field) {
      return !!getOverride(name, schema.id, field);
    }

    var html = '<div class="chain-card" data-schema="' + schema.id + '">' +
      '<div class="chain-card-header ' + levelClass + '">' +
        '<div class="chain-schema-info">' +
          '<div class="chain-schema-name">' + escHtml(schema.name) + '</div>' +
          '<div class="chain-schema-name-en">' + escHtml(schema.nameEn) + '</div>' +
        '</div>' +
        '<div class="chain-schema-score">' +
          '<div class="chain-score-value ' + levelClass + '">' + ysqScore + '/5</div>' +
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

    // Step 3: Related Modes
    html += '<div class="chain-step">' +
      '<div class="chain-step-dot modes"></div>' +
      '<div class="chain-step-label modes">מודים קשורים</div>' +
      '<div class="chain-modes">';

    schema.relatedModes.forEach(function(modeCode) {
      var mode = MAP.modes[modeCode];
      if (!mode) return;
      var modeScore = smiData ? smiData.items[mode.name] : null;
      html += '<span class="chain-mode-badge ' + mode.type + '">' +
        escHtml(mode.name) +
        (modeScore !== null && modeScore !== undefined ?
          ' <span class="chain-mode-score">' + modeScore.toFixed(1) + '</span>' : '') +
      '</span>';
    });

    html += '</div></div>';

    // Step 4: Positive Schema
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
    }
    html += '</div>';

    // Step 5: Corrective Response
    html += '<div class="chain-step">' +
      '<div class="chain-step-dot corrective"></div>' +
      '<div class="chain-step-label corrective">תגובה מתקנת</div>' +
      '<div class="chain-step-text' + (isModified('correctiveResponse') ? ' modified' : '') + '" contenteditable="true" data-field="correctiveResponse" data-schema="' + schema.id + '">' +
        escHtml(val('correctiveResponse')) +
      '</div>' +
    '</div>';

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
