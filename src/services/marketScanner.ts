import { ClobClient } from '@polymarket/clob-client';
import { Market } from '../models/weatherArbitrage';

interface ScannedMarket {
    market_id: string;
    question: string;
    city: string;
    threshold_temp: number;
    market_date: Date;
    resolution_source: string;
}

/**
 * Market Scanner - Continuous market scanning for weather prediction markets
 * Parses market questions to identify weather arbitrage opportunities
 */

/**
 * Parse weather market question to extract structured data
 * Examples:
 * - "Will the max temperature in New York on Nov 10 exceed 80°F?"
 * - "Will Boston max temp reach 65°F or higher on Nov 11?"
 */
function parseWeatherMarketQuestion(question: string): Partial<ScannedMarket> | null {
    // Normalize question
    const q = question.toLowerCase();

    // City extraction - look for common US city names
    const cityPatterns = [
        'new york',
        'los angeles',
        'chicago',
        'houston',
        'phoenix',
        'philadelphia',
        'san antonio',
        'san diego',
        'dallas',
        'san jose',
        'austin',
        'jacksonville',
        'denver',
        'boston',
        'seattle',
        'miami',
        'portland',
        'atlanta',
        'vegas',
        'las vegas',
        'sf',
        'san francisco',
    ];

    let city = '';
    for (const pattern of cityPatterns) {
        if (q.includes(pattern)) {
            city = pattern.split(' ')[0].charAt(0).toUpperCase() + pattern.split(' ')[0].slice(1);
            if (pattern.includes(' ')) {
                city = pattern
                    .split(' ')
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ');
            }
            break;
        }
    }

    if (!city) {
        return null; // Not a weather market we recognize
    }

    // Temperature threshold extraction (look for numbers followed by °F or F or degrees)
    const tempMatch = q.match(/(\d+)\s*(?:°F|f|degrees? f)/i);
    if (!tempMatch) {
        return null;
    }

    const thresholdTemp = parseInt(tempMatch[1]);

    // Date extraction (look for dates like "Nov 10", "November 10", etc.)
    const dateMatch = q.match(
        /(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)\s+(\d{1,2})/i
    );

    if (!dateMatch) {
        return null;
    }

    // Parse date
    const monthStr = dateMatch[0].split(' ')[0];
    const day = parseInt(dateMatch[1]);

    const monthMap: { [key: string]: number } = {
        jan: 0,
        january: 0,
        feb: 1,
        february: 1,
        mar: 2,
        march: 2,
        apr: 3,
        april: 3,
        may: 4,
        jun: 5,
        june: 5,
        jul: 6,
        july: 6,
        aug: 7,
        august: 7,
        sep: 8,
        september: 8,
        oct: 9,
        october: 9,
        nov: 10,
        november: 10,
        dec: 11,
        december: 11,
    };

    const month = monthMap[monthStr.toLowerCase()] ?? -1;
    if (month === -1) {
        return null;
    }

    // Create date (assuming current year, or next year if month has passed)
    const today = new Date();
    const marketDate = new Date(today.getFullYear(), month, day);

    if (marketDate < today) {
        marketDate.setFullYear(today.getFullYear() + 1);
    }

    return {
        city,
        threshold_temp: thresholdTemp,
        market_date: marketDate,
        resolution_source: 'NOAA', // Default to NOAA, should be verified per market
    };
}

/**
 * Scan all Polymarket markets for weather prediction opportunities
 */
export async function scanWeatherMarkets(clobClient: ClobClient): Promise<ScannedMarket[]> {
    const scannedMarkets: ScannedMarket[] = [];

    try {
        // Fetch all active markets from CLOB
        // Note: This depends on the actual CLOB API structure
        // For now, we'll fetch markets with pagination
        console.log('🔍 Scanning Polymarket for weather markets...');

        // This is a simplified version - in production, you'd fetch from the actual API
        const marketsResponse = await (clobClient as any).getMarkets();

        if (!marketsResponse || !marketsResponse.markets) {
            console.warn('⚠️  No markets returned from CLOB');
            return scannedMarkets;
        }

        for (const market of marketsResponse.markets) {
            const parsed = parseWeatherMarketQuestion(market.question);

            if (parsed) {
                const scannedMarket: ScannedMarket = {
                    market_id: market.conditionId || market.id,
                    question: market.question,
                    city: parsed.city || '',
                    threshold_temp: parsed.threshold_temp || 0,
                    market_date: parsed.market_date || new Date(),
                    resolution_source: parsed.resolution_source || 'NOAA',
                };

                scannedMarkets.push(scannedMarket);

                console.log(
                    `✅ Found weather market: ${scannedMarket.city} ${scannedMarket.threshold_temp}°F on ${scannedMarket.market_date.toDateString()}`
                );
            }
        }

        return scannedMarkets;
    } catch (error) {
        console.error('❌ Error scanning markets:', error);
        return scannedMarkets;
    }
}

/**
 * Store scanned market in database
 */
export async function storeMarket(scannedMarket: ScannedMarket): Promise<boolean> {
    try {
        // Check if market already exists
        const existing = await Market.findOne({ market_id: scannedMarket.market_id });

        if (!existing) {
            const market = new Market({
                market_id: scannedMarket.market_id,
                question: scannedMarket.question,
                city: scannedMarket.city,
                threshold_temp: scannedMarket.threshold_temp,
                market_date: scannedMarket.market_date,
                resolution_source: scannedMarket.resolution_source,
                active: true,
                created_at: new Date(),
                updated_at: new Date(),
            });

            await market.save();
            console.log(`📝 Market stored: ${scannedMarket.market_id}`);
            return true;
        }

        return false;
    } catch (error) {
        console.error('❌ Error storing market:', error);
        return false;
    }
}

/**
 * Get all active markets for today and tomorrow
 */
export async function getActiveMarkets(): Promise<ScannedMarket[]> {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 2); // Include tomorrow + 1 day buffer

        const markets = await Market.find({
            active: true,
            resolved: false,
            market_date: { $gte: today, $lte: tomorrow },
        }).lean();

        return markets.map((m) => ({
            market_id: m.market_id,
            question: m.question,
            city: m.city,
            threshold_temp: m.threshold_temp,
            market_date: m.market_date,
            resolution_source: m.resolution_source,
        }));
    } catch (error) {
        console.error('❌ Error fetching active markets:', error);
        return [];
    }
}

/**
 * Get cities we need to track weather for
 */
export async function getCitiesToTrack(): Promise<string[]> {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 2);

        const cities = await Market.distinct('city', {
            active: true,
            resolved: false,
            market_date: { $gte: today, $lte: tomorrow },
        });

        return cities;
    } catch (error) {
        console.error('❌ Error fetching cities to track:', error);
        return [];
    }
}

/**
 * Mark market as resolved
 */
export async function resolveMarket(marketId: string, outcome: 'YES' | 'NO'): Promise<boolean> {
    try {
        const result = await Market.updateOne(
            { market_id: marketId },
            {
                resolved: true,
                resolution_outcome: outcome,
                active: false,
                updated_at: new Date(),
            }
        );

        if (result.modifiedCount > 0) {
            console.log(`✅ Market ${marketId} resolved as ${outcome}`);
            return true;
        }

        return false;
    } catch (error) {
        console.error('❌ Error resolving market:', error);
        return false;
    }
}
