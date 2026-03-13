require('dotenv').config();
const fs = require('fs');
const ExcelJS = require('exceljs');
const pdf = require('pdf-parse');

const { DAILY_LIMIT, PROGRESS_FILE, RESUME_PATH, DATA_FILE } = require('./src/config');
const { delay, randomDelay, loadProgress, saveProgress } = require('./src/utils');
const { sendMail } = require('./src/mailService');

async function startMailing() {
  if (!process.env.OPENROUTER_API_KEY) {
      console.error("❌ OPENROUTER_API_KEY is missing from .env");
      return;
  }

  let resumeText = "";
  try {
      const dataBuffer = fs.readFileSync(RESUME_PATH);
      const data = await pdf(dataBuffer);
      resumeText = data.text;
      console.log("✅ Resume parsed successfully.");
  } catch(e) {
      console.error("❌ Failed to parse resume PDF:", e.message);
      return;
  }

  let progress = loadProgress(PROGRESS_FILE);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(DATA_FILE);
  const worksheet = workbook.getWorksheet(1);
  const rows = [];
  
  // Helper: extract plain text from ExcelJS cell value (handles rich text, hyperlinks, etc.)
  const getCellText = (val) => {
    if (val == null) return '';
    if (typeof val === 'string') return val.trim();
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (val.richText) return val.richText.map(r => r.text || '').join('').trim();
    if (val.text != null) return getCellText(val.text);   // hyperlink — recurse in case text is also an object
    if (val.result != null) return getCellText(val.result); // formula
    // Last resort: try to pull an email out of the JSON
    try {
      const json = JSON.stringify(val);
      const match = json.match(/[\w.\-+]+@[\w.\-]+\.\w+/);
      if (match) return match[0];
    } catch {}
    return '';
  };

  // Read header names
  const headers = {};
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = getCellText(cell.value);
  });

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    const rowData = {};
    for (const [colNumber, headerName] of Object.entries(headers)) {
      rowData[headerName] = getCellText(row.getCell(Number(colNumber)).value);
    }
    rows.push(rowData);
  });

  // Find the actual email column name (case-insensitive)
  const sampleRow = rows[0] || {};
  const emailKey = Object.keys(sampleRow).find(k => k.toLowerCase() === 'email');
  if (!emailKey) {
    console.error('❌ No "Email" column found in Excel. Available columns:', Object.keys(sampleRow).join(', '));
    return;
  }
  console.log(`📋 Found email column: "${emailKey}". Total rows: ${rows.length}`);

  const start = progress.lastIndex;
  const end = Math.min(start + DAILY_LIMIT, rows.length);
  const todaysList = rows.slice(start, end);

  if (todaysList.length === 0) {
    console.log('🎉 All HRs have been contacted.');
    return;
  }

  console.log(`📧 Sending emails ${start + 1} → ${end} of ${rows.length}\n`);

  for (let i = 0; i < todaysList.length; i++) {
    try {
      // Normalize email key so sendMail always gets row.Email
      const currentRow = todaysList[i];
      if (emailKey !== 'Email') {
        currentRow.Email = currentRow[emailKey];
      }
      if (!currentRow.Email) {
        console.log(`⚠️ Skipping row ${start + i + 1}: no email found`);
        progress.lastIndex++;
        saveProgress(PROGRESS_FILE, progress);
        continue;
      }
      const sentToList = await sendMail(currentRow, resumeText);
      console.log(`✅ Sent to ${sentToList}`);

      progress.lastIndex++;
      saveProgress(PROGRESS_FILE, progress);

      if (i < todaysList.length - 1) {
        const wait = randomDelay();
        console.log(`⏳ Waiting ${wait / 1000}s...\n`);
        await delay(wait);
      }
    } catch (err) {
      console.error(`❌ Failed for ${todaysList[i].Company} (${todaysList[i].Email}): ${err.message}`);
    }
  }

  console.log('🛑 Daily limit reached. Run again tomorrow.');
}

startMailing();
