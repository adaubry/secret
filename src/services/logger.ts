import * as fs from 'fs';
import * as path from 'path';

/**
 * Comprehensive Logging System
 * Complete audit trail of every decision with all inputs/reasoning
 */

const LOGS_DIR = path.join(process.cwd(), 'logs');
const MAX_LOG_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

interface LogEntry {
    timestamp: string;
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'TRADE';
    category: string;
    message: string;
    data?: any;
}

/**
 * Initialize logging system
 */
export function initializeLogger(): void {
    if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    console.log('✅ Logging system initialized');
}

/**
 * Write log entry
 */
function writeLog(entry: LogEntry): void {
    const logFile = path.join(LOGS_DIR, 'bot.log');

    // Rotate log if too large
    if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        if (stats.size > MAX_LOG_FILE_SIZE) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const archiveFile = path.join(LOGS_DIR, `bot.log.${timestamp}`);
            fs.renameSync(logFile, archiveFile);
        }
    }

    // Format log line
    const logLine = JSON.stringify(entry) + '\n';

    // Append to file
    fs.appendFileSync(logFile, logLine);
}

/**
 * Log decision (highest priority)
 */
export function logDecision(decision: {
    marketId: string;
    action: string;
    reason: string;
    data?: any;
}): void {
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'TRADE',
        category: 'DECISION',
        message: `${decision.action} - ${decision.reason}`,
        data: decision.data,
    };
    writeLog(entry);
    console.log(`📝 Decision logged: ${decision.action}`);
}

/**
 * Log trade execution
 */
export function logTrade(trade: {
    marketId: string;
    side: string;
    shares: number;
    price: number;
    totalCost: number;
    expectedProfit: number;
    safetyScore: number;
}): void {
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'TRADE',
        category: 'EXECUTION',
        message: `Executed ${trade.side} order: ${trade.shares} shares @ $${trade.price}`,
        data: trade,
    };
    writeLog(entry);
}

/**
 * Log safety score calculation
 */
export function logSafetyScore(score: {
    marketId: string;
    totalScore: number;
    temperatureScore: number;
    marketPriceScore: number;
    weatherStabilityScore: number;
    recommendation: string;
    reason: string;
}): void {
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        category: 'SAFETY_SCORE',
        message: `Safety score: ${score.totalScore} - ${score.recommendation}`,
        data: score,
    };
    writeLog(entry);
}

/**
 * Log circuit breaker trigger
 */
export function logCircuitBreaker(breaker: {
    name: string;
    triggered: boolean;
    reason: string;
}): void {
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: breaker.triggered ? 'WARN' : 'INFO',
        category: 'CIRCUIT_BREAKER',
        message: `${breaker.name}: ${breaker.reason}`,
        data: breaker,
    };
    writeLog(entry);
}

/**
 * Log weather data
 */
export function logWeatherData(data: {
    city: string;
    currentTemp: number;
    dailyMax: number;
    forecastHigh: number;
    source: string;
}): void {
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        category: 'WEATHER',
        message: `Weather update: ${data.city} ${data.currentTemp}°C (max: ${data.dailyMax}°C)`,
        data,
    };
    writeLog(entry);
}

/**
 * Log market data
 */
export function logMarketData(data: {
    marketId: string;
    question: string;
    yesPrice: number | null;
    noPrice: number | null;
    spread: number | null;
}): void {
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        category: 'MARKET',
        message: `Market data: ${data.marketId}`,
        data,
    };
    writeLog(entry);
}

/**
 * Log error
 */
export function logError(error: any, context?: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        category: context || 'UNKNOWN',
        message: errorMessage,
        data: error instanceof Error ? { stack: error.stack } : error,
    };
    writeLog(entry);
}

/**
 * Log info
 */
export function logInfo(message: string, data?: any): void {
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'INFO',
        category: 'BOT',
        message,
        data,
    };
    writeLog(entry);
}

/**
 * Log position status
 */
export function logPosition(position: {
    marketId: string;
    side: string;
    shares: number;
    buyPrice: number;
    currentPrice: number;
    totalCost: number;
    unrealizedPnL: number;
    status: string;
}): void {
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'INFO',
        category: 'POSITION',
        message: `Position: ${position.side} ${position.shares} @ ${position.buyPrice} (U/P: $${position.unrealizedPnL.toFixed(2)})`,
        data: position,
    };
    writeLog(entry);
}

/**
 * Log API request/response
 */
export function logApiCall(api: {
    endpoint: string;
    method: string;
    status: number;
    duration: number;
    error?: string;
}): void {
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: api.status >= 400 ? 'WARN' : 'DEBUG',
        category: 'API',
        message: `${api.method} ${api.endpoint} - ${api.status} (${api.duration}ms)`,
        data: api,
    };
    writeLog(entry);
}

/**
 * Generate decision audit trail
 */
export async function generateAuditReport(): Promise<string> {
    try {
        const logFile = path.join(LOGS_DIR, 'bot.log');

        if (!fs.existsSync(logFile)) {
            return 'No logs found';
        }

        const logs = fs.readFileSync(logFile, 'utf-8').split('\n').filter((l) => l.length > 0);

        const decisions = logs
            .map((l) => {
                try {
                    return JSON.parse(l);
                } catch {
                    return null;
                }
            })
            .filter((l) => l && l.level === 'TRADE');

        let report = '=== TRADE DECISION AUDIT TRAIL ===\n\n';

        for (const decision of decisions) {
            report += `${decision.timestamp} - ${decision.message}\n`;
            if (decision.data) {
                report += `Details: ${JSON.stringify(decision.data, null, 2)}\n`;
            }
            report += '\n';
        }

        return report;
    } catch (error) {
        console.error('❌ Error generating audit report:', error);
        return 'Error generating report';
    }
}
