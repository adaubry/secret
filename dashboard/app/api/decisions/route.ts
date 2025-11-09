import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

async function connectDB() {
  if (mongoose.connection.readyState >= 1) {
    return;
  }

  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/weather_arbitrage');
}

export async function GET() {
  try {
    await connectDB();

    const db = mongoose.connection;
    const decisionCollection = db.collection('trade_decisions');

    // Get recent trade decisions (limit to last 20)
    const decisions = await decisionCollection
      .find({})
      .sort({ timestamp: -1 })
      .limit(20)
      .toArray();

    const formatted = decisions.map((dec: any) => ({
      timestamp: dec.timestamp,
      marketId: dec.market_id,
      decision: dec.decision,
      safetyScore: dec.safety_score,
      profitMargin: dec.profit_margin_percent || 0,
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch decisions' },
      { status: 500 }
    );
  }
}
