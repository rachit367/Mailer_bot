require('dotenv').config();
const nodemailer = require('nodemailer');

const DAILY_LIMIT = Number(process.env.DAILY_LIMIT) || 20;
const DELAY_MIN = Number(process.env.DELAY_MIN) || 20000; // 20 sec
const DELAY_MAX = Number(process.env.DELAY_MAX) || 30000; // 30 sec
const PROGRESS_FILE_V3 = 'progress_v3.json';
const DATA_FILE_V3 = 'HR_Lists.xlsx';

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
  PROGRESS_FILE_V3,
  DATA_FILE_V3,
  transporter
};
