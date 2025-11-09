Weather Prediction Market Arbitrage Bot - Project Specification
Project Overview
Build a locally-hosted automated trading bot for Polymarket weather prediction markets that identifies and executes near-certain arbitrage opportunities.
Core Strategy
NOT probabilistic trading - This is a certainty arbitrage bot.
The bot finds markets where the outcome is already determined (or 99%+ certain) but the order book hasn't fully adjusted. It buys guaranteed winners at any price that yields profit after fees.
How It Makes Money
Example scenarios:

Post-Peak Arbitrage: Market asks "Will NYC max temp exceed 80°F today?" At 6 PM, the max already hit 85°F at 2 PM. Someone is still selling YES shares at 92¢. Bot buys at 92¢ → guaranteed $1 payout = 8¢ profit (6¢ after fees).
Pre-Market Lock-In: Market asks "Will Phoenix max temp exceed 60°F today?" At 8 AM it's already 75°F and rising. YES shares available at 88¢. Bot buys → 10%+ guaranteed return.
Impossible Scenarios: Market asks "Will Boston max temp exceed 100°F today?" Current temp is 65°F, forecast high 72°F. NO shares available at 97¢. Bot buys NO → guaranteed winner.

Critical Philosophy

Boom or bust: Once a position is taken, hold until resolution. Never sell to avoid manipulation.
Only trade certainties: Safety score must be 85+ minimum, preferably 90+.
Small edges are fine: Even 1% profit after fees is acceptable if certainty is 95%+.
Market price matters: Current market price indicates crowd confidence and feeds into safety scoring.

Technical Requirements
System Architecture
Core Components:

Wallet Management Module - Secure local key generation and storage
Polymarket Integration Layer - CLOB order book interaction (Polymarket uses a CLOB, not AMM)
Weather Data Aggregator - Real-time temperature tracking
Trading Strategy Engine - Safety scoring and order execution
Market Monitor - Continuous market scanning

Technology Stack:

Backend: Node.js/TypeScript
Database: PostgreSQL
Blockchain: Polygon chain (for Polymarket)
Wallet: ethers.js
APIs: Polymarket CLOB API, one weather API (based on latitude and longitude)

Database Schema Requirements
Markets table:

market_id, question, city, threshold_temp, market_date, resolution_source, timestamps

Temperature readings:

city, timestamp, current_temp, daily_max, source (API name)

Positions:

market_id, side (YES/NO), buy_price, shares, status (OPEN/RESOLVED), pnl, timestamp

Safety scores:

market_id, timestamp, total score (0-100), component breakdowns

Trade decisions log:

Complete audit trail of every decision with all inputs/reasoning

Safety Scoring Algorithm
The bot calculates a safety score (0-100) using weighted components:
Components (weighted):
1. Temperature Certainty (40% weight)

Distance from current max to threshold
Time elapsed in day (later = safer)
Historical peak time for city/season
If outcome already happened: score = 100

2. Market Price Signal (30% weight)

How confident is the market? (95¢+ = very confident)
Order book depth (thick = reliable)
Recent price stability
This validates our temperature analysis

3. Weather Stability (20% weight)

Forecast volatility
Historical variance for similar conditions
Season/location stability factors


Trading Thresholds

Score 95-100: buy as much as you can
Score <95: Never trade

Critical Safety Requirements
1. Data Source Verification (HIGHEST PRIORITY)
Before deploying any capital:

Document Polymarket's exact resolution source for each market
Which weather API/station do they use?
Which timezone? What time window?
Match your data source EXACTLY to theirs

Validation process:

Backtest on 50-100 past resolved markets
Compare your data vs actual resolutions
Accuracy must be >99%
Run in shadow mode for 2 weeks before live trading
Track: predicted outcome vs actual resolution
Zero discrepancies = safe to proceed

If your temperature data doesn't match Polymarket's resolution source, you'll be "right" but still lose money.
2. Kill Switches & Circuit Breakers
Must have multiple automatic stops:

Loss limit: Stop if total P&L drops below threshold (e.g., -$100)
Win rate check: Stop if last 10 trades show <80% win rate
Data freshness: Stop if weather data is >15 minutes old
API health: Stop if any critical API is down
Balance check: Stop if USDC balance too low
Network issues: Pause during blockchain congestion
Manual override: File-based emergency stop mechanism

STOPPING MEANS STOP TRYING TO BUY, not closing positions

Every circuit breaker must:

