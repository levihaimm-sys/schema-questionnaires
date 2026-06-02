// ============================================
// Google Apps Script - Schema Questionnaire Backend
// ============================================
// מבנה גיליונות: גיליון אחד לכל שאלון (לא לכל מטופל)
// כל גיליון מכיל: תאריך, שם, [ציוני סכמות...]
// תשובות גולמיות: גיליון נפרד לכל שאלון (שם השאלון + " - תשובות")
//
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
  // Validate patient name - reject if empty or matches questionnaire title
  if (!data.name || data.name.trim() === '' || data.name === data.questionnaire) {
    throw new Error('שם מטופל לא תקין: ' + (data.name || '(ריק)'));
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  // Sheet name = questionnaire name only (shared across all patients)
  const sheetName = data.questionnaire;
  let sheet = ss.getSheetByName(sheetName);

  // Create sheet if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (data.results[0] && data.results[0].firstScore !== undefined) {
      // Dual rating - headers: תאריך, שם, schema1-label1, schema2-label1, ..., schema1-label2, schema2-label2, ...
      const headers = ['תאריך', 'שם'];
      data.results.forEach(r => headers.push(r.name + ' - ' + r.firstLabel));
      data.results.forEach(r => headers.push(r.name + ' - ' + r.secondLabel));
      sheet.appendRow(headers);
    } else {
      const headers = ['תאריך', 'שם'];
      data.results.forEach(r => headers.push(r.name));
      sheet.appendRow(headers);
    }
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold');
    sheet.setRightToLeft(true);
  }

  // Add data row: [date, name, scores...]
  const row = [new Date().toLocaleDateString('he-IL'), data.name];

  if (data.results[0] && data.results[0].firstScore !== undefined) {
    data.results.forEach(r => row.push(r.firstScore));
    data.results.forEach(r => row.push(r.secondScore));
  } else {
    data.results.forEach(r => row.push(r.score));
  }

  sheet.appendRow(row);

  // Save raw answers in a companion answers sheet
  if (data.answers) {
    const answersSheetName = data.questionnaire + ' - תשובות';
    let answersSheet = ss.getSheetByName(answersSheetName);
    if (!answersSheet) {
      answersSheet = ss.insertSheet(answersSheetName);
      answersSheet.appendRow(['תאריך', 'שם', 'answers_json']);
      answersSheet.getRange(1, 1, 1, 3).setFontWeight('bold');
      answersSheet.setRightToLeft(true);
    }
    answersSheet.appendRow([
      new Date().toLocaleDateString('he-IL'),
      data.name,
      JSON.stringify(data.answers)
    ]);
  }
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
    const sheetName = sheet.getName();
    // Skip answer sheets
    if (sheetName.endsWith(' - תשובות')) return;

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 2) return;

    // Verify this is a questionnaire sheet (has "שם" in column 2 header)
    const header2 = sheet.getRange(1, 2).getValue();
    if (header2 !== 'שם') return;

    // Read name + date columns for all data rows
    const dataRows = sheet.getRange(2, 1, lastRow - 1, 2).getValues(); // [date, name]

    // Track per-patient: latest date + entry count
    const patientInfo = {};
    dataRows.forEach(row => {
      const pName = row[1] ? row[1].toString().trim() : '';
      if (!pName) return;
      if (!patientInfo[pName]) {
        patientInfo[pName] = { lastDate: '', entries: 0 };
      }
      patientInfo[pName].entries++;
      patientInfo[pName].lastDate = row[0] ? row[0].toString() : '';
    });

    // Add to patients map
    Object.keys(patientInfo).forEach(pName => {
      if (!patients[pName]) {
        patients[pName] = { questionnaires: [] };
      }
      patients[pName].questionnaires.push({
        name: sheetName,
        lastDate: patientInfo[pName].lastDate,
        entries: patientInfo[pName].entries
      });
    });
  });

  return { patients: patients };
}

function getPatientData(patientName) {
  if (!patientName) return { error: 'missing patient name' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets();
  const data = { name: patientName, questionnaires: {} };

  sheets.forEach(sheet => {
    const sheetName = sheet.getName();
    if (sheetName.endsWith(' - תשובות')) return;

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 2) return;

    // Verify questionnaire sheet
    const header2 = sheet.getRange(1, 2).getValue();
    if (header2 !== 'שם') return;

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    // Find latest row for this patient (search from bottom up)
    const nameCol = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    let patientRowIdx = -1;
    for (let i = nameCol.length - 1; i >= 0; i--) {
      if (nameCol[i][0] && nameCol[i][0].toString().trim() === patientName) {
        patientRowIdx = i + 2; // row 1 = header, data starts at row 2
        break;
      }
    }

    if (patientRowIdx < 0) return;

    const latestRow = sheet.getRange(patientRowIdx, 1, 1, lastCol).getValues()[0];

    data.questionnaires[sheetName] = {
      headers: headers,
      scores: latestRow,
      date: latestRow[0] ? latestRow[0].toString() : ''
    };

    // Get raw answers from companion answers sheet
    const answersSheetName = sheetName + ' - תשובות';
    const answersSheet = ss.getSheetByName(answersSheetName);
    if (answersSheet && answersSheet.getLastRow() >= 2) {
      const aLastRow = answersSheet.getLastRow();
      const aNameCol = answersSheet.getRange(2, 2, aLastRow - 1, 1).getValues();
      let aRowIdx = -1;
      for (let i = aNameCol.length - 1; i >= 0; i--) {
        if (aNameCol[i][0] && aNameCol[i][0].toString().trim() === patientName) {
          aRowIdx = i + 2;
          break;
        }
      }
      if (aRowIdx >= 0) {
        const answersJson = answersSheet.getRange(aRowIdx, 3).getValue();
        if (answersJson) {
          try {
            data.questionnaires[sheetName].answers = JSON.parse(answersJson);
          } catch(e) { /* ignore parse errors */ }
        }
      }
    }
  });

  return data;
}
