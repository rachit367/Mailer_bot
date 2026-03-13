const { transporter, RESUME_PATH } = require('./config');
const { prepareEmailContent } = require('./llmService');

const sendMail = async (row, resumeText) => {
  if (!row.Email) return null;

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

  await transporter.sendMail(mailOptions);
  return toList;
};

module.exports = {
  sendMail
};
