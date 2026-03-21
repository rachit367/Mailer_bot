require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const ExcelJS = require('exceljs');
const pdf = require('pdf-parse');

/* ─── helpers ─────────────────────────────────────────────── */
const ask = (rl, question) =>
  new Promise(resolve => rl.question(question, resolve));

const { delay, randomDelay, loadProgress, saveProgress } = require('./src/utils');

/* ─── cell text extractor (handles rich text / hyperlinks) ── */
const getCellText = (val) => {
  if (val == null) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val.richText) return val.richText.map(r => r.text || '').join('').trim();
  if (val.text != null) return getCellText(val.text);
  if (val.result != null) return getCellText(val.result);
  try {
    const json = JSON.stringify(val);
    const match = json.match(/[\w.\-+]+@[\w.\-]+\.\w+/);
    if (match) return match[0];
  } catch {}
  return '';
};

/* ─── list PDFs in project root ─────────────────────────────── */
function listPDFs() {
  return fs.readdirSync('.').filter(f => f.toLowerCase().endsWith('.pdf'));
}

/* ─── load V1 rows from hr.xlsx ──────────────────────────── */
async function loadV1Rows() {
  const { DATA_FILE } = require('./src/config');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(DATA_FILE);
  const worksheet = workbook.getWorksheet(1);
  const rows = [];

  const headers = {};
  worksheet.getRow(1).eachCell((cell, col) => {
    headers[col] = getCellText(cell.value);
  });

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rowData = {};
    for (const [col, name] of Object.entries(headers)) {
      rowData[name] = getCellText(row.getCell(Number(col)).value);
    }
    rows.push(rowData);
  });

  // Normalise email column name
  const sampleRow = rows[0] || {};
  const emailKey = Object.keys(sampleRow).find(k => k.toLowerCase() === 'email');
  if (!emailKey) {
    console.error('❌ No "Email" column found in hr.xlsx. Columns:', Object.keys(sampleRow).join(', '));
    process.exit(1);
  }
  if (emailKey !== 'Email') rows.forEach(r => { r.Email = r[emailKey]; });

  return rows;
}

/* ─── load V2 rows from recruiter Excel (2 sheets) ──────── */
async function loadV2Rows() {
  const { DATA_FILE_V2 } = require('./src/config_v2');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(DATA_FILE_V2);

  const allRows = [];

  workbook.eachSheet((worksheet, sheetId) => {
    const headers = {};
    worksheet.getRow(1).eachCell((cell, col) => {
      headers[col] = getCellText(cell.value);
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rowData = {};
      for (const [col, name] of Object.entries(headers)) {
        rowData[name] = getCellText(row.getCell(Number(col)).value);
      }
      // Only add rows that have at least an email
      if (rowData['Email Id'] || rowData['Email']) {
        allRows.push(rowData);
      }
    });

    console.log(`  📄 Sheet "${worksheet.name}": ${worksheet.rowCount - 1} rows loaded`);
  });

  return allRows;
}

