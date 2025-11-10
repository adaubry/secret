import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

/**
 * Markets API Endpoint
 * Returns ALL markets with their safety scores, grouped for display
 * This shows all possible bets (event > market > side) categorized by event
 */

export async function GET() {
    try {
        await connectToDatabase();

        // Import models dynamically
        const { Market, SafetyScore } = await import('@/models/weatherArbitrage');

        // Get ALL markets (including resolved ones for historical view)
        // But we'll prioritize active/unresolved ones
        const markets = await Market.find({})
            .sort({ market_date: -1, city: 1, threshold_temp: 1 })
            .lean();

        // Get latest safety scores for each market (for both YES and NO sides)
        const marketIds = markets.map((m: any) => m.market_id);

        // Get all recent safety scores (last 24 hours) to capture both YES and NO recommendations
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const safetyScores = await SafetyScore.find({
            market_id: { $in: marketIds },
            timestamp: { $gte: oneDayAgo }
        })
            .sort({ timestamp: -1 })
            .lean();

        // Create a map to store the latest safety score for each market+side combination
        const safetyScoreMap = new Map();
        safetyScores.forEach((score: any) => {
            const side = score.recommendation === 'BUY_YES' ? 'YES' :
                        score.recommendation === 'BUY_NO' ? 'NO' : null;

            if (side) {
                const key = `${score.market_id}-${side}`;
                // Only store if we don't have one yet (since they're sorted by timestamp desc)
                if (!safetyScoreMap.has(key)) {
                    safetyScoreMap.set(key, score);
                }
            }
        });

        // Combine markets with their safety scores for both YES and NO
        const marketsWithScores = markets.map((market: any) => {
            const yesKey = `${market.market_id}-YES`;
            const noKey = `${market.market_id}-NO`;

            const yesSafetyScore = safetyScoreMap.get(yesKey);
            const noSafetyScore = safetyScoreMap.get(noKey);

            // Determine which side is safe (if any)
            let safeSide = null;
            let isSafe = false;
            let expectedProfit = null;

            if (yesSafetyScore && yesSafetyScore.total_score >= 95) {
                safeSide = 'YES';
                isSafe = true;
                expectedProfit = yesSafetyScore.expected_profit_percent;
            } else if (noSafetyScore && noSafetyScore.total_score >= 95) {
                safeSide = 'NO';
                isSafe = true;
                expectedProfit = noSafetyScore.expected_profit_percent;
            }

            return {
                marketId: market.market_id,
                question: market.question,
                city: market.city,
                thresholdTemp: market.threshold_temp,
                marketDate: market.market_date,
                yesPrice: market.yes_price,
                noPrice: market.no_price,
                resolved: market.resolved,
                resolutionOutcome: market.resolution_outcome,
                active: market.active,
                // Safety scores for both sides
                yesSafetyScore: yesSafetyScore ? yesSafetyScore.total_score : null,
                noSafetyScore: noSafetyScore ? noSafetyScore.total_score : null,
                // Overall safety determination
                isSafe,
                safeSide,
                expectedProfit,
                lastChecked: yesSafetyScore?.timestamp || noSafetyScore?.timestamp || null,
            };
        });

        return NextResponse.json({
            success: true,
            markets: marketsWithScores,
            count: marketsWithScores.length,
        });
    } catch (error: any) {
        console.error('Error fetching markets:', error);
        return NextResponse.json(
            { success: false, error: error.message, stack: error.stack },
            { status: 500 }
        );
    }
}
