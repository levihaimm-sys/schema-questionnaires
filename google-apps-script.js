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

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; // שנה לID של הגיליון שלך
const EMAIL_TO = 'levihaimm@gmail.com';

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

  let resultsHtml = '<table dir="rtl" style="border-collapse:collapse;font-family:Arial,sans-serif;width:100%">';
  resultsHtml += '<tr style="background:#5b7a6e;color:white"><th style="padding:10px;text-align:right">שם</th>';

  if (data.results[0] && data.results[0].firstScore !== undefined) {
    resultsHtml += `<th style="padding:10px">${data.results[0].firstLabel}</th>`;
    resultsHtml += `<th style="padding:10px">${data.results[0].secondLabel}</th></tr>`;
    data.results.forEach((r, i) => {
      const bg = i % 2 === 0 ? '#f9f7f5' : 'white';
      resultsHtml += `<tr style="background:${bg}">`;
      resultsHtml += `<td style="padding:8px 10px;border-bottom:1px solid #e8e0d8;font-weight:600">${r.name}</td>`;
      resultsHtml += `<td style="padding:8px 10px;border-bottom:1px solid #e8e0d8;text-align:center;color:${getColorForScore(r.firstScore)};font-weight:700">${r.firstScore}</td>`;
      resultsHtml += `<td style="padding:8px 10px;border-bottom:1px solid #e8e0d8;text-align:center;color:${getColorForScore(r.secondScore)};font-weight:700">${r.secondScore}</td>`;
      resultsHtml += '</tr>';
    });
  } else {
    resultsHtml += '<th style="padding:10px">ציון</th>';
    if (data.results[0].statusText) {
      resultsHtml += '<th style="padding:10px">סטטוס</th>';
    } else if (data.results[0].levelText) {
      resultsHtml += '<th style="padding:10px">רמה</th>';
    }
    resultsHtml += '</tr>';

    data.results.forEach((r, i) => {
      const bg = i % 2 === 0 ? '#f9f7f5' : 'white';
      const scoreColor = r.status === 'active' || r.level === 'high' ? '#e74c3c' :
                         r.level === 'moderate' ? '#f39c12' : '#5b7a6e';
      resultsHtml += `<tr style="background:${bg}">`;
      resultsHtml += `<td style="padding:8px 10px;border-bottom:1px solid #e8e0d8;font-weight:600">${r.name}</td>`;
      resultsHtml += `<td style="padding:8px 10px;border-bottom:1px solid #e8e0d8;text-align:center;color:${scoreColor};font-weight:700">${r.score}${r.maxScore ? '/' + r.maxScore : ''}</td>`;
      if (r.statusText) {
        resultsHtml += `<td style="padding:8px 10px;border-bottom:1px solid #e8e0d8;text-align:center">${r.statusText}</td>`;
      } else if (r.levelText) {
        resultsHtml += `<td style="padding:8px 10px;border-bottom:1px solid #e8e0d8;text-align:center">${r.levelText}</td>`;
      }
      resultsHtml += '</tr>';
    });
  }
  resultsHtml += '</table>';

  const subject = `תוצאות שאלון ${questionnaire} - ${name}`;
  const htmlBody = `
    <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#5b7a6e,#7a9e8e);padding:20px;border-radius:12px 12px 0 0;color:white;text-align:center">
        <h2 style="margin:0">תוצאות שאלון ${questionnaire}</h2>
        <p style="margin:6px 0 0;opacity:0.9">${name} &bull; ${date}</p>
      </div>
      <div style="background:white;padding:20px;border-radius:0 0 12px 12px;border:1px solid #e8e0d8;border-top:none">
        ${resultsHtml}
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

// Test function
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok', message: 'Schema Questionnaire Backend is running' }))
    .setMimeType(ContentService.MimeType.JSON);
}
