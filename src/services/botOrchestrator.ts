import { ClobClient } from '@polymarket/clob-client';
import { scanWeatherMarkets, storeMarket, getActiveMarkets, getCitiesToTrack } from './marketScanner';
import { updateWeatherData, getLatestWeatherData } from './weatherAggregator';
import { calculateSafetyScore } from './safetyScorer';
import { executeTrade } from './tradeEngine';
import { initializeCircuitBreakers } from './circuitBreakers';
import { addAlert, alertError } from './alerts';
import { ENV } from '../config/env';
import { Market, Position, PortfolioMetrics } from '../models/weatherArbitrage';

/**
 * Bot Orchestrator - Main trading loop coordinator
 */

let isRunning = false;
let lastMarketScan = 0;
let lastWeatherUpdate = 0;

/**
 * Initialize bot
 */
export async function initializeBot(clobClient: ClobClient): Promise<void> {
    console.log('🤖 Starting Weather Arbitrage Bot...');
    await initializeCircuitBreakers();
    await scanMarketsIfNeeded(clobClient);
    console.log('✅ Bot ready');
}

/**
 * Main bot loop - Runs every 1 minute
 */
export async function runBotLoop(clobClient: ClobClient, usdcBalance: number): Promise<void> {
    if (isRunning) return;

    isRunning = true;

    try {
        const now = Date.now();

        // Scan markets every 1 minute
        if (now - lastMarketScan > ENV.MARKET_SCAN_INTERVAL) {
            await scanMarketsIfNeeded(clobClient);
            lastMarketScan = now;
        }

        // Update weather every 10 minutes
        if (now - lastWeatherUpdate > ENV.WEATHER_UPDATE_INTERVAL) {
            await updateWeatherIfNeeded();
            lastWeatherUpdate = now;
        }

        // Evaluate and execute safe trades with maximum compute
        await evaluateAndExecuteTrades(clobClient, usdcBalance);

        // Update portfolio metrics
        await updatePortfolioMetrics(usdcBalance);

    } catch (error) {
        alertError(String(error));
    } finally {
        isRunning = false;
    }
}

/**
 * Scan markets
 */
async function scanMarketsIfNeeded(clobClient: ClobClient): Promise<void> {
    try {
        const scannedMarkets = await scanWeatherMarkets(clobClient);
        for (const market of scannedMarkets) {
            await storeMarket(market);
        }
    } catch (error) {
        console.error('❌ Market scan failed');
    }
}

/**
 * Update weather data
 */
async function updateWeatherIfNeeded(): Promise<void> {
    try {
        const cities = await getCitiesToTrack();
        const coordinates: { [key: string]: [number, number] } = {
            'New York': [40.7128, -74.006],
            'Los Angeles': [34.0522, -118.2437],
            Chicago: [41.8781, -87.6298],
            Houston: [29.7604, -95.3698],
            Phoenix: [33.4484, -112.074],
            Boston: [42.3601, -71.0589],
            Denver: [39.7392, -104.9903],
            Seattle: [47.6062, -122.3321],
            Austin: [30.2672, -97.7431],
            Miami: [25.7617, -80.1918],
        };

        for (const city of cities) {
            const coords = coordinates[city as keyof typeof coordinates];
            if (coords) {
                await updateWeatherData(city, coords[0], coords[1]);
            }
        }
    } catch (error) {
        console.error('❌ Weather update failed');
    }
}

/**
 * Evaluate and execute safe trades with maximum compute
 */
async function evaluateAndExecuteTrades(clobClient: ClobClient, usdcBalance: number): Promise<void> {
    try {
        const activeMarkets = await getActiveMarkets();

        for (const market of activeMarkets) {
            // Check if already have position
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
                forecastHigh: weatherData.forecast_high,
                thresholdTemp: market.threshold_temp,
                yesPrice: marketData.yes_price,
                noPrice: marketData.no_price,
                orderBookSpread: Math.abs(marketData.yes_price - marketData.no_price),
                orderBookVolume: null,
            });

            // If safe to trade, use maximum compute to capture orders
            if (safetyScore.totalScore >= ENV.MIN_SAFETY_SCORE &&
                safetyScore.recommendation !== 'SKIP' &&
                safetyScore.expectedProfitPercent &&
                safetyScore.expectedProfitPercent >= ENV.MIN_PROFIT_MARGIN_PERCENT) {

                // Use maximum available balance for this trade
                const side = safetyScore.recommendation === 'BUY_YES' ? 'YES' : 'NO';
                const price = side === 'YES' ? (marketData.yes_price || 0.5) : (marketData.no_price || 0.5);

                // Allocate 10% of balance per safe trade
                const positionSize = usdcBalance * 0.1;
                const shares = positionSize / price;

                // Execute with maximum retries to capture order
                for (let attempt = 0; attempt < 3; attempt++) {
                    const result = await executeTrade(clobClient, {
                        marketId: market.market_id,
                        side,
                        currentPrice: price,
                        confidence: safetyScore.totalScore,
                        expectedProfit: safetyScore.expectedProfitPercent,
                        usdcBalance,
                        shares,
                    });

                    if (result.success) {
                        console.log(`✅ Safe trade executed (score: ${safetyScore.totalScore})`);
                        break;
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Trade execution failed');
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
            unrealized_pnl: 0, // Would calculate from current market prices
            usdc_balance: usdcBalance,
            win_rate_percent:
                resolvedPositions.length > 0 ? (winningTrades / resolvedPositions.length) * 100 : 0,
            total_trades: resolvedPositions.length,
            winning_trades: winningTrades,
        });

        await metrics.save();
        console.log(`💼 Portfolio: ${openPositions.length} open positions, P&L: $${totalPnL.toFixed(2)}`);
    } catch (error) {
        console.error('❌ Error updating portfolio metrics:', error);
    }
}

/**
 * Stop bot
 */
export async function stopBot(reason: string): Promise<void> {
    console.log(`⏹️  Bot stopped: ${reason}`);
    process.exit(0);
}
