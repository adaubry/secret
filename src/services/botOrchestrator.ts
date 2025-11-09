import { ClobClient } from '@polymarket/clob-client';
import {
    scanWeatherMarkets,
    storeMarket,
    getActiveMarkets,
    getCitiesToTrack,
} from './marketScanner';
import { updateWeatherData, getLatestWeatherData } from './weatherAggregator';
import { calculateSafetyScore } from './safetyScorer';
import { executeTrade } from './tradeEngine';
import { initializeCircuitBreakers } from './circuitBreakers';
import { alertBotStarted, alertBotStopped, alertErrorOccurred } from './alerts';
import { ENV } from '../config/env';
import { Market, Position } from '../models/weatherArbitrage';
import { PortfolioMetrics } from '../models/weatherArbitrage';

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
    console.log('🤖 Initializing Weather Arbitrage Bot...');

    // Initialize circuit breakers
    await initializeCircuitBreakers();

    // Initial market scan
    await scanMarketsIfNeeded(clobClient);

    // Alert that bot started
    await alertBotStarted();

    console.log('✅ Bot initialized successfully');
}

/**
 * Main bot loop - Runs every 2 minutes
 */
export async function runBotLoop(clobClient: ClobClient, usdcBalance: number): Promise<void> {
    if (isRunning) {
        console.warn('⚠️  Bot loop already running');
        return;
    }

    isRunning = true;

    try {
        const now = Date.now();

        // Scan markets every 5 minutes
        if (now - lastMarketScan > ENV.MARKET_SCAN_INTERVAL) {
            console.log('\n📋 Market scanning phase...');
            await scanMarketsIfNeeded(clobClient);
            lastMarketScan = now;
        }

        // Update weather every 10 minutes
        if (now - lastWeatherUpdate > ENV.WEATHER_UPDATE_INTERVAL) {
            console.log('\n🌤️  Weather update phase...');
            await updateWeatherIfNeeded();
            lastWeatherUpdate = now;
        }

        // Calculate safety scores for all active markets
        console.log('\n📊 Safety score calculation phase...');
        await calculateSafetyScoresForActiveMarkets();

        // Evaluate trade opportunities
        console.log('\n🎯 Trade evaluation phase...');
        await evaluateTradeOpportunities(clobClient, usdcBalance);

        // Monitor existing positions
        console.log('\n👁️  Position monitoring phase...');
        await monitorPositions();

        // Update portfolio metrics
        console.log('\n💼 Updating portfolio metrics...');
        await updatePortfolioMetrics(usdcBalance);

    } catch (error) {
        console.error('❌ Error in bot loop:', error);
        await alertErrorOccurred(String(error));
    } finally {
        isRunning = false;
    }
}

/**
 * Scan markets if needed
 */
async function scanMarketsIfNeeded(clobClient: ClobClient): Promise<void> {
    try {
        const scannedMarkets = await scanWeatherMarkets(clobClient);

        let newMarkets = 0;
        for (const market of scannedMarkets) {
            const stored = await storeMarket(market);
            if (stored) {
                newMarkets++;
            }
        }

        console.log(`✅ Market scan complete: ${scannedMarkets.length} weather markets (${newMarkets} new)`);
    } catch (error) {
        console.error('❌ Error scanning markets:', error);
    }
}

/**
 * Update weather data
 */
async function updateWeatherIfNeeded(): Promise<void> {
    try {
        const cities = await getCitiesToTrack();

        if (cities.length === 0) {
            console.log('ℹ️  No cities to track yet');
            return;
        }

        let successCount = 0;
        for (const city of cities) {
            // Hardcoded coordinates for demo (in production, use a city -> lat/lon database)
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

            const coords = coordinates[city];
            if (coords) {
                const result = await updateWeatherData(city, coords[0], coords[1]);
                if (result) {
                    successCount++;
                }
            }
        }

        console.log(`✅ Weather update complete: ${successCount}/${cities.length} cities updated`);
    } catch (error) {
        console.error('❌ Error updating weather:', error);
    }
}

