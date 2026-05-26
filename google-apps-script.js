// ============================================
// Google Apps Script - Schema Questionnaire Backend
// ============================================
// הוראות התקנה:
// 1. לך ל: https://script.google.com
// 2. צור פרויקט חדש (New Project)
// 3. מחק את הקוד הקיים והדבק את כל הקוד הזה
// 4. שנה את SPREADSHEET_ID למזהה של הגיליון שלך
// 5. שנה את EMAIL_TO למייל שלך
// 6. לחץ Deploy > New deployment > Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 7. העתק את ה-URL שקיבלת והדבק ב-app.js (APPS_SCRIPT_URL)
// ============================================

const SPREADSHEET_ID = '1po-SxGqhfDthjp1Jja2ZYcAjIDAj5LPMWNTnodFPNGw';
const EMAIL_TO = 'levihaimm@gmail.com';
const DASHBOARD_TOKEN = 'schema2024'; // סיסמת כניסה ללוח המטפל

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Save to Google Sheets
    saveToSheet(data);

    // Send email
    sendEmail(data);

    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function saveToSheet(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetName = data.name + ' - ' + data.questionnaire;
  let sheet = ss.getSheetByName(sheetName);

  // Create sheet if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // Add headers
    const headers = ['תאריך'];
    data.results.forEach(r => headers.push(r.name));
    if (data.results[0] && data.results[0].firstScore !== undefined) {
      // Dual rating - add second parent columns
      const headers2 = ['תאריך'];
      data.results.forEach(r => headers2.push(r.name + ' - ' + r.firstLabel));
      data.results.forEach(r => headers2.push(r.name + ' - ' + r.secondLabel));
      sheet.appendRow(headers2);
    } else {
      sheet.appendRow(headers);
    }
    // Bold headers
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold');
    sheet.setRightToLeft(true);
  }

  // Add data row
  const row = [new Date().toLocaleDateString('he-IL')];

  if (data.results[0] && data.results[0].firstScore !== undefined) {
    // Dual rating
    data.results.forEach(r => row.push(r.firstScore));
    data.results.forEach(r => row.push(r.secondScore));
  } else {
    data.results.forEach(r => row.push(r.score));
  }

  sheet.appendRow(row);
}

function sendEmail(data) {
  const name = data.name;
  const questionnaire = data.questionnaire;
  const date = new Date().toLocaleDateString('he-IL');

  // Build scores table
  let tableHtml = '<table dir="rtl" style="border-collapse:collapse;font-family:Arial,sans-serif;width:100%">';
  tableHtml += '<tr style="background:#5b7a6e;color:white"><th style="padding:10px;text-align:right">שם</th>';

  if (data.results[0] && data.results[0].firstScore !== undefined) {
    tableHtml += `<th style="padding:10px">${data.results[0].firstLabel}</th>`;
    tableHtml += `<th style="padding:10px">${data.results[0].secondLabel}</th></tr>`;
    data.results.forEach((r, i) => {
      const bg = i % 2 === 0 ? '#f9f7f5' : 'white';
      tableHtml += `<tr style="background:${bg}">`;
      tableHtml += `<td style="padding:8px 10px;border-bottom:1px solid #e8e0d8;font-weight:600">${r.name}</td>`;
      tableHtml += `<td style="padding:8px 10px;border-bottom:1px solid #e8e0d8;text-align:center;color:${getColorForScore(r.firstScore)};font-weight:700">${r.firstScore}</td>`;
      tableHtml += `<td style="padding:8px 10px;border-bottom:1px solid #e8e0d8;text-align:center;color:${getColorForScore(r.secondScore)};font-weight:700">${r.secondScore}</td>`;
      tableHtml += '</tr>';
    });
  } else {
    tableHtml += '<th style="padding:10px">ציון</th>';
    if (data.results[0].statusText) {
      tableHtml += '<th style="padding:10px">סטטוס</th>';
    } else if (data.results[0].levelText) {
      tableHtml += '<th style="padding:10px">רמה</th>';
    }
    tableHtml += '</tr>';

    data.results.forEach((r, i) => {
      const bg = i % 2 === 0 ? '#f9f7f5' : 'white';
      const scoreColor = r.status === 'active' || r.level === 'high' ? '#e74c3c' :
                         r.level === 'moderate' ? '#f39c12' : '#5b7a6e';
      tableHtml += `<tr style="background:${bg}">`;
      tableHtml += `<td style="padding:8px 10px;border-bottom:1px solid #e8e0d8;font-weight:600">${r.name}</td>`;
      tableHtml += `<td style="padding:8px 10px;border-bottom:1px solid #e8e0d8;text-align:center;color:${scoreColor};font-weight:700">${r.score}${r.maxScore ? '/' + r.maxScore : ''}</td>`;
      if (r.statusText) {
        tableHtml += `<td style="padding:8px 10px;border-bottom:1px solid #e8e0d8;text-align:center">${r.statusText}</td>`;
      } else if (r.levelText) {
        tableHtml += `<td style="padding:8px 10px;border-bottom:1px solid #e8e0d8;text-align:center">${r.levelText}</td>`;
      }
      tableHtml += '</tr>';
    });
  }
  tableHtml += '</table>';

  // Build active schemas/modes explanation section
  let activeHtml = '';
  const activeResults = data.results.filter(r => {
    if (r.status === 'active') return true;
    if (r.level === 'high') return true;
    if (r.level === 'moderate') return true;
    if (r.firstScore !== undefined) return (r.firstScore >= 3.5 || r.secondScore >= 3.5);
    return false;
  });

  if (activeResults.length > 0) {
    activeHtml = '<div style="margin-top:24px;padding-top:20px;border-top:2px solid #e8e0d8">';
    activeHtml += '<h3 style="color:#5b7a6e;font-size:16px;margin:0 0 16px">ממצאים בולטים והסבר:</h3>';

    activeResults.forEach(r => {
      const explanation = r.explanation || '';
      if (!explanation) return;

      let scoreText = '';
      let borderColor = '#f39c12';
      if (r.status === 'active') {
        scoreText = `${r.score}/${r.maxScore} תשובות גבוהות – אקטיבית`;
        borderColor = '#e74c3c';
      } else if (r.level === 'high') {
        scoreText = `ציון ${r.score} – גבוה`;
        borderColor = '#e74c3c';
      } else if (r.level === 'moderate') {
        scoreText = `ציון ${r.score} – בינוני`;
        borderColor = '#f39c12';
      } else if (r.firstScore !== undefined) {
        const parts = [];
        if (r.firstScore >= 3.5) parts.push(`${r.firstLabel}: ${r.firstScore}`);
        if (r.secondScore >= 3.5) parts.push(`${r.secondLabel}: ${r.secondScore}`);
        scoreText = parts.join(' | ');
        borderColor = '#e67e22';
      }

      activeHtml += `
        <div style="border-right:4px solid ${borderColor};padding:12px 16px;margin-bottom:12px;background:#f9f7f5;border-radius:0 8px 8px 0">
          <div style="font-weight:700;font-size:15px;color:#3d3530;margin-bottom:4px">${r.name}</div>
          <div style="font-size:12px;color:${borderColor};font-weight:600;margin-bottom:8px">${scoreText}</div>
          <div style="font-size:13px;color:#5a504a;line-height:1.7">${explanation}</div>
        </div>
      `;
    });

    activeHtml += '</div>';
  }

  const subject = `תוצאות שאלון ${questionnaire} - ${name}`;
  const htmlBody = `
    <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#5b7a6e,#7a9e8e);padding:20px;border-radius:12px 12px 0 0;color:white;text-align:center">
        <h2 style="margin:0">תוצאות שאלון ${questionnaire}</h2>
        <p style="margin:6px 0 0;opacity:0.9">${name} &bull; ${date}</p>
      </div>
      <div style="background:white;padding:20px;border-radius:0 0 12px 12px;border:1px solid #e8e0d8;border-top:none">
        ${tableHtml}
        ${activeHtml}
      </div>
    </div>
  `;

  MailApp.sendEmail({
    to: EMAIL_TO,
    subject: subject,
    htmlBody: htmlBody
  });
}

