import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

/**
 * Bot Status API Endpoint
 * Returns current bot status and SAFE BETS that are:
 * - Unresolved (not yet resolved)
 * - For TODAY only (not n+1 days)
 * - High safety score (>= 95)
 * - Being actively monitored (orderbook fetched every second)
 */

export async function GET() {
    try {
        await connectToDatabase();

        // Import models dynamically
        const { Market, SafetyScore, Position } = await import('@/models/weatherArbitrage');

        // Get today's date range (00:00 to 23:59)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Get active, unresolved markets for TODAY only
        const activeMarkets = await Market.find({
            active: true,
            resolved: false,
            market_date: { $gte: today, $lt: tomorrow }, // Only today
        }).lean();

        const marketIds = activeMarkets.map((m: any) => m.market_id);

        // Get recent safety scores (last 30 minutes) for these markets
        const recentTime = new Date(Date.now() - 30 * 60 * 1000);
        const safetyScores = await SafetyScore.find({
            market_id: { $in: marketIds },
            timestamp: { $gte: recentTime },
            total_score: { $gte: 95 }, // Only high safety scores
            recommendation: { $in: ['BUY_YES', 'BUY_NO'] }, // Skip SKIP recommendations
        })
            .sort({ timestamp: -1 })
            .lean();

        // Create a map for the latest safety score per market+side
        const safetyScoreMap = new Map();
        safetyScores.forEach((score: any) => {
            const side = score.recommendation === 'BUY_YES' ? 'YES' : 'NO';
            const key = `${score.market_id}-${side}`;

            if (!safetyScoreMap.has(key)) {
                safetyScoreMap.set(key, score);
            }
        });

        // Get all open positions to avoid duplicates
        const openPositions = await Position.find({
            market_id: { $in: marketIds },
            status: 'OPEN',
        }).lean();

        const openPositionKeys = new Set(
            openPositions.map((p: any) => `${p.market_id}-${p.side}`)
        );

        // Build the safe markets list
        const safeMarkets: any[] = [];

        for (const market of activeMarkets) {
            const marketData = market as any;

            // Check both YES and NO sides
            for (const side of ['YES', 'NO']) {
                const key = `${marketData.market_id}-${side}`;

                // Skip if we already have an open position
                if (openPositionKeys.has(key)) {
                    continue;
                }

                const safetyScore = safetyScoreMap.get(key);

                if (safetyScore) {
                    const price = side === 'YES' ? marketData.yes_price : marketData.no_price;

                    safeMarkets.push({
                        marketId: marketData.market_id,
                        tokenId: `${marketData.market_id}-${side}`,
                        city: marketData.city,
                        question: marketData.question,
                        thresholdTemp: marketData.threshold_temp,
                        side: side as 'YES' | 'NO',
                        safetyScore: safetyScore.total_score,
                        expectedProfit: safetyScore.expected_profit_percent || 0,
                        currentPrice: price || 0.5,
                        lastChecked: safetyScore.timestamp.getTime(),
                    });
                }
            }
        }

        // Mock bot state (in production, this would come from the actual bot orchestrator)
        // For now, we'll determine running state based on whether we have safe markets
        const status = {
            running: true, // Would come from actual bot state
            paused: false,
            emergencyStop: false,
            safeMarketsCount: safeMarkets.length,
            activeOrderbookFetchers: safeMarkets.length, // One fetcher per safe market
            safeMarkets: safeMarkets,
        };

        return NextResponse.json({
            success: true,
            ...status,
        });
    } catch (error: any) {
        console.error('Error fetching bot status:', error);
        return NextResponse.json(
            { success: false, error: error.message, stack: error.stack },
            { status: 500 }
        );
    }
}
