const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
require('dotenv').config();
puppeteer.use(StealthPlugin());

const TWITTER_USERNAME = process.env.TWITTER_USERNAME;  
const TWITTER_PASSWORD = process.env.TWITTER_PASSWORD;  

async function loginTwitter(page) {
    await page.goto('https://twitter.com/login', { waitUntil: 'networkidle2' });

    // Enter username
    await page.waitForSelector('input[name="text"]');
    await page.type('input[name="text"]', TWITTER_USERNAME);
    await page.keyboard.press('Enter');
    await new Promise(resolve => setTimeout(resolve, 3000)); 

    // Enter password
    await page.waitForSelector('input[name="password"]', { visible: true });
    await page.type('input[name="password"]', TWITTER_PASSWORD, { delay: 100 }); 
    await page.keyboard.press('Enter');
    

    // Wait for navigation after login
    await page.waitForNavigation();
    console.log('Logged into Twitter successfully.');
}

async function scrapeTwitter() {
    const browser = await puppeteer.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    // Login to Twitter
    await loginTwitter(page);

    // Navigate to the search page
    await page.goto(`https://x.com/thekookreport`, {
        waitUntil: 'domcontentloaded'
    });

    // Scroll down to load more tweets
    for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await new Promise(resolve => setTimeout(resolve, 4000)); // Wait for 4 seconds
    }

    // Wait for tweets to load
    await page.waitForSelector('article', { timeout: 60000 });

    // Extract tweets
    const tweets = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('article')).slice(0, 10).map(tweet => {
            const content = tweet.querySelector('div[lang]')?.innerText || 'No text';
            const username = tweet.querySelector('a[href*="/status/"]')?.href.split('/')[3] || 'Unknown';
            const tweetUrl = tweet.querySelector('a[href*="/status/"]')?.href || 'No URL';
            return { username, content, tweetUrl };
        });
    });

    console.log(tweets);
    await browser.close();
    return tweets;
}

// Run the scraper
scrapeTwitter().then(console.log).catch(console.error);
