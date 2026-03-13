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

## 📦 Setup from Scratch

### Prerequisites
1. **Node.js**: Make sure you have Node.js installed (v16 or higher recommended).
2. **Gmail App Password**: 
   - You cannot use your regular Gmail password. 
   - Go to your Google Account Strategy -> Security -> 2-Step Verification.
   - Scroll to the bottom and create an **App Password** (name it something like "Mailer Bot").

### Step 1: Clone & Install
```bash
git clone <repository-url>
cd Mailer
npm install
```

### Step 2: Environment Configuration
1. Copy the example `.env` file:
   ```bash
   cp .env.example .env
   ```
2. Open the `.env` file and fill in your details:
   - `EMAIL_USER`: Your Gmail address (e.g., `you@gmail.com`).
   - `EMAIL_PASS`: The 16-character **App Password** you generated earlier.
   - `OPENROUTER_API_KEY`: Get this for free at [OpenRouter](https://openrouter.ai/).
   - `OPENROUTER_MODEL`: Set your primary AI model (e.g., `meta-llama/llama-3.3-70b-instruct:free`).
   - `OPENROUTER_FALLBACK_MODELS`: Comma-separated list of backup models if the primary gets rate-limited (e.g., `meta-llama/llama-3.3-8b-instruct:free`).
   - *Optional:* Adjust `DAILY_LIMIT`, `DELAY_MIN`, and `DELAY_MAX`.

### Step 3: Add Your Data
1. **The Excel File (`hr.xlsx`)**: 
   - Place a file named `hr.xlsx` in the root folder.
   - Ensure the first row has headers. It **must** include an `Email` column and a `Company` column.
2. **The Resume (`resume.pdf`)**: 
   - Place your resume as a PDF file named `resume.pdf` in the root folder. This is read by the AI to customize the emails.

### Step 4: Run the Bot
```bash
npm start
```

### How it Works
- The script checks `progress.json` to see where it left off.
- It will process up to `DAILY_LIMIT` lines from your Excel file.
- For each row, it generates a custom email, finds extra HR emails, and sends the email using your Gmail account.
- It waits for a random time (between `DELAY_MIN` and `DELAY_MAX`) between sending each email to avoid being flagged as spam.
- 🛑 **When the daily limit is reached**, the bot stops. Run it again the next day to continue down the list!
