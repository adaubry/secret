import connectDB from './config/db';
import { ENV } from './config/env';
import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import { initializeBot, runBotLoop, stopBot } from './services/botOrchestrator';
import { initializeLogger, logInfo } from './services/logger';

/**
 * Weather Prediction Market Arbitrage Bot
 *
 * This bot identifies and executes near-certain arbitrage opportunities
 * in Polymarket weather prediction markets.
 *
 * Key features:
 * - Real-time weather data integration
 * - Safety scoring algorithm (0-100 scale)
 * - Multiple circuit breakers for risk management
 * - Paper trading mode for validation
 * - Comprehensive logging and audit trail
 */

const main = async () => {
    try {
        // Initialize logging
        initializeLogger();
        logInfo('Starting Weather Arbitrage Bot');

        // Connect to database
        console.log('🔌 Connecting to database...');
        await connectDB();
        console.log('✅ Database connected');

        // Initialize wallet and CLOB client
        console.log('🔐 Initializing wallet...');
        const WALLET_ADDRESS = ENV.WALLET_ADDRESS;
        const PRIVATE_KEY = ENV.PRIVATE_KEY;
        const RPC_URL = ENV.RPC_URL;
        const CLOB_HTTP_URL = ENV.CLOB_HTTP_URL;

        const wallet = new ethers.Wallet(PRIVATE_KEY);
        console.log(`✅ Wallet loaded: ${wallet.address}`);

        // Verify wallet matches configured address
        if (wallet.address.toLowerCase() !== WALLET_ADDRESS.toLowerCase()) {
            throw new Error(
                `Wallet mismatch: Private key derives to ${wallet.address}, but WALLET_ADDRESS is ${WALLET_ADDRESS}`
            );
        }

        // Create CLOB client
        console.log('🏦 Initializing Polymarket CLOB client...');
        const chainId = 137; // Polygon
        const host = CLOB_HTTP_URL;

        let clobClient = new ClobClient(
            host,
            chainId,
            wallet,
            undefined,
            SignatureType.EOA,
            WALLET_ADDRESS
        );

        // Create or derive API key
        const originalConsoleError = console.error;
        console.error = function () {};
        let creds = await clobClient.createApiKey();
        console.error = originalConsoleError;

        if (creds.key) {
            console.log('✅ API Key created');
        } else {
            creds = await clobClient.deriveApiKey();
            console.log('✅ API Key derived');
        }

        // Reinitialize client with credentials
        clobClient = new ClobClient(
            host,
            chainId,
            wallet,
            creds,
            SignatureType.EOA,
            WALLET_ADDRESS
        );

        // Get initial balance
        console.log('💰 Checking USDC balance...');
        let usdcBalance = 0; // In production, fetch from blockchain
        console.log(`💰 USDC Balance: $${usdcBalance.toFixed(2)}`);

        // Initialize bot
        await initializeBot(clobClient);

        // Main trading loop
        console.log(`\n⏱️  Starting main trading loop (${ENV.MAIN_LOOP_INTERVAL}ms interval)`);
        console.log(`📊 Paper trading mode: ${ENV.PAPER_TRADING_MODE}`);
        console.log(`🔒 Min safety score: ${ENV.MIN_SAFETY_SCORE}`);
        console.log(`📈 Min profit margin: ${ENV.MIN_PROFIT_MARGIN_PERCENT}%`);

        const loopInterval = setInterval(async () => {
            try {
                // Update balance (in production, fetch from blockchain)
                await runBotLoop(clobClient, usdcBalance);
            } catch (error) {
                console.error('❌ Error in trading loop:', error);
                logInfo('Trading loop error', { error: String(error) });
            }
        }, ENV.MAIN_LOOP_INTERVAL);

        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n\n🛑 Received SIGINT, shutting down gracefully...');
            clearInterval(loopInterval);
            await stopBot('User initiated shutdown');
        });

        process.on('SIGTERM', async () => {
            console.log('\n\n🛑 Received SIGTERM, shutting down gracefully...');
            clearInterval(loopInterval);
            await stopBot('System initiated shutdown');
        });

        process.on('uncaughtException', async (error) => {
            console.error('💥 Uncaught exception:', error);
            clearInterval(loopInterval);
            await stopBot(`Uncaught exception: ${error.message}`);
        });

    } catch (error) {
        console.error('❌ Fatal error:', error);
        logInfo('Fatal error', { error: String(error) });
        process.exit(1);
    }
};

main();