/**
 * Calculate safety scores for all active markets
 */
async function calculateSafetyScoresForActiveMarkets(): Promise<void> {
    try {
        const activeMarkets = await getActiveMarkets();

        if (activeMarkets.length === 0) {
            console.log('ℹ️  No active markets to score');
            return;
        }

        let scoredCount = 0;
        for (const market of activeMarkets) {
            const weatherData = await getLatestWeatherData(market.city);

            if (!weatherData) {
                console.warn(`⚠️  No weather data for ${market.city}`);
                continue;
            }

            // Get market prices from CLOB (simplified - in production, fetch actual order book)
            const marketData = await Market.findOne({ market_id: market.market_id }).lean();

            if (!marketData) {
                continue;
            }

            const safetyScore = await calculateSafetyScore({
                marketId: market.market_id,
                currentTemp: weatherData.current_temp,
                dailyMax: weatherData.daily_max,
                forecastHigh: weatherData.forecast_high,
                thresholdTemp: market.threshold_temp,
                yesPrice: marketData.yes_price,
                noPrice: marketData.no_price,
                orderBookSpread: marketData.yes_price && marketData.no_price
                    ? Math.abs((marketData.yes_price || 0) - (marketData.no_price || 0))
                    : null,
                orderBookVolume: null,
            });

            scoredCount++;
        }

        console.log(`✅ Safety scoring complete: ${scoredCount} markets scored`);
    } catch (error) {
        console.error('❌ Error calculating safety scores:', error);
    }
}

/**
 * Evaluate trade opportunities
 */
async function evaluateTradeOpportunities(clobClient: ClobClient, usdcBalance: number): Promise<void> {
    try {
        const activeMarkets = await getActiveMarkets();
        let tradeCount = 0;

        for (const market of activeMarkets) {
            // Check if already have position
            const existingPosition = await Position.findOne({
                market_id: market.market_id,
                status: 'OPEN',
            });

            if (existingPosition) {
                continue; // Already have position in this market
            }

            const weatherData = await getLatestWeatherData(market.city);
            if (!weatherData) {
                continue;
            }

            const marketData = await Market.findOne({ market_id: market.market_id }).lean();
            if (!marketData || !marketData.yes_price || !marketData.no_price) {
                continue;
            }

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

            // Check if should trade
            if (
                safetyScore.totalScore >= ENV.MIN_SAFETY_SCORE &&
                safetyScore.recommendation !== 'SKIP' &&
                safetyScore.expectedProfitPercent &&
                safetyScore.expectedProfitPercent >= ENV.MIN_PROFIT_MARGIN_PERCENT
            ) {
                // Calculate position size (risk management)
                const riskPercentage = 0.02; // 2% of balance per trade
                const positionSize = usdcBalance * riskPercentage;
                const shares = positionSize / safetyScore.expectedProfitPercent;

                const side = safetyScore.recommendation === 'BUY_YES' ? 'YES' : 'NO';
                const price =
                    side === 'YES' ? (marketData.yes_price || 0.5) : (marketData.no_price || 0.5);

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
                    tradeCount++;
                }
            }
        }

        console.log(`✅ Trade evaluation complete: ${tradeCount} trades executed`);
    } catch (error) {
        console.error('❌ Error evaluating trades:', error);
    }
}

/**
 * Monitor open positions
 */
async function monitorPositions(): Promise<void> {
    try {
        const openPositions = await Position.find({ status: 'OPEN' });

        console.log(`👁️  Monitoring ${openPositions.length} open positions`);

        // In production, check if markets have resolved and update position status
        // For now, just log
    } catch (error) {
        console.error('❌ Error monitoring positions:', error);
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
 * Stop bot gracefully
 */
export async function stopBot(reason: string): Promise<void> {
    console.log(`⏹️  Stopping bot: ${reason}`);
    await alertBotStopped(reason);
    process.exit(0);
}
