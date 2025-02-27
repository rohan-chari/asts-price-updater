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
    page.on('console', (msg) => {
      console.log(msg.text());
    });
  
    return await page.evaluate(() => {
      const getText = (el) => (el ? el.innerText.trim() : null);
  
      const results = [];
      const articles = Array.from(document.querySelectorAll('article'));
      
      articles.forEach((tweet, index) => {
        const contentEls = tweet.querySelectorAll('div[data-testid="tweetText"]');
        const contentArray = Array.from(contentEls).map((el) => getText(el));
  
        const authorEls = tweet.querySelectorAll('div[data-testid="User-Name"]');
        const authorArray = Array.from(authorEls)
            .map(el => getText(el)) // Extracts full author text
            .map(text => {
                const match = text.match(/@\w+/); // Extract @username
                return match ? match[0].replace('@', '') : null; // Remove '@' for direct comparison
            })
            .filter(Boolean); // Remove null values
            
        const imageEls = tweet.querySelectorAll('a[href*="/photo/"]');
        const imageArray = Array.from(imageEls)
            .map(el => el.getAttribute('href'))
            .filter(href => authorArray.some(author => href.includes(`/${author}/`))); // Ignore @ and check match
        
        const imagesByAuthor = {};
        imageArray.forEach(href => {
            let imageAuthorIndex = authorArray.findIndex(author => href.includes(`/${author}/`));
            
            if (imageAuthorIndex !== -1) {
                let imageAuthor = authorArray[imageAuthorIndex];
                let imageAnchor = tweet.querySelector(`a[href="${href}"]`); // Find <a> tag
                
                if (imageAnchor) {
                    let imageTag = imageAnchor.querySelector('img'); // Find <img> inside <a>
                    
                    if (imageTag) {
                        let imgUrl = imageTag.src; // Extract image URL
                        
                        if (!imagesByAuthor[imageAuthor]) {
                            imagesByAuthor[imageAuthor] = []; // Initialize array if not exists
                        }
                        imagesByAuthor[imageAuthor].push(imgUrl);
                    }
                }
            }
        });

            
    
            

        const idEls = tweet.querySelectorAll('a[href*="/status/"]');
        const idArray = Array.from(idEls)
            .map(el => el.getAttribute('href'))
            .filter(href => !href.includes('/photo/') && !href.includes('/analytics'))
            .map(href => href.split('/status/')[1]?.split('/')[0]);


        

        let result = {
          tweet_id: idArray[0],
          tweet_text: contentArray[0] || null,
          tweet_author: authorArray[0] || null,
          tweet_images: imagesByAuthor[authorArray[0]] || null,
          quote_text: null,
          quote_author: null,
          quote_images: imagesByAuthor[authorArray[1]] || null
        };
  
        if (contentArray.length > 1) {
          result.quote_text = contentArray[1];
          result.quote_author = authorArray[1] || null;
        }
  
        // Check for ASTS
        if (
          (result.tweet_text && result.tweet_text.includes("ASTS")) ||
          (result.quote_text && result.quote_text.includes("ASTS"))
        ) {
          results.push(result);
        }
      });
  
      return results;
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
