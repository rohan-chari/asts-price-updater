const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
require('dotenv').config();
const fs = require('fs');

puppeteer.use(StealthPlugin());

const { randomDelay, loginTwitter, processTweets, areThereAnyTweets } = require('./helper-functions');

const PROXY_HOST = process.env.PROXY_HOST || ''; 
const PROXY_USER = process.env.PROXY_USER || ''; 
const PROXY_PASS = process.env.PROXY_PASS || '';

const COOKIES_FILE = './processor_cookies.json';

let browser = null;
let page = null;
let isProcessing = false; // Prevents overlapping runs

async function openBrowserIfNeeded() {
    if (!browser) {
        console.log("🚀 Launching new Puppeteer browser...");
        browser = await puppeteer.launch({
            headless: true,
            slowMo: 0,
            args: [
                `--proxy-server=${PROXY_HOST}`,
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        });
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
    } else {
        console.log("♻️ Using existing Puppeteer browser.");
    }
    return page;
}

async function processAndScrapeTwitterUrls() {
    if (isProcessing) {
        console.log("⚠️ Already processing, skipping this run.");
        return;
    }
    isProcessing = true; // Lock processing

    try {
        // ✅ Check DB for tweets **before opening browser**
        if (!(await areThereAnyTweets())) {
            console.log("ℹ️ No tweets to scrape.");
            return;
        }

        // ✅ Open browser only when needed
        const page = await openBrowserIfNeeded();

        // ✅ Authenticate proxy if needed
        if (PROXY_USER && PROXY_PASS) {
            await page.authenticate({ username: PROXY_USER, password: PROXY_PASS });
        }

        // ✅ Load cookies if available
        if (fs.existsSync(COOKIES_FILE)) {
            const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
            await page.setCookie(...cookies);
            console.log('✅ Loaded session cookies!');
        }

        await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 60000 });

        // ✅ Check if login is required
        const isLoggedIn = await page.evaluate(() => {
            return document.querySelector('input[name="session[username_or_email]"]') === null;
        });

        if (!isLoggedIn) {
            console.log('🔒 Not logged in. Logging in now...');
            await loginTwitter(page);

            // ✅ Save cookies after login
            const cookies = await page.cookies();
            fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies));
            console.log('💾 Session cookies saved!');
        }

        await randomDelay();
        await processTweets(page);
    } catch (error) {
        console.error("❌ Error in processing:", error);
    } finally {
        isProcessing = false; // Release lock
    }
}

// ✅ Prevent multiple overlapping executions
setInterval(async () => {
    await processAndScrapeTwitterUrls();
}, 30000);

// ✅ Gracefully close browser on exit
process.on('SIGINT', async () => {
    console.log("🔻 Closing browser before exiting...");
    if (browser) await browser.close();
    process.exit();
});
