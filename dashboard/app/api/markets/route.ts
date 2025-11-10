import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

/**
 * Markets API Endpoint
 * Returns all markets with their safety scores and current status
 */

export async function GET() {
    try {
        await connectToDatabase();

        // Import models dynamically
        const { Market, SafetyScore } = await import('@/models/weatherArbitrage');

        // Get all active markets
        const markets = await Market.find({ active: true })
            .sort({ market_date: 1 })
            .lean();

        // Get latest safety scores for each market
        const marketIds = markets.map((m: any) => m.market_id);
        const safetyScores = await SafetyScore.find({
            market_id: { $in: marketIds }
        })
            .sort({ timestamp: -1 })
            .lean();

        // Create a map of latest safety scores by market_id
        const safetyScoreMap = new Map();
        safetyScores.forEach((score: any) => {
            if (!safetyScoreMap.has(score.market_id)) {
                safetyScoreMap.set(score.market_id, score);
            }
        });

        // Combine markets with their safety scores
        const marketsWithScores = markets.map((market: any) => {
            const safetyScore = safetyScoreMap.get(market.market_id);

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
                // Safety scores for both sides
                yesSafetyScore: safetyScore?.recommendation === 'BUY_YES' ? safetyScore.total_score : null,
                noSafetyScore: safetyScore?.recommendation === 'BUY_NO' ? safetyScore.total_score : null,
                isSafe: safetyScore ? safetyScore.total_score >= 95 : false,
                safeSide: safetyScore?.recommendation?.replace('BUY_', '') || null,
                expectedProfit: safetyScore?.expected_profit_percent || null,
                lastChecked: safetyScore?.timestamp || null,
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
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
