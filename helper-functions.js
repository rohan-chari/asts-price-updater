// Random delay function
async function randomDelay() {
    const delayTime = Math.floor(Math.random() * (10000 - 5000 + 1)) + 5000;
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

// Scroll function that mimics human scrolling
async function humanScroll(page, targetSelector = null, scrollAmount = 500, steps = 20) {
    console.log(`🔽 Scrolling ${scrollAmount}px in ${steps} smooth steps...`);

    if (targetSelector) {
        const element = await page.$(targetSelector);
        if (element) {
            console.log(`🎯 Scrolling to element: ${targetSelector}`);
            await element.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }
    }

    for (let i = 0; i < steps; i++) {
        await page.evaluate(y => window.scrollBy(0, y), scrollAmount / steps);
        await delay(50 + Math.random() * 150);
    }

    console.log("✅ Finished smooth scrolling.");
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

async function scrollDown(page) {
    await page.mouse.wheel({deltaY:400});
}


// Export functions for use in main script
module.exports = {
    randomDelay,
    delay,
    moveMouseSmoothly,
    humanScroll,
    installMouseHelper,
    clickRepliesButtonWithMouse,
    scrollDown
};
