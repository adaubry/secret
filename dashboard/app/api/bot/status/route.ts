import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ActionLog } from '@/models/logs';

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
                    city: 'London',
                    safetyScore: 97,
                    side: 'YES',
                    expectedProfit: 3.5,
                    currentPrice: 0.92,
                    lastChecked: Date.now(),
                },
                {
                    marketId: 'market-2',
                    city: 'New York',
                    safetyScore: 96,
                    side: 'NO',
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
