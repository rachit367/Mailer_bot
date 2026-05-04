function buildTemplatePrompt({ template, resumeText, userInstructions, recipient, company, companyContext }) {
  const {
    firstName,
    fullName = '',
    title = '',
  } = recipient;

  const userInstructionsBlock = userInstructions
    ? `Additional sender context (real, verified — pick AT MOST ONE concrete project/result from here that is most relevant to ${company}; weave it in naturally as a single phrase, do NOT list multiple items):\n${userInstructions}\n`
    : '';

  return `
You are writing a SHORT, high-conversion cold email that gets the recipient to reply with an interview slot. The output is sent without human review — every word must be final.

═══════════════════════════════════════════════
TEMPLATE (loose guide for tone — DO NOT copy its length; the email you write must be SHORTER than the template):
═══════════════════════════════════════════════
${template || '(no template provided)'}
═══════════════════════════════════════════════

Recipient:
- First name: ${firstName}
- Full name: ${fullName || firstName}
- Title: ${title || 'Hiring Manager'}
- Company: ${company}

Resume (truth source for sender's name, role, years, skills, achievements, links):
${resumeText}

Company context (scraped — use for the hook):
${companyContext || 'Not available — use widely known facts about the company.'}

${userInstructionsBlock}
HARD CONSTRAINTS — emails that violate these get deleted unread:
1. TOTAL BODY LENGTH: 70–110 words. Count them. Anything longer is rejected.
2. STRUCTURE — exactly 3 short paragraphs, separated by ONE blank line each:
   • P1 (1 sentence): "Hi ${firstName}," + a one-line hook tying you to ${company} (their product, hiring focus, or a real fact from the company context). No fluff like "I came across…".
   • P2 (2 sentences MAX): who you are in one line — role, years, top stack — then ONE quantified achievement pulled directly from the resume (real number, real project). Optionally swap the achievement for one concrete item from the additional sender context if it fits ${company} better.
   • P3 (2 sentences MAX): a direct ask — "Open to a 15-min chat this week?" + "Resume attached." Nothing more.
3. NO filler: drop "I really liked", "I came across while exploring", "I'd love to learn more about your goals", "share how I can add value", "expanding its HR tech stack", "robust high-performance APIs", and any similar template residue. Be concrete or be silent.
4. SUBJECT LINE: under 60 chars, names the role + one real skill. Examples:
   • "Backend Engineer — Node.js + MongoDB, 1 yr"
   • "Full-stack dev (Node/React) interested in ${company}"
   Avoid: "Exploring opportunities at…", "Application for…".
5. SIGNATURE: full name + only the contact links that EXIST in the resume. If the resume has GitHub/LinkedIn URLs, use the bare URLs — no "LinkedIn:" labels, no markdown, no angle brackets. If a link is missing in the resume, drop it; do NOT write "GitHub" or "[Link]".
6. NO PLACEHOLDERS of any kind: no [brackets], no <angles>, no "X years", no "skill 1", no invented metrics.
7. Greet with first name only ("${firstName}"). If first name is generic ("team", "Hiring Manager"), open with "Hi team," instead.

OUTPUT — MUST be valid JSON:
{
  "subject": "...",
  "body": "Hi ${firstName},\\n\\n<P1>\\n\\n<P2>\\n\\n<P3>\\n\\nBest,\\n<full name>\\n<link1>\\n<link2 if real>"
}

The "body" string MUST contain literal "\\n\\n" between paragraphs and "\\n" between signature lines. No HTML tags.
`.trim();
}

const PLACEHOLDER_REGEX = /\[[^\]]*\]|<[^>]*>|\bX\s*years\b|\bskill\s*\d\b|\byour name\b|\byour role\b|\b1 achievement\b/gi;

function detectPlaceholders(text) {
  if (!text) return null;
  return text.match(PLACEHOLDER_REGEX);
}

module.exports = { buildTemplatePrompt, detectPlaceholders };
