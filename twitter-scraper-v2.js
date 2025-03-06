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
let isProcessing = false;
let iterationCount = 0;

async function openBrowserIfNeeded() {
    try {
        if (!browser) {
            console.log("🚀 Launching new Puppeteer browser...");
            browser = await puppeteer.launch({
                headless: true,
                slowMo: 0,
                protocolTimeout: 60000,
                args: [
                    `--proxy-server=${PROXY_HOST}`,
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
            });
        }

        if (!page || page.isClosed()) { 
            console.log("♻️ Creating a new page in existing browser.");
            page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });

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

async function scrapeTwitterProfile() {
    if (isProcessing) {
        console.log("⚠️ Already processing, skipping this run.");
        return;
    }
    isProcessing = true;

    try {
        page = await openBrowserIfNeeded();

        if (PROXY_USER && PROXY_PASS) {
            await page.authenticate({ username: PROXY_USER, password: PROXY_PASS });
        }

        await page.goto('https://twitter.com/home', { timeout: 60000, waitUntil: 'domcontentloaded' });

        const isLoggedIn = await page.evaluate(() => {
            return document.querySelector('input[name="session[username_or_email]"]') === null;
        });

        if (!isLoggedIn) {
            console.log('🔑 Not logged in, logging in...');
            await loginTwitter(page);

            fs.writeFileSync(COOKIES_FILE, JSON.stringify(await page.cookies(), null, 2));
            console.log('✅ Session cookies saved!');
        }

        await navigateToProfiles(page);
        
        iterationCount++;
        if (iterationCount >= 2) { 
            console.log("♻️ Restarting page to free memory...");
            await page.removeAllListeners();
            await page.close();
            page = null;
            iterationCount = 0;
        }
    } catch (error) {
        console.error("❌ Error in scraping process:", error);
    } finally {
        isProcessing = false;
    }

    setTimeout(scrapeTwitterProfile, 5000);
}

scrapeTwitterProfile();
