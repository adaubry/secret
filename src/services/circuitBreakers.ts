import { CircuitBreaker, Position, TradeDecision } from '../models/weatherArbitrage';
import { ENV } from '../config/env';
import { getLatestWeatherData, isWeatherDataFresh, getTrackedCities } from './weatherAggregator';

/**
 * Circuit Breakers & Kill Switches
 * Multiple automatic stops to prevent catastrophic losses
 * STOPPING MEANS STOP TRYING TO BUY, not closing positions
 */

/**
 * Initialize circuit breakers
 */
export async function initializeCircuitBreakers(): Promise<void> {
    const breakerNames = [
        'loss_limit',
        'win_rate',
        'data_freshness',
        'api_health',
        'balance_check',
        'network_congestion',
        'manual_stop',
    ];

    for (const name of breakerNames) {
        const existing = await CircuitBreaker.findOne({ name });
        if (!existing) {
            const breaker = new CircuitBreaker({
                name,
                active: false,
                triggered_at: null,
                triggered_reason: null,
                last_checked: new Date(),
            });
            await breaker.save();
        }
    }

    console.log('✅ Circuit breakers initialized');
}

/**
 * Loss limit - Stop if total P&L drops below threshold
 */
export async function checkLossLimit(): Promise<boolean> {
    try {
        const positions = await Position.find({ status: 'RESOLVED' });

        const totalPnL = positions.reduce((sum, p) => sum + (p.pnl || 0), 0);

        const triggered = totalPnL < ENV.MAX_LOSS_THRESHOLD;

        if (triggered) {
            console.error(`🛑 LOSS LIMIT BREAKER: Total P&L ($${totalPnL.toFixed(2)}) below threshold ($${ENV.MAX_LOSS_THRESHOLD.toFixed(2)})`);
            await setCircuitBreakerActive('loss_limit', `Total P&L $${totalPnL.toFixed(2)}`);
        } else {
            await setCircuitBreakerInactive('loss_limit');
        }

        return triggered;
    } catch (error) {
        console.error('❌ Error checking loss limit:', error);
        return false;
    }
}

/**
 * Win rate check - Stop if last 10 trades show <80% win rate
 */
export async function checkWinRate(): Promise<boolean> {
    try {
        const lastTrades = await Position.find({ status: 'RESOLVED' }).sort({ timestamp: -1 }).limit(10);

        if (lastTrades.length < 5) {
            // Need at least 5 trades to check
            return false;
        }

        const winningTrades = lastTrades.filter((t) => (t.pnl || 0) > 0).length;
        const winRate = (winningTrades / lastTrades.length) * 100;

        const triggered = winRate < ENV.MIN_WIN_RATE_PERCENT;

        if (triggered) {
            console.error(`🛑 WIN RATE BREAKER: Win rate ${winRate.toFixed(1)}% below threshold ${ENV.MIN_WIN_RATE_PERCENT}%`);
            await setCircuitBreakerActive('win_rate', `Win rate ${winRate.toFixed(1)}%`);
        } else {
            await setCircuitBreakerInactive('win_rate');
        }

        return triggered;
    } catch (error) {
        console.error('❌ Error checking win rate:', error);
        return false;
    }
}

/**
 * Data freshness check - Stop if weather data is >15 minutes old
 */
export async function checkDataFreshness(): Promise<boolean> {
    try {
        const cities = await getTrackedCities();

        if (cities.length === 0) {
            return false; // No cities tracked yet
        }

        const staleCheck = await Promise.all(
            cities.map(async (city) => ({
                city,
                fresh: await isWeatherDataFresh(city, ENV.DATA_FRESHNESS_THRESHOLD),
            }))
        );

        const staleCities = staleCheck.filter((c) => !c.fresh).map((c) => c.city);

        if (staleCities.length > 0) {
            console.error(`🛑 DATA FRESHNESS BREAKER: Stale weather data for ${staleCities.join(', ')}`);
            await setCircuitBreakerActive('data_freshness', `Stale data: ${staleCities.join(', ')}`);
            return true;
        }

        await setCircuitBreakerInactive('data_freshness');
        return false;
    } catch (error) {
        console.error('❌ Error checking data freshness:', error);
        return false;
    }
}

