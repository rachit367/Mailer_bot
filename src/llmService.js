const OpenAI = require('openai');

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Mailer Bot",
  }
});

const PRIMARY_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001';

// Fallback models from .env (comma-separated), stripping quotes
const FALLBACK_MODELS = (process.env.OPENROUTER_FALLBACK_MODELS || '')
  .split(',')
  .map(m => m.trim().replace(/^['"]|['"]$/g, ''))
  .filter(Boolean);

const MODELS = [PRIMARY_MODEL, ...FALLBACK_MODELS];

const blacklistedModels = new Set();

async function getLLMResponse(messages) {
    for (let modelIdx = 0; modelIdx < MODELS.length; modelIdx++) {
        const model = MODELS[modelIdx];
        
        if (blacklistedModels.has(model)) continue;

        const maxRetries = modelIdx === 0 ? 2 : 1;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await openai.chat.completions.create({
                    model,
                    messages,
                    response_format: { type: "json_object" }
                });
                const content = response.choices[0].message.content;
                const parsed = JSON.parse(content);
                if (modelIdx > 0) {
                    console.log(`  ✅ Fallback model worked: ${model}`);
                }
                return parsed;
            } catch (error) {
                const status = error.status || 500;
                const is429 = error.message?.includes('429') || status === 429;
                const isAuthOrPayment = status === 402 || status === 404 || status === 403 || status === 401;

                if (is429 && attempt < maxRetries) {
                    const waitSec = attempt * 3;
                    console.warn(`  ⏳ Rate limited on ${model}. Retrying in ${waitSec}s...`);
                    await new Promise(r => setTimeout(r, waitSec * 1000));
                    continue;
                }

                if (isAuthOrPayment) {
                    console.error(`  🚨 ${model} is unavailable (${status}). Removing from rotation.`);
                    blacklistedModels.add(model);
                    break; // Skip to next model immediately
                }

                // Move to next model
                if (modelIdx < MODELS.length - 1) {
                    console.warn(`  ⚠️ ${model} failed: ${error.message}. Trying fallback...`);
                    await new Promise(r => setTimeout(r, 1500)); // Delay between models to prevent global 429s
                    break;
                }

                // All models exhausted
                console.error(`  ❌ All models failed. Last error:`, error.message);
                return null;
            }
        }
    }
    return null;
}

async function prepareEmailContent(row, resumeText, companyContext = '') {
    console.log(`🧠 Generating personalized email for ${row.Company}...`);

    // Step 1: Get Custom Draft
    const draftPrompt = `
You are an expert technical recruiter and job seeker.
Write a SHORT, cold email applying for a software engineering/backend internship at ${row.Company}.

My Resume Context:
${resumeText}

Company Context (Mission/Values):
${companyContext || 'Not available'}

Rules:
1. KEEP IT SHORT (max 3-4 concise paragraphs).
2. Tailor specifically using the Company Context if provided.
3. DO NOT include ANY placeholders.
4. Output MUST be valid JSON with: "subject" and "body".
5. Mention you're applying for an internship.
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
