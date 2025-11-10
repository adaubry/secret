'use client';

import { useEffect, useState } from 'react';
import { Activity, AlertCircle, Target, ThermometerSun, Clock } from 'lucide-react';

interface Market {
  marketId: string;
  question: string;
  city: string;
  thresholdTemp: number;
  marketDate: string;
  yesPrice: number | null;
  noPrice: number | null;
  resolved: boolean;
  resolutionOutcome: string | null;
  active: boolean;
  yesSafetyScore: number | null;
  noSafetyScore: number | null;
  isSafe: boolean;
  safeSide: string | null;
  expectedProfit: number | null;
  lastChecked: string | null;
}

interface Temperature {
  city: string;
  currentTemp: number;
  dailyMax: number;
  forecastHigh: number | null;
  timestamp: string;
  source: string;
  validated: boolean;
}

interface SafeMarket {
  marketId: string;
  tokenId: string;
  city: string;
  question: string;
  thresholdTemp: number;
  side: 'YES' | 'NO';
  safetyScore: number;
  expectedProfit: number;
  currentPrice: number;
  lastChecked: number;
}

interface BotStatus {
  running: boolean;
  paused: boolean;
  emergencyStop: boolean;
  safeMarketsCount: number;
  activeOrderbookFetchers: number;
  safeMarkets: SafeMarket[];
}

interface Stats {
  totalPnL: number;
  totalTrades: number;
  winRate: number;
  openPositions: number;
  usdcBalance: number;
  circuitBreakers: string[];
}