/**
 * API health check - Stop if critical API is down (simplified)
 */
export async function checkApiHealth(): Promise<boolean> {
    try {
        // In production, ping all API endpoints and check response times
        // For now, just mark as healthy
        await setCircuitBreakerInactive('api_health');
        return false;
    } catch (error) {
        console.error('❌ Error checking API health:', error);
        await setCircuitBreakerActive('api_health', 'Unknown API failure');
        return true;
    }
}

/**
 * Balance check - Stop if USDC balance too low
 * (This would be called with actual balance from blockchain)
 */
export async function checkBalance(usdcBalance: number): Promise<boolean> {
    try {
        const triggered = usdcBalance < ENV.MIN_USDC_BALANCE;

        if (triggered) {
            console.error(`🛑 BALANCE BREAKER: USDC balance $${usdcBalance.toFixed(2)} below minimum $${ENV.MIN_USDC_BALANCE.toFixed(2)}`);
            await setCircuitBreakerActive('balance_check', `Low balance: $${usdcBalance.toFixed(2)}`);
        } else {
            await setCircuitBreakerInactive('balance_check');
        }

        return triggered;
    } catch (error) {
        console.error('❌ Error checking balance:', error);
        return false;
    }
}

/**
 * Manual emergency stop
 */
export async function setEmergencyStop(reason: string): Promise<void> {
    console.error(`🚨 EMERGENCY STOP: ${reason}`);
    await setCircuitBreakerActive('manual_stop', reason);
}

/**
 * Manual resume (requires human intervention)
 */
export async function resumeTrading(): Promise<void> {
    console.log('▶️  Resuming trading...');
    await setCircuitBreakerInactive('manual_stop');
}

/**
 * Check if ANY circuit breaker is active
 */
export async function isAnyBreakerActive(): Promise<boolean> {
    try {
        const activeBreaker = await CircuitBreaker.findOne({ active: true });
        return activeBreaker !== null;
    } catch (error) {
        console.error('❌ Error checking circuit breaker status:', error);
        return true; // Fail safe - assume breaker is active
    }
}

/**
 * Get all active breakers
 */
export async function getActiveBreakers(): Promise<string[]> {
    try {
        const activeBreakers = await CircuitBreaker.find({ active: true }).lean();
        return activeBreakers.map((b) => b.name);
    } catch (error) {
        console.error('❌ Error fetching active breakers:', error);
        return [];
    }
}

/**
 * Run all circuit breaker checks
 */
export async function runAllCircuitBreakerChecks(usdcBalance: number): Promise<boolean> {
    console.log('⚙️  Running circuit breaker checks...');

    const checks = [
        await checkLossLimit(),
        await checkWinRate(),
        await checkDataFreshness(),
        await checkApiHealth(),
        await checkBalance(usdcBalance),
    ];

    if (checks.some((c) => c)) {
        console.error('🛑 One or more circuit breakers triggered');
        return true;
    }

    console.log('✅ All circuit breakers passed');
    return false;
}

/**
 * Helper: Set breaker as active
 */
async function setCircuitBreakerActive(name: string, reason: string): Promise<void> {
    try {
        await CircuitBreaker.updateOne(
            { name },
            {
                active: true,
                triggered_at: new Date(),
                triggered_reason: reason,
                last_checked: new Date(),
            }
        );
    } catch (error) {
        console.error(`Error activating breaker ${name}:`, error);
    }
}

/**
 * Helper: Set breaker as inactive
 */
async function setCircuitBreakerInactive(name: string): Promise<void> {
    try {
        await CircuitBreaker.updateOne(
            { name },
            {
                active: false,
                triggered_at: null,
                triggered_reason: null,
                last_checked: new Date(),
            }
        );
    } catch (error) {
        console.error(`Error deactivating breaker ${name}:`, error);
    }
}