function getColorForScore(score) {
  if (score >= 4.5) return '#e74c3c';
  if (score >= 3.5) return '#f39c12';
  return '#5b7a6e';
}

// ============================================
// Dashboard API – קריאת נתונים ללוח המטפל
// ============================================

function doGet(e) {
  const params = e ? e.parameter : {};
  const action = params.action || 'status';
  const token = params.token || '';
  const callback = params.callback || '';

  // Auth check for data actions
  if (action !== 'status' && token !== DASHBOARD_TOKEN) {
    return respond({ error: 'unauthorized' }, callback);
  }

  let result;
  switch (action) {
    case 'patients':
      result = getPatientsList();
      break;
    case 'patient':
      result = getPatientData(params.name || '');
      break;
    default:
      result = { status: 'ok', message: 'Schema Questionnaire Backend is running' };
  }

  return respond(result, callback);
}

function respond(data, callback) {
  const json = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function getPatientsList() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets();
  const patients = {};

  sheets.forEach(sheet => {
    const name = sheet.getName();
    const sepIdx = name.indexOf(' - ');
    if (sepIdx < 0) return;

    const patientName = name.substring(0, sepIdx).trim();
    const questionnaire = name.substring(sepIdx + 3).trim();

    if (!patients[patientName]) {
      patients[patientName] = { questionnaires: [] };
    }

    const lastRow = sheet.getLastRow();
    let lastDate = '';
    if (lastRow > 1) {
      const val = sheet.getRange(lastRow, 1).getValue();
      lastDate = val ? val.toString() : '';
    }

    patients[patientName].questionnaires.push({
      name: questionnaire,
      lastDate: lastDate,
      entries: Math.max(0, lastRow - 1)
    });
  });

  return { patients: patients };
}

function getPatientData(patientName) {
  if (!patientName) return { error: 'missing patient name' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets();
  const data = { name: patientName, questionnaires: {} };
  const prefix = patientName + ' - ';

  sheets.forEach(sheet => {
    const name = sheet.getName();
    if (!name.startsWith(prefix)) return;

    const questionnaire = name.substring(prefix.length).trim();
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return;

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const latestRow = sheet.getRange(lastRow, 1, 1, lastCol).getValues()[0];

    data.questionnaires[questionnaire] = {
      headers: headers,
      scores: latestRow,
      date: latestRow[0] ? latestRow[0].toString() : ''
    };
  });

  return data;
}
