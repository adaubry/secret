# Weather Prediction Market Arbitrage Bot - Setup Guide

This project has been transformed from a copytrading bot into a **Weather Prediction Market Arbitrage Bot** for Polymarket.

## Overview

This bot identifies and executes **near-certain arbitrage opportunities** in Polymarket weather prediction markets:

- Buys "guaranteed winners" when real-time weather data shows certainty
- Uses a safety scoring algorithm (0-100 scale) with minimum 95+ threshold
- Multiple circuit breakers for risk management
- Paper trading mode for validation
- Comprehensive logging and audit trail
- Real-time monitoring dashboard

## Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment Variables

Create a `.env` file in the root directory:

```bash
# Wallet Configuration
WALLET_ADDRESS=0x...                    # Your trading wallet address
PRIVATE_KEY=0x...                       # Private key (will be encrypted)

# Polymarket CLOB
CLOB_HTTP_URL=https://clob.polymarket.com
CLOB_WS_URL=wss://ws-subscriptions-clob.polymarket.com

# Blockchain
RPC_URL=https://polygon-rpc.com

# Database
MONGO_URI=mongodb://localhost:27017/weather_arbitrage

# USDC Contract (Polygon)
USDC_CONTRACT_ADDRESS=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174

# Weather APIs
OPENWEATHER_API_KEY=your_api_key

# Alerts
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
ALERT_EMAIL=your_email@example.com

# Safety Thresholds
MIN_SAFETY_SCORE=95
MIN_PROFIT_MARGIN_PERCENT=0.5

# Circuit Breakers
MAX_LOSS_THRESHOLD=-100
MIN_WIN_RATE_PERCENT=80
DATA_FRESHNESS_THRESHOLD=900000
MIN_USDC_BALANCE=10

# Mode
PAPER_TRADING_MODE=true        # Start in paper trading mode
DEBUG_MODE=false
```

### 3. Setup MongoDB

Install MongoDB locally or use MongoDB Atlas:

```bash
# Local MongoDB
brew install mongodb-community
brew services start mongodb-community

# Or use MongoDB Atlas (cloud)
# Update MONGO_URI in .env
```

### 4. Wallet Setup

The bot uses encrypted private key storage:

```bash
npm run dev
# Choose option to generate wallet or import existing key
```

Your private key will be stored encrypted locally with AES-256 + password.

## Running the Bot

### Development Mode (Paper Trading)

```bash
# Set paper trading in .env
PAPER_TRADING_MODE=true

npm run dev
```

### Build

```bash
npm run build
npm start
```

## Monitoring Dashboard

The bot includes a Next.js 15 monitoring dashboard:

### Setup Dashboard

```bash
cd dashboard
npm install
```

### Run Dashboard

```bash
# Development
npm run dev

# Visit http://localhost:3000
```

The dashboard shows:
- Real-time P&L and win rate
- Open positions
- Recent trade decisions
- Safety score breakdowns
- Circuit breaker status
- Portfolio metrics

## Key Components

### Services

1. **walletManager.ts** - Secure wallet with BIP39 + AES-256 encryption
2. **weatherAggregator.ts** - Real-time weather data from APIs
3. **safetyScorer.ts** - Safety score calculation (40% temp, 30% market price, 20% weather stability)
4. **marketScanner.ts** - Identifies weather prediction markets
5. **tradeEngine.ts** - Order placement and execution
6. **circuitBreakers.ts** - Risk management stops (loss limit, win rate, data freshness, etc.)
7. **botOrchestrator.ts** - Main trading loop coordination
8. **logger.ts** - Comprehensive audit trail

### Database Schema

- **markets** - All tracked weather prediction markets
- **temperature_readings** - Real-time weather data
- **positions** - Open and resolved trades
- **safety_scores** - Safety score calculations
- **trade_decisions** - Complete audit trail
- **circuit_breakers** - Active/inactive circuit breaker status
- **portfolio_metrics** - Performance metrics

## Trading Strategy

### Safety Scoring (0-100)

The bot only trades when safety score is 95+:

