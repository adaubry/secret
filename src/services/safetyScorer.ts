import { SafetyScore, Market, TemperatureReading } from '../models/weatherArbitrage';
import { ENV } from '../config/env';

interface SafetyScoreComponents {
    temperatureCertaintyScore: number; // 0-100, weight 40%
    marketPriceSignalScore: number; // 0-100, weight 30%
    weatherStabilityScore: number; // 0-100, weight 20%
    totalScore: number; // Weighted average 0-100
}

interface ScoringInput {
    marketId: string;
    currentTemp: number;
    dailyMax: number;
    forecastHigh: number;
    thresholdTemp: number;
    yesPrice: number | null;
    noPrice: number | null;
    orderBookSpread: number | null;
    orderBookVolume: number | null;
}

interface ScoringOutput extends SafetyScoreComponents {
    recommendation: 'BUY_YES' | 'BUY_NO' | 'SKIP';
    reason: string;
    expectedProfitPercent: number | null;
}

/**
 * Safety Scoring Algorithm
 * Core decision-making engine for arbitrage bot
 */

/**
 * Calculate temperature certainty score (40% weight)
 * Measures how certain we are about the outcome
 */
function calculateTemperatureCertaintyScore(
    currentTemp: number,
    dailyMax: number,
    forecastHigh: number,
    thresholdTemp: number,
    timeOfDay: 'morning' | 'midday' | 'afternoon' | 'evening'
): number {
    // If outcome already happened, certainty is 100
    if (dailyMax > thresholdTemp && currentTemp > thresholdTemp) {
        return 100;
    }

    // Distance from current max to threshold
    const distanceFromThreshold = Math.abs(dailyMax - thresholdTemp);
    let distanceScore = 0;

    if (distanceFromThreshold > 10) {
        distanceScore = 95; // Very far from threshold
    } else if (distanceFromThreshold > 5) {
        distanceScore = 85;
    } else if (distanceFromThreshold > 3) {
        distanceScore = 70;
    } else if (distanceFromThreshold > 1) {
        distanceScore = 50;
    } else {
        distanceScore = 20; // Too close to threshold, risky
    }

    // Time elapsed in day (later = safer)
    let timeScore = 0;
    const hour = new Date().getHours();

    if (hour >= 18) {
        timeScore = 90; // Evening, most of day has passed
    } else if (hour >= 15) {
        timeScore = 80;
    } else if (hour >= 12) {
        timeScore = 60;
    } else if (hour >= 9) {
        timeScore = 40;
    } else {
        timeScore = 20; // Very early morning
    }

    // Weight: 60% distance, 40% time
    const uncertaintyScore = distanceScore * 0.6 + timeScore * 0.4;

    return Math.round(uncertaintyScore);
}

/**
 * Calculate market price signal score (30% weight)
 * Validates our analysis with market confidence
 */
function calculateMarketPriceSignalScore(
    yesPrice: number | null,
    noPrice: number | null,
    orderBookSpread: number | null,
    orderBookVolume: number | null,
    dailyMax: number,
    thresholdTemp: number
): number {
    if (!yesPrice || !noPrice) {
        return 50; // Neutral if missing data
    }

    let score = 50; // Base score

    // Market confidence (extreme prices = confident)
    if (yesPrice > 0.95) {
        score += 25; // Market very confident YES
    } else if (yesPrice < 0.05) {
        score += 25; // Market very confident NO
    } else if ((yesPrice > 0.8 && yesPrice < 0.95) || (yesPrice > 0.05 && yesPrice < 0.2)) {
        score += 15; // Moderately confident
    }

    // Order book depth (thick = reliable signal)
    if (orderBookVolume && orderBookVolume > 10000) {
        score += 10; // Good liquidity
    } else if (orderBookVolume && orderBookVolume > 1000) {
        score += 5;
    } else if (!orderBookVolume || orderBookVolume < 100) {
        score -= 10; // Thin order book, risky
    }

    // Spread validation (shouldn't be too wide)
    if (orderBookSpread && orderBookSpread > 0.2) {
        score -= 15; // Wide spread = uncertain market
    }

    return Math.max(0, Math.min(100, score));
}

/**
 * Calculate weather stability score (20% weight)
 * Measures confidence in weather data
 */
function calculateWeatherStabilityScore(
    currentTemp: number,
    dailyMax: number,
    forecastHigh: number,
    thresholdTemp: number
): number {
    let score = 60; // Base score

    // Forecast alignment (if forecast matches actual, very stable)
    const forecastDeviation = Math.abs(forecastHigh - dailyMax);

    if (forecastDeviation < 1) {
        score += 30; // Very stable
    } else if (forecastDeviation < 3) {
        score += 15;
    } else if (forecastDeviation < 5) {
        score += 5;
    } else if (forecastDeviation > 10) {
        score -= 20; // Very unstable
    }

    // Trend stability (is max trending away from threshold?)
    const tempDistance = Math.abs(dailyMax - thresholdTemp);
    if (currentTemp > dailyMax * 0.9) {
        score -= 10; // Temp already peaked, stable
    } else {
        score -= 5; // Still warming up, less stable
    }

    return Math.max(0, Math.min(100, score));
}

/**
 * Calculate expected profit percentage after fees
 */
