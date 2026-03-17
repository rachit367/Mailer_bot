const OpenAI = require('openai');

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Mailer Bot V2",
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
                    break;
                }

                if (modelIdx < MODELS.length - 1) {
                    console.warn(`  ⚠️ ${model} failed: ${error.message}. Trying fallback...`);
                    await new Promise(r => setTimeout(r, 1500));
                    break;
                }

                console.error(`  ❌ All models failed. Last error:`, error.message);
                return null;
            }
        }
    }
    return null;
}

/**
 * V2: Generates a personalized email addressed to a named recruiter.
 * Uses: Name, Job Profile, Company Name, Location, website URL from the row.
 */
async function prepareEmailContent(row, resumeText, companyContext = '') {
    const recruiterName = row.Name || 'Hiring Manager';
    const jobProfile    = row['Job Profile'] || 'Recruiter';
    const company       = row['Company Name'] || row.Company || 'your company';
    const location      = row.Location || '';
    const websiteUrl    = row['account/website_url'] || '';

    console.log(`🧠 Generating personalized email for ${recruiterName} at ${company}...`);

    // Step 1: Personalised cold email addressed to the named recruiter
    const draftPrompt = `
You are an expert job seeker writing a SHORT, highly tailored cold email.

Recipient Details:
- Name: ${recruiterName}
- Job Profile: ${jobProfile}
- Company: ${company}
- Location: ${location}
- Company Website: ${websiteUrl || 'Not available'}

My Resume:
${resumeText}

Company Context (Mission/Values):
${companyContext || 'Not available'}

Rules:
1. Analyze my resume to determine my core skills, experience level, and the most logical role I would be applying for.
2. Open with "Hi ${recruiterName.split(' ')[0]}," — address them directly.
3. Keep the email SHORT (max 3-4 concise paragraphs).
4. Tailor the application specifically to the role derived from the resume and the Company Context if provided.
5. Reference the company's location (${location}) naturally if possible.
6. DO NOT include ANY placeholders like [Link] or [Your Name].
7. Sign the email with my name as found in the resume.
8. Output MUST be valid JSON with two keys: "subject" and "body".
`;

    const draftResponse = await getLLMResponse([
        { role: "system", content: "You are an expert assistant that generates precise, ready-to-send JSON for cold emails." },
        { role: "user", content: draftPrompt }
    ]);

    if (!draftResponse) return null;

    // LLM email guessing removed — was hallucinating fake addresses
    return {
        subject: draftResponse.subject,
        body: draftResponse.body,
        additionalEmails: []
    };
}

module.exports = { prepareEmailContent };
