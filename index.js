require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const ExcelJS = require('exceljs');
const fastCsv = require('fast-csv');
const pdf = require('pdf-parse');

const { delay, randomDelay, loadProgress, saveProgress } = require('./src/utils');
const { DATA_FILE, PROGRESS_FILE } = require('./src/config');
const { sendMail } = require('./src/mailService');

const ask = (rl, question) =>
  new Promise(resolve => rl.question(question, resolve));

/* ─── cell text extractor (handles rich text / hyperlinks) ── */
const getCellText = (val) => {
  if (val == null) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val.richText) return val.richText.map(r => r.text || '').join('').trim();
  if (val.text != null) return getCellText(val.text);
  if (val.result != null) return getCellText(val.result);
  if (val.hyperlink) return val.hyperlink;
  try {
    const json = JSON.stringify(val);
    const match = json.match(/[\w.\-+]+@[\w.\-]+\.\w+/);
    if (match) return match[0];
  } catch {}
  return '';
};

function listPDFs() {
  return fs.readdirSync('.').filter(f => f.toLowerCase().endsWith('.pdf'));
}

function splitEmails(raw) {
  if (!raw) return [];
  return raw
    .split(/;\s*|,\s*/)
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

// Pick the most "send-worthy" guessed emails: prefer short patterns like
// firstname@domain over first.last@ / flast@ / firstnamelast@ aliases.
function rankGuessedEmails(emails) {
  return [...emails].sort((a, b) => {
    const localA = a.split('@')[0] || '';
    const localB = b.split('@')[0] || '';
    const scoreA = (localA.includes('.') ? 2 : 0) + Math.floor(localA.length / 6);
    const scoreB = (localB.includes('.') ? 2 : 0) + Math.floor(localB.length / 6);
    return scoreA - scoreB;
  });
}

// If all emails land in one founder's inbox (e.g. dominik@... + dominik.helmreich@...),
// greet by that founder's first name. Otherwise leave blank → prompt builder uses "team".
function pickGreetingName(foundersRaw, emails) {
  if (!foundersRaw || !emails.length) return '';
  const founders = foundersRaw.split(/;\s*/).map(s => s.trim()).filter(Boolean);
  if (founders.length === 0) return '';

  const locals = emails.map(e => (e.split('@')[0] || '').toLowerCase());
  for (const full of founders) {
    const first = full.split(/\s+/)[0].toLowerCase();
    if (first && locals.every(l => l.includes(first))) {
      return full;
    }
  }
  return '';
}

async function loadCsvRows() {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(DATA_FILE)
      .pipe(fastCsv.parse({ headers: true, trim: true }))
      .on('error', reject)
      .on('data', (r) => {
        const found = splitEmails(r.emails_found);
        const guessed = rankGuessedEmails(splitEmails(r.emails_guessed)).slice(0, 2);
        const emails = found.length ? found : guessed;
        if (!r.name || emails.length === 0) return; // skip unmailable

        rows.push({
          Company: r.name,
          Website: r.website || '',
          YCPage: r.yc_page || '',
          YCOneLiner: r.one_liner || '',
          YCDescription: r.description || '',
          Emails: emails,
          // Primary email kept for log lines / dedup; full list also passed via Emails.
          Email: emails[0],
          // If we mail a single founder, greet by their first name; otherwise fall back to "team".
          Name: pickGreetingName(r.founders_names, emails),
          Title: r.founders_names ? 'Founder' : '',
          FoundersNames: r.founders_names || '',
          Location: r.location || '',
        });
      })
      .on('end', () => resolve(rows));
  });
}

async function loadExcelRows() {
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

    if (!rowData.Company) {
      rowData.Company = rowData['company name'] || rowData['Company Name'] || '';
    }
    if (!rowData.Website) rowData.Website = rowData['website'] || '';
    if (!rowData.YCPage)  rowData.YCPage  = rowData['YC company page'] || '';
    rowData.YCOneLiner   = rowData['one liner'] || '';
    rowData.YCDescription = rowData['description'] || '';

    if (rowData.Company) rows.push(rowData);
  });

  console.log(`  📄 Sheet "${worksheet.name}": ${rows.length} rows loaded`);
  return rows;
}

async function loadRows() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`❌ Data file "${DATA_FILE}" not found in project root.`);
    process.exit(1);
  }

  const ext = path.extname(DATA_FILE).toLowerCase();
  if (ext === '.csv') {
    const rows = await loadCsvRows();
    console.log(`  📄 CSV "${DATA_FILE}": ${rows.length} mailable rows loaded`);
    return rows;
  }
  return loadExcelRows();
}

async function main() {
  console.log('\n╔══════════════════════════════╗');
  console.log('║       MAILER BOT             ║');
  console.log('╚══════════════════════════════╝\n');

  if (!process.env.OPENROUTER_API_KEY) {
    console.error('❌ OPENROUTER_API_KEY is missing from .env');
    process.exit(1);
  }
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('❌ EMAIL_USER / EMAIL_PASS missing from .env');
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  /* ── Choose PDF ── */
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

  /* ── Parse PDF ── */
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

  /* ── Load rows ── */
  const rows = await loadRows();
  rows.forEach(r => { r._resumePath = resumePath; });
  console.log(`📋 ${rows.length} rows loaded from ${DATA_FILE}\n`);

  /* ── Progress ── */
  let progress = loadProgress(PROGRESS_FILE);
  let currentIndex = progress.lastIndex;
  let successfulSends = 0;
  const SUCCESS_TARGET = parseInt(process.env.DAILY_LIMIT, 10) || 10;

  console.log(`📧 Starting mailer. Target: ${SUCCESS_TARGET} successful sends.\n`);

  /* ── Mailing loop ── */
  while (successfulSends < SUCCESS_TARGET && currentIndex < rows.length) {
    try {
      const currentRow = rows[currentIndex];
      const company = currentRow.Company || currentRow['Company Name'] || 'Unknown';
      const name = currentRow.Name || '';

      console.log(`[${successfulSends + 1}/${SUCCESS_TARGET}] Row ${currentIndex + 1}: ${company}${name ? ' → ' + name : ''} ...`);

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
