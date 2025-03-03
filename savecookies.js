const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    const browser = await puppeteer.launch({ headless: false }); // Keep headless false for manual login
    const page = await browser.newPage();

    // Go to Twitter login page
    await page.goto('https://twitter.com/login', { waitUntil: 'networkidle2' });

    // Wait for user to log in manually
    console.log('Log in manually and press Enter here...');
    await new Promise(resolve => process.stdin.once('data', resolve));

    // Save session cookies
    const cookies = await page.cookies();
    fs.writeFileSync('./twitter_cookies.json', JSON.stringify(cookies, null, 2));

    console.log('Cookies saved!');
    await browser.close();
})();
