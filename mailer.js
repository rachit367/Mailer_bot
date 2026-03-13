require('dotenv').config();
const fs = require('fs');
const nodemailer = require('nodemailer');
const ExcelJS = require('exceljs');
const OpenAI = require('openai');
const pdfParse = require('pdf-parse');

/* ================= CONFIG ================= */

const DAILY_LIMIT = Number(process.env.DAILY_LIMIT) || 20;
const DELAY_MIN = Number(process.env.DELAY_MIN) || 20000; // 20 sec
const DELAY_MAX = Number(process.env.DELAY_MAX) || 30000; // 30 sec
const PROGRESS_FILE = 'progress.json';
const RESUME_PATH = './resume.pdf';

/* ================= PROGRESS ================= */

let progress = { lastIndex: 0 };

if (fs.existsSync(PROGRESS_FILE)) {
  progress = JSON.parse(fs.readFileSync(PROGRESS_FILE));
} else {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

/* ================= MAIL SETUP ================= */

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* ================= LLM SETUP ================= */

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000", // Required by OpenRouter
    "X-Title": "Mailer Bot", // Required by OpenRouter
  }
});

const MODEL = 'google/gemini-2.5-flash';

/* ================= UTILS ================= */

const delay = (ms) => new Promise(res => setTimeout(res, ms));
const randomDelay = () =>
  Math.floor(Math.random() * (DELAY_MAX - DELAY_MIN + 1)) + DELAY_MIN;

/* ================= LLM ACTIONS ================= */

async function getLLMResponse(messages) {
    try {
        const response = await openai.chat.completions.create({
            model: MODEL,
            messages: messages,
            response_format: { type: "json_object" }
        });
        const content = response.choices[0].message.content;
        return JSON.parse(content);
    } catch (error) {
        console.error("LLM Error:", error.message);
        return null;
    }
}

async function prepareEmailContent(row, resumeText) {
    console.log(`🧠 Generating email for ${row.Company}...`);

    // Step 1: Get Custom Draft
    const draftPrompt = `
You are an expert technical recruiter and job seeker.
Write a cold email applying for a software engineering/backend internship at ${row.Company}.
Here is my resume data for context:
---
${resumeText}
---
Rules:
1. Tailor the email very specifically to ${row.Company}'s industry.
2. DO NOT include ANY placeholders like [Link] or [LinkedIn] or [Company Name]. If you don't have the exact link or data from the resume, completely omit that line or sentence. The email must be fully ready to send without edits.
3. Be professional, concise, and compelling.
4. Output MUST be valid JSON with two keys: "subject" and "body".
`;

    const draftResponse = await getLLMResponse([
        { role: "system", content: "You are an expert assistant that generates precise, ready-to-send JSON for cold emails." },
        { role: "user", content: draftPrompt }
    ]);

    if (!draftResponse) return null;

    // Step 2: Scrape HR Emails
    const scrapePrompt = `
Find up to 4 real, publicly known email addresses for HR, Recruiting, or Careers at ${row.Company}.
Do NOT hallucinate or guess. Only provide emails that you know exist for a fact, such as 'careers@${row.Company.replace(/\s+/g,'').toLowerCase()}.com'.
If you are not highly confident, return an empty array.
Output MUST be valid JSON with one key: "emails", which is an array of strings.
`;

    const scrapeResponse = await getLLMResponse([
        { role: "system", content: "You are a specialized OSINT agent that only outputs highly verified JSON arrays of emails." },
        { role: "user", content: scrapePrompt }
    ]);

    const additionalEmails = scrapeResponse?.emails || [];

    return {
        subject: draftResponse.subject,
        body: draftResponse.body,
        additionalEmails: additionalEmails
    };
}


/* ================= SEND MAIL ================= */

const sendMail = async (row, resumeText) => {
  if (!row.Email) return;

  const llmData = await prepareEmailContent(row, resumeText);
  if (!llmData) {
      throw new Error("Failed to generate LLM content.");
  }

  // Combine original email with up to 4 LLM emails, ensuring uniqueness
  const allEmails = new Set([row.Email]);
  if (Array.isArray(llmData.additionalEmails)) {
      for (const email of llmData.additionalEmails) {
          if (allEmails.size < 5 && email.includes('@')) {
              allEmails.add(email.trim());
          }
      }
  }

  const toList = Array.from(allEmails).join(', ');

  const mailOptions = {
    from: `"Rachit Mittal" <${process.env.EMAIL_USER}>`,
    to: toList,
    subject: llmData.subject,
    text: llmData.body,
    attachments: [
      {
        filename: 'Rachit_Mittal_Backend_Intern.pdf',
        path: RESUME_PATH
      }
    ]
  };

  // DRY RUN: DO NOT SEND EMAIL
  console.log("\n--- DRY RUN EMAIL DRAFT ---");
  console.log(`TO: ${mailOptions.to}`);
  console.log(`SUBJECT: ${mailOptions.subject}`);
  console.log(`BODY:\n${mailOptions.text}`);
  console.log("---------------------------\n");
  // await transporter.sendMail(mailOptions);
  return toList;
};

/* ================= MAIN RUNNER ================= */

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


  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('hr.xlsx');
  const worksheet = workbook.getWorksheet(1);
  const rows = [];
  
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    const rowData = {};
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      rowData[cell.value] = row.getCell(colNumber).value;
    });
    rows.push(rowData);
  });

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
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));

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
