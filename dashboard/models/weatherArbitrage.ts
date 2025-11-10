import mongoose, { Schema } from 'mongoose';

// Markets table - Polymarket weather prediction markets
const marketSchema = new Schema(
    {
        market_id: { type: String, required: true, unique: true, index: true },
        question: { type: String, required: true },
        city: { type: String, required: true, index: true },
        threshold_temp: { type: Number, required: true },
        market_date: { type: Date, required: true },
        resolution_source: { type: String, required: true }, // e.g., "NOAA", "Weather.com"
        yes_price: { type: Number, default: null },
        no_price: { type: Number, default: null },
        order_book_depth: { type: String, default: null }, // JSON stringified
        active: { type: Boolean, default: true },
        resolved: { type: Boolean, default: false },
        resolution_outcome: { type: String, enum: ['YES', 'NO', null], default: null },
        created_at: { type: Date, default: Date.now },
        updated_at: { type: Date, default: Date.now },
    },
    { timestamps: false }
);

// Temperature readings - Real-time weather data
const temperatureReadingSchema = new Schema(
    {
        city: { type: String, required: true, index: true },
        timestamp: { type: Date, required: true, index: true },
        current_temp: { type: Number, required: true },
        daily_max: { type: Number, required: true },
        forecast_high: { type: Number, default: null },
        source: { type: String, required: true }, // API name (e.g., "OpenWeatherMap", "NOAA")
        validated: { type: Boolean, default: false },
    },
    { timestamps: false }
);

// Positions - Active trades
const positionSchema = new Schema(
    {
        market_id: { type: String, required: true, index: true },
        side: { type: String, enum: ['YES', 'NO'], required: true },
        buy_price: { type: Number, required: true },
        shares: { type: Number, required: true },
        total_cost: { type: Number, required: true },
        status: { type: String, enum: ['OPEN', 'RESOLVED', 'CLOSED'], default: 'OPEN', index: true },
        pnl: { type: Number, default: null },
        pnl_percent: { type: Number, default: null },
        exit_price: { type: Number, default: null },
        resolution_outcome: { type: String, enum: ['YES', 'NO', null], default: null },
        timestamp: { type: Date, default: Date.now, index: true },
    },
    { timestamps: false }
);

// Safety scores - Decision audit trail
const safetyScoreSchema = new Schema(
    {
        market_id: { type: String, required: true, index: true },
        timestamp: { type: Date, default: Date.now, index: true },
        total_score: { type: Number, required: true }, // 0-100
        temperature_certainty_score: { type: Number, required: true },
        market_price_signal_score: { type: Number, required: true },
        weather_stability_score: { type: Number, required: true },
        current_temp: { type: Number, required: true },
        daily_max: { type: Number, required: true },
        threshold_temp: { type: Number, required: true },
        market_yes_price: { type: Number, default: null },
        market_no_price: { type: Number, default: null },
        order_book_volume: { type: Number, default: null },
        spread: { type: Number, default: null },
        expected_profit_percent: { type: Number, default: null },
        recommendation: { type: String, enum: ['BUY_YES', 'BUY_NO', 'SKIP'], required: true },
        reason: { type: String, required: true },
    },
    { timestamps: false }
);

// Trade decisions log - Complete audit trail
const tradeDecisionSchema = new Schema(
    {
        timestamp: { type: Date, default: Date.now, index: true },
        market_id: { type: String, required: true, index: true },
        decision: { type: String, enum: ['BUY', 'SKIP', 'ERROR'], required: true },
        side: { type: String, enum: ['YES', 'NO', null], default: null },
        safety_score: { type: Number, required: true },
        profit_margin_percent: { type: Number, default: null },
        circuit_breaker_active: { type: String, default: null }, // Which breaker triggered, if any
        reason: { type: String, required: true },
        // Input data
        temperature_data: {
            current_temp: { type: Number, required: true },
            daily_max: { type: Number, required: true },
            forecast_high: { type: Number, default: null },
            source: { type: String, required: true },
        },
        market_data: {
            question: { type: String, required: true },
            yes_price: { type: Number, default: null },
            no_price: { type: Number, default: null },
            spread: { type: Number, default: null },
        },
        // Execution result (if bought)
        order_id: { type: String, default: null },
        order_success: { type: Boolean, default: null },
        order_error: { type: String, default: null },
        shares_purchased: { type: Number, default: null },
        actual_price: { type: Number, default: null },
        total_cost: { type: Number, default: null },
    },
    { timestamps: false }
);

// Circuit breaker status - Tracking active breakers
const circuitBreakerSchema = new Schema(
    {
        name: { type: String, required: true, unique: true }, // e.g., "loss_limit", "win_rate", "data_freshness"
        active: { type: Boolean, default: false },
        triggered_at: { type: Date, default: null },
        triggered_reason: { type: String, default: null },
        last_checked: { type: Date, default: Date.now },
    },
    { timestamps: false }
);

// Portfolio metrics - Performance tracking
const portfolioMetricsSchema = new Schema(
    {
        timestamp: { type: Date, default: Date.now, index: true },
        total_open_positions: { type: Number, required: true },
        total_position_value: { type: Number, required: true },
        total_pnl: { type: Number, required: true },
        total_pnl_percent: { type: Number, required: true },
        realized_pnl: { type: Number, required: true },
        unrealized_pnl: { type: Number, required: true },
        usdc_balance: { type: Number, required: true },
        win_rate_percent: { type: Number, required: true },
        total_trades: { type: Number, required: true },
        winning_trades: { type: Number, required: true },
    },
    { timestamps: false }
);

// Models - use mongoose.models to prevent recompilation errors in development
const Market = mongoose.models.Market || mongoose.model('Market', marketSchema, 'markets');
const TemperatureReading = mongoose.models.TemperatureReading || mongoose.model('TemperatureReading', temperatureReadingSchema, 'temperature_readings');
const Position = mongoose.models.Position || mongoose.model('Position', positionSchema, 'positions');
const SafetyScore = mongoose.models.SafetyScore || mongoose.model('SafetyScore', safetyScoreSchema, 'safety_scores');
const TradeDecision = mongoose.models.TradeDecision || mongoose.model('TradeDecision', tradeDecisionSchema, 'trade_decisions');
const CircuitBreaker = mongoose.models.CircuitBreaker || mongoose.model('CircuitBreaker', circuitBreakerSchema, 'circuit_breakers');
const PortfolioMetrics = mongoose.models.PortfolioMetrics || mongoose.model('PortfolioMetrics', portfolioMetricsSchema, 'portfolio_metrics');

export {
    Market,
    TemperatureReading,
    Position,
    SafetyScore,
    TradeDecision,
    CircuitBreaker,
    PortfolioMetrics,
};
