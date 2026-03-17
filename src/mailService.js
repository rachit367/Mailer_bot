const path = require('path');
const dns = require('dns').promises;
const { transporter, RESUME_PATH } = require('./config');
const { prepareEmailContent } = require('./llmService');
const { findCompanyInfo } = require('./emailScraper');
const validator = require('email-validator');

const { validateEmailReputation } = require('./validation');

const sendMail = async (row, resumeText) => {
  if (!row.Email && !row.Company) return null;

  // Use runtime-injected resume path (from unified launcher) or fall back to config default
  const resumePath = row._resumePath || RESUME_PATH;

  // 🔍 Layer 1: Find real emails + domain + about context
  const companyInfo = row.Company ? await findCompanyInfo(row.Company) : { emails: [], aboutText: '' };

  // 🤖 Layer 2: Get LLM content with company context (email body/subject only)
  const llmData = await prepareEmailContent(row, resumeText, companyInfo.aboutText);
  if (!llmData) {
      throw new Error("Failed to generate LLM content.");
  }

  // 📋 Layer 3: Collect and STRICTLY validate all emails
  const candidates = new Set();
  
  const addIfValid = (email) => {
    if (!email) return;
    const cleanEmail = email.trim().toLowerCase();
    if (validator.validate(cleanEmail)) {
      candidates.add(cleanEmail);
    }
  };

  // 1. Add from Excel
  addIfValid(row.Email);

  // 2. Add from Scraper (real scraped emails only, no fabricated ones)
  for (const email of companyInfo.emails) {
    if (candidates.size >= 5) break;
    addIfValid(email);
  }

  if (candidates.size === 0) {
    console.log(`⚠️ No valid emails found for ${row.Company || 'Unknown Company'}`);
    return null;
  }

  // 🔒 Layer 4: Advanced validation & Reputation check
  const validatedEmails = [];
  for (const email of candidates) {
    const rep = await validateEmailReputation(email);
    if (rep.isValid) {
      if (!rep.isHighQuality) {
        console.log(`  ⚠ Note: ${email} is ${rep.reason}. Sending anyway.`);
      }
      validatedEmails.push(email);
    } else {
      console.log(`  🚫 Skipping ${email} — ${rep.reason}`);
    }
  }

  if (validatedEmails.length === 0) {
    console.log(`⚠️ All emails failed MX validation for ${row.Company || 'Unknown Company'}`);
    return null;
  }

  const toList = validatedEmails.join(', ');

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: toList,
    subject: llmData.subject,
    text: llmData.body,
    attachments: [
      {
        filename: path.basename(resumePath),
        path: resumePath
      }
    ]
  };

  await transporter.sendMail(mailOptions);
  return toList;
};

module.exports = {
  sendMail
};

