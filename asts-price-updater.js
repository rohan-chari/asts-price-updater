const WebSocket = require('ws');
const mysql = require('mysql2/promise'); // Using mysql2 for async/await support
require('dotenv').config();
const fs = require('fs');

const DB_CONFIG = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10, // Limits open connections
    queueLimit: 0
};

const ALPACA_API_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY;
const ALPACA_WS_URL = 'wss://stream.data.alpaca.markets/v2/iex';

let socket;
let isAuthenticated = false;
const lastPrices = {};
const CACHE_EXPIRATION_TIME = 60 * 60 * 1000; // 1 hour

// ✅ Use a single MySQL connection pool
const pool = mysql.createPool(DB_CONFIG);

async function getCurrentPrice(symbol) {
    try {
        const [rows] = await pool.execute(
            `SELECT price FROM stock_prices WHERE symbol = ?`, 
            [symbol]
        );
        return rows.length ? rows[0].price : null;
    } catch (error) {
        console.error(`❌ Database error (getCurrentPrice):`, error);
        return null;
    }
}

async function updatePrice(symbol, newPrice) {
    try {
        await pool.execute(
            `INSERT INTO stock_prices (symbol, price) VALUES (?, ?) 
             ON DUPLICATE KEY UPDATE price = VALUES(price), last_updated = CURRENT_TIMESTAMP`,
            [symbol, newPrice]
        );
        console.log(`🔄 Updated ${symbol} price to ${newPrice}`);
    } catch (error) {
        console.error(`❌ Database error (updatePrice):`, error);
    }
}

// ✅ Auto-clear old cache data to free memory
function cleanupCache() {
    const now = Date.now();
    for (const symbol in lastPrices) {
        if (now - lastPrices[symbol].timestamp > CACHE_EXPIRATION_TIME) {
            delete lastPrices[symbol];
            console.log(`🗑️ Removed ${symbol} from cache`);
        }
    }
}

// ✅ Keep the last price cached to avoid unnecessary DB writes
async function handleTrade(symbol, price) {
    if (!lastPrices[symbol]) {
        console.log(`ℹ️ Cache miss for ${symbol}. Fetching from DB...`);
        lastPrices[symbol] = { price: await getCurrentPrice(symbol), timestamp: Date.now() };
    }

    if (lastPrices[symbol].price === null || lastPrices[symbol].price !== price) {
        console.log(`🔄 Price changed for ${symbol}. Updating DB...`);
        await updatePrice(symbol, price);
        lastPrices[symbol] = { price, timestamp: Date.now() };
    } else {
        console.log(`✅ Price unchanged for ${symbol}. No DB update needed.`);
    }
}

function connectWebSocket() {
    if (socket && socket.readyState !== WebSocket.CLOSED) {
        console.warn("⚠️ WebSocket already running. Skipping new connection.");
        return;
    }

    isAuthenticated = false;
    socket = new WebSocket(ALPACA_WS_URL);

    socket.addEventListener('open', () => {
        console.log("✅ WebSocket Connected to Alpaca");
        authenticate();
    });

    socket.addEventListener('message', async (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data[0] && data[0].T === "success" && data[0].msg === "authenticated") {
                console.log("🔐 Authentication successful!");
                isAuthenticated = true;
                subscribeToStock("ASTS");
            } else if (data[0] && data[0].T === "t") {
                const { S: symbol, p: price } = data[0];
                console.log(`📩 Received price for ${symbol}: ${price}`);
                await handleTrade(symbol, price);
            }
        } catch (e) {
            console.error("❌ Error parsing WebSocket message:", e);
        }
    });

    socket.addEventListener('close', () => {
        console.warn("⚠️ WebSocket Disconnected. Reconnecting in 10 seconds...");
        setTimeout(() => {
            console.log("🔄 Reconnecting WebSocket...");
            connectWebSocket();
        }, 10000);
    });

    socket.addEventListener('error', (error) => {
        console.error("🚨 WebSocket Error:", error);
        socket.close();
    });
}

function authenticate() {
    sendMessage({
        action: "auth",
        key: ALPACA_API_KEY,
        secret: ALPACA_SECRET_KEY
    });
}

function subscribeToStock(symbol) {
    if (isAuthenticated) {
        sendMessage({
            action: "subscribe",
            trades: [symbol]
        });
    } else {
        console.error("❌ Cannot subscribe, authentication failed.");
    }
}

function sendMessage(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    } else {
        console.error("❌ WebSocket is not open. Cannot send:", message);
    }
}

// ✅ Periodically clean up cache to free memory
setInterval(cleanupCache, CACHE_EXPIRATION_TIME);

connectWebSocket();
