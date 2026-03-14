const { transporter, RESUME_PATH } = require('./config');
const { prepareEmailContent } = require('./llmService');
const { findCareerEmails } = require('./emailScraper');

const sendMail = async (row, resumeText) => {
  if (!row.Email && !row.Company) return null;

  // 🔍 Layer 1: Find real emails via web search/scraping
  const scrapedEmails = row.Company ? await findCareerEmails(row.Company) : [];

  // 🤖 Layer 2: Get LLM content and fallback emails
  const llmData = await prepareEmailContent(row, resumeText);
  if (!llmData) {
      throw new Error("Failed to generate LLM content.");
  }

  // 📋 Layer 3: Combine Excel email + Scraped emails + LLM emails
  // Use a Set to ensure uniqueness, cap at 5 total recipients
  const allEmails = new Set();
  
  // Add original Excel email first (priority)
  if (row.Email) allEmails.add(row.Email.trim().toLowerCase());

  // Add scraped emails (Layer 1)
  for (const email of scrapedEmails) {
      if (allEmails.size < 5 && email.includes('@')) {
          allEmails.add(email.trim().toLowerCase());
      }
  }

  // Add LLM fallback emails (Layer 2)
  if (Array.isArray(llmData.additionalEmails)) {
      for (const email of llmData.additionalEmails) {
          if (allEmails.size < 5 && email.includes('@')) {
              allEmails.add(email.trim().toLowerCase());
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

  await transporter.sendMail(mailOptions);
  return toList;
};

module.exports = {
  sendMail
};
