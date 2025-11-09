import * as dotenv from 'dotenv';
dotenv.config();

// Required environment variables
const requiredEnv = [
    'WALLET_ADDRESS',
    'PRIVATE_KEY',
    'CLOB_HTTP_URL',
    'CLOB_WS_URL',
    'MONGO_URI',
    'RPC_URL',
    'USDC_CONTRACT_ADDRESS',
    'OPENWEATHER_API_KEY',
];

requiredEnv.forEach((env) => {
    if (!process.env[env]) {
        throw new Error(`${env} is not defined`);
    }
});

export const ENV = {
    // Wallet & Chain
    WALLET_ADDRESS: process.env.WALLET_ADDRESS as string,
    PRIVATE_KEY: process.env.PRIVATE_KEY as string,
    RPC_URL: process.env.RPC_URL as string,
    USDC_CONTRACT_ADDRESS: process.env.USDC_CONTRACT_ADDRESS as string,

    // Polymarket CLOB
    CLOB_HTTP_URL: process.env.CLOB_HTTP_URL as string,
    CLOB_WS_URL: process.env.CLOB_WS_URL as string,

    // Database
    MONGO_URI: process.env.MONGO_URI as string,

    // Weather APIs
    OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY as string,
    WEATHER_UPDATE_INTERVAL: parseInt(process.env.WEATHER_UPDATE_INTERVAL || '600000', 10), // 10 minutes default
    MARKET_SCAN_INTERVAL: parseInt(process.env.MARKET_SCAN_INTERVAL || '60000', 10), // 1 minute default
    MAIN_LOOP_INTERVAL: parseInt(process.env.MAIN_LOOP_INTERVAL || '60000', 10), // 1 minute default

    // Safety thresholds
    MIN_SAFETY_SCORE: parseInt(process.env.MIN_SAFETY_SCORE || '95', 10),
    MIN_PROFIT_MARGIN_PERCENT: parseFloat(process.env.MIN_PROFIT_MARGIN_PERCENT || '0.5'),

    // Circuit breakers
    MAX_LOSS_THRESHOLD: parseFloat(process.env.MAX_LOSS_THRESHOLD || '-100'),
    MIN_WIN_RATE_PERCENT: parseFloat(process.env.MIN_WIN_RATE_PERCENT || '80'),
    DATA_FRESHNESS_THRESHOLD: parseInt(process.env.DATA_FRESHNESS_THRESHOLD || '900000', 10), // 15 minutes
    MIN_USDC_BALANCE: parseFloat(process.env.MIN_USDC_BALANCE || '10'),

    // Wallet encryption
    WALLET_ENCRYPTION_PASSWORD: process.env.WALLET_ENCRYPTION_PASSWORD || 'default-password',

    // Mode
    PAPER_TRADING_MODE: process.env.PAPER_TRADING_MODE === 'true',
    DEBUG_MODE: process.env.DEBUG_MODE === 'true',
};
