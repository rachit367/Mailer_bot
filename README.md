# Mailer Bot: AI-Powered Outreach

An automated mailing bot that personalized cold emails for job/internship applications using OpenRouter LLMs, scraping additional contacts, and managing daily limits.

## 🚀 The Evolution

### Before (Initial State)
- **Single File**: All logic (Excel reading, nodemailer setup, loop) was in one `mailer.js` file.
- **Static Content**: Emails were sent using a hardcoded template with very basic placeholders.
- **Limited Reach**: Only sent emails to the single address provided in the Excel row.
- **Manual Data**: Required manually filling in company names and details correctly for every single row.

### Now (Current State)
- **Modular Architecture**: Refactored into a scalable `src/` modular structure (`config`, `utils`, `llmService`, `mailService`).
- **AI-Driven Personalization**: Uses **OpenRouter** (Gemini, Claude, or GPT) to read your `resume.pdf` and generate a unique, professional email body and subject tailored to each specific company.
- **Zero-Placeholder Guarantee**: The LLM is strictly instructed to avoid `[Placeholders]`. If data is missing (like a LinkedIn link), it intelligently rewords the email to omit it.
- **Dynamic Contact Scraping**: For every company, the bot asks the AI to find up to 4 additional verified HR/Careers emails, expanding your reach automatically.
- **Safety Caps**: Hard-coded limit of 5 recipients per email and strict hallucination guards to prevent sending to "guessed" email addresses.

---

## 🛠️ Key Changes Made

### 1. Architectural Refactor
- Extracted code into separate modules for better maintenance and readability.
    - `index.js`: Main entry point.
    - `src/config.js`: Global settings and security constants.
    - `src/utils.js`: Utility logic (random delays, progress tracking).
    - `src/llmService.js`: High-level AI prompting and JSON response parsing.
    - `src/mailService.js`: Email construction and attachment handling.

### 2. OpenRouter & PDF Integration
- Integrated `openai` client for OpenRouter compatibility.
- Added `pdf-parse` to extract your's resume text, ensuring the AI has the context of your skills and projects.
- Added dynamic model selection via environment variables.

### 3. Smart Logic Improvements
- **Dual-Prompt Workflow**: 
    - **Prompt 1**: Generates a professional, customized draft.
    - **Prompt 2**: Scrapes HR/Recruitment emails with high confidence requirements.
- **Rate Management**: Kept original random delay logic (20-30s) to prevent spam flags from email providers.
- **Email Deduplication**: Uses `Set` objects to ensure the original Excel email and scraped emails are unique and limited to 5 total.

---

## 📦 Setup & Usage

### 1. Installation
```bash
npm install
```

### 2. Environment Configuration
Create a `.env` file based on `.env_example.txt`:
- `EMAIL_USER`: Your Gmail address.
- `EMAIL_PASS`: Your Gmail App Password.
- `OPENROUTER_API_KEY`: Your API key from [OpenRouter](https://openrouter.ai/).
- `OPENROUTER_MODEL`: Preferred model (e.g., `google/gemini-2.5-flash` or `anthropic/claude-3.5-sonnet`).

### 3. Assets
- Place your `hr.xlsx` in the root (ensure it has columns: `Company`, `Email`, `Name`).
- Place your `resume.pdf` in the root.

### 4. Running
```bash
node index.js
```

The script will track progress in `progress.json` and respect your `DAILY_LIMIT`.
