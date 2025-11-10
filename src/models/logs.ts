import mongoose, { Schema } from 'mongoose';

/**
 * Action Log - Real-time bot action tracking
 * Captures all significant bot activities for dashboard display
 */
const actionLogSchema = new Schema(
    {
        timestamp: { type: Date, default: Date.now, index: true },
        action: { type: String, required: true, index: true }, // Action type (e.g., 'BOT_INIT', 'SAFE_MARKET_DETECTED', 'TRADE_EXECUTED')
        message: { type: String, required: true }, // Human-readable message
        data: { type: Schema.Types.Mixed, default: {} }, // Additional action data
    },
    { timestamps: false }
);

/**
 * Error Log - Bot error tracking
 * Captures all errors for debugging and monitoring
 */
const errorLogSchema = new Schema(
    {
        timestamp: { type: Date, default: Date.now, index: true },
        error_type: { type: String, required: true, index: true }, // Error category
        message: { type: String, required: true }, // Error message
        data: { type: Schema.Types.Mixed, default: {} }, // Error details (stack trace, context, etc.)
        resolved: { type: Boolean, default: false }, // Whether error has been addressed
    },
    { timestamps: false }
);

// Models
const ActionLog = mongoose.model('ActionLog', actionLogSchema, 'action_logs');
const ErrorLog = mongoose.model('ErrorLog', errorLogSchema, 'error_logs');

export { ActionLog, ErrorLog };
