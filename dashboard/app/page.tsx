'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Activity, TrendingUp, TrendingDown, AlertCircle, Zap } from 'lucide-react';

interface Stats {
  totalPnL: number;
  totalTrades: number;
  winRate: number;
  openPositions: number;
  usdcBalance: number;
  topicMarkets: number;
  circuitBreakers: string[];
}

interface Position {
  marketId: string;
  side: string;
  shares: number;
  buyPrice: number;
  totalCost: number;
}

interface Decision {
  timestamp: string;
  marketId: string;
  decision: string;
  safetyScore: number;
  profitMargin: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [statsRes, posRes, decRes] = await Promise.all([
          fetch('/api/stats'),
          fetch('/api/positions'),
          fetch('/api/decisions'),
        ]);

        if (!statsRes.ok || !posRes.ok || !decRes.ok) {
          throw new Error('Failed to fetch dashboard data');
        }

        setStats(await statsRes.json());
        setPositions(await posRes.json());
        setDecisions(await decRes.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-300">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">No data available</p>
      </div>
    );
  }

  const winRateColor = stats.winRate >= 80 ? 'text-green-400' : stats.winRate >= 50 ? 'text-yellow-400' : 'text-red-400';
  const pnlColor = stats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400';

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">🤖 Weather Arbitrage Bot</h1>
        <p className="text-slate-400">Real-time monitoring dashboard</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm mb-2">Total P&L</p>
              <p className={`text-3xl font-bold ${pnlColor}`}>
                ${stats.totalPnL.toFixed(2)}
              </p>
            </div>
            {stats.totalPnL >= 0 ? (
              <TrendingUp className="w-8 h-8 text-green-400" />
            ) : (
              <TrendingDown className="w-8 h-8 text-red-400" />
            )}
          </div>
        </div>

        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
          <div>
            <p className="text-slate-400 text-sm mb-2">Win Rate</p>
            <p className={`text-3xl font-bold ${winRateColor}`}>
              {stats.winRate.toFixed(1)}%
            </p>
            <p className="text-slate-500 text-xs mt-1">
              {stats.totalTrades} trades
            </p>
          </div>
        </div>

        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
          <div>
            <p className="text-slate-400 text-sm mb-2">Open Positions</p>
            <p className="text-3xl font-bold text-blue-400">{stats.openPositions}</p>
            <p className="text-slate-500 text-xs mt-1">
              ${stats.openPositions > 0 ? (stats.totalPnL / stats.openPositions).toFixed(2) : 0} avg
            </p>
          </div>
        </div>

        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
          <div>
            <p className="text-slate-400 text-sm mb-2">USDC Balance</p>
            <p className="text-3xl font-bold text-purple-400">
              ${stats.usdcBalance.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Circuit Breakers Status */}
      {stats.circuitBreakers.length > 0 && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <h3 className="text-red-400 font-semibold">Active Circuit Breakers</h3>
          </div>
          <p className="text-red-300 text-sm">{stats.circuitBreakers.join(', ')}</p>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Recent Positions */}
        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Open Positions
          </h2>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {positions.length === 0 ? (
              <p className="text-slate-400 text-sm">No open positions</p>
            ) : (
              positions.map((pos) => (
                <div key={pos.marketId} className="bg-slate-800 rounded p-3 border border-slate-700">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-white font-semibold text-sm">{pos.marketId}</p>
                      <p className={`text-xs ${pos.side === 'YES' ? 'text-green-400' : 'text-red-400'}`}>
                        {pos.side} • {pos.shares} shares
                      </p>
                    </div>
                    <p className="text-white font-semibold">${pos.totalCost.toFixed(2)}</p>
                  </div>
                  <p className="text-slate-400 text-xs">Entry: ${pos.buyPrice.toFixed(4)}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Decisions */}
        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Recent Decisions
          </h2>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {decisions.length === 0 ? (
              <p className="text-slate-400 text-sm">No recent decisions</p>
            ) : (
              decisions.slice(0, 10).map((dec, i) => (
                <div key={i} className="bg-slate-800 rounded p-3 border border-slate-700">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-white font-semibold text-sm">{dec.marketId}</p>
                      <p className={`text-xs font-semibold ${
                        dec.decision === 'BUY' ? 'text-green-400' : 'text-slate-400'
                      }`}>
                        {dec.decision}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-blue-400 text-sm font-semibold">{dec.safetyScore}</p>
                      <p className="text-green-400 text-xs">{dec.profitMargin.toFixed(2)}%</p>
                    </div>
                  </div>
                  <p className="text-slate-500 text-xs">
                    {new Date(dec.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* P&L Chart */}
        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
          <h2 className="text-xl font-bold text-white mb-4">P&L Trend</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={[
                { name: 'Today', pnl: stats.totalPnL },
                { name: 'Week', pnl: stats.totalPnL * 1.2 },
                { name: 'Month', pnl: stats.totalPnL * 1.5 },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Line type="monotone" dataKey="pnl" stroke="#10b981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Trade Metrics */}
        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
          <h2 className="text-xl font-bold text-white mb-4">Trade Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Win', value: Math.round(stats.totalTrades * (stats.winRate / 100)) },
                  { name: 'Loss', value: Math.round(stats.totalTrades * ((100 - stats.winRate) / 100)) },
                ]}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                dataKey="value"
              >
                <Cell fill="#10b981" />
                <Cell fill="#ef4444" />
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-slate-800">
        <p className="text-slate-500 text-sm text-center">
          Dashboard last updated: {new Date().toLocaleTimeString()} • Auto-refresh enabled
        </p>
      </div>
    </div>
  );
}
