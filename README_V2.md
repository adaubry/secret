# Weather Arbitrage Bot V2 - Competitive Trading Mode

**A high-frequency, competitive trading bot for Polymarket weather prediction markets**

## 🚀 What's New in V2

V2 is a complete revamp designed for **competitive, high-frequency trading** on Polymarket weather markets.

### Key Changes

1. **60-Second Safe Market Detection**
   - Calculates safety scores every 60 seconds (vs 2 minutes in V1)
   - Identifies markets that are certain but not yet resolved

2. **Aggressive Orderbook Fetching**
   - When safe markets are detected, orderbooks are fetched every 2-5 seconds
   - Maximizes chances of capturing favorable orders before competitors
   - Multiple concurrent fetchers for multiple safe markets

3. **All-In Liquidity Strategy**
   - When a safe market is identified, allocates ALL available liquidity
   - If multiple safe markets exist, splits liquidity equally
   - No more 10% conservative allocation

4. **London & New York Focus Only**
   - Filters markets to only London and New York cities
   - Targets 4 events: London today, London tomorrow, NY today, NY tomorrow
   - Ignores all other weather markets

5. **Auto Day Rotation**
   - Automatically cleans up markets from day n-1
   - Focuses trading on day n (today) and day n+1 (tomorrow)
   - Runs cleanup every 6 hours

6. **Enhanced Dashboard V2**
   - Real-time bot control (pause, resume, stop, emergency stop)
   - Live safe markets display with orderbook fetch indicators
   - Action log (last 50 actions)
   - Error log (last 20 errors)
   - 5-second auto-refresh
   - Full kill switches and safety controls

## 🏗️ Architecture

### Core Components

```
src/
├── services/
│   ├── botOrchestratorV2.ts      ← Main V2 orchestrator (60s loop, aggressive fetching)
│   ├── tradeEngine.ts              ← Order execution
│   ├── safetyScorer.ts             ← Safety scoring (0-100)
│   ├── marketScanner.ts            ← Market discovery (London/NY only)
│   ├── weatherAggregator.ts        ← Weather data fetching
│   └── circuitBreakers.ts          ← Risk management
├── models/
│   ├── weatherArbitrage.ts         ← MongoDB schemas
│   └── logs.ts                     ← Action/error logging schemas
└── index.ts                        ← Entry point (uses V2)

dashboard/
├── app/
│   ├── page.tsx                    ← V2 Dashboard UI
│   └── api/
│       ├── bot/
│       │   ├── control/route.ts    ← Bot control API
│       │   └── status/route.ts     ← Bot status API
│       └── logs/
│           ├── actions/route.ts    ← Action logs API
│           └── errors/route.ts     ← Error logs API
```

## 🎯 Trading Strategy

### Safe Market Detection (Every 60 Seconds)

1. Fetch all active London/New York markets for today and tomorrow
2. For each market:
   - Get latest weather data
   - Calculate safety score (0-100)
   - Check if score >= 95 and profit >= 0.5%
3. If market is safe → Start aggressive orderbook fetching

### Aggressive Orderbook Fetching (Every 2-5 Seconds)

1. For each safe market, spawn an aggressive fetcher
2. Fetcher runs every 2-5 seconds (randomized to avoid pattern detection)
3. On each fetch:
   - Get latest orderbook from Polymarket CLOB
   - Find best available price
   - If price is favorable (within 2% slippage) → Execute trade immediately

### All-In Trade Execution

1. When favorable order found:
   - Calculate allocation: `total_balance / num_safe_markets`
   - Execute trade with all allocated funds
   - Stop fetcher for this market
   - Remove from safe markets list

### Example Flow

```
[T=0s]    Detect safe market: London today YES @ 92¢ (score: 97, profit: 8%)
[T=0s]    Start aggressive orderbook fetcher for London market
[T=2s]    Fetch orderbook → Best price: 93¢ (acceptable, within 2% slippage)
[T=2s]    Execute all-in trade: 10,000 USDC → 10,752 shares @ 93¢
[T=2s]    Stop fetcher, remove from safe markets
```

## 📊 Dashboard V2

Access the dashboard at: `http://localhost:3000`

### Features

1. **Bot Controls**
   - Pause: Temporarily pause trading (keeps positions open)
   - Resume: Resume trading after pause
   - Stop: Stop bot gracefully (closes orderbook fetchers)
   - Emergency Stop: Immediate halt (for critical situations)

2. **Safe Markets Display**
   - Shows all currently detected safe markets
   - Displays safety score, expected profit, current price
   - Indicates active orderbook fetcher status
   - Updates every 5 seconds

