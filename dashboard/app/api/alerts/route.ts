import { NextResponse } from 'next/server';

// This would normally fetch from the bot's in-memory alert queue
// For now, we return an empty array (frontend will show popups when available)
export async function GET() {
    try {
        // In production, connect to bot service to get alerts
        // For now, return empty array - alerts pushed via WebSocket or polling
        return NextResponse.json([]);
    } catch (error) {
        console.error('Alerts API error:', error);
        return NextResponse.json([], { status: 200 });
    }
}
