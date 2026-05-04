function buildTemplatePrompt({ template, resumeText, userInstructions, recipient, company, companyContext }) {
  const {
    firstName,
    fullName = '',
    title = '',
  } = recipient;

  const userInstructionsBlock = userInstructions
    ? `Additional sender context (real projects — pick AT MOST ONE concrete item that fits ${company}; weave it in as a single phrase, never as a list):\n${userInstructions}\n`
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

═══════════════════════════════════════════════
RESUME — THIS IS THE ONLY SOURCE OF TRUTH FOR SENDER FACTS.
Read it carefully. Extract the sender's actual name, education status (student / final-year / graduated), real project names, real metrics, real links. Do NOT use anything outside this resume + the additional sender context block below.
═══════════════════════════════════════════════
${resumeText}
═══════════════════════════════════════════════

Company context (scraped — only for the hook in P1):
${companyContext || 'Not available — use widely known facts about the company.'}

${userInstructionsBlock}
═══════════════════════════════════════════════
HARD CONSTRAINTS — violations make the email unusable:
═══════════════════════════════════════════════

A. RESUME FIDELITY (most important):
   1. NEVER claim years of professional experience unless the resume EXPLICITLY says "X years of experience" at a real company. Internships, freelance, and college projects do NOT count as years of experience.
   2. If the resume shows the sender is a student / final-year / fresh graduate / has only college projects → the sender is a FRESHER. Open the pitch with "I'm a final-year student / recent grad" or "I'm a developer who built…" — NEVER write "1 year of experience", "2 years of experience", "Backend Engineer with X years".
   3. NEVER invent metrics. Only use numbers that literally appear in the resume. If the resume has no quantified result, just describe one project concretely without inventing a percentage.
   4. NEVER invent job titles. The sender's title is whatever the resume actually shows (often "Student", "Developer", "Intern" — that's fine).
   5. Skills, project names, URLs (LinkedIn, GitHub, portfolio), phone — only what the resume contains. If a link is missing, omit that line from the signature. Do NOT write the word "LinkedIn" or "GitHub" without an actual URL.

B. STRUCTURE (exactly 3 paragraphs, ONE blank line between each):
   • P1 (1 sentence): "Hi ${firstName}," + one-line hook tying you to ${company} (their product, hiring focus, or a real fact from the company context). No "I came across while exploring".
   • P2 (1–2 sentences MAX): who you are in plain language — student/fresher status + your stack — then ONE concrete project from the resume OR ONE concrete project from the additional sender context (whichever fits ${company} better). Describe it in real terms ("built X using Y", "migrated monolith to microservices, deployed on Vultr with Docker + Nginx") — no invented numbers.
   • P3 (1–2 sentences MAX): direct ask — "Open to a 15-min chat this week?" + "Resume attached." Nothing more.

C. LENGTH: 60–100 words for the whole body (excluding signature). Count them.

D. SUBJECT LINE: under 60 chars, names the actual stack + intent. Examples for a fresher:
   • "Node.js + MongoDB developer — interested in ${company}"
   • "Full-stack (Node/React) — looking to join ${company}"
   • "Backend developer (Node/Mongo, Docker) — ${company}"
   AVOID: "Exploring opportunities at…", "Backend Engineer with X yrs", "Application for…".

E. NO FILLER PHRASES — these are banned:
   "I really liked", "I came across while exploring", "I'd love to learn more about your goals", "share how I can add value", "expanding its HR tech stack", "robust high-performance APIs", "scalable enterprise solutions", "passionate about", "honored to apply".

F. NO PLACEHOLDERS: no [brackets], no <angles>, no "X years", no "skill 1", no template residue.

G. GREETING: first name only ("${firstName}"). If first name is generic ("team", "Hiring Manager"), open with "Hi team,".

═══════════════════════════════════════════════
OUTPUT — MUST be valid JSON, exactly:
{
  "subject": "...",
  "body": "Hi ${firstName},\\n\\n<P1>\\n\\n<P2>\\n\\n<P3>\\n\\nBest,\\n<full name from resume>\\n<linkedin url if in resume>\\n<phone if in resume>\\n<github url if in resume>"
}

The "body" string MUST contain literal "\\n\\n" between paragraphs and "\\n" between signature lines. No HTML tags. Omit signature lines whose URL/value is not in the resume.
`.trim();
}

const PLACEHOLDER_REGEX = /\[[^\]]*\]|<[^>]*>|\bX\s*years?\b|\bskill\s*\d\b|\byour name\b|\byour role\b|\b1 achievement\b/gi;

// Hallucinated-experience patterns — block emails claiming years of experience.
// Matches "1 year of experience", "2 years of experience", "with 3 years", etc.
const FAKE_EXPERIENCE_REGEX = /\b(\d+\+?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(\+|plus)?\s*years?\s*(of\s*)?(professional\s*|industry\s*|work\s*|hands-on\s*)?experience\b/gi;

function detectPlaceholders(text) {
  if (!text) return null;
  return text.match(PLACEHOLDER_REGEX);
}

function detectFakeExperience(text) {
  if (!text) return null;
  return text.match(FAKE_EXPERIENCE_REGEX);
}

module.exports = { buildTemplatePrompt, detectPlaceholders, detectFakeExperience };
