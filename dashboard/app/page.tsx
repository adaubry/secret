'use client';

import { useEffect, useState } from 'react';
import { Activity, TrendingUp, TrendingDown, AlertCircle, Zap, Power, Pause, Play, XCircle, Target, Clock, DollarSign, BarChart3, AlertTriangle } from 'lucide-react';

interface Stats {
  totalPnL: number;
  totalTrades: number;
  winRate: number;
  openPositions: number;
  usdcBalance: number;
  circuitBreakers: string[];
}

interface BotStatus {
  running: boolean;
  paused: boolean;
  emergencyStop: boolean;
  safeMarketsCount: number;
  activeOrderbookFetchers: number;
  safeMarkets: SafeMarket[];
}

interface SafeMarket {
  marketId: string;
  city: string;
  safetyScore: number;
  side: 'YES' | 'NO';
  expectedProfit: number;
  currentPrice: number;
  lastChecked: number;
}

interface ActionLog {
  timestamp: string;
  action: string;
  message: string;
  data?: any;
}

interface ErrorLog {
  timestamp: string;
  errorType: string;
  message: string;
  data?: any;
  resolved: boolean;
}

interface Position {
  marketId: string;
  side: string;
  shares: number;
  buyPrice: number;
  totalCost: number;
}

export default function DashboardV2() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [controlLoading, setControlLoading] = useState(false);

  // Fetch all data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsRes, statusRes, actionsRes, errorsRes, posRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/bot/status'),
        fetch('/api/logs/actions?limit=50'),
        fetch('/api/logs/errors?limit=20'),
        fetch('/api/positions'),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (statusRes.ok) {
        const data = await statusRes.json();
        setBotStatus({
          running: data.running,
          paused: data.paused,
          emergencyStop: data.emergencyStop,
          safeMarketsCount: data.safeMarketsCount,
          activeOrderbookFetchers: data.activeOrderbookFetchers,
          safeMarkets: data.safeMarkets || [],
        });
      }
      if (actionsRes.ok) {
        const data = await actionsRes.json();
        setActionLogs(data.logs || []);
      }
      if (errorsRes.ok) {
        const data = await errorsRes.json();
        setErrorLogs(data.logs || []);
      }
      if (posRes.ok) setPositions(await posRes.json());

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // Bot control functions
  const sendBotCommand = async (action: string, reason?: string) => {
    try {
      setControlLoading(true);
      const res = await fetch('/api/bot/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: reason || `${action} via dashboard` }),
      });

      if (!res.ok) throw new Error('Command failed');

      await fetchData(); // Refresh data
    } catch (err) {
      alert(`Failed to ${action}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setControlLoading(false);
    }
  };

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-300">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => fetchData()}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const getBotStatusColor = () => {
    if (botStatus?.emergencyStop) return 'text-red-500';
    if (botStatus?.paused) return 'text-yellow-500';
    if (botStatus?.running) return 'text-green-500';
    return 'text-slate-500';
  };

  const getBotStatusText = () => {
    if (botStatus?.emergencyStop) return 'EMERGENCY STOP';
    if (botStatus?.paused) return 'PAUSED';
    if (botStatus?.running) return 'RUNNING';
    return 'STOPPED';
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">🤖 Trading Bot V2</h1>
            <p className="text-slate-400">Competitive Polymarket Weather Arbitrage</p>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${getBotStatusColor()}`}>
              {getBotStatusText()}
            </div>
            <div className="text-slate-400 text-sm">
              {botStatus?.safeMarketsCount || 0} safe markets detected
            </div>
          </div>
        </div>
      </div>

      {/* Bot Controls */}
      <div className="bg-slate-900 rounded-lg p-6 border border-slate-800 mb-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Power className="w-5 h-5" />
          Bot Controls
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => sendBotCommand('pause')}
            disabled={controlLoading || botStatus?.paused || !botStatus?.running}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-slate-700 disabled:text-slate-500 rounded text-white font-semibold flex items-center gap-2"
          >
            <Pause className="w-4 h-4" />
            Pause
          </button>
          <button
            onClick={() => sendBotCommand('resume')}
            disabled={controlLoading || !botStatus?.paused}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:text-slate-500 rounded text-white font-semibold flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            Resume
          </button>
          <button
            onClick={() => {
              if (confirm('Are you sure you want to stop the bot?')) {
                sendBotCommand('stop', 'Manual stop via dashboard');
              }
            }}
            disabled={controlLoading}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-700 disabled:text-slate-500 rounded text-white font-semibold flex items-center gap-2"
          >
            <XCircle className="w-4 h-4" />
            Stop Bot
          </button>
          <button
            onClick={() => {
              if (confirm('⚠️ EMERGENCY STOP - This will immediately halt all bot operations. Continue?')) {
                sendBotCommand('emergency_stop', 'Emergency stop via dashboard');
              }
            }}
            disabled={controlLoading}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:text-slate-500 rounded text-white font-semibold flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4" />
            EMERGENCY STOP
          </button>
        </div>
      </div>

      {/* Circuit Breakers Alert */}
      {stats && stats.circuitBreakers && stats.circuitBreakers.length > 0 && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <h3 className="text-red-400 font-semibold">Active Circuit Breakers</h3>
          </div>
          <p className="text-red-300 text-sm">{stats.circuitBreakers.join(', ')}</p>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm mb-2">Total P&L</p>
                <p className={`text-3xl font-bold ${stats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
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
              <p className={`text-3xl font-bold ${stats.winRate >= 80 ? 'text-green-400' : stats.winRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                {stats.winRate.toFixed(1)}%
              </p>
              <p className="text-slate-500 text-xs mt-1">{stats.totalTrades} trades</p>
            </div>
          </div>

          <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
            <div>
              <p className="text-slate-400 text-sm mb-2">Open Positions</p>
              <p className="text-3xl font-bold text-blue-400">{stats.openPositions}</p>
            </div>
          </div>

          <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
            <div>
              <p className="text-slate-400 text-sm mb-2">USDC Balance</p>
              <p className="text-3xl font-bold text-purple-400">${stats.usdcBalance.toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Safe Markets */}
      {botStatus && botStatus.safeMarkets.length > 0 && (
        <div className="bg-green-900/20 border border-green-500 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-green-400 mb-4 flex items-center gap-2">
            <Target className="w-5 h-5" />
            Safe Markets - Active Trading
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {botStatus.safeMarkets.map((market, i) => (
              <div key={i} className="bg-slate-900 rounded-lg p-4 border border-green-500">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-white font-bold">{market.city}</p>
                    <p className={`text-sm font-semibold ${market.side === 'YES' ? 'text-green-400' : 'text-red-400'}`}>
                      {market.side}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-green-400 font-bold text-lg">{market.safetyScore}</p>
                    <p className="text-xs text-slate-400">safety score</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-slate-400">Expected Profit</p>
                    <p className="text-green-400 font-semibold">{market.expectedProfit.toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Price</p>
                    <p className="text-white font-semibold">${market.currentPrice.toFixed(4)}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                  <Clock className="w-3 h-3" />
                  Orderbook fetching active
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 bg-slate-800 rounded p-3">
            <p className="text-sm text-slate-300">
              <span className="font-semibold text-green-400">{botStatus.activeOrderbookFetchers}</span> aggressive orderbook fetchers active •
              Checking every 2-5 seconds for opportunities
            </p>
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Action Logs */}
        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Action Logs (Last 50)
          </h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {actionLogs.length === 0 ? (
              <p className="text-slate-400 text-sm">No action logs yet</p>
            ) : (
              actionLogs.map((log, i) => (
                <div key={i} className="bg-slate-800 rounded p-3 border border-slate-700 text-sm">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-semibold text-blue-400">{log.action}</span>
                    <span className="text-slate-500 text-xs">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-slate-300">{log.message}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Error Logs */}
        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            Error Logs (Last 20)
          </h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {errorLogs.length === 0 ? (
              <p className="text-slate-400 text-sm">No errors - System healthy!</p>
            ) : (
              errorLogs.map((log, i) => (
                <div key={i} className="bg-red-900/20 rounded p-3 border border-red-800 text-sm">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-semibold text-red-400">{log.errorType}</span>
                    <span className="text-slate-500 text-xs">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-red-300">{log.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Open Positions */}
      <div className="bg-slate-900 rounded-lg p-6 border border-slate-800 mb-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Open Positions
        </h2>
        <div className="space-y-3">
          {positions.length === 0 ? (
            <p className="text-slate-400 text-sm">No open positions</p>
          ) : (
            positions.map((pos, i) => (
              <div key={i} className="bg-slate-800 rounded p-4 border border-slate-700">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white font-semibold">{pos.marketId}</p>
                    <p className={`text-sm ${pos.side === 'YES' ? 'text-green-400' : 'text-red-400'}`}>
                      {pos.side} • {pos.shares.toFixed(2)} shares @ ${pos.buyPrice.toFixed(4)}
                    </p>
                  </div>
                  <p className="text-white font-bold text-lg">${pos.totalCost.toFixed(2)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-slate-800">
        <p className="text-slate-500 text-sm text-center">
          Dashboard V2 • Auto-refresh every 5s • Last updated: {new Date().toLocaleTimeString()}
        </p>
        <p className="text-slate-600 text-xs text-center mt-1">
          Focused on London & New York markets • All-in liquidity strategy • Competitive mode
        </p>
      </div>
    </div>
  );
}
