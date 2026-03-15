# Mailer Bot: AI-Powered Outreach (V1 + V2)

An automated mailing bot that sends personalized cold emails for job/internship applications. Powered by OpenRouter LLMs, with dynamic contact discovery, daily-limit management, and now **two modes** for two different recruiter datasets.

---

## 🚀 Quick Start

```bash
npm start
```

The launcher will interactively ask you **two questions**:

1. **Version** — V1 (generic HR contacts from `hr.xlsx`) or V2 (named recruiters from `Recruiter Email - Bengaluru_ Delhi-NCR.xlsx`)
2. **Resume PDF** — picks from any `.pdf` file in the project root

That's it. No flags, no separate scripts needed.

---

## 🆚 V1 vs V2

| Feature | V1 | V2 |
|---|---|---|
| **Data File** | `hr.xlsx` | `Recruiter Email - Bengaluru_ Delhi-NCR.xlsx` |
| **Sheets** | Single sheet | Two sheets (Bengaluru + Delhi-NCR) |
| **Email column** | `Email` | `Email Id` |
| **Company column** | `Company` | `Company Name` |
| **Extra data** | — | `Name`, `Job Profile`, `LinkedIn Profile`, `Location`, `account/website_url` |
| **Progress** | `progress.json` | `progress_v2.json` |
| **Email style** | Generic company-targeted | Addressed directly to the recruiter by name |

### V2 Excel Format

The new file has two sheets. Each row looks like:

| Name | Job Profile | Company Name | Email Id | LinkedIn Profile | Location | account/website_url | account/linkedin_url |
|---|---|---|---|---|---|---|---|
| Shrishti Singh | Associate Talent Acquisition | Zyion Group | shrishti.singh@zyon.com | linkedin.com/in/... | Bengaluru, Karnataka | zyon.com | ... |

---

## 📦 Setup

### Prerequisites
1. **Node.js** v16 or higher
2. **Gmail App Password** (not your regular password):
   - Google Account → Security → 2-Step Verification → App Passwords

### Step 1: Clone & Install
```bash
git clone <repository-url>
cd Mailer
npm install
```

### Step 2: Environment Configuration

Copy `.env_example.txt` to `.env` and fill in:

| Variable | Description |
|---|---|
| `EMAIL_USER` | Your Gmail address |
| `EMAIL_PASS` | 16-char Gmail App Password |
| `OPENROUTER_API_KEY` | Get free at [openrouter.ai](https://openrouter.ai) |
| `OPENROUTER_MODEL` | Primary model, e.g. `google/gemini-2.0-flash-001` |
| `OPENROUTER_FALLBACK_MODELS` | Comma-separated backup models |
| `DAILY_LIMIT` | Max emails per run (default: 20) |
| `DELAY_MIN` / `DELAY_MAX` | Delay range between sends in ms (default: 20000–30000) |

### Step 3: Add Your Data

**For V1** — place `hr.xlsx` in the project root with at least `Email` and `Company` columns.

**For V2** — place `Recruiter Email - Bengaluru_ Delhi-NCR.xlsx` in the project root (already included). Two sheets, columns as shown above.

**Resume** — drop any `.pdf` resume(s) in the project root. The launcher will list them and let you choose.

### Step 4: Run
```bash
npm start
```

---

## 🏗️ Architecture

```
index.js              ← Unified interactive launcher (picks version + PDF)
src/
  config.js           ← V1: config, transporter, paths
  config_v2.js        ← V2: config, transporter, paths
  utils.js            ← Shared: delay, progress tracking
  llmService.js       ← V1: LLM prompts (company-focused)
  llmService_v2.js    ← V2: LLM prompts (recruiter-name personalized)
  mailService.js      ← V1: email builder & sender
  mailService_v2.js   ← V2: email builder & sender (uses Email Id)
  emailScraper.js     ← Shared: domain discovery, web scraping
```

---

## ⚙️ How It Works

1. **Resume Parse** — reads your chosen PDF and extracts text for LLM context.
2. **Excel Load** — reads all rows (V2 combines both city sheets automatically).
3. **Per Row**:
   - **Company scraping** — finds domain, About page text, and career emails via DuckDuckGo.
   - **LLM Draft** — writes a short, personalized email (V2 addresses the recruiter by first name).
   - **LLM Contact Mining** — asks the AI for additional verified HR emails.
   - **Validation** — all emails are validated before sending. Max 5 recipients per email.
   - **Send** — delivers via Gmail with your resume attached.
4. **Progress saved** — picks up where it left off on next run (`progress.json` / `progress_v2.json`).
5. 🛑 **Stops after 10 successful sends** (or when the list is exhausted).
