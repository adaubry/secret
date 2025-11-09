/**
 * Alerts System - Store notifications for frontend display as popups
 */

interface Alert {
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message: string;
}

// In-memory queue for alerts (frontend polls this)
let alertQueue: Alert[] = [];

/**
 * Add alert to queue
 */
export function addAlert(alert: Alert): void {
    alertQueue.push(alert);
    console.log(`[${alert.type.toUpperCase()}] ${alert.title}: ${alert.message}`);
    // Keep only last 50 alerts
    if (alertQueue.length > 50) {
        alertQueue = alertQueue.slice(-50);
    }
}

/**
 * Get and clear all pending alerts
 */
export function getAndClearAlerts(): Alert[] {
    const alerts = [...alertQueue];
    alertQueue = [];
    return alerts;
}

/**
 * Alert: Trade executed
 */
export function alertTradeExecuted(side: string, shares: number, price: number, profit: number): void {
    addAlert({
        type: 'success',
        title: '🟢 Trade Executed',
        message: `${side} ${shares} @ $${price.toFixed(4)} | Profit: ${profit.toFixed(2)}%`,
    });
}

/**
 * Alert: Circuit breaker triggered
 */
export function alertCircuitBreaker(breakerName: string, reason: string): void {
    addAlert({
        type: 'error',
        title: '🛑 Circuit Breaker',
        message: `${breakerName}: ${reason}`,
    });
}

/**
 * Alert: Position resolved
 */
export function alertPositionResolved(side: string, outcome: string, pnl: number): void {
    const emoji = pnl > 0 ? '📈' : '📉';
    addAlert({
        type: pnl > 0 ? 'success' : 'warning',
        title: `${emoji} Position Resolved`,
        message: `${side} → ${outcome} | P&L: $${pnl.toFixed(2)}`,
    });
}

/**
 * Alert: Error occurred
 */
export function alertError(error: string): void {
    addAlert({
        type: 'error',
        title: '⚠️ Error',
        message: error,
    });
}

/**
 * Alert: Market opportunity
 */
export function alertMarketOpportunity(city: string, threshold: number, safetyScore: number): void {
    addAlert({
        type: 'info',
        title: '🎯 Market Scan',
        message: `${city} ${threshold}°F - Safety: ${safetyScore}/100`,
    });
}
