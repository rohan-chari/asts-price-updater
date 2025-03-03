const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
require('dotenv').config();

puppeteer.use(StealthPlugin());

const { randomDelay, loginTwitter, navigateToProfiles } = require('./helper-functions');

const PROXY_HOST = process.env.PROXY_HOST || ''; 
const PROXY_USER = process.env.PROXY_USER || ''; 
const PROXY_PASS = process.env.PROXY_PASS || '';

const COOKIES_FILE = './twitter_cookies.json';

async function scrapeTwitterProfile() {
    const browser = await puppeteer.launch({
        headless: false,
        slowMo: 50,
        args: [`--proxy-server=${PROXY_HOST}`]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    if (PROXY_USER && PROXY_PASS) {
        await page.authenticate({
            username: PROXY_USER,
            password: PROXY_PASS,
        });
    }

    // Load cookies if available
    if (fs.existsSync(COOKIES_FILE)) {
        const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
        await page.setCookie(...cookies);
        console.log('✅ Loaded session cookies!');
    }

    // Go to Twitter
    await page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });

    // Check if login is required
    const isLoggedIn = await page.evaluate(() => {
        return document.querySelector('input[name="session[username_or_email]"]') === null;
    });

    if (!isLoggedIn) {
        console.log('🔑 Not logged in, proceeding with login...');
        await loginTwitter(page);

        // Save cookies after logging in
        const cookies = await page.cookies();
        fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
        console.log('✅ Saved session cookies!');
    } else {
        console.log('✅ Already logged in, skipping login process.');
    }

    // Now proceed with scraping
    await navigateToProfiles(page);
}

scrapeTwitterProfile();
