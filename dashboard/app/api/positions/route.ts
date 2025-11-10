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

    const mongoClient = mongoose.connection.getClient();
    const db = mongoClient.db();
    const positionCollection = db.collection('positions');

    // Get open positions (limit to last 20)
    const positions = await positionCollection
      .aggregate([
        { $match: { status: 'OPEN' } },
        { $sort: { timestamp: -1 } },
        { $limit: 20 }
      ])
      .toArray();

    const formatted = positions.map((pos: any) => ({
      marketId: pos.market_id,
      side: pos.side,
      shares: pos.shares,
      buyPrice: pos.buy_price,
      totalCost: pos.total_cost,
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch positions' },
      { status: 500 }
    );
  }
}
