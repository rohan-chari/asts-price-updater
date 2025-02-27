// Random delay function
async function randomDelay() {
    const delayTime = Math.floor(Math.random() * (10000 - 5000 + 1)) + 2000;
    return new Promise(resolve => setTimeout(resolve, delayTime));
}

// Delay function for replacing deprecated waitForTimeout
async function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

// Moves the mouse smoothly to a target location
async function moveMouseSmoothly(page, x, y) {
    console.log(`🖱 Moving mouse to (${x.toFixed(2)}, ${y.toFixed(2)})`);
    const steps = 40;

    let startX = Math.random() * 200;
    let startY = Math.random() * 200;

    for (let i = 0; i <= steps; i++) {
        const newX = startX + ((x - startX) * i) / steps;
        const newY = startY + ((y - startY) * i) / steps;
        await page.mouse.move(newX, newY);
        await delay(10);
    }
    console.log('✅ Mouse movement completed.');
}


// Installs a mouse tracker in the browser for debugging
async function installMouseHelper(page) {
    await page.evaluateOnNewDocument(() => {
        if (window !== window.parent) return;
        window.addEventListener('DOMContentLoaded', () => {
            const box = document.createElement('puppeteer-mouse-pointer');
            const styleElement = document.createElement('style');
            styleElement.innerHTML = `
                puppeteer-mouse-pointer {
                    pointer-events: none;
                    position: absolute;
                    top: 0;
                    z-index: 10000;
                    left: 0;
                    width: 20px;
                    height: 20px;
                    background: rgba(255, 0, 0, 0.4);
                    border: 1px solid white;
                    border-radius: 10px;
                    margin: -10px 0 0 -10px;
                    padding: 0;
                    transition: background .2s, border-radius .2s, border-color .2s;
                }
            `;
            document.head.appendChild(styleElement);
            document.body.appendChild(box);
            document.addEventListener('mousemove', event => {
                box.style.left = event.pageX + 'px';
                box.style.top = event.pageY + 'px';
            }, true);
        }, false);
    });
}

async function clickRepliesButtonWithMouse(page) {
    console.log('🔍 Locating Replies button...');

    const repliesButton = await page.waitForSelector('a[href*="with_replies"]', { visible: true });
    await installMouseHelper(page);

    if (repliesButton) {
        console.log('✅ Replies button found. Moving mouse...');
        
        const box = await repliesButton.boundingBox();
        
        if (box) {
            console.log(`🎯 Moving mouse to Replies button at (${box.x}, ${box.y})`);
            
            await moveMouseSmoothly(page, box.x + box.width / 2, box.y + box.height / 2);

            console.log('🖱 Mouse reached Replies button. Clicking...');
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        } else {
            console.log('❌ Could not retrieve button position.');
        }
    } else {
        console.log('❌ Replies button not found.');
    }
}

async function clickFirstNonPinnedTweet(page) {
    let maxAttempts = 5 
    let attempts = 0;

    while (attempts < maxAttempts) {
        // Get all tweets currently loaded
        console.log('attempt #: ' + attempts)
        const tweets = await page.$$('article');
        
        if (tweets.length > 0) {
            for (const tweet of tweets) {
                // Check if this tweet contains a div with "Pinned"
                const isPinned = await page.evaluate(el => {
                    return Array.from(el.querySelectorAll('div'))
                        .some(div => div.innerText.trim() === "Pinned");
                }, tweet);

                if (!isPinned) {
                    await page.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), tweet);
                    console.log("Found non-pinned tweet and centered it.");
                
                    const timestamp = await tweet.$('time');
                    if (timestamp) {
                        await page.evaluate(el => el.click(), timestamp);
                    } else {
                        // Fallback: click the tweet body or entire tweet
                        const tweetBody = await tweet.$('[data-testid="tweet"]');
                        if (tweetBody) {
                            await page.evaluate(el => el.click(), tweetBody);
                        } else {
                            await page.evaluate(el => el.click(), tweet);
                        }
                    }
                
                    
                    // **Wait for thread to fully load before interacting again**
                    await page.waitForSelector('[data-testid="tweetText"]', { visible: true });
                
                
                    // **Wait some time before scrolling up to avoid UI disruptions**
                    await randomDelay();
                
                    // **Now scroll to top safely**
                    await scrollToTop(page);
                    await randomDelay();
                    //put this into new function - pass in page. Add delay too
                    const tweets = await getTweetsOnPage(page);
                
                    console.log(tweets);
                    
                    return; // Ensure it only processes one tweet
                }

                console.log("Skipping pinned tweet...");
            }
        }


        await humanLikeScroll(page);

        attempts++;
    }
}

