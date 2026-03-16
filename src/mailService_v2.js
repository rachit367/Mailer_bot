const dns = require('dns').promises;
const { transporter } = require('./config_v2');
const { prepareEmailContent } = require('./llmService_v2');
const { findCompanyInfo } = require('./emailScraper');
const validator = require('email-validator');

/**
 * Check if an email's domain has valid MX records (can receive mail).
 */
async function hasValidMX(email) {
  try {
    const domain = email.split('@')[1];
    if (!domain) return false;
    const mxRecords = await dns.resolveMx(domain);
    return mxRecords && mxRecords.length > 0;
  } catch (e) {
    return false;
  }
}

const sendMail = async (row, resumeText) => {
  const email    = row['Email Id'] || row.Email || '';
  const company  = row['Company Name'] || row.Company || 'Unknown';
  const name     = row.Name || '';
  const resumePath = row._resumePath; // injected by index.js

  if (!email && !company) return null;

  const websiteUrl = row['account/website_url'] || '';
  
  // 🔍 Layer 1: Find real emails + domain + about context
  const companyInfo = company ? await findCompanyInfo(company, websiteUrl) : { emails: [], aboutText: '' };

  // 🤖 Layer 2: LLM generates personalized email addressed to recruiter (body/subject only)
  const llmData = await prepareEmailContent(row, resumeText, companyInfo.aboutText);
  if (!llmData) {
      throw new Error("Failed to generate LLM content.");
  }

  // 📋 Layer 3: Collect and STRICTLY validate all emails
  const candidates = new Set();

  const addIfValid = (e) => {
    if (!e) return;
    const clean = e.trim().toLowerCase();
    if (validator.validate(clean)) candidates.add(clean);
  };

  // 1. Excel email (Email Id column)
  addIfValid(email);

  // 2. Scraped emails (real only, no fabricated ones)
  for (const e of companyInfo.emails) {
    if (candidates.size >= 5) break;
    addIfValid(e);
  }

  if (candidates.size === 0) {
    console.log(`⚠️ No valid emails found for ${company}`);
    return null;
  }

  // 🔒 Layer 4: DNS MX validation — confirm domain can receive email
  const validatedEmails = [];
  for (const e of candidates) {
    const mxValid = await hasValidMX(e);
    if (mxValid) {
      validatedEmails.push(e);
    } else {
      console.log(`  🚫 Skipping ${e} — domain has no MX records (can't receive mail)`);
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
        filename: require('path').basename(resumePath),
        path: resumePath
      }
    ]
  };

  await transporter.sendMail(mailOptions);
  return toList;
};

module.exports = { sendMail };