Cancel pending orders (but don't sell open positions)
Send alerts via multiple channels (Telegram, email)
Log detailed reason for stop
Require manual intervention to restart

3. Wallet Security

Generate HD wallet locally using BIP39
Encrypt private key with AES-256 + user password
Store only encrypted key on disk (never plaintext)
Send mnemonic to creator email once on creation (for recovery)
Fund wallet with USDC on Polygon for trading
Clear private key from memory on shutdown

4. Comprehensive Logging
Every decision must be traceable:

Why you traded or didn't trade
All input data (temperature, market price, safety score)
Complete safety score component breakdown
Order book state at decision time
Expected profit calculation
Raw API responses (for forensics)

Monitoring dashboard must show:

All kill switches for the user to activate
Bot status (running/paused/stopped)
Open positions and portfolio value
Total P&L and win rate
Last update times for all data sources
Active circuit breakers
Recent trade decisions (last 10)

5. Dry-Run / Paper Trading Mode
Must support two modes:

Paper trading: Simulate everything, no real money
Live trading: Real blockchain transactions

Paper trading requirements:

Run for minimum 2 weeks before live
Minimum 20 simulated trades
Win rate must exceed 90%
Must show positive P&L after fees

Don't go live until paper trading proves:

Data sources are accurate
Safety scoring works
Execution logic is sound
No bugs in decision making

6. Transaction Safety
Every blockchain transaction needs:

Pre-flight balance checks
Gas price verification (not too high)
Network congestion checks
Transaction simulation (if supported)
Proper gas limits with 20% buffer
30-second timeout
Minimum 2 block confirmations
Retry logic (max 3 attempts)
Detailed error logging

7. Data Integrity Checks
Never trust external data blindly:
Weather data validation:

Temperature in reasonable range (-50°F to 130°F)
Daily max >= current temp
Cross-validate with multiple APIs (flag if >5°F difference)
Timestamp must be fresh (<20 minutes old)

Order book validation:

Prices between 0 and 1
Spread not too wide (flag if >20¢)
Sufficient liquidity (minimum volume threshold)

On any validation failure:

Skip the trade
Log the issue
Alert if repeated failures


Graduate to next phase only if:

Previous phase completed successfully
All requirements met
No data source discrepancies
No emergency stops triggered

Risk Management Rules
Position Sizing



Trading Rules

Never trade with safety score <95
Never trade if profit <0.5% after fees
Account for current Polymarket fees in all calculations
No intraday trading (either accumulate or hold to resolution)
No stop losses (would enable manipulation)

Main Bot Logic Flow
Continuous loop (every 2 minutes):

Update weather data (every 10 minutes)

Poll all weather APIs for active market cities
Store current temp and daily max
Validate data integrity


Scan Polymarket markets (every 5 minutes)

Fetch all active weather markets (today + tomorrow)
Parse market questions for city, threshold, date
Store in database


Calculate safety scores (every iteration)

For each active market:

Get latest temperature data
Get current order book
Calculate safety score with all components
Store score in database




Evaluate trade opportunities

For each market:

Check if safety score meets threshold
Calculate expected profit after fees
Verify no existing position in this market
Decide: trade or skip




Execute trades (if opportunity found)

Run all circuit breakers first
Calculate position size
Submit order to Polymarket CLOB
Log position in database


Monitor positions (passive)

Check if markets have resolved
Calculate P&L when resolved
Update position status
Log performance metrics


Sleep 2 minutes, repeat

Red Flags - Do Not Deploy If:
🚩 Any data source discrepancies in backtesting
🚩 Win rate <80% in paper trading
🚩 Cannot verify Polymarket's resolution sources
🚩 Frequent API failures (>5%)
🚩 Transaction failures >5%
🚩 Cannot explain every trade from logs
🚩 No working emergency stop
🚩 Private keys stored unencrypted
Key Risks
Data Source Mismatch (HIGHEST RISK)
Your temperature API shows 86°F, Polymarket's resolution source shows 84°F. You lose even though your data was "right."
Mitigation: Verify exact data sources before deploying capital. Backtest extensively.
Timing Risk
Market resolution time ambiguity. Is "Nov 10" midnight-to-midnight local? UTC? Does it include late readings?
Mitigation: Understand resolution criteria exactly. Trade with 3-5°F safety margins.
Weather Data Revision
Live API showed 87°F, but official data gets revised down to 84°F the next day.
Mitigation: Use authoritative sources. Wait for confirmations. Trade with margins.
Liquidity Risk
Can't get orders filled at desired prices. Order book too thin.
Mitigation: Check depth before trading. Use limit orders. Start with smaller sizes.
Technical Execution Risk
Bot crashes, API limits hit, transactions fail during critical windows.
Mitigation: Robust error handling, retries, balance monitoring, fallback paths.
Fee Erosion
Overconfidence Risk
Your model thinks 95% certain, but actually only 70%. Loses money on poor odds.
Mitigation: Conservative thresholds, backtesting, track actual vs expected performance.
Success Metrics
The bot is working if:

Positive P&L after fees
Uptime >99%
All circuit breakers functioning
Decisions are auditable and logical

Development Phases
Phase 1: Foundation

Wallet infrastructure
Polymarket API connection
Basic market data fetching

Phase 2: Data Collection

Weather API integration (multiple sources)
Database schema and storage
Market monitoring system

Phase 3: Strategy Engine

Safety scoring algorithm
Profit calculation
Risk management rules

Phase 4: Execution

Order placement logic
Transaction management
Position tracking

Phase 5: Safety & Monitoring

Circuit breakers
Logging and alerts
Monitoring dashboard
Paper trading mode

Phase 6: Testing & Validation

Backtesting on historical data
Paper trading (2 weeks minimum)
Gradual capital deployment
