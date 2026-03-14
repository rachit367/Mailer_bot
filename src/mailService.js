const { transporter, RESUME_PATH } = require('./config');
const { prepareEmailContent } = require('./llmService');
const { findCompanyInfo } = require('./emailScraper');
const validator = require('email-validator');

const sendMail = async (row, resumeText) => {
  if (!row.Email && !row.Company) return null;

  // 🔍 Layer 1: Find real emails + domain + about context
  const companyInfo = row.Company ? await findCompanyInfo(row.Company) : { emails: [], aboutText: '' };

  // 🤖 Layer 2: Get LLM content with company context
  const llmData = await prepareEmailContent(row, resumeText, companyInfo.aboutText);
  if (!llmData) {
      throw new Error("Failed to generate LLM content.");
  }

  // 📋 Layer 3: Combine Excel email + Scraped emails + LLM emails
  const allEmails = new Set();
  
  if (row.Email && validator.validate(row.Email.trim())) {
      allEmails.add(row.Email.trim().toLowerCase());
  }

  for (const email of companyInfo.emails) {
      if (allEmails.size < 5) allEmails.add(email);
  }

  if (Array.isArray(llmData.additionalEmails)) {
      for (const email of llmData.additionalEmails) {
          if (allEmails.size < 5) allEmails.add(email.trim().toLowerCase());
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

  await transporter.sendMail(mailOptions);
  return toList;
};

module.exports = {
  sendMail
};
