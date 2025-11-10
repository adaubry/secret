import { ClobClient } from '@polymarket/clob-client';
import { scanWeatherMarkets, storeMarket, getActiveMarkets, resolveMarket } from './marketScanner';
import { updateWeatherData, getLatestWeatherData } from './weatherAggregator';
import { calculateSafetyScore } from './safetyScorer';
import { executeTrade } from './tradeEngine';
import { initializeCircuitBreakers, runAllCircuitBreakerChecks, isAnyBreakerActive } from './circuitBreakers';
import { addAlert, alertError } from './alerts';
import { ENV } from '../config/env';
import { Market, Position, PortfolioMetrics, TradeDecision } from '../models/weatherArbitrage';
import { ActionLog, ErrorLog } from '../models/logs';

/**
 * Bot Orchestrator V2 - CORRECTED LOGIC
 *
 * CRITICAL FIX: A "safe bet" is a specific MARKET + SIDE combination, NOT a city.
 *
 * Example:
 * - Event: "Highest temperature in London on Nov 10"
 * - Creates MULTIPLE markets:
 *   - Market 1: "Will it be < 50°F?" → Can buy YES or NO
 *   - Market 2: "Will it be 50-51°F?" → Can buy YES or NO
 *   - Market 3: "Will it be 55-56°F?" → Can buy YES or NO
 *
 * Safe bets:
 * - "Buying NO on Market 1" (if temp is 55°F)
 * - "Buying YES on Market 3" (if temp is 55.5°F and it's evening)
 * - Both can be safe AT THE SAME TIME
 */

interface SafeMarket {
    marketId: string; // e.g. "0x123abc"
    tokenId: string; // e.g. "0x123abc-YES" or "0x123abc-NO"
    city: string; // e.g. "London"
    question: string; // e.g. "Will max temp be 55-56°F?"
    thresholdTemp: number; // e.g. 55 (lower bound) or 56 (upper bound)
    side: 'YES' | 'NO'; // Which outcome we're buying
    safetyScore: number;
    expectedProfit: number;
    currentPrice: number;
    lastChecked: number;
}

// Bot state
let botRunning = false;
let botPaused = false;
let emergencyStop = false;
let safeMarkets: Map<string, SafeMarket> = new Map(); // Key: marketId-side
let orderbookFetchersActive: Map<string, NodeJS.Timeout> = new Map(); // Key: marketId-side
let lastMarketScan = 0;
let lastWeatherUpdate = 0;
let lastDayRotation = 0;

// Coordinates for our tracked cities
const CITY_COORDINATES = {
    'London': [51.5074, -0.1278],
    'New York': [40.7128, -74.006],
};

/**
 * Initialize bot V2
 */
export async function initializeBotV2(clobClient: ClobClient): Promise<void> {
    console.log('🤖 Starting Weather Arbitrage Bot V2 (Competitive Mode)...');
    await logAction('BOT_INIT', 'Initializing bot V2 with corrected trading logic');

    await initializeCircuitBreakers();
    await performDayRotation();
    await scanMarketsIfNeeded(clobClient);

    botRunning = true;
    botPaused = false;
    emergencyStop = false;

    await logAction('BOT_READY', 'Bot V2 ready for competitive trading');
    console.log('✅ Bot V2 ready - Focusing on London & New York weather markets');
}

/**
 * Main bot loop - Safe market detection every 60 seconds
 */
export async function runSafeMarketDetectionLoop(clobClient: ClobClient, usdcBalance: number): Promise<void> {
    if (!botRunning || botPaused || emergencyStop) {
        await logAction('LOOP_SKIPPED', `Loop skipped - running: ${botRunning}, paused: ${botPaused}, emergency: ${emergencyStop}`);
        return;
    }

    try {
        const now = Date.now();

        // Day rotation every 6 hours
        if (now - lastDayRotation > 6 * 60 * 60 * 1000) {
            await performDayRotation();
            lastDayRotation = now;
        }

        // Scan markets every 5 minutes
        if (now - lastMarketScan > 5 * 60 * 1000) {
            await scanMarketsIfNeeded(clobClient);
            lastMarketScan = now;
        }

        // Update weather every 10 minutes
        if (now - lastWeatherUpdate > 10 * 60 * 1000) {
            await updateWeatherForTargetCities();
            lastWeatherUpdate = now;
        }

        // CORE: Detect safe BETS (every 60 seconds)
        await detectSafeBets(clobClient, usdcBalance);

        // Start aggressive orderbook fetching for safe bets
        await manageOrderbookFetchers(clobClient, usdcBalance);

        // Update portfolio metrics
        await updatePortfolioMetrics(usdcBalance);

    } catch (error: any) {
        await logError('MAIN_LOOP_ERROR', error.message, { stack: error.stack });
        alertError(`Main loop error: ${error.message}`);
    }
}

