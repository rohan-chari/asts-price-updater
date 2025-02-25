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

const ALPACA_API_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY;
const ALPACA_WS_URL = 'wss://stream.data.alpaca.markets/v2/iex';

let socket;
const lastPrices = {};
let isAuthenticated = false;

async function getCurrentPrice(symbol) {
    try {
        const connection = await mysql.createConnection(DB_CONFIG);
        const [rows] = await connection.execute(`SELECT price FROM stock_prices WHERE symbol = ?`, [symbol]);
        await connection.end();
        return rows.length ? rows[0].price : null;
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
    if (lastPrices[symbol] === undefined) {
        console.log(`ℹ️ Cache miss for ${symbol}. Fetching from DB...`);
        lastPrices[symbol] = await getCurrentPrice(symbol);
    }

    if (lastPrices[symbol] === null || lastPrices[symbol] !== price) {
        console.log(`🔄 Price changed for ${symbol}. Updating DB...`);
        await updatePrice(symbol, price);
        lastPrices[symbol] = price;
    } else {
        console.log(`✅ Price unchanged for ${symbol}. No DB update needed.`);
    }
}

function connectWebSocket() {
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
        setTimeout(connectWebSocket, 10000);
    });

    socket.addEventListener('error', (error) => {
        console.error("🚨 WebSocket Error:", error);
        socket.close();
    });
}

function authenticate() {
    const authMessage = {
        action: "auth",
        key: ALPACA_API_KEY,
        secret: ALPACA_SECRET_KEY
    };
    sendMessage(authMessage);
}

function subscribeToStock(symbol) {
    if (isAuthenticated) {
        const subscribeMessage = {
            action: "subscribe",
            trades: [symbol]
        };
        sendMessage(subscribeMessage);
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



connectWebSocket();
