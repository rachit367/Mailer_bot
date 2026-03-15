const { transporter } = require('./config_v2');
const { prepareEmailContent } = require('./llmService_v2');
const { findCompanyInfo } = require('./emailScraper');
const validator = require('email-validator');

const sendMail = async (row, resumeText) => {
  const email    = row['Email Id'] || row.Email || '';
  const company  = row['Company Name'] || row.Company || 'Unknown';
  const name     = row.Name || '';
  const resumePath = row._resumePath; // injected by index_v2.js

  if (!email && !company) return null;

  // 🔍 Layer 1: Find real emails + domain + about context
  const companyInfo = company ? await findCompanyInfo(company) : { emails: [], aboutText: '' };

  // 🤖 Layer 2: LLM generates personalized email addressed to recruiter
  const llmData = await prepareEmailContent(row, resumeText, companyInfo.aboutText);
  if (!llmData) {
      throw new Error("Failed to generate LLM content.");
  }

  // 📋 Layer 3: Combine and STRICTLY validate all emails
  const allEmails = new Set();

  const addIfValid = (e) => {
    if (!e) return;
    const clean = e.trim().toLowerCase();
    if (validator.validate(clean)) allEmails.add(clean);
  };

  // 1. Excel email (Email Id column)
  addIfValid(email);

  // 2. Scraped emails
  for (const e of companyInfo.emails) {
    if (allEmails.size >= 5) break;
    addIfValid(e);
  }

  // 3. LLM-suggested emails
  if (Array.isArray(llmData.additionalEmails)) {
    for (const e of llmData.additionalEmails) {
      if (allEmails.size >= 5) break;
      addIfValid(e);
    }
  }

  if (allEmails.size === 0) {
    console.log(`⚠️ No valid emails found for ${company}`);
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
        filename: require('path').basename(resumePath),
        path: resumePath
      }
    ]
  };

  await transporter.sendMail(mailOptions);
  return toList;
};

module.exports = { sendMail };