/**
 * Detect safe BETS - Core strategy implementation
 * CRITICAL: Each market has YES and NO outcomes. We evaluate BOTH separately.
 */
async function detectSafeBets(clobClient: ClobClient, usdcBalance: number): Promise<void> {
    try {
        await logAction('DETECT_SAFE_BETS', 'Starting safe bet detection');

        const activeMarkets = await getActiveMarkets();
        const newSafeBets: Map<string, SafeMarket> = new Map();

        for (const market of activeMarkets) {
            const weatherData = await getLatestWeatherData(market.city);
            if (!weatherData) continue;

            const marketData = await Market.findOne({ market_id: market.market_id }).lean();
            if (!marketData || !marketData.yes_price || !marketData.no_price) continue;

            // Calculate safety score for this market
            const safetyScore = await calculateSafetyScore({
                marketId: market.market_id,
                currentTemp: weatherData.current_temp,
                dailyMax: weatherData.daily_max,
                forecastHigh: weatherData.forecast_high || weatherData.daily_max,
                thresholdTemp: market.threshold_temp,
                yesPrice: marketData.yes_price,
                noPrice: marketData.no_price,
                orderBookSpread: Math.abs(marketData.yes_price - marketData.no_price),
                orderBookVolume: null,
            });

            // IMPORTANT: Check if this specific market+side combination is safe
            if (safetyScore.totalScore >= ENV.MIN_SAFETY_SCORE &&
                safetyScore.recommendation !== 'SKIP' &&
                safetyScore.expectedProfitPercent &&
                safetyScore.expectedProfitPercent >= ENV.MIN_PROFIT_MARGIN_PERCENT) {

                const side = safetyScore.recommendation === 'BUY_YES' ? 'YES' : 'NO';
                const price = side === 'YES' ? (marketData.yes_price || 0.5) : (marketData.no_price || 0.5);
                const tokenId = `${market.market_id}-${side}`;
                const safeBetKey = `${market.market_id}-${side}`; // Unique key for this bet

                // Check if we already have a position on this specific market+side
                const existing = await Position.findOne({
                    market_id: market.market_id,
                    side: side,
                    status: 'OPEN',
                });
                if (existing) continue;

                newSafeBets.set(safeBetKey, {
                    marketId: market.market_id,
                    tokenId: tokenId,
                    city: market.city,
                    question: market.question,
                    thresholdTemp: market.threshold_temp,
                    side,
                    safetyScore: safetyScore.totalScore,
                    expectedProfit: safetyScore.expectedProfitPercent,
                    currentPrice: price,
                    lastChecked: Date.now(),
                });

                await logAction('SAFE_BET_DETECTED', `Safe bet: ${side} on "${market.question}"`, {
                    marketId: market.market_id,
                    tokenId: tokenId,
                    question: market.question,
                    side: side,
                    safetyScore: safetyScore.totalScore,
                    expectedProfit: safetyScore.expectedProfitPercent,
                    currentPrice: price,
                });

                console.log(`🎯 SAFE BET: ${side} on "${market.question}" (Score: ${safetyScore.totalScore}, Profit: ${safetyScore.expectedProfitPercent.toFixed(2)}%)`);
            }
        }

        // Update safe bets
        safeMarkets = newSafeBets;

        if (safeMarkets.size > 0) {
            await logAction('SAFE_BETS_UPDATE', `Currently tracking ${safeMarkets.size} safe bets`, {
                bets: Array.from(safeMarkets.values()).map(m => ({
                    question: m.question,
                    side: m.side,
                    score: m.safetyScore,
                })),
            });
        }

    } catch (error: any) {
        await logError('DETECT_SAFE_BETS_ERROR', error.message, { stack: error.stack });
    }
}

