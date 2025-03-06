const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
require('dotenv').config();

puppeteer.use(StealthPlugin());

const { randomDelay, loginTwitter, navigateToProfiles } = require('./helper-functions');

const PROXY_HOST = process.env.PROXY_HOST || ''; 
const PROXY_USER = process.env.PROXY_USER || ''; 
const PROXY_PASS = process.env.PROXY_PASS || '';

const COOKIES_FILE = './scraper_cookies.json';

let browser = null;
let page = null;
let isProcessing = false; // Prevents overlapping executions


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
        console.log("♻️ Reusing existing Puppeteer instance.");
    }
    return page;
}

async function scrapeTwitterProfile() {
    if (isProcessing) {
        console.log("⚠️ Already processing, skipping this run.");
        return;
    }
    isProcessing = true; // Lock execution

    try {
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

        // ✅ Go to Twitter
        await page.goto('https://twitter.com/home', { timeout: 60000, waitUntil: 'domcontentloaded' });

        // ✅ Check if login is required
        const isLoggedIn = await page.evaluate(() => {
            return document.querySelector('input[name="session[username_or_email]"]') === null;
        });

        if (!isLoggedIn) {
            console.log('🔑 Not logged in, proceeding with login...');
            await loginTwitter(page);

            // ✅ Save cookies after logging in
            const cookies = await page.cookies();
            fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
            console.log('✅ Saved session cookies!');
        } else {
            console.log('✅ Already logged in, skipping login process.');
        }

        // ✅ Proceed with profile scraping
        await navigateToProfiles(page);
    } catch (error) {
        console.error("❌ Error in scraping process:", error);
    } finally {
        isProcessing = false; // Release execution lock
    }
    
    // ✅ Automatically restart once finished
    setImmediate(scrapeTwitterProfile);  // 👈 Ensures it runs again **immediately**
}

// ✅ Start the infinite loop
scrapeTwitterProfile();

// ✅ Gracefully close browser on exit
process.on('SIGINT', async () => {
    console.log("🔻 Closing browser before exiting...");
    if (browser) {
        await browser.close();
        console.log("🛑 Browser closed.");
    }
    process.exit();
});
