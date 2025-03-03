const mysql = require('mysql2/promise');
require('dotenv').config();
import moment from 'moment-timezone'; 

const DB_CONFIG = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
};

const TWITTER_USERNAME = process.env.TWITTER_USERNAME;  
const TWITTER_PASSWORD = process.env.TWITTER_PASSWORD;
const TARGET_USERS = process.env.TWITTER_TARGETS ? process.env.TWITTER_TARGETS.split(',') : [];

// Random delay function
async function randomDelay() {
    const delayTime = Math.floor(Math.random() * (10000 - 5000 + 1)) + 1000;
    return new Promise(resolve => setTimeout(resolve, delayTime));
}

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

async function navigateToProfiles(page) {
    for (const user of TARGET_USERS) {      
        await page.goto(`https://x.com/${user}`, { waitUntil: 'domcontentloaded' });
        await randomDelay();
        const currentUserTweetUrls = await scrollAndScrapeReplyUrls(page,user);
        await postTwitterUrlsToDb(currentUserTweetUrls);
    }
}

// Delay function for replacing deprecated waitForTimeout
async function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

// Moves the mouse smoothly to a target location
async function moveMouseSmoothly(page, x, y) {
    console.log(`🖱 Moving mouse to (${x.toFixed(2)}, ${y.toFixed(2)})`);
    const steps = 8;

    let startX = Math.random() * 200;
    let startY = Math.random() * 200;

    for (let i = 0; i <= steps; i++) {
        const newX = startX + ((x - startX) * i) / steps;
        const newY = startY + ((y - startY) * i) / steps;
        await page.mouse.move(newX, newY);
        await delay(7);
    }
    console.log('✅ Mouse movement completed.');
}




async function clickRepliesButtonWithMouse(page) {
    console.log('🔍 Locating Replies button...');

    const repliesButton = await page.waitForSelector('a[href*="with_replies"]', { visible: true });

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
    const maxAttempts = 5;
    let attempts = 0;
    while (attempts < maxAttempts) {
      console.log(`Attempt #${attempts}`);
  
      // Get all loaded tweets
      const tweets = await page.$$('article');
      if (tweets.length === 0) {
        // No tweets found, scroll to load more
        await humanLikeScroll(page);
        attempts++;
        continue;
      }
  
      for (const tweet of tweets) {
        // Check if tweet is pinned
        const isPinned = await page.evaluate(el => {
          return Array.from(el.querySelectorAll('div'))
            .some(div => div.innerText.trim() === 'Pinned');
        }, tweet);
        
        if (isPinned) {
          console.log('Skipping pinned tweet...');
          continue;
        }
  
        // Extract tweet ID
        const tweetId = await page.evaluate(el => {
          const timeElement = el.querySelector('time');
          if (timeElement && timeElement.parentElement) {
            const href = timeElement.parentElement.getAttribute('href');
            if (href && href.includes('/status/')) {
              return href.split('/status/')[1];
            }
          }
          return null;
        }, tweet);
        
        if (!tweetId) {
          // Tweet ID could not be parsed; skip
          continue;
        }
        // Check if tweet exists in DB
        const tweetExists = await doesTweetExistInDb(tweetId);
        if (tweetExists) {
          // Found a tweet that exists, exit function
          continue;
        } else {
          // Scroll tweet into view
          await page.evaluate(el => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, tweet);
  
          // Click to open the tweet
          const timestampElement = await tweet.$('time');
          if (timestampElement) {
            await page.evaluate(el => el.click(), timestampElement);
          } else {
            // Fallback: click the tweet body
            const tweetBody = await tweet.$('[data-testid="tweet"]');
            if (tweetBody) {
              await page.evaluate(el => el.click(), tweetBody);
            } else {
              await page.evaluate(el => el.click(), tweet);
            }
          }
          
          // Wait for tweet thread to load
          await page.waitForSelector('[data-testid="tweetText"]', { visible: true });
          await randomDelay(); // Wait a random amount of time
  
          // Scroll up to avoid UI disruptions
          await scrollToTop(page);
          await randomDelay();
  
          // Scrape and store thread in DB
          const tweetsInThread = await getTweetsOnPage(page);
          await addTweetsToDb(tweetsInThread);
  
          // Go back to the main tweet feed
          await page.goBack();
          await randomDelay();
        }
      }
  
      // Scroll to load more tweets
      await humanLikeScroll(page);
      attempts++;
    }
  }

async function doesTweetExistInDb(tweetId) {
    try {
        const connection = await mysql.createConnection(DB_CONFIG);
        const [rows] = await connection.execute(`SELECT 1 FROM tweets WHERE tweet_id = ? LIMIT 1`, [tweetId]);
        await connection.end();
        console.log("DB CHECK", rows.length > 0)
        return rows.length > 0; 
    } catch (error) {
        console.error(`❌ Database error (doesTweetExistInDb):`, error);
        return false;
    }
}

