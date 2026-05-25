document.addEventListener('DOMContentLoaded', () => {
  const data = window.QUESTIONNAIRE_DATA;
  if (!data) return;

  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxOVk-yQjgF1709ALH7gqetQvE3C6qnoQ5XwLiYw3llQtIiZZvbA4xQzb3z8tmi2yPHjA/exec';

  const app = document.getElementById('app');
  const state = { answers: {}, name: '' };

  data.questions.forEach(q => {
    q.number = q.number || q.num || q.id;
  });

  renderQuestionnaire();

  function renderQuestionnaire() {
    app.innerHTML = `
      <div class="q-header">
        <a href="index.html" class="back-link">&rarr; חזרה לכל השאלונים</a>
        <h1>${data.title}</h1>
        <p>${data.subtitle}</p>
      </div>
      <div class="progress-container">
        <div class="progress-info">
          <span id="progress-text">שאלה 0 מתוך ${data.totalItems}</span>
          <span id="progress-pct">0%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
      </div>
      <div class="container">
        <div class="instructions">
          ${data.instructions}
          <div class="scale-legend">
            <div class="scale-legend-title">סולם דירוג:</div>
            ${[1,2,3,4,5,6].map(v => `<div class="scale-legend-item"><strong>${v}</strong> = ${data.scaleLabels[v]}</div>`).join('')}
          </div>
        </div>
        <div class="name-section">
          <label>שם פרטי</label>
          <input type="text" class="name-input" id="patient-name" placeholder="הכניסו את שמכם הפרטי">
        </div>
        <div id="questions-container"></div>
        <div class="submit-section">
          <button class="submit-btn" id="submit-btn">שליחת השאלון</button>
        </div>
      </div>
    `;

    renderQuestions();
    document.getElementById('patient-name').addEventListener('input', e => { state.name = e.target.value; });
    document.getElementById('submit-btn').addEventListener('click', handleSubmit);
  }

  function renderQuestions() {
    const container = document.getElementById('questions-container');
    container.innerHTML = data.questions.map(q => {
      if (data.dualRating) {
        return renderDualQuestion(q);
      }
      return renderSingleQuestion(q);
    }).join('');
  }

  function renderScaleButtons(qNum, parentKey) {
    const pAttr = parentKey ? ` data-p="${parentKey}"` : '';
    const handler = parentKey ? 'window._selectDual(this)' : 'window._select(this)';
    return `
      <div class="scale-with-labels">
        ${[1,2,3,4,5,6].map(v => `
          <div class="scale-item">
            <button class="scale-btn" data-q="${qNum}"${pAttr} data-v="${v}" onclick="${handler}">${v}</button>
            <span class="scale-item-label">${data.scaleLabels[v]}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderSingleQuestion(q) {
    return `
      <div class="question-card" id="q-${q.number}">
        <div class="question-number">${q.number}</div>
        <div class="question-text">${q.text}</div>
        ${renderScaleButtons(q.number)}
      </div>
    `;
  }

  function renderDualQuestion(q) {
    const labels = data.dualRatingLabels;
    return `
      <div class="question-card" id="q-${q.number}">
        <div class="question-number">${q.number}</div>
        <div class="question-text">${q.text}</div>
        <div class="dual-rating-section">
          <div class="dual-group">
            <div class="dual-label"><span class="icon">&#128105;</span> ${labels.first}</div>
            ${renderScaleButtons(q.number, 'first')}
          </div>
          <div class="dual-group">
            <div class="dual-label"><span class="icon">&#128104;</span> ${labels.second}</div>
            ${renderScaleButtons(q.number, 'second')}
          </div>
        </div>
      </div>
    `;
  }

  window._select = function(btn) {
    const qNum = parseInt(btn.dataset.q);
    const val = parseInt(btn.dataset.v);
    state.answers[qNum] = val;
    const card = btn.closest('.question-card');
    card.querySelectorAll('.scale-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    card.classList.add('answered');
    card.classList.remove('unanswered-highlight');
    updateProgress();
  };

  window._selectDual = function(btn) {
    const qNum = parseInt(btn.dataset.q);
    const parent = btn.dataset.p;
    const val = parseInt(btn.dataset.v);
    if (!state.answers[qNum]) state.answers[qNum] = {};
    state.answers[qNum][parent] = val;
    const group = btn.closest('.dual-group');
    group.querySelectorAll('.scale-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    const card = btn.closest('.question-card');
    if (state.answers[qNum].first && state.answers[qNum].second) {
      card.classList.add('answered');
      card.classList.remove('unanswered-highlight');
    }
    updateProgress();
  };

  function getAnsweredCount() {
    let count = 0;
    for (const qNum of data.questions.map(q => q.number)) {
      if (data.dualRating) {
        if (state.answers[qNum] && state.answers[qNum].first && state.answers[qNum].second) count++;
      } else {
        if (state.answers[qNum]) count++;
      }
    }
    return count;
  }

  function updateProgress() {
    const answered = getAnsweredCount();
    const pct = Math.round((answered / data.totalItems) * 100);
    document.getElementById('progress-text').textContent = `שאלה ${answered} מתוך ${data.totalItems}`;
    document.getElementById('progress-pct').textContent = `${pct}%`;
    document.getElementById('progress-fill').style.width = `${pct}%`;
  }

  function handleSubmit() {
    if (!state.name.trim()) {
      document.getElementById('patient-name').focus();
      document.getElementById('patient-name').style.borderColor = '#e74c3c';
      return;
    }

    const unanswered = [];
    for (const q of data.questions) {
      if (data.dualRating) {
        if (!state.answers[q.number] || !state.answers[q.number].first || !state.answers[q.number].second) {
          unanswered.push(q.number);
        }
      } else {
        if (!state.answers[q.number]) unanswered.push(q.number);
      }
    }

    if (unanswered.length > 0) {
      const firstMissing = document.getElementById(`q-${unanswered[0]}`);
      unanswered.slice(0, 5).forEach(num => {
        const el = document.getElementById(`q-${num}`);
        if (el) el.classList.add('unanswered-highlight');
      });
      if (firstMissing) firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const results = calculateResults();
    renderResults(results);
    sendResults(results);
  }

  function sendResults(results) {
    if (APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') return;
    const payload = {
      name: state.name,
      questionnaire: data.title,
      date: new Date().toISOString(),
      results: results
    };
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(err => console.log('Send error:', err));
  }

  function calculateResults() {
    const scoring = data.scoring;

    if (scoring.method === 'countHigh') {
      return data.schemas.map(schema => {
        const highCount = schema.items.filter(i => state.answers[i] >= scoring.highThreshold).length;
        const isActive = highCount >= scoring.activeThreshold;
        return {
          name: schema.name,
          description: schema.description,
          score: highCount,
          maxScore: schema.items.length,
          status: isActive ? 'active' : 'inactive',
          statusText: isActive ? 'אקטיבית (משמעותית)' : 'לא אקטיבית'
        };
      });
    }

    if (scoring.method === 'average' && data.dualRating) {
      return data.schemas.map(schema => {
        const firstScores = schema.items.map(i => state.answers[i].first);
        const secondScores = schema.items.map(i => state.answers[i].second);
        let firstAvg = firstScores.reduce((a, b) => a + b, 0) / firstScores.length;
        let secondAvg = secondScores.reduce((a, b) => a + b, 0) / secondScores.length;
        if (schema.reversed) {
          firstAvg = 7 - firstAvg;
          secondAvg = 7 - secondAvg;
        }
        return {
          name: schema.name,
          description: schema.description || '',
          firstScore: Math.round(firstAvg * 100) / 100,
          secondScore: Math.round(secondAvg * 100) / 100,
          firstLabel: data.dualRatingLabels.first,
          secondLabel: data.dualRatingLabels.second
        };
      });
    }

    if (scoring.method === 'average') {
      const reverseItems = scoring.reverseItems || [];
      return data.schemas.map(schema => {
        const scores = schema.items.map(i => {
          let score = state.answers[i];
          if (reverseItems.includes(i)) score = 7 - score;
          return score;
        });
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const rounded = Math.round(avg * 100) / 100;

        let level = 'average';
        let levelText = 'ממוצע';
        if (schema.norms) {
          if (rounded >= schema.norms.very_high) { level = 'high'; levelText = 'גבוה מאוד'; }
          else if (rounded >= schema.norms.high) { level = 'high'; levelText = 'גבוה'; }
          else if (rounded >= schema.norms.moderate) { level = 'moderate'; levelText = 'בינוני'; }
          else { level = 'low'; levelText = 'ממוצע / נמוך'; }
        }

        return {
          name: schema.name,
          nameEn: schema.nameEn || '',
          description: schema.description || '',
          category: schema.category || '',
          score: rounded,
          maxScore: 6,
          level,
          levelText
        };
      });
    }
  }

  function renderResults(results) {
    document.querySelector('.container').style.display = 'none';
    document.querySelector('.progress-container').style.display = 'none';

    const resultsDiv = document.createElement('div');
    resultsDiv.className = 'results-container';

    let html = `
      <div class="container">
        <div class="results-header">
          <h2>תוצאות: ${data.title}</h2>
          <p>${state.name} &bull; ${new Date().toLocaleDateString('he-IL')}</p>
        </div>
    `;

    if (data.scoring.method === 'countHigh') {
      html += renderCountHighResults(results);
    } else if (data.dualRating) {
      html += renderDualResults(results);
    } else {
      html += renderAverageResults(results);
    }

    html += `
        <div class="submit-section">
          <button class="submit-btn" onclick="window.print()">הדפסת התוצאות</button>
        </div>
      </div>
    `;

    resultsDiv.innerHTML = html;
    app.appendChild(resultsDiv);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderCountHighResults(results) {
    results.sort((a, b) => b.score - a.score);
    const active = results.filter(r => r.status === 'active');
    const inactive = results.filter(r => r.status === 'inactive');
    let html = '';

    // Graph overview
    html += renderBarChart(results.map(r => ({
      label: r.name,
      value: r.score,
      max: r.maxScore,
      color: r.status === 'active' ? '#e74c3c' : '#7a9e8e'
    })));

    if (active.length > 0) {
      html += '<div class="category-header">סכמות אקטיביות (משמעותיות)</div>';
      html += active.map(r => `
        <div class="result-card active">
          <div class="result-info">
            <div class="result-name">${r.name}</div>
            <div class="result-desc">${r.description}</div>
          </div>
          <div class="result-score">
            <div class="score-value score-active">${r.score}/${r.maxScore}</div>
            <div class="score-label">תשובות גבוהות</div>
          </div>
        </div>
      `).join('');
    }

    if (inactive.length > 0) {
      html += '<div class="category-header">סכמות לא אקטיביות</div>';
      html += inactive.map(r => `
        <div class="result-card inactive">
          <div class="result-info">
            <div class="result-name">${r.name}</div>
            <div class="result-desc">${r.description}</div>
          </div>
          <div class="result-score">
            <div class="score-value score-inactive">${r.score}/${r.maxScore}</div>
            <div class="score-label">תשובות גבוהות</div>
          </div>
        </div>
      `).join('');
    }

    return html;
  }

  function renderDualResults(results) {
    results.sort((a, b) => ((b.firstScore + b.secondScore) / 2) - ((a.firstScore + a.secondScore) / 2));

    // Graph overview
    let html = renderDualBarChart(results);

    html += results.map(r => `
      <div class="result-card">
        <div class="result-info">
          <div class="result-name">${r.name}</div>
          <div class="result-desc">${r.description}</div>
        </div>
        <div class="dual-result">
          <div class="result-parent">
            <div class="parent-label">${r.firstLabel}</div>
            <div class="parent-score" style="color: ${getScoreColor(r.firstScore)}">${r.firstScore.toFixed(1)}</div>
          </div>
          <div class="result-parent">
            <div class="parent-label">${r.secondLabel}</div>
            <div class="parent-score" style="color: ${getScoreColor(r.secondScore)}">${r.secondScore.toFixed(1)}</div>
          </div>
        </div>
      </div>
    `).join('');
    return html;
  }

  function renderAverageResults(results) {
    results.sort((a, b) => b.score - a.score);

    // Graph overview
    let html = renderBarChart(results.map(r => ({
      label: r.name,
      value: r.score,
      max: r.maxScore,
      color: r.level === 'high' ? '#e74c3c' : r.level === 'moderate' ? '#f39c12' : '#7a9e8e'
    })));

    for (const r of results) {
      const barWidth = Math.round((r.score / r.maxScore) * 100);
      const barColor = r.level === 'high' ? '#e74c3c' : r.level === 'moderate' ? '#f39c12' : '#7a9e8e';
      html += `
        <div class="result-card ${r.level}">
          <div class="result-info">
            <div class="result-name">${r.name}</div>
            <div class="result-desc">${r.description}</div>
            <div class="score-bar-container">
              <div class="score-bar-fill" style="width: ${barWidth}%; background: ${barColor};"></div>
            </div>
          </div>
          <div class="result-score">
            <div class="score-value score-${r.level}">${r.score.toFixed(2)}</div>
            <div class="score-label">${r.levelText}</div>
          </div>
        </div>
      `;
    }

    return html;
  }

  function renderBarChart(items) {
    const maxVal = Math.max(...items.map(i => i.max));
    return `
      <div class="chart-card">
        <div class="chart-title">סקירה גרפית</div>
        <div class="chart-container">
          ${items.map(item => {
            const pct = Math.round((item.value / maxVal) * 100);
            return `
              <div class="chart-row">
                <div class="chart-label">${item.label}</div>
                <div class="chart-bar-bg">
                  <div class="chart-bar-fill" style="width: ${pct}%; background: ${item.color};"></div>
                </div>
                <div class="chart-value" style="color: ${item.color};">${typeof item.value === 'number' && item.value % 1 !== 0 ? item.value.toFixed(1) : item.value}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderDualBarChart(results) {
    return `
      <div class="chart-card">
        <div class="chart-title">סקירה גרפית</div>
        <div class="chart-legend">
          <span class="chart-legend-item"><span class="chart-legend-dot" style="background:#e67e22;"></span>${results[0].firstLabel}</span>
          <span class="chart-legend-item"><span class="chart-legend-dot" style="background:#5b7a6e;"></span>${results[0].secondLabel}</span>
        </div>
        <div class="chart-container">
          ${results.map(r => `
            <div class="chart-row">
              <div class="chart-label">${r.name}</div>
              <div class="chart-dual-bars">
                <div class="chart-bar-bg">
                  <div class="chart-bar-fill" style="width: ${Math.round((r.firstScore / 6) * 100)}%; background: #e67e22;"></div>
                </div>
                <div class="chart-bar-bg">
                  <div class="chart-bar-fill" style="width: ${Math.round((r.secondScore / 6) * 100)}%; background: #5b7a6e;"></div>
                </div>
              </div>
              <div class="chart-value">${r.firstScore.toFixed(1)} | ${r.secondScore.toFixed(1)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function getScoreColor(score) {
    if (score >= 4.5) return '#e74c3c';
    if (score >= 3.5) return '#f39c12';
    if (score >= 2.5) return '#e67e22';
    return '#7a9e8e';
  }
});