/**
 * Manage aggressive orderbook fetchers for safe bets
 * Each safe bet (market+side) gets its own fetcher
 */
async function manageOrderbookFetchers(clobClient: ClobClient, usdcBalance: number): Promise<void> {
    // Stop fetchers for bets no longer safe
    for (const [safeBetKey, interval] of orderbookFetchersActive.entries()) {
        if (!safeMarkets.has(safeBetKey)) {
            clearInterval(interval);
            orderbookFetchersActive.delete(safeBetKey);
            await logAction('STOP_ORDERBOOK_FETCHER', `Stopped orderbook fetcher for ${safeBetKey}`);
        }
    }

    // Start fetchers for new safe bets
    for (const [safeBetKey, safeBet] of safeMarkets.entries()) {
        if (!orderbookFetchersActive.has(safeBetKey)) {
            await startAggressiveOrderbookFetcher(clobClient, safeBet, usdcBalance, safeBetKey);
        }
    }
}

/**
 * Start aggressive orderbook fetching for a safe bet (specific market+side)
 * Fetches every 2-5 seconds to capture opportunities quickly
 */
async function startAggressiveOrderbookFetcher(
    clobClient: ClobClient,
    safeBet: SafeMarket,
    usdcBalance: number,
    safeBetKey: string
): Promise<void> {
    await logAction('START_ORDERBOOK_FETCHER', `Starting fetcher: ${safeBet.side} on "${safeBet.question}"`, {
        marketId: safeBet.marketId,
        tokenId: safeBet.tokenId,
        side: safeBet.side,
        question: safeBet.question,
        fetchInterval: '2-5 seconds',
    });

    const fetchInterval = setInterval(async () => {
        try {
            // Check if still safe and bot still running
            if (!botRunning || botPaused || emergencyStop || !safeMarkets.has(safeBetKey)) {
                clearInterval(fetchInterval);
                orderbookFetchersActive.delete(safeBetKey);
                return;
            }

            // Check circuit breakers
            const breakerTriggered = await runAllCircuitBreakerChecks(usdcBalance);
            if (breakerTriggered) {
                clearInterval(fetchInterval);
                orderbookFetchersActive.delete(safeBetKey);
                await logAction('ORDERBOOK_FETCHER_STOPPED', 'Circuit breaker triggered');
                return;
            }

            // Fetch orderbook for this specific market+side
            await fetchOrderbookAndExecute(clobClient, safeBet, usdcBalance, safeBetKey);

        } catch (error: any) {
            await logError('ORDERBOOK_FETCH_ERROR', error.message, {
                marketId: safeBet.marketId,
                tokenId: safeBet.tokenId,
                question: safeBet.question,
            });
        }
    }, 2000 + Math.random() * 3000); // Random 2-5 seconds to avoid pattern detection

    orderbookFetchersActive.set(safeBetKey, fetchInterval);
}

/**
 * Fetch orderbook and execute if favorable order found
 * IMPORTANT: Fetches the orderbook for the specific outcome (YES or NO)
 */
async function fetchOrderbookAndExecute(
    clobClient: ClobClient,
    safeBet: SafeMarket,
    usdcBalance: number,
    safeBetKey: string
): Promise<void> {
    try {
        // Fetch orderbook from CLOB for this specific token (market-YES or market-NO)
        const orderbook = await clobClient.getOrderBook(safeBet.tokenId);
        if (!orderbook) return;

        // For buying, we look at asks (sell orders)
        const targetOrderbook = orderbook.asks;
        if (!targetOrderbook || targetOrderbook.length === 0) return;

        // Find best price
        const bestOrder = targetOrderbook[0];
        const bestPrice = parseFloat(bestOrder.price);

        // Check if price is favorable (within 2% slippage)
        if (bestPrice <= safeBet.currentPrice * 1.02) {
            await logAction('FAVORABLE_ORDER_FOUND', `Favorable: ${safeBet.side} on "${safeBet.question}"`, {
                marketId: safeBet.marketId,
                tokenId: safeBet.tokenId,
                side: safeBet.side,
                question: safeBet.question,
                bestPrice: bestPrice,
                expectedPrice: safeBet.currentPrice,
            });

            // Execute all-in trade
            await executeAllInTrade(clobClient, safeBet, bestPrice, usdcBalance, safeBetKey);
        }

    } catch (error: any) {
        // Silent failure for orderbook fetching - don't spam logs
        if (ENV.DEBUG_MODE) {
            console.error(`Orderbook fetch failed for ${safeBet.tokenId}: ${error.message}`);
        }
    }
}

