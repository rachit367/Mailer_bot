const OpenAI = require('openai');

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Mailer Bot",
  }
});

const MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

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

module.exports = {
  prepareEmailContent
};
