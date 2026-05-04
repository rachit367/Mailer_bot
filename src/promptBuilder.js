function buildTemplatePrompt({ template, resumeText, userInstructions, recipient, company, companyContext }) {
  const {
    firstName,
    fullName = '',
    title = '',
  } = recipient;

  const userInstructionsBlock = userInstructions
    ? `Additional Sender Context (USE THESE FACTS — they are real and verified about the sender; weave the most relevant 1–2 items into the email naturally where they strengthen the pitch):\n${userInstructions}\n`
    : '';

  return `
You are rewriting a cold email by filling in a fixed template with REAL, FINAL content. Every word in the output must be ready to send — zero placeholders, zero brackets, zero template variables.

═══════════════════════════════════════════════
TEMPLATE (this is the exact structure you must follow — keep paragraph order, tone, and flow identical, just replace bracketed placeholders with real content):
═══════════════════════════════════════════════
${template || '(no template provided — fall back to a 4-paragraph cold email: greeting+hook, who-I-am, why-I-fit, CTA+sign-off)'}
═══════════════════════════════════════════════

Recipient:
- First name: ${firstName}
- Full name: ${fullName || firstName}
- Title: ${title || 'Hiring Manager'}
- Company: ${company}

Resume (source of truth for sender's facts — name, role, years, skills, achievements, links):
${resumeText}

Company Context (scraped about/mission text — use it to personalize the hook):
${companyContext || 'Not available — use widely-known facts about the company instead.'}

${userInstructionsBlock}
INSTRUCTIONS:
1. Follow the template's paragraph structure EXACTLY. Same order, same intent for each paragraph.
2. Replace every bracketed placeholder ([First Name], [Company Name], [X years], [skill 1], etc.) with REAL values pulled from the resume, the recipient details, or the company context above.
3. Greet the recipient with their first name only ("${firstName}").
4. Pull the sender's role title, years of experience, top skills, and one quantified achievement strictly from the resume. Never invent numbers.
5. If the additional sender context is provided, you MAY enrich the "who I am" or "why I fit" paragraphs with one or two of those points when they strengthen the message — but only if they fit naturally and are relevant to the recipient/company. Do not dump the whole list.
6. The signature must use the sender's actual name and only the contact links that actually appear in the resume. If a link is missing (e.g. no GitHub), drop that part entirely — never write a placeholder.
7. Keep the email SHORT — 4 short paragraphs max, the same length as the template.
8. Subject line: name the actual role and one real skill. Example shape: "Exploring Opportunities at ${company} — <Real Role> with <Real Skill>".

CRITICAL — output is sent without human review:
- No square brackets, no angle brackets, no "X years", no "skill 1", no "[Link]", no "[Your Name]".
- Output MUST be valid JSON with exactly two keys: "subject" (string) and "body" (string).
`.trim();
}

const PLACEHOLDER_REGEX = /\[[^\]]*\]|<[^>]*>|\bX\s*years\b|\bskill\s*\d\b|\byour name\b|\byour role\b|\b1 achievement\b/gi;

function detectPlaceholders(text) {
  if (!text) return null;
  return text.match(PLACEHOLDER_REGEX);
}

module.exports = { buildTemplatePrompt, detectPlaceholders };