/**
 * Execute all-in trade for safe bet
 * Allocates all available liquidity (split equally if multiple safe bets)
 */
async function executeAllInTrade(
    clobClient: ClobClient,
    safeBet: SafeMarket,
    price: number,
    usdcBalance: number,
    safeBetKey: string
): Promise<void> {
    try {
        // Calculate position size - split equally among all safe bets
        const numSafeBets = safeMarkets.size;
        const allocationPerBet = usdcBalance / numSafeBets;
        const shares = allocationPerBet / price;

        await logAction('EXECUTE_ALL_IN_TRADE', `Executing: ${safeBet.side} on "${safeBet.question}"`, {
            marketId: safeBet.marketId,
            tokenId: safeBet.tokenId,
            question: safeBet.question,
            side: safeBet.side,
            allocation: allocationPerBet,
            shares,
            price,
            totalSafeBets: numSafeBets,
        });

        const result = await executeTrade(clobClient, {
            marketId: safeBet.marketId,
            side: safeBet.side,
            currentPrice: price,
            confidence: safeBet.safetyScore,
            expectedProfit: safeBet.expectedProfit,
            usdcBalance,
            shares,
        });

        if (result.success) {
            console.log(`✅ TRADE EXECUTED: ${safeBet.side} on "${safeBet.question}" - $${allocationPerBet.toFixed(2)}`);

            // Stop fetcher for this specific bet
            const fetcher = orderbookFetchersActive.get(safeBetKey);
            if (fetcher) {
                clearInterval(fetcher);
                orderbookFetchersActive.delete(safeBetKey);
            }

            // Remove from safe bets
            safeMarkets.delete(safeBetKey);

            await logAction('TRADE_SUCCESS', `Trade executed successfully`, {
                marketId: safeBet.marketId,
                tokenId: safeBet.tokenId,
                question: safeBet.question,
                side: safeBet.side,
                orderId: result.orderId,
            });
        }

    } catch (error: any) {
        await logError('EXECUTE_TRADE_ERROR', error.message, {
            marketId: safeBet.marketId,
            tokenId: safeBet.tokenId,
            question: safeBet.question,
        });
    }
}

/**
 * Perform day rotation - cleanup n-1, focus on n and n+1
 */
async function performDayRotation(): Promise<void> {
    try {
        await logAction('DAY_ROTATION', 'Performing day rotation cleanup');

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);

        // Mark yesterday's markets as inactive
        const result = await Market.updateMany(
            {
                market_date: { $lt: now },
                active: true,
            },
            {
                active: false,
                updated_at: new Date(),
            }
        );

        if (result.modifiedCount > 0) {
            console.log(`🔄 Day rotation: Deactivated ${result.modifiedCount} old markets`);
            await logAction('DAY_ROTATION_COMPLETE', `Deactivated ${result.modifiedCount} markets from previous days`);
        }

    } catch (error: any) {
        await logError('DAY_ROTATION_ERROR', error.message);
    }
}

/**
 * Scan markets - Focus on London & New York only
 */
async function scanMarketsIfNeeded(clobClient: ClobClient): Promise<void> {
    try {
        await logAction('MARKET_SCAN', 'Scanning for London & New York weather markets');

        const scannedMarkets = await scanWeatherMarkets(clobClient);

        // Filter to London & New York only
        const targetMarkets = scannedMarkets.filter(m =>
            m.city === 'London' || m.city === 'New York'
        );

        for (const market of targetMarkets) {
            await storeMarket(market);
        }

        if (targetMarkets.length > 0) {
            await logAction('MARKETS_FOUND', `Found ${targetMarkets.length} London/New York markets`);
        }

    } catch (error: any) {
        await logError('MARKET_SCAN_ERROR', error.message);
    }
}

