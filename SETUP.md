# Weather Prediction Market Arbitrage Bot

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
Create `.env` file:
```bash
WALLET_ADDRESS=0x...
PRIVATE_KEY=0x...
CLOB_HTTP_URL=https://clob.polymarket.com
CLOB_WS_URL=wss://ws-subscriptions-clob.polymarket.com
RPC_URL=https://polygon-rpc.com
MONGO_URI=mongodb://localhost:27017/weather_arbitrage
USDC_CONTRACT_ADDRESS=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
OPENWEATHER_API_KEY=your_api_key
PAPER_TRADING_MODE=true
```

### 3. Start MongoDB

**Option A: Docker (Recommended - Cross-platform)**
```bash
docker run -d -p 27017:27017 --name weather-bot-db mongo:latest
```

**Option B: MongoDB Atlas (Cloud - No Installation)**
1. Create account at https://www.mongodb.com/cloud/atlas
2. Create a free cluster
3. Get connection string and update `MONGO_URI` in `.env`:
```bash
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/weather_arbitrage
```

**Option C: macOS (Homebrew)**
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Option D: Linux (Ubuntu/Debian)**
```bash
sudo apt-get update
sudo apt-get install -y mongodb
sudo systemctl start mongodb
```

**Option E: Windows**
1. Download from https://www.mongodb.com/try/download/community
2. Run installer
3. MongoDB starts automatically as a service

### 4. Run Bot
```bash
npm run dev
```

### 5. View Dashboard
```bash
cd dashboard
npm install
npm run dev
# Visit http://localhost:3000
```

## MongoDB Setup

### Stopping MongoDB

**Docker:**
```bash
docker stop weather-bot-db
docker rm weather-bot-db
```

**Homebrew (macOS):**
```bash
brew services stop mongodb-community
```

**Linux:**
```bash
sudo systemctl stop mongodb
```

**Atlas (Cloud):** No action needed (always running)

## How It Works

The bot scans Polymarket weather markets every minute and executes arbitrage when:
- Safety score ≥ 95 (40% temperature certainty, 30% market price, 20% weather stability)
- Expected profit ≥ 0.5% after fees
- No existing position in the market

When a safe trade is found, it uses maximum compute to capture orders (10% of balance, up to 3 retry attempts).

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| MIN_SAFETY_SCORE | 95 | Minimum score required to trade |
| MIN_PROFIT_MARGIN_PERCENT | 0.5 | Minimum profit after fees |
| MARKET_SCAN_INTERVAL | 60000 | Market scan interval (1 min) |
| WEATHER_UPDATE_INTERVAL | 600000 | Weather update interval (10 min) |
| MAIN_LOOP_INTERVAL | 60000 | Main loop interval (1 min) |
| PAPER_TRADING_MODE | true | Simulate trades without real money |

## Safety Features

- **Circuit Breakers**: Loss limits, win rate checks, data freshness validation
- **Encrypted Wallet**: AES-256 encryption with BIP39 mnemonic
- **Audit Trail**: Complete decision logging
- **One Weather Source**: OpenWeatherMap only
- **Frontend Alerts**: Real-time notifications via dashboard popups

## Architecture

### Backend Services
- `walletManager.ts` - Secure wallet management
- `weatherAggregator.ts` - Real-time weather data
- `safetyScorer.ts` - Safety score calculation
- `marketScanner.ts` - Market identification
- `tradeEngine.ts` - Order execution
- `circuitBreakers.ts` - Risk management
- `botOrchestrator.ts` - Main loop coordination
- `logger.ts` - Audit logging
- `alerts.ts` - Notification system

### Database Collections
- `markets` - Weather prediction markets
- `temperature_readings` - Real-time weather data
- `positions` - Active trades
- `safety_scores` - Score calculations
- `trade_decisions` - Complete audit trail
- `circuit_breakers` - Breaker status
- `portfolio_metrics` - Performance metrics

### Dashboard (Next.js 15)
- Real-time P&L and win rate
- Open positions
- Trade decisions
- Portfolio metrics
- Alert popups
- Auto-refresh every 10 seconds

## Trading Strategy

**Example**: "Will NYC max temp exceed 80°F today?"
- Current: 86°F at 6 PM (max already determined)
- YES price: 92¢
- Bot buys YES → Guaranteed $1 payout = 8¢ profit

## Key Differences from Original

| Feature | Original | New |
|---------|----------|-----|
| Strategy | Copy trader | Arbitrage |
| Market Scan | 5 min | 1 min |
| Decision Logic | Follow trades | Safety score ≥95 |
| Alerts | Telegram | Frontend popups |
| Computing | Standard | Maximum on safe trades |
| Data Source | Single | OpenWeatherMap only |

## Commands

```bash
npm run build    # Build TypeScript
npm start        # Run production build
npm run dev      # Run development
npm run lint     # Lint code
npm run format   # Format code
```

## Do NOT Deploy If

- Safety score threshold < 90
- Paper trading win rate < 80%
- Cannot verify data sources
- API failures > 5%
- Cannot explain every trade from logs
- Private keys unencrypted