async function addTweetsToDb(listOfTweets){
    const connection = await mysql.createConnection(DB_CONFIG);
    if(listOfTweets && listOfTweets.length > 1){
        for (let i = 0; i < listOfTweets.length; i++) {
            const parentId = i > 0 ? listOfTweets[i - 1].tweet_id : null; 
            await connection.execute(
                `INSERT IGNORE INTO tweets (tweet_id, tweet_text, tweet_author, tweet_images, quote_text, quote_author, quote_images, parent_id, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`, 
                [
                    listOfTweets[i].tweet_id,
                    listOfTweets[i].tweet_text || "",
                    listOfTweets[i].tweet_author,
                    listOfTweets[i].tweet_images,
                    listOfTweets[i].quote_text,
                    listOfTweets[i].quote_author,
                    listOfTweets[i].quote_images,
                    parentId 
                ]
            );
        }
        
    }else if(listOfTweets && listOfTweets.length ==1){
        await connection.execute(
            `INSERT IGNORE INTO tweets (tweet_id, tweet_text, tweet_author, tweet_images, quote_text, quote_author, quote_images, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`, 
            [
                listOfTweets[0].tweet_id,
                listOfTweets[0].tweet_text || "",
                listOfTweets[0].tweet_author,
                listOfTweets[0].tweet_images,
                listOfTweets[0].quote_text,
                listOfTweets[0].quote_author,
                listOfTweets[0].quote_images
            ]
        );
    }
    console.log("Added tweet to database")
    await connection.end();

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
  
  
  
  
async function humanLikeScroll(page, amount) {
  let scrollCounter = 0;

  while (scrollCounter < amount) {
    let totalScroll = Math.floor(Math.random() * 700) + 200; 
    let steps = Math.floor(totalScroll / 5) + 1; 
    let stepSize = totalScroll / steps; 

    for (let i = 0; i < steps; i++) {
      let xOffset = Math.random() * 5 - 2.5; 
      let yOffset = stepSize + Math.random() * 35; 

      await page.mouse.wheel({ deltaX: xOffset, deltaY: yOffset });
      await delay(Math.random() * 50 + 30); 
    }

    await randomDelay(); 
    scrollCounter++;
  }
}  

async function scrollToTop(page) {
    await page.evaluate(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    console.log("Scrolled to top.");
}

async function getMostRecentTweetFromUser(user){
  const connection = await mysql.createConnection(DB_CONFIG);
  const [rows] = await connection.execute(`SELECT 1 FROM tweets WHERE tweet_author = ? ORDER BY created_at DESC LIMIT 1`, [user]);
  await connection.end();
  return rows;
}

async function getAllTweetUrls(page, user) {
  let tweetUrls = [];
  
  const tweetId = await getMostRecentTweetFromUser(user);

  const extractedTweets = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('article'))
      .map(tweet => {
        const timeElement = tweet.querySelector('time');
        const href = timeElement?.parentElement?.getAttribute('href') || null;
        
        if (!href || !href.includes('/status/')) return null;
        
        return {
          tweetUrl: `x.com${href}`,
          tweetId: href.split('/status/')[1]
        };
      })
      .filter(tweet => tweet !== null); 
  });


  for (const tweet of extractedTweets) {
    if (tweet.tweetId === tweetId) break; 
    tweetUrls.push(tweet);
    if (tweetUrls.length >= 10) break; 
  }

  return tweetUrls;
}


async function scrollAndScrapeReplyUrls(page,user){
  await clickRepliesButtonWithMouse(page);
  await randomDelay();
  await humanLikeScroll(page,2);
  const tweetUrls = await getAllTweetUrls(page,user);
  return tweetUrls;
}

async function postTwitterUrlsToDb(urls) {
  const connection = await mysql.createConnection(DB_CONFIG);
  try {
    const query = `INSERT IGNORE INTO tweet_urls (tweetUrl, tweetId) VALUES ?`;

    const values = urls.map(urlObj => [urlObj.tweetUrl, urlObj.tweetId]);

    await connection.query(query, [values]);

    console.log('Inserted successfully');
  } catch (error) {
    console.error('Error inserting data:', error);
  } finally {
    await connection.end();
  }
}
async function fetchAllTweetUrls(){
  const connection = await mysql.createConnection(DB_CONFIG);
  try{
    const query = `SELECT * FROM tweet_urls`;

    const [rows] = await connection.execute(query)
    return rows;

  }catch (error) {
    console.error('Error inserting data:', error);
  } finally {
    await connection.end();
  }
}