/**
 * Update weather for target cities only
 */
async function updateWeatherForTargetCities(): Promise<void> {
    try {
        await logAction('WEATHER_UPDATE', 'Updating weather for London & New York');

        for (const [city, coords] of Object.entries(CITY_COORDINATES)) {
            await updateWeatherData(city, coords[0], coords[1]);
        }

    } catch (error: any) {
        await logError('WEATHER_UPDATE_ERROR', error.message);
    }
}

/**
 * Update portfolio metrics
 */
async function updatePortfolioMetrics(usdcBalance: number): Promise<void> {
    try {
        const openPositions = await Position.find({ status: 'OPEN' });
        const resolvedPositions = await Position.find({ status: 'RESOLVED' });

        const totalPnL = resolvedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
        const winningTrades = resolvedPositions.filter((p) => (p.pnl || 0) > 0).length;
        const totalPositionValue = openPositions.reduce((sum, p) => sum + (p.total_cost || 0), 0);

        const metrics = new PortfolioMetrics({
            timestamp: new Date(),
            total_open_positions: openPositions.length,
            total_position_value: totalPositionValue,
            total_pnl: totalPnL,
            total_pnl_percent: totalPositionValue > 0 ? (totalPnL / totalPositionValue) * 100 : 0,
            realized_pnl: totalPnL,
            unrealized_pnl: 0,
            usdc_balance: usdcBalance,
            win_rate_percent:
                resolvedPositions.length > 0 ? (winningTrades / resolvedPositions.length) * 100 : 0,
            total_trades: resolvedPositions.length,
            winning_trades: winningTrades,
        });

        await metrics.save();

    } catch (error: any) {
        // Silent failure - don't spam logs
    }
}

/**
 * Bot control functions
 */
export async function pauseBot(): Promise<void> {
    botPaused = true;
    await logAction('BOT_PAUSED', 'Bot trading paused by user');
    console.log('⏸️  Bot paused');
}

export async function resumeBot(): Promise<void> {
    botPaused = false;
    await logAction('BOT_RESUMED', 'Bot trading resumed by user');
    console.log('▶️  Bot resumed');
}

export async function stopBot(reason: string): Promise<void> {
    botRunning = false;

    // Clear all orderbook fetchers
    for (const [safeBetKey, interval] of orderbookFetchersActive.entries()) {
        clearInterval(interval);
    }
    orderbookFetchersActive.clear();
    safeMarkets.clear();

    await logAction('BOT_STOPPED', `Bot stopped: ${reason}`);
    console.log(`⏹️  Bot stopped: ${reason}`);
}

export async function triggerEmergencyStop(reason: string): Promise<void> {
    emergencyStop = true;
    botRunning = false;

    // Clear all orderbook fetchers immediately
    for (const [safeBetKey, interval] of orderbookFetchersActive.entries()) {
        clearInterval(interval);
    }
    orderbookFetchersActive.clear();
    safeMarkets.clear();

    await logAction('EMERGENCY_STOP', `EMERGENCY STOP: ${reason}`, { critical: true });
    console.error(`🚨 EMERGENCY STOP: ${reason}`);
}

/**
 * Get bot status
 */
export function getBotStatus() {
    return {
        running: botRunning,
        paused: botPaused,
        emergencyStop,
        safeMarketsCount: safeMarkets.size,
        activeOrderbookFetchers: orderbookFetchersActive.size,
        safeMarkets: Array.from(safeMarkets.values()),
    };
}

/**
 * Action logging helper
 */
async function logAction(action: string, message: string, data?: any): Promise<void> {
    try {
        const log = new ActionLog({
            timestamp: new Date(),
            action,
            message,
            data: data || {},
        });
        await log.save();
    } catch (error) {
        console.error('Failed to log action:', error);
    }
}

/**
 * Error logging helper
 */
async function logError(errorType: string, message: string, data?: any): Promise<void> {
    try {
        const log = new ErrorLog({
            timestamp: new Date(),
            error_type: errorType,
            message,
            data: data || {},
        });
        await log.save();
    } catch (error) {
        console.error('Failed to log error:', error);
    }
}
