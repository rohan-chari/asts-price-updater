const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
require('dotenv').config();


puppeteer.use(StealthPlugin());

const { randomDelay, scrollAndScrapeReplyUrls } = require('./helper-functions');


const TWITTER_USERNAME = process.env.TWITTER_USERNAME;  
const TWITTER_PASSWORD = process.env.TWITTER_PASSWORD;
const TARGET_USERS = process.env.TWITTER_TARGETS ? process.env.TWITTER_TARGETS.split(',') : [];

async function loginTwitter(page) {
    await page.goto('https://x.com/login', { waitUntil: 'networkidle2' });

    await page.waitForSelector('input[name="text"]');
    await page.type('input[name="text"]', TWITTER_USERNAME);
    await page.keyboard.press('Enter');
    await new Promise(resolve => setTimeout(resolve, 3000)); 

    await page.waitForSelector('input[name="password"]', { visible: true });
    await page.type('input[name="password"]', TWITTER_PASSWORD, { delay: 100 }); 
    await page.keyboard.press('Enter');

    await page.waitForNavigation();
    console.log('Logged into Twitter successfully.');
}

async function navigateToProfile(page) {
    for (const user of TARGET_USERS) {      
        await page.goto(`https://x.com/${user}`, { waitUntil: 'domcontentloaded' });
        await randomDelay();
        await scrollAndScrapeReplyUrls(page);
        //remove this
        break;
    }
}


async function scrapeTwitterProfile() {
    const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    await loginTwitter(page);
    await randomDelay();
    await navigateToProfile(page);
}

scrapeTwitterProfile();
