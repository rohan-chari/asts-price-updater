const WebSocket = require('ws');
const mysql = require('mysql2/promise'); // Using mysql2 for async/await support
require('dotenv').config();

const DB_CONFIG = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
};

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

let socket;
const lastPrices = {};

async function getCurrentPrice(symbol) {
    try {
        const connection = await mysql.createConnection(DB_CONFIG);
        const [rows] = await connection.execute(`SELECT price FROM stock_prices WHERE symbol = ?`, [symbol]);
        await connection.end();
        return rows.length ? rows[0].price : null; // Return price or null if not found
    } catch (error) {
        console.error(`❌ Database error (getCurrentPrice):`, error);
        return null;
    }
}

async function updatePrice(symbol, newPrice) {
    try {
        const connection = await mysql.createConnection(DB_CONFIG);
        await connection.execute(
            `INSERT INTO stock_prices (symbol, price) VALUES (?, ?) 
             ON DUPLICATE KEY UPDATE price = VALUES(price), last_updated = CURRENT_TIMESTAMP`,
            [symbol, newPrice]
        );
        await connection.end();
        console.log(`🔄 Updated ${symbol} price to ${newPrice}`);
    } catch (error) {
        console.error(`❌ Database error (updatePrice):`, error);
    }
}

async function handleTrade(symbol, price) {
    // Check cache first
    if (lastPrices[symbol] === undefined) {
        console.log(`ℹ️ Cache miss for ${symbol}. Fetching from DB...`);
        lastPrices[symbol] = await getCurrentPrice(symbol); // Fetch from DB if not in cache
    }

    if (lastPrices[symbol] === null || lastPrices[symbol] !== price) {
        console.log(`🔄 Price changed for ${symbol}. Updating DB...`);
        await updatePrice(symbol, price);
        lastPrices[symbol] = price; // Update cache
    } else {
        console.log(`✅ Price unchanged for ${symbol}. No DB update needed.`);
    }
}

function connectWebSocket() {
    socket = new WebSocket('wss://ws.finnhub.io?token=' + FINNHUB_API_KEY);

    socket.addEventListener('open', () => {
        console.log("✅ WebSocket Connected");
        sendMessage({ 'type': 'subscribe', 'symbol': 'ASTS' });
    });

    socket.addEventListener('message', async (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === "trade") {
                for (const trade of data.data) { 
                    const { s: symbol, p: price } = trade;
                    console.log(`📩 Received price for ${symbol}: ${price}`);
                    await handleTrade(symbol, price);
                }
            }
        } catch (e) {
            console.error("❌ Error parsing WebSocket message:", e);
        }
    });

    socket.addEventListener('close', () => {
        console.warn("⚠️ WebSocket Disconnected. Reconnecting...");
        setTimeout(connectWebSocket, 3000);
    });

    socket.addEventListener('error', (error) => {
        console.error("🚨 WebSocket Error:", error);
        socket.close();
    });
}

const sendMessage = (message) => {
    if (socket && socket.readyState === WebSocket.OPEN) { // Check if socket is defined and open
        socket.send(JSON.stringify(message));
    } else {
        console.error("❌ WebSocket is not open. Cannot send:", message);
    }
};

connectWebSocket();