function calculateExpectedProfit(
    yesPrice: number | null,
    noPrice: number | null,
    dailyMax: number,
    thresholdTemp: number
): number | null {
    if (!yesPrice || !noPrice) {
        return null;
    }

    const POLYMARKET_FEES_PERCENT = 0.5; // Typical Polymarket fee

    // Determine guaranteed side
    const willExceedThreshold = dailyMax > thresholdTemp;

    if (willExceedThreshold) {
        // YES is winner, calculate profit on YES purchase
        const profitPercent = (1 - yesPrice) / yesPrice * 100 - POLYMARKET_FEES_PERCENT;
        return Math.max(0, profitPercent);
    } else {
        // NO is winner, calculate profit on NO purchase
        const profitPercent = (1 - noPrice) / noPrice * 100 - POLYMARKET_FEES_PERCENT;
        return Math.max(0, profitPercent);
    }
}

/**
 * Main scoring function
 */
export async function calculateSafetyScore(input: ScoringInput): Promise<ScoringOutput> {
    const {
        marketId,
        currentTemp,
        dailyMax,
        forecastHigh,
        thresholdTemp,
        yesPrice,
        noPrice,
        orderBookSpread,
        orderBookVolume,
    } = input;

    // Determine time of day
    const hour = new Date().getHours();
    let timeOfDay: 'morning' | 'midday' | 'afternoon' | 'evening' = 'morning';
    if (hour >= 18) timeOfDay = 'evening';
    else if (hour >= 15) timeOfDay = 'afternoon';
    else if (hour >= 12) timeOfDay = 'midday';

    // Calculate component scores
    const temperatureCertaintyScore = calculateTemperatureCertaintyScore(
        currentTemp,
        dailyMax,
        forecastHigh,
        thresholdTemp,
        timeOfDay
    );

    const marketPriceSignalScore = calculateMarketPriceSignalScore(
        yesPrice,
        noPrice,
        orderBookSpread,
        orderBookVolume,
        dailyMax,
        thresholdTemp
    );

    const weatherStabilityScore = calculateWeatherStabilityScore(
        currentTemp,
        dailyMax,
        forecastHigh,
        thresholdTemp
    );

    // Calculate weighted total score
    const totalScore = Math.round(
        temperatureCertaintyScore * 0.4 + marketPriceSignalScore * 0.3 + weatherStabilityScore * 0.2
    );

    // Calculate expected profit
    const expectedProfitPercent = calculateExpectedProfit(yesPrice, noPrice, dailyMax, thresholdTemp);

    // Generate recommendation
    let recommendation: 'BUY_YES' | 'BUY_NO' | 'SKIP' = 'SKIP';
    let reason = '';

    if (totalScore < 85) {
        reason = `Safety score ${totalScore} below minimum ${ENV.MIN_SAFETY_SCORE}`;
    } else if (!expectedProfitPercent || expectedProfitPercent < ENV.MIN_PROFIT_MARGIN_PERCENT) {
        reason = `Profit margin ${expectedProfitPercent?.toFixed(2) || 0}% below minimum ${ENV.MIN_PROFIT_MARGIN_PERCENT}%`;
    } else if (dailyMax > thresholdTemp) {
        recommendation = 'BUY_YES';
        reason = `YES is guaranteed (daily max ${dailyMax}°C > threshold ${thresholdTemp}°C). Safety score: ${totalScore}`;
    } else {
        recommendation = 'BUY_NO';
        reason = `NO is guaranteed (daily max ${dailyMax}°C <= threshold ${thresholdTemp}°C). Safety score: ${totalScore}`;
    }

    // Store safety score in database
    const safetyScoreDoc = new SafetyScore({
        market_id: marketId,
        timestamp: new Date(),
        total_score: totalScore,
        temperature_certainty_score: temperatureCertaintyScore,
        market_price_signal_score: marketPriceSignalScore,
        weather_stability_score: weatherStabilityScore,
        current_temp: currentTemp,
        daily_max: dailyMax,
        threshold_temp: thresholdTemp,
        market_yes_price: yesPrice,
        market_no_price: noPrice,
        order_book_volume: orderBookVolume,
        spread: orderBookSpread,
        expected_profit_percent: expectedProfitPercent,
        recommendation,
        reason,
    });

    await safetyScoreDoc.save();

    return {
        temperatureCertaintyScore,
        marketPriceSignalScore,
        weatherStabilityScore,
        totalScore,
        recommendation,
        reason,
        expectedProfitPercent,
    };
}

/**
 * Get latest safety score for a market
 */
export async function getLatestSafetyScore(
    marketId: string
): Promise<ScoringOutput | null> {
    const latestScore = await SafetyScore.findOne({ market_id: marketId })
        .sort({ timestamp: -1 })
        .lean();

    if (!latestScore) {
        return null;
    }

    return {
        temperatureCertaintyScore: latestScore.temperature_certainty_score,
        marketPriceSignalScore: latestScore.market_price_signal_score,
        weatherStabilityScore: latestScore.weather_stability_score,
        totalScore: latestScore.total_score,
        recommendation: latestScore.recommendation as 'BUY_YES' | 'BUY_NO' | 'SKIP',
        reason: latestScore.reason,
        expectedProfitPercent: latestScore.expected_profit_percent,
    };
}