async function getTweetsOnPage(page) {
    return await page.evaluate(() => {
        const getText = (el) => (el ? el.innerText.trim() : null);
        const getImages = (el) => el ? Array.from(el.querySelectorAll('img')).map(img => img.src) : [];

        return Array.from(document.querySelectorAll('article')).map(tweet => {
        // Outer text
        const contentEl = tweet.querySelector('div[data-testid="tweetText"]');
        const content = getText(contentEl) || 'No text';

        // Gather all status anchors but exclude any /photo/
        let anchors = Array
            .from(tweet.querySelectorAll('a[href*="/status/"]'))
            .filter(a => !a.href.includes('/photo/'));

        // Remove duplicates by href
        // (Converts to a Set of unique href strings, then back to DOM anchors)
        const uniqueHrefs = [...new Set(anchors.map(a => a.href))];
        anchors = uniqueHrefs.map(href => anchors.find(a => a.href === href));

        // Decide outer vs quoted
        let outerAnchor = null;
        let quoteAnchor = null;
        if (anchors.length === 1) {
            // Only 1 anchor -> no quote tweet
            outerAnchor = anchors[0];
        } else if (anchors.length > 1) {
            // Assume last anchor is the outer tweet, first anchor is quoted
            quoteAnchor = anchors[0];
            outerAnchor = anchors[anchors.length - 1];
        }

        // Outer tweet info
        const tweetUrl = outerAnchor 
            ? `https://x.com${outerAnchor.getAttribute('href').split('?')[0].split('/analytics')[0]}` 
            : 'No URL';

        const tweetIdPart = outerAnchor 
            ? outerAnchor.href.split("/status/")[1] 
            : null;
        const tweetId = tweetIdPart
            ? tweetIdPart.split("?")[0].split("/")[0]
            : null;

        const username = outerAnchor
            ? outerAnchor.href.split('/')[3]
            : 'Unknown';

        // Quoted tweet URL
        const possibleQuoteUrl = quoteAnchor 
        ? `https://x.com${quoteAnchor.getAttribute('href')
            .split('?')[0]
            .split('/analytics')[0]}` 
        : null;

        // Compare against outer tweetUrl, then finalize
        const quote_tweet = possibleQuoteUrl === tweetUrl 
        ? null 
        : possibleQuoteUrl;


        // Images
        const imageContainer = tweet.querySelector('div[data-testid="tweetPhoto"]');
        const images = getImages(imageContainer);
        const finalImages = images.length ? images : null;

        return {
            username: username,
            tweet: content,
            quote_tweet: quote_tweet,
            images: finalImages,
            tweetUrl: tweetUrl,
            tweetId: tweetId
        };
        });
    });
}
  
  
async function humanLikeScroll(page) {
    const scrollAmount = Math.floor(Math.random() * 300) + 100; // Between 100-300px
    await page.mouse.wheel({ deltaY: scrollAmount });

    console.log(`Scrolled down by ${scrollAmount}px`);

    // Wait a random time to mimic human behavior
    await randomDelay(); // 300-800ms
}

async function scrollToTop(page) {
    await page.evaluate(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    console.log("Scrolled to top.");
}



// Export functions for use in main script
module.exports = {
    randomDelay,
    delay,
    moveMouseSmoothly,
    installMouseHelper,
    clickRepliesButtonWithMouse,
    clickFirstNonPinnedTweet,
    humanLikeScroll
};
