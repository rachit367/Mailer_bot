require('dotenv').config();
const fs = require('fs');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');

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
      const data = await pdfParse(dataBuffer);
      resumeText = data.text;
      console.log("✅ Resume parsed successfully.");
  } catch(e) {
      console.error("❌ Failed to parse resume PDF:", e.message);
      return;
  }

  let progress = loadProgress(PROGRESS_FILE);

  const workbook = XLSX.readFile(DATA_FILE);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet);

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
      const sentToList = await sendMail(todaysList[i], resumeText);
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
