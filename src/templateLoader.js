const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const TEMPLATE_DOCX = 'Cold Email Template.docx';
const USER_INSTRUCTIONS_FILE = 'user_instructions.md';

let cachedTemplate = null;
let cachedUserInstructions = null;

async function loadTemplateText() {
  if (cachedTemplate !== null) return cachedTemplate;

  const templatePath = path.resolve(process.cwd(), TEMPLATE_DOCX);
  if (!fs.existsSync(templatePath)) {
    console.warn(`  ⚠️ Template file "${TEMPLATE_DOCX}" not found. LLM will generate without template guidance.`);
    cachedTemplate = '';
    return cachedTemplate;
  }

  const buf = fs.readFileSync(templatePath);
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');

  const text = xml
    .replace(/<w:p\b[^>]*>/g, '\n')
    .replace(/<w:br\b[^>]*\/?>/g, '\n')
    .replace(/<w:tab\b[^>]*\/?>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  cachedTemplate = text;
  return cachedTemplate;
}

function loadUserInstructions() {
  if (cachedUserInstructions !== null) return cachedUserInstructions;

  const filePath = path.resolve(process.cwd(), USER_INSTRUCTIONS_FILE);
  if (!fs.existsSync(filePath)) {
    cachedUserInstructions = '';
    return cachedUserInstructions;
  }

  cachedUserInstructions = fs.readFileSync(filePath, 'utf8').trim();
  return cachedUserInstructions;
}

module.exports = { loadTemplateText, loadUserInstructions };
