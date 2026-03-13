const fs = require('fs');

const { DELAY_MIN, DELAY_MAX } = require('./config');

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const randomDelay = (min = DELAY_MIN, max = DELAY_MAX) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const loadProgress = (progressFile) => {
  let progress = { lastIndex: 0 };
  if (fs.existsSync(progressFile)) {
    progress = JSON.parse(fs.readFileSync(progressFile));
  } else {
    fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
  }
  return progress;
};

const saveProgress = (progressFile, progress) => {
  fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
};

module.exports = {
  delay,
  randomDelay,
  loadProgress,
  saveProgress
};