3. **Action Logs**
   - Real-time feed of all bot actions
   - Last 50 actions displayed
   - Includes: market detection, trades, errors, state changes

4. **Error Logs**
   - All errors with timestamps
   - Last 20 errors displayed
   - Helps debug issues quickly

5. **Portfolio Stats**
   - Total P&L
   - Win rate
   - Open positions
   - USDC balance
   - Active circuit breakers

## 🔧 Configuration

### Environment Variables

```env
# Wallet & Blockchain
WALLET_ADDRESS=0x...
PRIVATE_KEY=0x...
RPC_URL=https://polygon-rpc.com
USDC_CONTRACT_ADDRESS=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174

# Polymarket CLOB
CLOB_HTTP_URL=https://clob.polymarket.com
CLOB_WS_URL=wss://ws-subscriptions-clob.polymarket.com

# Database
MONGO_URI=mongodb+srv://...

# Weather API
OPENWEATHER_API_KEY=your_api_key

# Trading Parameters (V2)
MIN_SAFETY_SCORE=95                     # Minimum safety score to trade
MIN_PROFIT_MARGIN_PERCENT=0.5           # Minimum profit after fees

# Mode
PAPER_TRADING_MODE=true                 # Set to false for live trading
DEBUG_MODE=false                        # Enable debug logging
```

## 🚦 Safety Features

### Circuit Breakers

All circuit breakers from V1 are maintained:

1. **Loss Limit**: Stops if total P&L drops below threshold
2. **Win Rate**: Stops if last 10 trades show <80% win rate
3. **Data Freshness**: Stops if weather data is >15 minutes old
4. **API Health**: Stops if critical APIs are down
5. **Balance Check**: Stops if USDC balance too low
6. **Manual Stop**: File-based emergency stop mechanism

### Dashboard Kill Switches

- **Pause**: Pause trading temporarily
- **Stop**: Graceful shutdown
- **Emergency Stop**: Immediate halt (clears all orderbook fetchers)

## 📈 Performance Optimizations

1. **Concurrent Orderbook Fetching**
   - Multiple safe markets = multiple concurrent fetchers
   - Each fetcher runs independently every 2-5 seconds

2. **Randomized Intervals**
   - 2-5 second random intervals to avoid pattern detection
   - Prevents predictable behavior that competitors could exploit

3. **Immediate Execution**
   - No waiting for next loop cycle
   - Executes trades immediately when favorable orders found

4. **Efficient Day Rotation**
   - Runs every 6 hours (not every minute)
   - Keeps database lean and focused

## 🛠️ Development

### Setup

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your values

# Run in development
npm run dev

# Build for production
npm run build
npm start
```

### Dashboard Development

```bash
cd dashboard
npm install
npm run dev
```

Dashboard runs on `http://localhost:3000`

## 🔍 Monitoring

### Logs

- **Console**: Real-time bot activity
- **Database**: All actions and errors stored in MongoDB
- **Dashboard**: Live action/error logs

### Key Metrics to Monitor

1. **Safe Markets Count**: How many safe markets detected
2. **Active Fetchers**: Number of concurrent orderbook fetchers
3. **Trade Execution Rate**: % of fetches that result in trades
4. **Average Time to Trade**: Time from detection to execution
5. **Competition Rate**: Orders that fail due to already filled

## ⚠️ Risks

### V2-Specific Risks

1. **Increased Competition**
   - More frequent fetching may attract competitor attention
   - All-in strategy means higher stake per trade

2. **API Rate Limits**
   - Aggressive fetching (2-5 seconds) may hit rate limits
   - Monitor for 429 errors and adjust intervals if needed

3. **Execution Risk**
   - All-in strategy means no diversification during a single safe market window
   - If trade fails, entire opportunity missed

4. **Network Latency**
   - Speed is critical in V2
   - Higher latency = lower chance of capturing orders

### Mitigation

- Start with paper trading to validate
- Monitor API health and rate limit warnings
- Use fast RPC provider
- Consider running on cloud server near Polymarket infrastructure

## 📚 Resources

- [Polymarket Docs](https://docs.polymarket.com/)
- [CLOB API](https://docs.polymarket.com/api/clob)
- [Migration Guide](./migration.md)

## 🤝 Support

For issues or questions:
1. Check the error logs in dashboard
2. Review action logs for unexpected behavior
3. Ensure circuit breakers aren't triggering
4. Verify API keys and network connectivity

## 📝 License

MIT License - See LICENSE file for details

---

**⚡ V2 is designed for competitive, high-frequency trading. Use responsibly and start with paper trading.**
