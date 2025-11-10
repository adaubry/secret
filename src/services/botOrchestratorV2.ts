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
 * Bot Orchestrator V2 - Revamped for competitive Polymarket trading
 *
 * Key changes:
 * - 60-second safe market detection loop
 * - Aggressive orderbook fetching for safe markets (2-5 second intervals)
 * - All-in liquidity allocation for safe markets
 * - London/New York focus only
 * - Auto day rotation (cleanup n-1, focus on n and n+1)
 */

interface SafeMarket {
    marketId: string;
    city: string;
    safetyScore: number;
    side: 'YES' | 'NO';
    expectedProfit: number;
    currentPrice: number;
    lastChecked: number;
}

// Bot state
let botRunning = false;
let botPaused = false;
let emergencyStop = false;
let safeMarkets: Map<string, SafeMarket> = new Map();
let orderbookFetchersActive: Map<string, NodeJS.Timeout> = new Map();
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
    await logAction('BOT_INIT', 'Initializing bot V2 with competitive trading strategy');

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

        // CORE: Detect safe markets (every 60 seconds)
        await detectSafeMarkets(clobClient, usdcBalance);

        // Start aggressive orderbook fetching for safe markets
        await manageOrderbookFetchers(clobClient, usdcBalance);

        // Update portfolio metrics
        await updatePortfolioMetrics(usdcBalance);

    } catch (error: any) {
        await logError('MAIN_LOOP_ERROR', error.message, { stack: error.stack });
        alertError(`Main loop error: ${error.message}`);
    }
}

/**
 * Detect safe markets - Core strategy implementation
 */
async function detectSafeMarkets(clobClient: ClobClient, usdcBalance: number): Promise<void> {
    try {
        await logAction('DETECT_SAFE_MARKETS', 'Starting safe market detection');

        const activeMarkets = await getActiveMarkets();
        const newSafeMarkets: Map<string, SafeMarket> = new Map();

        for (const market of activeMarkets) {
            // Skip if already have position
            const existing = await Position.findOne({
                market_id: market.market_id,
                status: 'OPEN',
            });
            if (existing) continue;

            const weatherData = await getLatestWeatherData(market.city);
            if (!weatherData) continue;

            const marketData = await Market.findOne({ market_id: market.market_id }).lean();
            if (!marketData || !marketData.yes_price || !marketData.no_price) continue;

            // Calculate safety score
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

            // Check if market is SAFE (score >= 95 and profitable)
            if (safetyScore.totalScore >= ENV.MIN_SAFETY_SCORE &&
                safetyScore.recommendation !== 'SKIP' &&
                safetyScore.expectedProfitPercent &&
                safetyScore.expectedProfitPercent >= ENV.MIN_PROFIT_MARGIN_PERCENT) {

                const side = safetyScore.recommendation === 'BUY_YES' ? 'YES' : 'NO';
                const price = side === 'YES' ? (marketData.yes_price || 0.5) : (marketData.no_price || 0.5);

                newSafeMarkets.set(market.market_id, {
                    marketId: market.market_id,
                    city: market.city,
                    safetyScore: safetyScore.totalScore,
                    side,
                    expectedProfit: safetyScore.expectedProfitPercent,
                    currentPrice: price,
                    lastChecked: Date.now(),
                });

                await logAction('SAFE_MARKET_DETECTED', `Safe market found: ${market.city} ${market.threshold_temp}°F`, {
                    marketId: market.market_id,
                    safetyScore: safetyScore.totalScore,
                    expectedProfit: safetyScore.expectedProfitPercent,
                    side,
                });

                console.log(`🎯 SAFE MARKET: ${market.city} ${market.threshold_temp}°F - Score: ${safetyScore.totalScore}, Expected profit: ${safetyScore.expectedProfitPercent.toFixed(2)}%`);
            }
        }

        // Update safe markets
        safeMarkets = newSafeMarkets;

        if (safeMarkets.size > 0) {
            await logAction('SAFE_MARKETS_UPDATE', `Currently tracking ${safeMarkets.size} safe markets`, {
                markets: Array.from(safeMarkets.values()).map(m => ({
                    marketId: m.marketId,
                    city: m.city,
                    score: m.safetyScore,
                })),
            });
        }

    } catch (error: any) {
        await logError('DETECT_SAFE_MARKETS_ERROR', error.message, { stack: error.stack });
    }
}

/**
 * Manage aggressive orderbook fetchers for safe markets
 */
async function manageOrderbookFetchers(clobClient: ClobClient, usdcBalance: number): Promise<void> {
    // Stop fetchers for markets no longer safe
    for (const [marketId, interval] of orderbookFetchersActive.entries()) {
        if (!safeMarkets.has(marketId)) {
            clearInterval(interval);
            orderbookFetchersActive.delete(marketId);
            await logAction('STOP_ORDERBOOK_FETCHER', `Stopped orderbook fetcher for ${marketId}`);
        }
    }

    // Start fetchers for new safe markets
    for (const [marketId, safeMarket] of safeMarkets.entries()) {
        if (!orderbookFetchersActive.has(marketId)) {
            await startAggressiveOrderbookFetcher(clobClient, safeMarket, usdcBalance);
        }
    }
}

/**
 * Start aggressive orderbook fetching for a safe market
 * Fetches every 2-5 seconds to capture opportunities quickly
 */