/* ─── MAIN ──────────────────────────────────────────────── */
async function main() {
  console.log('\n╔══════════════════════════════╗');
  console.log('║       MAILER BOT LAUNCHER    ║');
  console.log('╚══════════════════════════════╝\n');

  if (!process.env.OPENROUTER_API_KEY) {
    console.error('❌ OPENROUTER_API_KEY is missing from .env');
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  /* ── 1. Choose version ── */
  console.log('Select version:');
  console.log('  [1] V1 — hr.xlsx (generic HR contacts)');
  console.log('  [2] V2 — Recruiter Email Bengaluru/Delhi-NCR (named recruiters)\n');
  const versionInput = (await ask(rl, 'Enter 1 or 2: ')).trim();
  const version = versionInput === '2' ? 2 : 1;
  console.log(`\n✅ Selected: V${version}\n`);

  /* ── 2. Choose PDF ── */
  const pdfs = listPDFs();
  if (pdfs.length === 0) {
    console.error('❌ No PDF files found in project root. Add at least one resume PDF.');
    rl.close();
    process.exit(1);
  }

  console.log('Available resumes:');
  pdfs.forEach((p, i) => console.log(`  [${i + 1}] ${p}`));
  console.log();

  let resumePath = pdfs[0];
  if (pdfs.length > 1) {
    const pdfInput = (await ask(rl, `Enter number (default 1 = ${pdfs[0]}): `)).trim();
    const pdfIdx = parseInt(pdfInput, 10);
    if (!isNaN(pdfIdx) && pdfIdx >= 1 && pdfIdx <= pdfs.length) {
      resumePath = pdfs[pdfIdx - 1];
    }
  }

  rl.close();
  console.log(`\n✅ Using resume: ${resumePath}\n`);

  /* ── 3. Parse PDF ── */
  let resumeText = '';
  try {
    const buf = fs.readFileSync(resumePath);
    const data = await pdf(buf);
    resumeText = data.text;
    console.log('✅ Resume parsed successfully.\n');
  } catch (e) {
    console.error('❌ Failed to parse resume PDF:', e.message);
    process.exit(1);
  }

  /* ── 4. Load rows & config ── */
  let rows, PROGRESS_FILE, sendMail;

  if (version === 1) {
    const { PROGRESS_FILE: PF } = require('./src/config');
    PROGRESS_FILE = PF;
    sendMail = require('./src/mailService').sendMail;
    rows = await loadV1Rows();
    console.log(`📋 V1: ${rows.length} rows loaded from hr.xlsx`);
  } else {
    const { PROGRESS_FILE_V2: PF } = require('./src/config_v2');
    PROGRESS_FILE = PF;
    // Inject resume path into each row so mailService_v2 can use it
    rows = await loadV2Rows();
    rows.forEach(r => { r._resumePath = resumePath; });
    sendMail = require('./src/mailService_v2').sendMail;
    console.log(`\n📋 V2: ${rows.length} total rows loaded across all sheets`);
  }

  /* ── 5. Progress ── */
  let progress = loadProgress(PROGRESS_FILE);
  let currentIndex = progress.lastIndex;
  let successfulSends = 0;
  const SUCCESS_TARGET = parseInt(process.env.DAILY_LIMIT, 10) || 10;

  console.log(`\n📧 Starting V${version} mailing. Target: ${SUCCESS_TARGET} successful sends.\n`);

  /* ── 6. Mailing loop ── */
  while (successfulSends < SUCCESS_TARGET && currentIndex < rows.length) {
    try {
      const currentRow = rows[currentIndex];
      const label = currentRow['Company Name'] || currentRow.Company || 'Unknown';
      const nameLabel = version === 2 ? ` → ${currentRow.Name || ''}` : '';

      console.log(`[${successfulSends + 1}/${SUCCESS_TARGET}] Row ${currentIndex + 1}: ${label}${nameLabel} ...`);

      // For V1, pass resumePath via a different mechanism (config already has RESUME_PATH,
      // but to support custom PDF we patch it here at row level)
      if (version === 1) currentRow._resumePath = resumePath;

      const sentToList = await sendMail(currentRow, resumeText);

      if (sentToList) {
        console.log(`✅ Sent to: ${sentToList}`);
        successfulSends++;
        if (successfulSends < SUCCESS_TARGET && currentIndex < rows.length - 1) {
          const wait = randomDelay();
          console.log(`⏳ Waiting ${wait / 1000}s...\n`);
          await delay(wait);
        }
      } else {
        console.log(`⏭️ Row ${currentIndex + 1} skipped (no valid emails).\n`);
      }

      currentIndex++;
      progress.lastIndex = currentIndex;
      saveProgress(PROGRESS_FILE, progress);

    } catch (err) {
      console.error(`❌ Failed for row ${currentIndex + 1}: ${err.message}`);
      currentIndex++;
      progress.lastIndex = currentIndex;
      saveProgress(PROGRESS_FILE, progress);
    }
  }

  if (successfulSends >= SUCCESS_TARGET) {
    console.log(`\n🛑 Daily limit of ${SUCCESS_TARGET} sends reached. Run again tomorrow.`);
  } else if (currentIndex >= rows.length) {
    console.log('\n🎉 All rows processed!');
  }
}

main();
