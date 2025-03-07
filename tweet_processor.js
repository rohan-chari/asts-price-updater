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
let isProcessing = false; 
let iterationCount = 0;

async function openBrowserIfNeeded() {
    try {
        if (!browser) {
            console.log("🚀 Launching new Puppeteer browser...");
            browser = await puppeteer.launch({
                headless: true,
                slowMo: 0,
                args: [
                    `--proxy-server=${PROXY_HOST}`,
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ],
                protocolTimeout: 90000
            });
        }

        if (!page || page.isClosed()) { 
            console.log("♻️ Creating a new page in existing browser.");
            page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });

            // ✅ Load cookies **only when browser starts**
            if (fs.existsSync(COOKIES_FILE)) {
                const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
                await page.setCookie(...cookies);
                console.log('✅ Loaded session cookies at startup!');
            }
        }
        return page;
    } catch (error) {
        console.error("❌ Error opening browser:", error);
        throw error;
    }
}

async function processAndScrapeTwitterUrls() {
    if (isProcessing) {
        console.log("⚠️ Already processing, skipping this run.");
        return;
    }
    isProcessing = true; 

    try {
        if (!(await areThereAnyTweets())) {
            console.log("ℹ️ No tweets to scrape.");
        } else {
            page = await openBrowserIfNeeded();

            if (PROXY_USER && PROXY_PASS) {
                await page.authenticate({ username: PROXY_USER, password: PROXY_PASS });
            }
    
            await page.goto('https://x.com/home', { waitUntil: 'networkidle2', timeout: 90000 });
    
            const isLoggedIn = await page.evaluate(() => {
                return document.querySelector('input[name=\"session[username_or_email]\"]') === null;
            });
    
            if (!isLoggedIn) {
                console.log('🔒 Not logged in. Logging in now...');
                await loginTwitter(page);
    
                fs.writeFileSync(COOKIES_FILE, JSON.stringify(await page.cookies(), null, 2));
                console.log('💾 Session cookies saved!');
            }
    
            await randomDelay();
            await processTweets(page);
    
            iterationCount++;
            if (iterationCount >= 1 && page) { // ✅ Ensure page exists before closing
                console.log("♻️ Restarting browser to free memory...");
                await browser.close();
                browser = null;
                page = null;
                iterationCount = 0;
            }
        }
    } catch (error) {
        console.error("❌ Error in processing:", error);
        if (browser) { // ✅ Ensure browser is closed on error
            await browser.close();
            browser = null;
            page = null;
        }
    } finally {
        isProcessing = false;
        setTimeout(processAndScrapeTwitterUrls, 30000); // ✅ Ensures loop continues
    }
}

processAndScrapeTwitterUrls();


// ✅ Gracefully close browser on exit
process.on('SIGINT', async () => {
    console.log("🔻 SIGINT received. Closing browser...");
    try {
        if (browser) await browser.close();
    } catch (err) {
        console.error("❌ Error closing browser:", err);
    }
    process.exit();
});

process.on('uncaughtException', async (err) => {
    console.error("🔥 Uncaught Exception! Closing browser...", err);
    try {
        if (browser) await browser.close();
    } catch (error) {
        console.error("❌ Error closing browser:", error);
    }
    process.exit(1);
});
