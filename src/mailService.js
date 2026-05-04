const path = require('path');
const validator = require('email-validator');
const { transporter } = require('./config');
const { prepareEmailContent } = require('./llmService');
const { findCompanyInfo } = require('./emailScraper');
const { validateEmailReputation } = require('./validation');
const { verifyRecipient } = require('./smtpVerify');

const ENABLE_SMTP_PROBE = process.env.SMTP_PROBE !== 'false'; // on by default

// Convert plain-text LLM body into Gmail-friendly HTML so paragraph spacing renders.
function bodyToHtml(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const linked = escaped.replace(/\b(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');

  const paragraphs = linked
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p style="margin:0 0 12px 0;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222;">${paragraphs}</div>`;
}

const sendMail = async (row, resumeText) => {
  const email      = row.Email || '';
  const company    = row.Company || row['Company Name'] || 'Unknown';
  const resumePath = row._resumePath;

  if (!email && !company) return null;

  const companyInfo = company
    ? await findCompanyInfo(company, '')
    : { emails: [], aboutText: '' };

  const llmData = await prepareEmailContent(row, resumeText, companyInfo.aboutText);
  if (!llmData) {
    throw new Error('Failed to generate LLM content.');
  }

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

  // Reputation + MX
  const mxPassed = [];
  for (const e of candidates) {
    const rep = await validateEmailReputation(e);
    if (rep.isValid) {
      if (!rep.isHighQuality) {
        console.log(`  ⚠ Note: ${e} is ${rep.reason}. Sending anyway.`);
      }
      mxPassed.push(e);
    } else {
      console.log(`  🚫 Skipping ${e} — ${rep.reason}`);
    }
  }

  if (mxPassed.length === 0) {
    console.log(`⚠️ All emails failed MX validation for ${company}`);
    return null;
  }

  // SMTP-level probe — drops "address not found" before we waste a send.
  let validatedEmails = mxPassed;
  if (ENABLE_SMTP_PROBE) {
    validatedEmails = [];
    for (const e of mxPassed) {
      try {
        const probe = await verifyRecipient(e);
        if (probe.ok) {
          validatedEmails.push(e);
        } else if (probe.status === 'rejected') {
          console.log(`  🚫 SMTP rejected ${e} (${probe.code || ''}): ${(probe.reason || '').slice(0, 120)}`);
        } else {
          // Unknown/timeout — server probably blocks port 25 (common on residential ISPs). Send anyway.
          console.log(`  ❓ SMTP probe inconclusive for ${e} — sending anyway.`);
          validatedEmails.push(e);
        }
      } catch (err) {
        console.log(`  ❓ SMTP probe error for ${e}: ${err.message} — sending anyway.`);
        validatedEmails.push(e);
      }
    }
  }

  if (validatedEmails.length === 0) {
    console.log(`⚠️ All emails rejected by destination SMTP for ${company}`);
    return null;
  }

  const toList = validatedEmails.join(', ');

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: toList,
    subject: llmData.subject,
    text: llmData.body,
    html: bodyToHtml(llmData.body),
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
