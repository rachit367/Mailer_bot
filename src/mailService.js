const path = require('path');
const validator = require('email-validator');
const { transporter } = require('./config');
const { prepareEmailContent } = require('./llmService');
const { findCompanyInfo } = require('./emailScraper');
const { validateEmailReputation } = require('./validation');

const sendMail = async (row, resumeText) => {
  const email      = row.Email || '';
  const company    = row.Company || row['Company Name'] || 'Unknown';
  const resumePath = row._resumePath;

  if (!email && !company) return null;

  // 🔍 Layer 1: Find domain + about context via web scrape
  const companyInfo = company
    ? await findCompanyInfo(company, '')
    : { emails: [], aboutText: '' };

  // 🤖 Layer 2: LLM generates template-guided email
  const llmData = await prepareEmailContent(row, resumeText, companyInfo.aboutText);
  if (!llmData) {
    throw new Error('Failed to generate LLM content.');
  }

  // 📋 Layer 3: Collect and validate all candidate emails
  const candidates = new Set();

  const addIfValid = (e) => {
    if (!e) return;
    const clean = e.trim().toLowerCase();
    if (validator.validate(clean)) candidates.add(clean);
  };

  addIfValid(email);

  for (const e of companyInfo.emails) {
    if (candidates.size >= 5) break;
    addIfValid(e);
  }

  if (candidates.size === 0) {
    console.log(`⚠️ No valid emails found for ${company}`);
    return null;
  }

  // 🔒 Layer 4: Reputation + MX check
  const validatedEmails = [];
  for (const e of candidates) {
    const rep = await validateEmailReputation(e);
    if (rep.isValid) {
      if (!rep.isHighQuality) {
        console.log(`  ⚠ Note: ${e} is ${rep.reason}. Sending anyway.`);
      }
      validatedEmails.push(e);
    } else {
      console.log(`  🚫 Skipping ${e} — ${rep.reason}`);
    }
  }

  if (validatedEmails.length === 0) {
    console.log(`⚠️ All emails failed MX validation for ${company}`);
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

module.exports = { sendMail };
