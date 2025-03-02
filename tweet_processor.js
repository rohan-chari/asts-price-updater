const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
require('dotenv').config();


puppeteer.use(StealthPlugin());

const { randomDelay, loginTwitter, processTweets } = require('./helper-functions');

async function processAndScrapeTwitterUrls() {
    const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    await loginTwitter(page);
    await randomDelay();
    await processTweets(page);
}

processAndScrapeTwitterUrls();
