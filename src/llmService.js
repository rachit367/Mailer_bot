const OpenAI = require('openai');
const { loadTemplateText, loadUserInstructions } = require('./templateLoader');
const { buildTemplatePrompt, detectPlaceholders, detectFakeExperience, detectBannedPhrases } = require('./promptBuilder');

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Mailer Bot",
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

async function prepareEmailContent(row, resumeText, companyContext = '', extra = {}) {
  const recruiterName = row.Name || 'team';
  const recruiterTitle = row.Title || 'Founding team';
  const company = row.Company || row['Company Name'] || 'your company';
  const firstName = recruiterName.split(' ')[0];

  console.log(`🧠 Generating template-guided email for ${recruiterName} at ${company}...`);

  const template = await loadTemplateText();
  const userInstructions = loadUserInstructions();

  const prompt = buildTemplatePrompt({
    template,
    resumeText,
    userInstructions,
    recipient: { firstName, fullName: recruiterName, title: recruiterTitle },
    company,
    companyContext,
    foundersText: extra.founders || '',
    previousInstitutions: extra.previousInstitutions || '',
    competitors: extra.competitors || '',
    mode: extra.mode || 'f25',
  });

  const response = await getLLMResponse([
    {
      role: "system",
      content: "You generate ready-to-send cold emails as JSON. The output is sent directly without human review. Follow the supplied template structure exactly and never emit placeholders or brackets."
    },
    { role: "user", content: prompt }
  ]);

  if (!response) return null;

  const bodyMatches = detectPlaceholders(response.body);
  const subjectMatches = detectPlaceholders(response.subject);
  if (bodyMatches || subjectMatches) {
    console.warn(`  ⚠️ Placeholder detected in LLM output — skipping row. Found: ${[...(bodyMatches||[]), ...(subjectMatches||[])].join(', ')}`);
    return null;
  }

  const fakeExp = [
    ...(detectFakeExperience(response.body) || []),
    ...(detectFakeExperience(response.subject) || []),
  ];
  if (fakeExp.length) {
    console.warn(`  ⚠️ LLM hallucinated years of experience — skipping row. Found: ${fakeExp.join(', ')}`);
    return null;
  }

  const banned = [
    ...(detectBannedPhrases(response.body) || []),
    ...(detectBannedPhrases(response.subject) || []),
  ];
  if (banned.length) {
    console.warn(`  ⚠️ Banned filler phrase in LLM output — skipping row. Found: ${banned.join(', ')}`);
    return null;
  }

  return {
    subject: response.subject,
    body: response.body,
    additionalEmails: []
  };
}

module.exports = { prepareEmailContent };