- **Temperature Certainty (40%)** - Distance from threshold, time of day
- **Market Price Signal (30%)** - Market confidence, order book depth
- **Weather Stability (20%)** - Forecast alignment, historical variance

### Arbitrage Opportunities

Examples where bot would buy:

```
Market: "Will NYC max temp exceed 80°F today?"
Current temp: 86°F at 6 PM (max already determined)
YES price: 92¢
Bot buys YES → Guaranteed $1 payout = 8¢ profit

---

Market: "Will Phoenix max temp exceed 60°F today?"
Current temp: 75°F at 8 AM
Forecast high: 98°F
YES price: 88¢
Bot buys YES → Guaranteed winner, 10%+ profit
```

### Circuit Breakers

The bot stops trading if:
- Total P&L drops below threshold (default: -$100)
- Win rate < 80% (last 10 trades)
- Weather data > 15 minutes old
- USDC balance < minimum
- API health issues
- Manual emergency stop

## Paper Trading (Validation)

Before going live, run paper trading for 2+ weeks:

```bash
PAPER_TRADING_MODE=true npm run dev
```

Requirement to go live:
- ✅ 20+ simulated trades
- ✅ >90% win rate
- ✅ Positive P&L after fees
- ✅ All circuit breakers working
- ✅ No emergency stops triggered

## Important Security Notes

⚠️ **CRITICAL:**

1. **Private Key Encryption** - Keys are AES-256 encrypted, never stored in plaintext
2. **Wallet Recovery** - Mnemonic saved on wallet creation (for recovery)
3. **Data Source Verification** - Backtest on 50-100 past resolved markets before deploying capital
4. **Kill Switches** - Multiple automatic circuit breakers
5. **Audit Trail** - Every decision logged with full inputs/reasoning

## Logging

All decisions logged to `logs/bot.log`:

```
Timestamp | Level | Category | Message | Data
```

Generate audit report:

```bash
npm run logs:audit
```

## Troubleshooting

### Bot won't start
- Check MongoDB connection: `MONGO_URI`
- Verify Polymarket CLOB endpoints
- Check wallet setup

### No trades executing
- Check safety score threshold (default: 95)
- Verify weather API key working
- Check circuit breaker status in dashboard
- Enable debug mode: `DEBUG_MODE=true`

### Poor win rate
- Increase profit margin threshold
- Check data source accuracy vs Polymarket resolution
- Verify safety scoring weights

## Development

### Run Tests
```bash
npm run test
```

### Build TypeScript
```bash
npm run build
```

### Format Code
```bash
npm run format
```

### Lint
```bash
npm run lint
npm run lint:fix
```

## Production Deployment

See `deploy_for_ec2.md` for AWS EC2 deployment (but do not modify/touch those scripts as per instructions).

## Red Flags - Do Not Deploy If

🚩 Any data source discrepancies in backtesting
🚩 Win rate <80% in paper trading
🚩 Cannot verify Polymarket's resolution sources
🚩 Frequent API failures (>5%)
🚩 Transaction failures >5%
🚩 Cannot explain every trade from logs
🚩 No working emergency stop
🚩 Private keys stored unencrypted

## Support

For issues or questions, check:
1. Logs in `logs/bot.log`
2. Dashboard at http://localhost:3000
3. Migration guide in `migration.md`
4. Safety thresholds in `src/config/env.ts`

## Key Differences from Original

| Aspect | Original (Copytrading) | New (Arbitrage) |
|--------|------------------------|-----------------|
| **Strategy** | Copy another trader's trades | Execute weather arbitrage |
| **Decision Logic** | Track target wallet | Safety scoring algorithm |
| **Risk Management** | Position sizing ratio | Circuit breakers + safety scores |
| **Data Sources** | Target trader's activity | Real-time weather APIs |
| **Profit Model** | Follow trend, win/lose with trader | Buy guaranteed outcomes |
| **Trading Frequency** | React to target trader | Scan every 2 minutes |
| **Dashboard** | Simple position tracking | Real-time metrics & audit trail |
| **Testing** | Live from start | Paper trading (2 weeks minimum) |

---

**Ready to start?** Run `npm run dev` and visit the dashboard!
