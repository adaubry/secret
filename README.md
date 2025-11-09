# Weather Prediction Market Arbitrage Bot

Automated trading bot for Polymarket weather prediction markets with safety scoring and circuit breakers.

## Quick Start

```bash
npm install
npm run dev
```

See **SETUP.md** for full configuration.

## Features

- ✅ 1-minute market scans
- ✅ Safety scoring (≥95 required to trade)
- ✅ Maximum compute order capture
- ✅ OpenWeatherMap only
- ✅ Frontend popups (no Telegram)
- ✅ Paper trading mode
- ✅ Complete audit trail

## Dashboard

```bash
cd dashboard && npm install && npm run dev
```

Visit http://localhost:3000

## Deployment

See `deploy_for_ec2.md` for EC2 setup.
