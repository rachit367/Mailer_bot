# Mailer Bot — AI-Powered, Template-Driven Cold Outreach

An automated cold-email bot for job outreach. Reads a `.docx` template, your resume PDF, and a recruiter spreadsheet, then asks an LLM to **fill the template** for each recruiter — no placeholders, no invented numbers, ready to send.

---

## 🚀 Quick Start

```bash
npm install
npm start
```

The launcher will:
1. Detect every `.pdf` in the project root and let you pick one as your resume.
2. Load `HR_Contact_List.xlsx` (or whatever `DATA_FILE` you set in `.env`).
3. For each row: scrape the company, ask the LLM to fill the template, validate emails, send via Gmail.
4. Save progress to `progress.json` so the next run resumes where it left off.

---

## 📦 Setup

### 1. Prerequisites
- **Node.js** v16+
- A **Gmail App Password** (Google Account → Security → 2-Step Verification → App Passwords). The 16 chars go in `.env` with **no spaces**.

### 2. Install
```bash
git clone <repository-url>
cd Mailer
npm install
```

### 3. `.env`
Copy `.env_example.txt` to `.env` and fill in:

| Variable | Description |
|---|---|
| `EMAIL_USER` | Your Gmail address |
| `EMAIL_PASS` | 16-char Gmail App Password (no spaces) |
| `OPENROUTER_API_KEY` | Get one at [openrouter.ai](https://openrouter.ai) |
| `OPENROUTER_MODEL` | Primary model, e.g. `google/gemini-2.0-flash-001` |
| `OPENROUTER_FALLBACK_MODELS` | Comma-separated backups — tried in order on failure |
| `DAILY_LIMIT` | Max successful sends per run (default: 20) |
| `DELAY_MIN` / `DELAY_MAX` | Random delay between sends, in ms (default: 20000–30000) |
| `DATA_FILE` *(optional)* | Override the spreadsheet path. Defaults to `HR_Contact_List.xlsx` |

### 4. Drop in your data
- **Spreadsheet** — `HR_Contact_List.xlsx` in the project root. Columns expected: `Name`, `Email`, `Title`, `Company`. (`SNo` and others are ignored.)
- **Resume** — any `.pdf` in the project root. The launcher will list them.
- **Template** — `Cold Email Template.docx` in the project root. Use square-bracket placeholders (`[First Name]`, `[Company Name]`, `[X years]`, `[skill 1]`, `[1 achievement]`, `[Your Name]`, `[LinkedIn]`, etc.). The LLM will replace them all with real values from your resume.
- *(Optional)* **`user_instructions.md`** — extra sender context the LLM can weave in (see below). **Gitignored — kept private.**

### 5. Run
```bash
npm start
```

---

## 🧠 How the Template Flow Works

For every recruiter row, the LLM gets:

1. **The template text** (extracted from the `.docx` — paragraph order and tone preserved).
2. **Your parsed resume** (text from the chosen PDF).
3. **Recipient details** (`Name`, `Title`, `Company`).
4. **Scraped company context** (about/mission text, when found).
5. **Your `user_instructions.md`**, *if it exists*. The LLM may pull 1–2 of those facts into the email when they're genuinely relevant — it won't dump the whole list.

The LLM must:
- Follow the template's paragraph structure exactly.
- Replace every `[bracketed]` placeholder with real values pulled from the resume / recipient / company context.
- Use only contact links that actually appear in the resume — drop any that aren't there instead of writing a placeholder.
- Output valid JSON: `{ "subject", "body" }`.

A post-generation guard scans the output for leftover brackets, `X years`, `skill 1`, etc. and **skips the row** if anything slipped through — so a leaky LLM response never reaches a recruiter.

---

## 🛡️ Email Validation Layers

Each candidate address goes through:

1. **Excel column** — the `Email` value from the row.
2. **Web scrape** — emails found on the company's site (up to 5 candidates total).
3. **`email-validator`** — RFC syntax check.
4. **MX + reputation check** — disposable-domain blacklist + DNS MX lookup. Bad ones are dropped; questionable ones go through with a warning.

If nothing valid remains for a row, it's skipped.

---

## 🔁 LLM Fallback Chain

`OPENROUTER_FALLBACK_MODELS` is comma-separated and tried in order:

- 2 retries on `429` (rate limit) for the primary, 1 each for fallbacks.
- `401 / 402 / 403 / 404` → model is **blacklisted for the rest of the run**.
- Any other failure → 1.5s pause, then the next model.
- A successful fallback logs `✅ Fallback model worked: <model>`.

Example:
```
OPENROUTER_MODEL=google/gemini-2.0-flash-001
OPENROUTER_FALLBACK_MODELS=anthropic/claude-haiku-4-5,deepseek/deepseek-chat,meta-llama/llama-3.3-70b-instruct:free
```

---

## 🏗️ Project Structure

```
index.js                ← Launcher: picks PDF, loads spreadsheet, runs the loop
Cold Email Template.docx ← The template the LLM fills (your file, your wording)
HR_Contact_List.xlsx    ← Recruiter rows
resume.pdf              ← Source of truth for the sender's facts
user_instructions.md    ← Optional, gitignored sender extras
.env                    ← Secrets + tuning knobs

src/
  config.js             ← Env loader, transporter, paths
  utils.js              ← delay / random-delay / progress save+load
  templateLoader.js     ← Reads the .docx and user_instructions.md (cached)
  promptBuilder.js      ← Single source of truth for the LLM prompt
  llmService.js         ← OpenRouter call + fallback chain + placeholder guard
  emailScraper.js       ← Domain discovery + about-page scrape
  validation.js         ← MX + reputation check
  disposable_domains.js ← Blacklist
  mailService.js        ← Orchestrates: scrape → LLM → validate → send
```

---

## ⚙️ Run Flow

1. Validate `.env` (API key, Gmail creds).
2. Pick a resume PDF; parse to text.
3. Load all rows from the spreadsheet that have an `Email`.
4. Resume from `progress.json` if present.
5. Loop until `DAILY_LIMIT` successful sends or the list is exhausted:
   - scrape company info
   - LLM fills the template
   - validate emails
   - send with the resume attached
   - random delay (`DELAY_MIN`–`DELAY_MAX`)
6. Persist `progress.json` after every row, including failures and skips.

---

## 🔐 Privacy

- `.env`, `resume.pdf`, `progress.json`, and `user_instructions.md` are all in `.gitignore`. Personal data stays local.
- `user_instructions.md` is the place for soft sender context (projects you've shipped, stack you own, vibe you want the LLM to lean into) — keep it private and edit freely.
