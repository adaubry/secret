import { NextResponse } from 'next/server';

/**
 * Bot Status API Endpoint
 * Returns current bot status and safe markets
 */

export async function GET() {
    try {
        // In production, import: import { getBotStatus } from '@/services/botOrchestratorV2';
        // const status = getBotStatus();

        // Mock status for now
        const status = {
            running: true,
            paused: false,
            emergencyStop: false,
            safeMarketsCount: 2,
            activeOrderbookFetchers: 2,
            safeMarkets: [
                {
                    marketId: 'market-1',
                    tokenId: 'market-1-YES',
                    city: 'London',
                    question: 'Will the max temperature in London on Nov 10 be 55-56°F?',
                    thresholdTemp: 55,
                    side: 'YES' as 'YES' | 'NO',
                    safetyScore: 97,
                    expectedProfit: 3.5,
                    currentPrice: 0.92,
                    lastChecked: Date.now(),
                },
                {
                    marketId: 'market-2',
                    tokenId: 'market-2-NO',
                    city: 'New York',
                    question: 'Will the max temperature in New York on Nov 10 be below 50°F?',
                    thresholdTemp: 50,
                    side: 'NO' as 'YES' | 'NO',
                    safetyScore: 96,
                    expectedProfit: 2.8,
                    currentPrice: 0.95,
                    lastChecked: Date.now(),
                },
            ],
        };

        return NextResponse.json({
            success: true,
            ...status,
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
