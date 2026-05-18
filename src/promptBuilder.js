function buildTemplatePrompt({
  template,
  resumeText,
  userInstructions,
  recipient,
  company,
  companyContext,
  foundersText = '',
  previousInstitutions = '',
  competitors = '',
  mode = 'f25',
}) {
  const {
    firstName,
    fullName = '',
    title = '',
  } = recipient;

  // Mode 2 (all-emails): fixed "Hi there," — no name, no founder bios available.
  // Mode 1 (F25): single-founder greeting when loader resolved a match, else "Hi team,".
  const isAllMode = mode === 'all';
  const isTeamGreeting = !isAllMode && (!firstName || /^team$/i.test(firstName));
  const greetingFirst = isAllMode ? 'there' : (isTeamGreeting ? 'team' : firstName);
  const greetingLine = `Hi ${greetingFirst},`;

  const userInstructionsBlock = userInstructions
    ? `Additional sender context (real projects — pick AT MOST ONE concrete item that fits ${company}; weave it in as a single phrase, never as a list):\n${userInstructions}\n`
    : '';

  const foundersBlock = foundersText
    ? `═══════════════════════════════════════════════
FOUNDER BIOS — your PRIMARY source for the hook. The guide says: talk about THEM, not yourself.
Pull ONE specific, real detail from this block (a past company they built, a school, a domain they shipped in, an unusual background). Use it to make the hook feel like it was written only for this company.
NEVER invent details that aren't in this block.
${isTeamGreeting
  ? 'NEVER address a founder by name in the body (the greeting is "Hi team,"). You may say "the team previously built X" or similar.'
  : `You are writing to ${firstName} specifically. You may say "you previously built X" or "your background in Y" if the bios support it.`}
═══════════════════════════════════════════════
${foundersText}
${previousInstitutions ? `\nFounders' previous institutions: ${previousInstitutions}` : ''}
═══════════════════════════════════════════════
`
    : '';

  const intro = isAllMode
    ? `You are writing a SHORT, high-conversion cold email to a company contact (CEO, hiring manager, or general inbox) at an established company. The output is sent without human review — every word must be final. You do NOT know who exactly will open it, so the greeting is generic.`
    : `You are writing a SHORT, high-conversion cold email to the FOUNDING TEAM of a Y Combinator startup. The output is sent without human review — every word must be final. The recipient is a YC founder, not corporate HR.`;

  return `
${intro}

═══════════════════════════════════════════════
TEMPLATE (loose guide for tone — DO NOT copy its length; the email you write must be SHORTER than the template):
═══════════════════════════════════════════════
${template || '(no template provided)'}
═══════════════════════════════════════════════

Recipient:
- Greeting (use EXACTLY this line — do not change it): "${greetingLine}"
- Company: ${company}
${isAllMode
  ? '- You are writing to an unknown reader at this company (could be the CEO, a recruiter, or a general inbox). Refer to the company collectively ("your team", "you"). Do NOT invent or use any individual name in the body.'
  : isTeamGreeting
    ? '- You are writing to the whole founding team. Refer to them collectively ("the team", "you"). Do NOT use any founder names in the body.'
    : `- You are writing to ${firstName} specifically (a single founder reachable at the email we have). You may reference what they personally built or where they came from (from the founder bios block below).`}

═══════════════════════════════════════════════
RESUME — THIS IS THE ONLY SOURCE OF TRUTH FOR SENDER FACTS.
Read it carefully. Extract the sender's actual name, education status (student / final-year / graduated), real project names, real metrics, real links. Do NOT use anything outside this resume + the additional sender context block below.
═══════════════════════════════════════════════
${resumeText}
═══════════════════════════════════════════════

Company context ${isAllMode ? '(company description — your ONLY anchor for the hook)' : '(YC one-liner + description + scraped about — for the hook in P1)'}:
${companyContext || 'Not available — use widely known facts about the company.'}

${foundersBlock}${userInstructionsBlock}═══════════════════════════════════════════════
HARD CONSTRAINTS — violations make the email unusable:
═══════════════════════════════════════════════

A. RESUME FIDELITY (most important):
   1. NEVER claim years of professional experience. The sender is a FRESHER — student / final-year / fresh grad with only college projects. Internships, freelance, and college projects do NOT count as years of experience.
   2. NEVER write "1 year of experience", "2 years of experience", "Backend Engineer with X years". Open the pitch with "final-year student" or "recent grad who built…" or "developer who shipped…".
   3. NEVER invent metrics. Only use numbers that literally appear in the resume. If the resume has no quantified result, just describe one project concretely.
   4. NEVER invent job titles. The sender's title is whatever the resume shows.
   5. Skills, project names, URLs (LinkedIn, GitHub, portfolio), phone — only what the resume contains. If a link is missing, omit that line from the signature. Do NOT write the word "LinkedIn" or "GitHub" without an actual URL.

B. STRUCTURE — 4 parts compressed into 3 paragraphs, ONE blank line between each:
   • P1 — HOOK + CONNECTION (1–2 sentences): Start with "${greetingLine}" then a specific, real detail about ${company} drawn from the company description above (what they actually build, who they serve, the problem they solve). ${isAllMode ? 'You have NO founder bios — work only from the description. Be concrete: name the product or the problem in their words, not generic praise.' : 'Prefer a detail from the founder bios (e.g., "saw the team previously built X / came from Y / shipped Z") over a generic line about the product.'} Then ONE short sentence on why their problem space resonates with you. NEVER write "I came across while exploring" or "I'm reaching out to express interest".
   • P2 — CONGRUENCE (1–2 sentences MAX): who you are in plain language — student/fresher status + your stack — then ONE concrete project from the resume OR from the additional sender context that genuinely overlaps with what ${company} does. Connect it explicitly to their work. No invented numbers, no CV dump.
   • P3 — ASK (1–2 sentences MAX): one clear, low-friction ask — "Open to a quick 15-min chat this week?" + "Resume attached." Nothing more.

C. LENGTH: 60–120 words for the whole body (excluding signature). Count them.

D. TONE — ${isAllMode ? 'professional but warm:' : 'match YC founder culture:'}
   ${isAllMode
     ? '• Friendly-professional. Contractions are fine. No "Dear Sir/Madam", no "esteemed", no "honoured". Sentence case (not lowercase). Sound like a developer reaching out directly, not a job-board applicant.'
     : '• Casual, founder-to-founder. Contractions are fine ("I\'ve", "you\'re", "don\'t").\n   • Lowercase opener is ALLOWED if it feels natural. Sentence case is fine too. Avoid stiff "Dear" / "esteemed" / "honoured" / "kindly".\n   • Sound like a smart developer who actually uses their product — not like a job applicant.'}

E. SUBJECT LINE — under 60 chars. Pick ONE formula:
   • Shared journey / specific detail: "loved ${company}'s take on <specific thing from their description>"
   • Role reframe: "Engineer who'd ship at ${company} — Node/Mongo + Docker"
   • Function + credibility: "Full-stack (Node/React) — interested in ${company}"
   AVOID generic openers: "Application for…", "Exploring opportunities at…", "Backend Engineer with X yrs".

F. NO FILLER PHRASES — these are BANNED (instant rewrite):
   "I came across while exploring", "I'd love to learn more about your goals", "share how I can add value",
   "passionate about", "honored to apply", "esteemed organisation", "esteemed organization",
   "I am writing to express", "writing to express my interest", "kindly consider",
   "great work in this space", "doing amazing work", "innovative company",
   "robust high-performance APIs", "scalable enterprise solutions", "expanding its HR tech stack",
   "I really liked", "I hope this email finds you well", "Dear Sir", "Dear Madam",
   "please find attached" (just say "resume attached"), "look forward to hearing".

G. NO PLACEHOLDERS: no [brackets], no <angles>, no "X years", no "skill 1", no template residue.

H. GREETING: ALWAYS use exactly "${greetingLine}" as the first line. Do not change it. Do not write "Dear ${greetingFirst}" or "Hello ${greetingFirst}".

I. TALK ABOUT THEM MORE THAN YOU: P1 must reference something REAL about ${company} ${isAllMode ? 'taken from the company description above' : 'or its founders'}. P2 connects your one project to their work. If you only have material to talk about yourself, you have not done the research — STOP and re-read the ${isAllMode ? 'company description' : 'founder bios + company context'}.

═══════════════════════════════════════════════
OUTPUT — MUST be valid JSON, exactly:
{
  "subject": "...",
  "body": "${greetingLine}\\n\\n<P1>\\n\\n<P2>\\n\\n<P3>\\n\\nBest,\\n<full name from resume>\\n<linkedin url if in resume>\\n<phone if in resume>\\n<github url if in resume>"
}

The "body" string MUST contain literal "\\n\\n" between paragraphs and "\\n" between signature lines. No HTML tags. Omit signature lines whose URL/value is not in the resume.
${competitors ? `\nReference (do NOT mention by name in the email): competitors of ${company} include ${competitors}. Use this only to understand their space — do NOT name competitors in the email.` : ''}
`.trim();
}

const PLACEHOLDER_REGEX = /\[[^\]]*\]|<[^>]*>|\bX\s*years?\b|\bskill\s*\d\b|\byour name\b|\byour role\b|\b1 achievement\b/gi;

// Hallucinated-experience patterns — block emails claiming years of experience.
const FAKE_EXPERIENCE_REGEX = /\b(\d+\+?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(\+|plus)?\s*years?\s*(of\s*)?(professional\s*|industry\s*|work\s*|hands-on\s*)?experience\b/gi;

// Banned filler phrases — the guide's hit list + the prior bot's list. Case-insensitive.
const BANNED_PHRASE_REGEX = /\b(esteemed organi[sz]ation|honou?red to apply|passionate about|I came across while exploring|writing to express|kindly consider|great work in this space|doing amazing work|innovative company|robust high-performance APIs|scalable enterprise solutions|expanding its HR tech stack|I hope this email finds you well|Dear Sir|Dear Madam|please find attached|look forward to hearing from you)\b/gi;

function detectPlaceholders(text) {
  if (!text) return null;
  return text.match(PLACEHOLDER_REGEX);
}

function detectFakeExperience(text) {
  if (!text) return null;
  return text.match(FAKE_EXPERIENCE_REGEX);
}

function detectBannedPhrases(text) {
  if (!text) return null;
  return text.match(BANNED_PHRASE_REGEX);
}

module.exports = { buildTemplatePrompt, detectPlaceholders, detectFakeExperience, detectBannedPhrases };