async function startAggressiveOrderbookFetcher(
    clobClient: ClobClient,
    safeMarket: SafeMarket,
    usdcBalance: number
): Promise<void> {
    await logAction('START_ORDERBOOK_FETCHER', `Starting aggressive orderbook fetcher for ${safeMarket.city}`, {
        marketId: safeMarket.marketId,
        fetchInterval: '2-5 seconds',
    });

    const fetchInterval = setInterval(async () => {
        try {
            // Check if still safe and bot still running
            if (!botRunning || botPaused || emergencyStop || !safeMarkets.has(safeMarket.marketId)) {
                clearInterval(fetchInterval);
                orderbookFetchersActive.delete(safeMarket.marketId);
                return;
            }

            // Check circuit breakers
            const breakerTriggered = await runAllCircuitBreakerChecks(usdcBalance);
            if (breakerTriggered) {
                clearInterval(fetchInterval);
                orderbookFetchersActive.delete(safeMarket.marketId);
                await logAction('ORDERBOOK_FETCHER_STOPPED', 'Circuit breaker triggered');
                return;
            }

            // Fetch orderbook
            await fetchOrderbookAndExecute(clobClient, safeMarket, usdcBalance);

        } catch (error: any) {
            await logError('ORDERBOOK_FETCH_ERROR', error.message, { marketId: safeMarket.marketId });
        }
    }, 2000 + Math.random() * 3000); // Random 2-5 seconds to avoid pattern detection

    orderbookFetchersActive.set(safeMarket.marketId, fetchInterval);
}

/**
 * Fetch orderbook and execute if favorable order found
 */
async function fetchOrderbookAndExecute(
    clobClient: ClobClient,
    safeMarket: SafeMarket,
    usdcBalance: number
): Promise<void> {
    try {
        // Get latest market data
        const marketData = await Market.findOne({ market_id: safeMarket.marketId }).lean();
        if (!marketData) return;

        // Fetch orderbook from CLOB
        const orderbook = await clobClient.getOrderBook(safeMarket.marketId);
        if (!orderbook) return;

        // Determine target side orderbook
        const targetOrderbook = safeMarket.side === 'YES' ? orderbook.asks : orderbook.bids;
        if (!targetOrderbook || targetOrderbook.length === 0) return;

        // Find best price
        const bestOrder = targetOrderbook[0];
        const bestPrice = parseFloat(bestOrder.price);

        // Check if price is better than expected
        if (bestPrice <= safeMarket.currentPrice * 1.02) { // Allow 2% slippage
            await logAction('FAVORABLE_ORDER_FOUND', `Favorable order found in ${safeMarket.city}`, {
                marketId: safeMarket.marketId,
                side: safeMarket.side,
                price: bestPrice,
                expectedPrice: safeMarket.currentPrice,
            });

            // Execute all-in trade
            await executeAllInTrade(clobClient, safeMarket, bestPrice, usdcBalance);
        }

    } catch (error: any) {
        // Silent failure for orderbook fetching - don't spam logs
        if (ENV.DEBUG_MODE) {
            console.error(`Orderbook fetch failed for ${safeMarket.marketId}: ${error.message}`);
        }
    }
}

/**
 * Execute all-in trade for safe market
 * Allocates all available liquidity (split if multiple safe markets)
 */
async function executeAllInTrade(
    clobClient: ClobClient,
    safeMarket: SafeMarket,
    price: number,
    usdcBalance: number
): Promise<void> {
    try {
        // Calculate position size - split equally among safe markets
        const numSafeMarkets = safeMarkets.size;
        const allocationPerMarket = usdcBalance / numSafeMarkets;
        const shares = allocationPerMarket / price;

        await logAction('EXECUTE_ALL_IN_TRADE', `Executing all-in trade for ${safeMarket.city}`, {
            marketId: safeMarket.marketId,
            allocation: allocationPerMarket,
            shares,
            price,
            totalSafeMarkets: numSafeMarkets,
        });

        const result = await executeTrade(clobClient, {
            marketId: safeMarket.marketId,
            side: safeMarket.side,
            currentPrice: price,
            confidence: safeMarket.safetyScore,
            expectedProfit: safeMarket.expectedProfit,
            usdcBalance,
            shares,
        });

        if (result.success) {
            console.log(`✅ ALL-IN TRADE EXECUTED: ${safeMarket.city} ${safeMarket.side} - $${allocationPerMarket.toFixed(2)}`);

            // Stop fetcher for this market
            const fetcher = orderbookFetchersActive.get(safeMarket.marketId);
            if (fetcher) {
                clearInterval(fetcher);
                orderbookFetchersActive.delete(safeMarket.marketId);
            }

            // Remove from safe markets
            safeMarkets.delete(safeMarket.marketId);

            await logAction('TRADE_SUCCESS', `Successfully executed all-in trade`, {
                marketId: safeMarket.marketId,
                orderId: result.orderId,
            });
        }

    } catch (error: any) {
        await logError('EXECUTE_TRADE_ERROR', error.message, { marketId: safeMarket.marketId });
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
    for (const [marketId, interval] of orderbookFetchersActive.entries()) {
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
    for (const [marketId, interval] of orderbookFetchersActive.entries()) {
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
