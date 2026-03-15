const path = require('path');
const { transporter, RESUME_PATH } = require('./config');
const { prepareEmailContent } = require('./llmService');
const { findCompanyInfo } = require('./emailScraper');
const validator = require('email-validator');

const sendMail = async (row, resumeText) => {
  if (!row.Email && !row.Company) return null;

  // Use runtime-injected resume path (from unified launcher) or fall back to config default
  const resumePath = row._resumePath || RESUME_PATH;

  // 🔍 Layer 1: Find real emails + domain + about context
  const companyInfo = row.Company ? await findCompanyInfo(row.Company) : { emails: [], aboutText: '' };

  // 🤖 Layer 2: Get LLM content with company context
  const llmData = await prepareEmailContent(row, resumeText, companyInfo.aboutText);
  if (!llmData) {
      throw new Error("Failed to generate LLM content.");
  }

  // 📋 Layer 3: Combine and STRICTLY validate all emails
  const allEmails = new Set();
  
  // 1. Helper for validation and adding
  const addIfValid = (email) => {
    if (!email) return;
    const cleanEmail = email.trim().toLowerCase();
    if (validator.validate(cleanEmail)) {
      allEmails.add(cleanEmail);
    }
  };

  // 2. Add from Excel
  addIfValid(row.Email);

  // 3. Add from Scraper
  for (const email of companyInfo.emails) {
    if (allEmails.size >= 5) break;
    addIfValid(email);
  }

  // 4. Add from LLM
  if (Array.isArray(llmData.additionalEmails)) {
    for (const email of llmData.additionalEmails) {
      if (allEmails.size >= 5) break;
      addIfValid(email);
    }
  }

  if (allEmails.size === 0) {
    console.log(`⚠️ No valid emails found for ${row.Company || 'Unknown Company'}`);
    return null;
  }

  const toList = Array.from(allEmails).join(', ');

  const mailOptions = {
    from: `"Rachit Mittal" <${process.env.EMAIL_USER}>`,
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
