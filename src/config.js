require('dotenv').config();
const nodemailer = require('nodemailer');

const DAILY_LIMIT = Number(process.env.DAILY_LIMIT) || 20;
const DELAY_MIN = Number(process.env.DELAY_MIN) || 20000;
const DELAY_MAX = Number(process.env.DELAY_MAX) || 30000;
const PROGRESS_FILE = 'progress.json';
const DATA_FILE = process.env.DATA_FILE || 'f25-emails.csv';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

module.exports = {
  DAILY_LIMIT,
  DELAY_MIN,
  DELAY_MAX,
  PROGRESS_FILE,
  DATA_FILE,
  transporter
};
