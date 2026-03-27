const OpenAI = require('openai');

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Mailer Bot V3",
  }
});

const PRIMARY_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001';

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
 * V3: Generates a template-guided cold email addressed to a named HR/recruiter.
 * Uses: Name, Title, Company from the row + companyContext from scraper.
 * Follows the Cold Email Template structure exactly.
 */
async function prepareEmailContent(row, resumeText, companyContext = '') {
    const recruiterName = row.Name || 'Hiring Manager';
    const recruiterTitle = row.Title || 'HR';
    const company       = row.Company || 'your company';
    const firstName     = recruiterName.split(' ')[0];

    console.log(`🧠 Generating template-guided email for ${recruiterName} (${recruiterTitle}) at ${company}...`);

    const prompt = `
You are a job seeker writing a SHORT, ready-to-send cold email. Every word in the output must be real and final — no placeholders, no brackets, no template variables of any kind.

Recipient Details:
- Name: ${recruiterName} — greet them as "${firstName}"
- Title: ${recruiterTitle}
- Company: ${company}

My Resume:
${resumeText}

Company Context (scraped about/mission text):
${companyContext || 'Not available.'}

Write the email in this exact order:

PARAGRAPH 1 — Greeting + Hook:
Start with "Hi ${firstName}," then one sentence explaining how you found ${company} and one specific thing you genuinely noticed about their work, product, or mission. If company context is available use it; otherwise use known facts about ${company}.

PARAGRAPH 2 — Who I am:
State your actual role title from the resume, actual years of experience, your top 3 actual skills, and ONE real achievement with a real number or metric pulled from the resume (e.g. "reduced API latency by 30%", "built a system handling 10k requests/sec"). All values must come from the resume — never invent numbers.

PARAGRAPH 3 — Why I fit:
Reference something real that ${company} is working on and explain specifically how your background helps. Keep it to 2 sentences.

PARAGRAPH 4 — CTA + Close:
"Would you be open to a quick 10–15 min chat this week? I'd love to learn more about your goals and share how I can add value.\n\nI've attached my resume for your reference."

SIGNATURE:
"Best regards,\n<full name from resume>\n<LinkedIn URL from resume> | <phone from resume> | <GitHub or portfolio URL from resume>"

CRITICAL RULES — violation means the output is unusable:
1. Zero placeholders. No square brackets, no angle brackets, no "X years", no "skill 1", no "[Link]", no "[Your Name]", nothing unfilled.
2. Every fact (name, skills, years, achievement, URLs) must come from the resume or the company context provided above.
3. If a resume field (e.g. GitHub URL) is not present in the resume, omit it from the signature entirely — do not write a placeholder.
4. Subject line must name the actual role and a real skill: e.g. "Exploring Opportunities at ${company} — Backend Engineer with Node.js & System Design"
5. Output MUST be valid JSON with exactly two keys: "subject" (string) and "body" (string).
`;

    const response = await getLLMResponse([
        {
            role: "system",
            content: "You generate ready-to-send cold emails as JSON. The output is sent directly without human review. Any placeholder, bracket, or unfilled template variable will cause embarrassment — output only real, final text."
        },
        { role: "user", content: prompt }
    ]);

    if (!response) return null;

    // Post-generation guard: detect any remaining placeholders and warn
    const bodyText = response.body || '';
    const subjectText = response.subject || '';
    const placeholderPattern = /\[.*?\]|<.*?>|\bX years\b|\bskill \d\b|\byour name\b|\byour role\b/gi;
    const bodyMatches = bodyText.match(placeholderPattern);
    const subjectMatches = subjectText.match(placeholderPattern);
    if (bodyMatches || subjectMatches) {
        console.warn(`  ⚠️ Placeholder detected in LLM output — skipping row. Found: ${[...(bodyMatches||[]), ...(subjectMatches||[])].join(', ')}`);
        return null;
    }

    return {
        subject: response.subject,
        body: response.body,
        additionalEmails: []
    };
}

module.exports = { prepareEmailContent };