async function scrapeTwitterThread(page) {
  await humanLikeScroll(page, 1);
  let tweetInfo = [];
  const tweets = await page.$$('article');
  let threadAuthor = "";
  let lastTweetId = null;

  for (let i = 0; i < tweets.length; i++) {
    const handle = await tweets[i].$$eval('div[data-testid="User-Name"]', nodes =>
      nodes.map(node => node.innerText.split("@")[1].split("\n")[0].trim())
    ).catch(() => ["Unknown"]);    

    const tweetTexts = await tweets[i].$$eval('div[data-testid="tweetText"]', nodes => 
      nodes.map(node => node.innerText.replace(/\s+/g, ' ').trim())
    ).catch(() => []);

    const mainTweetText = tweetTexts.length > 0 ? tweetTexts[0] : "Unknown"; 
    const quotedTweetText = tweetTexts.length > 1 ? tweetTexts.slice(1).join(" ") : null; // Everything after the first is a quoted tweet
    
    if (i == 0 ) {
      threadAuthor = handle[0];
    }
    if(threadAuthor == handle[0] ||  mainTweetText.includes('$ASTS')){
      const images = await tweets[i].$$eval('a[href*="/photo/"]', nodes =>
        nodes.map(a => {
          const href = a.getAttribute('href');
          const imgTag = a.querySelector('img'); // Get the actual image
          const src = imgTag ? imgTag.src : null;
      
          const match = href.match(/^\/([^\/]+)\/status\/(\d+)\/photo\/(\d+)$/);
          return match && src ? { account: match[1], url: href, imageUrl: src } : null;
        }).filter(Boolean) // Remove any null values
      ).catch(() => []);
      
      // Separate images by account
      const tweetImages = images.filter(x => x.account === handle[0]).map(x => ({ imageUrl: x.imageUrl }));
      const quoteImages = images.filter(x => x.account === handle[1]).map(x => ({ imageUrl: x.imageUrl }));
  
      const timestamp = await tweets[i].$eval('time[datetime]', node => node.getAttribute('datetime')).catch(() => "Unknown");
  
      const tweetId = await tweets[i].$$eval('a[href*="/status/"]', nodes => {
        return nodes
            .map(el => el.getAttribute('href'))
            .filter(href => href && !href.includes('/photo/') && !href.includes('/analytics'))
            .map(href => href.split('/status/')[1]?.split('/')[0]) 
            .shift() || "Unknown"; 
      }).catch(() => "Unknown");
    
      //tweetInfo.threadAuthor = threadAuthor;
  
  
      tweetInfo.push({    
        tweetId: tweetId,
        tweetAuthor: handle[0],
        tweetText: mainTweetText,
        quoteAuthor: handle[1] || null,
        quoteTweet: quotedTweetText,
        tweetImages: tweetImages,
        quoteImages: quoteImages,
        timestamp: timestamp,
        parentId: lastTweetId
      })
      lastTweetId = tweetId;  
    }else{
      continue;
    }
  }
  await addThreadToDb(tweetInfo);
}

async function addThreadToDb(thread) {
  const connection = await mysql.createConnection(DB_CONFIG);
  try {
    const query = `
      INSERT IGNORE INTO tweets 
      (tweet_id, tweet_text, tweet_author, tweet_images, quote_text, quote_author, quote_images, parent_id, created_at) 
      VALUES ?
    `;

    const values = thread.map(tweet => [
      tweet.tweetId,
      tweet.tweetText,
      tweet.tweetAuthor,
      JSON.stringify(tweet.tweetImages), 
      tweet.quoteTweet,
      tweet.quoteAuthor,
      JSON.stringify(tweet.quoteImages), 
      tweet.parentId,
      convertToEST(tweet.timestamp)
    ]);
    //NEED TO DELETE FROM TWEET_URLS

    await connection.query(query, [values]);
    console.log('Thread inserted successfully');
  } catch (error) {
    console.error('Error inserting thread:', error);
  } finally {
    await connection.end();
  }
}

function convertToEST(utcTimestamp) {
  if (!utcTimestamp || utcTimestamp === "Unknown") return null; // Handle missing timestamps
  return moment.utc(utcTimestamp).tz("America/New_York").format("YYYY-MM-DD HH:mm:ss");
}


async function processTweets(page){
  const tweetUrls = await fetchAllTweetUrls();
  for(let i = 0; i < tweetUrls.length; i++){
    //NEED TO CHANGE TO NON HARDCODED
    await page.goto(`https://x.com/thekookreport/status/1895499090521415705`, { waitUntil: 'networkidle2' });
    //await page.goto(`https://${tweetUrls[i].tweetUrl}`, { waitUntil: 'networkidle2' });
    await scrapeTwitterThread(page);
    return;
  }
}



// Export functions for use in main script
module.exports = {
    randomDelay,
    delay,
    moveMouseSmoothly,
    clickRepliesButtonWithMouse,
    clickFirstNonPinnedTweet,
    humanLikeScroll,
    scrollAndScrapeReplyUrls,
    postTwitterUrlsToDb,
    loginTwitter,
    navigateToProfiles,
    processTweets
};