export default function Dashboard() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [temperatures, setTemperatures] = useState<Temperature[]>([]);
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all-bets' | 'safe-bets' | 'temperature'>('all-bets');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [marketsRes, tempRes, statusRes, statsRes] = await Promise.all([
        fetch('/api/markets'),
        fetch('/api/temperature'),
        fetch('/api/bot/status'),
        fetch('/api/stats'),
      ]);

      if (marketsRes.ok) {
        const data = await marketsRes.json();
        setMarkets(data.markets || []);
      }

      if (tempRes.ok) {
        const data = await tempRes.json();
        setTemperatures(data.temperatures || []);
      }

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

      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Refresh every 5 seconds
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
    <div className="min-h-screen bg-slate-950 flex">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 border-r border-slate-800 p-4 flex flex-col">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-white mb-1">Trading Bot</h1>
          <div className={`text-sm font-semibold ${getBotStatusColor()}`}>
            {getBotStatusText()}
          </div>
        </div>

        {/* Navigation */}
        <nav className="space-y-2 flex-1">
          <button
            onClick={() => setActiveTab('all-bets')}
            className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
              activeTab === 'all-bets'
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              <span className="font-medium">All Bets</span>
            </div>
            <div className="text-xs mt-1 opacity-80">{markets.length} markets</div>
          </button>

          <button
            onClick={() => setActiveTab('safe-bets')}
            className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
              activeTab === 'safe-bets'
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4" />
              <span className="font-medium">Safe Bets</span>
            </div>
            <div className="text-xs mt-1 opacity-80">
              {botStatus?.safeMarketsCount || 0} monitoring
            </div>
          </button>

          <button
            onClick={() => setActiveTab('temperature')}
            className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
              activeTab === 'temperature'
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <ThermometerSun className="w-4 h-4" />
              <span className="font-medium">Temperature</span>
            </div>
            <div className="text-xs mt-1 opacity-80">{temperatures.length} cities</div>
          </button>
        </nav>

        {/* Stats Summary */}
        {stats && (
          <div className="mt-auto pt-4 border-t border-slate-800 space-y-2">
            <div className="px-2">
              <div className="text-xs text-slate-400 mb-1">Total P&L</div>
              <div
                className={`text-lg font-bold ${
                  stats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                ${stats.totalPnL.toFixed(2)}
              </div>
            </div>
            <div className="px-2">
              <div className="text-xs text-slate-400 mb-1">Win Rate</div>
              <div className="text-lg font-bold text-blue-400">{stats.winRate.toFixed(1)}%</div>
            </div>
            <div className="px-2">
              <div className="text-xs text-slate-400 mb-1">Balance</div>
              <div className="text-lg font-bold text-purple-400">
                ${stats.usdcBalance.toFixed(2)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-auto">
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

        {/* All Bets Tab */}
        {activeTab === 'all-bets' && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">
              All Possible Bets ({markets.length})
            </h2>
            {markets.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center">
                <Activity className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No markets found</p>
                <p className="text-slate-500 text-sm mt-2">
                  Markets will appear here once they are scanned and stored in the database
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {markets.map((market) => (
                <div
                  key={market.marketId}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-4"
                >
                  <div className="mb-3">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-white font-semibold text-sm flex-1">
                        {market.question}
                      </h3>
                      <div className="flex gap-2 ml-2">
                        {market.resolved && (
                          <span className="bg-slate-700 border border-slate-600 text-slate-300 text-xs px-2 py-1 rounded">
                            RESOLVED {market.resolutionOutcome ? `(${market.resolutionOutcome})` : ''}
                          </span>
                        )}
                        {!market.resolved && market.isSafe && (
                          <span className="bg-green-500/20 border border-green-500 text-green-400 text-xs px-2 py-1 rounded">
                            SAFE
                          </span>
                        )}
                        {!market.resolved && !market.active && (
                          <span className="bg-yellow-500/20 border border-yellow-500 text-yellow-400 text-xs px-2 py-1 rounded">
                            INACTIVE
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{market.city}</span>
                      <span>•</span>
                      <span>{market.thresholdTemp}°F</span>
                      <span>•</span>
                      <span>{new Date(market.marketDate).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* YES Side */}
                    <div
                      className={`border rounded-lg p-3 ${
                        market.safeSide === 'YES'
                          ? 'border-green-500 bg-green-500/10'
                          : 'border-slate-700 bg-slate-800'
                      }`}
                    >
                      <div className="text-xs text-slate-400 mb-1">YES</div>
                      <div className="text-white font-semibold mb-1">
                        ${market.yesPrice?.toFixed(4) || 'N/A'}
                      </div>
                      {market.yesSafetyScore && (
                        <div className="text-xs">
                          <span className="text-green-400 font-semibold">
                            {market.yesSafetyScore}
                          </span>
                          <span className="text-slate-500"> safety</span>
                        </div>
                      )}
                    </div>

                    {/* NO Side */}
                    <div
                      className={`border rounded-lg p-3 ${
                        market.safeSide === 'NO'
                          ? 'border-green-500 bg-green-500/10'
                          : 'border-slate-700 bg-slate-800'
                      }`}
                    >
                      <div className="text-xs text-slate-400 mb-1">NO</div>
                      <div className="text-white font-semibold mb-1">
                        ${market.noPrice?.toFixed(4) || 'N/A'}
                      </div>
                      {market.noSafetyScore && (
                        <div className="text-xs">
                          <span className="text-green-400 font-semibold">
                            {market.noSafetyScore}
                          </span>
                          <span className="text-slate-500"> safety</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {market.expectedProfit && (
                    <div className="mt-3 pt-3 border-t border-slate-700 text-xs">
                      <span className="text-slate-400">Expected Profit: </span>
                      <span className="text-green-400 font-semibold">
                        {market.expectedProfit.toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
              ))}
              </div>
            )}
          </div>
        )}

        {/* Safe Bets Tab */}
        {activeTab === 'safe-bets' && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">
              Safe Bets - Actively Monitoring ({botStatus?.safeMarketsCount || 0})
            </h2>
            {botStatus && botStatus.safeMarkets.length > 0 ? (
              <div className="space-y-4">
                {botStatus.safeMarkets.map((market, i) => (
                  <div
                    key={i}
                    className="bg-green-900/20 border border-green-500 rounded-lg p-5"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-white font-bold text-base mb-2">
                          {market.question}
                        </h3>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-slate-400">{market.city}</span>
                          <span className="text-slate-600">•</span>
                          <span
                            className={`font-bold px-2 py-1 rounded text-xs ${
                              market.side === 'YES'
                                ? 'bg-green-900/50 text-green-400 border border-green-600'
                                : 'bg-red-900/50 text-red-400 border border-red-600'
                            }`}
                          >
                            {market.side}
                          </span>
                          <span className="text-slate-600">•</span>
                          <span className="text-slate-400">{market.thresholdTemp}°F</span>
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-green-400 font-bold text-2xl">
                          {market.safetyScore}
                        </div>
                        <div className="text-xs text-slate-400">safety score</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-4">
                      <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                        <div className="text-xs text-slate-400 mb-1">Expected Profit</div>
                        <div className="text-green-400 font-bold text-lg">
                          {market.expectedProfit.toFixed(2)}%
                        </div>
                      </div>
                      <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                        <div className="text-xs text-slate-400 mb-1">Current Price</div>
                        <div className="text-white font-bold text-lg">
                          ${market.currentPrice.toFixed(4)}
                        </div>
                      </div>
                      <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                        <div className="text-xs text-slate-400 mb-1">Status</div>
                        <div className="flex items-center gap-1 text-green-400">
                          <Clock className="w-4 h-4" />
                          <span className="text-sm font-semibold">Fetching</span>
                        </div>
                      </div>
                      <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                        <div className="text-xs text-slate-400 mb-1">Fetchers</div>
                        <div className="text-blue-400 font-bold text-lg">
                          {botStatus.activeOrderbookFetchers}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 bg-slate-900 border border-slate-700 rounded p-3">
                      <p className="text-xs text-slate-300">
                        Aggressive orderbook monitoring • Checking every{' '}
                        <span className="text-green-400 font-semibold">2-5 seconds</span> for
                        opportunities
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center">
                <Target className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No safe bets detected at the moment</p>
                <p className="text-slate-500 text-sm mt-2">
                  Continuously scanning markets for opportunities
                </p>
              </div>
            )}
          </div>
        )}

        {/* Temperature Tab */}
        {activeTab === 'temperature' && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">
              Temperature Data ({temperatures.length} cities)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {temperatures.map((temp) => (
                <div
                  key={temp.city}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-5"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <ThermometerSun className="w-8 h-8 text-orange-400" />
                      <div>
                        <h3 className="text-white font-bold text-lg">{temp.city}</h3>
                        <p className="text-xs text-slate-400">
                          {new Date(temp.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        temp.validated
                          ? 'bg-green-500/20 text-green-400 border border-green-500'
                          : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500'
                      }`}
                    >
                      {temp.validated ? 'Validated' : 'Pending'}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                      <div className="text-xs text-slate-400 mb-1">Current</div>
                      <div className="text-white font-bold text-xl">
                        {temp.currentTemp.toFixed(1)}°F
                      </div>
                    </div>
                    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                      <div className="text-xs text-slate-400 mb-1">Daily Max</div>
                      <div className="text-orange-400 font-bold text-xl">
                        {temp.dailyMax.toFixed(1)}°F
                      </div>
                    </div>
                    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                      <div className="text-xs text-slate-400 mb-1">Forecast</div>
                      <div className="text-blue-400 font-bold text-xl">
                        {temp.forecastHigh?.toFixed(1) || 'N/A'}°F
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between">
                    <span className="text-xs text-slate-400">Source: {temp.source}</span>
                    <span className="text-xs text-slate-500">
                      Last fetched: {new Date(temp.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
