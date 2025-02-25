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
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for 4 seconds

    // Enter password
    await page.waitForSelector('input[name="password"]', { visible: true });
    await page.type('input[name="password"]', TWITTER_PASSWORD, { delay: 100 }); 
    await page.keyboard.press('Enter');

    // Wait for navigation after login
    await page.waitForNavigation();
    console.log('Logged into Twitter successfully.');
}

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 1000;
            const timer = setInterval(() => {
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= document.body.scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 500);
        });
    });
}

async function scrapeTwitterProfile(targetUsername) {
    const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
    const page = await browser.newPage();
    
    // Log in
    await loginTwitter(page);

    // Navigate to the Twitter profile
    const profileUrl = `https://x.com/${targetUsername}`;
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });

    console.log(`Navigated to ${profileUrl}`);

    // Scroll down to load more tweets
    await autoScroll(page);

    // Wait for tweets to load
    await page.waitForSelector('article', { timeout: 60000 });

    // Extract tweets
    const tweets = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('article')).map(tweet => {
            const getText = (el) => (el ? el.innerText.trim() : null);
            const getImages = (el) => el ? Array.from(el.querySelectorAll('img')).map(img => img.src) : [];

            // Main tweet text
            const contentEl = tweet.querySelector('div[data-testid="tweetText"]');
            const content = getText(contentEl);

            // Quoted tweet (if present)
            const quoteTweetEl = tweet.querySelector('div[data-testid="tweet"]');
            const quoteTextEl = quoteTweetEl ? quoteTweetEl.querySelector('div[data-testid="tweetText"]') : null;
            const quoteText = getText(quoteTextEl);

            // Image URLs
            const imageContainer = tweet.querySelector('div[data-testid="tweetPhoto"]');
            const images = getImages(imageContainer);

            // Tweet URL
            const tweetUrlEl = tweet.querySelector('a[href*="/status/"]');
            const tweetUrl = tweetUrlEl ? `https://x.com${tweetUrlEl.getAttribute('href')}` : null;

            return {
                username: tweetUrl ? tweetUrl.split('/')[3] : 'Unknown',
                tweet: content || 'No text',
                quote_tweet: quoteText || null,
                images: images.length ? images : null,
                tweetUrl: tweetUrl || 'No URL',
            };
        });
    });

    console.log(tweets);
    await browser.close();
    return tweets;
}

// Run the scraper for a specific Twitter profile
scrapeTwitterProfile('thekookreport').then(console.log).catch(console.error);
