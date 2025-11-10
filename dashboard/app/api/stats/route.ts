import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

// Connect to MongoDB
async function connectDB() {
  if (mongoose.connection.readyState >= 1) {
    return;
  }

  await mongoose.connect(process.env.MONGO_URI!);
}

interface CircuitBreaker {
  active: boolean;
  name: string;
}

export async function GET() {
  try {
    await connectDB();

    // Get models
    const mongoClient = mongoose.connection.getClient();
    const db = mongoClient.db();
    const circuitBreakerCollection = db.collection('circuit_breakers');
    const portfolioMetricsCollection = db.collection('portfolio_metrics');

    // Get latest portfolio metrics
    const latestMetrics = await portfolioMetricsCollection
      .findOne({}, { sort: { timestamp: -1 } })
      .then((doc: any) => doc || {
        total_pnl: 0,
        total_trades: 0,
        winning_trades: 0,
        total_open_positions: 0,
        usdc_balance: 0,
      });

    // Get active circuit breakers
    const activeBreakers = await circuitBreakerCollection
      .find({ active: true })
      .project({ name: 1 })
      .toArray();

    const stats = {
      totalPnL: latestMetrics.total_pnl || 0,
      totalTrades: latestMetrics.total_trades || 0,
      winRate: latestMetrics.total_trades > 0
        ? (latestMetrics.winning_trades / latestMetrics.total_trades) * 100
        : 0,
      openPositions: latestMetrics.total_open_positions || 0,
      usdcBalance: latestMetrics.usdc_balance || 0,
      topicMarkets: latestMetrics.total_trades || 0,
      circuitBreakers: (activeBreakers as CircuitBreaker[]).map((b) => b.name),
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
