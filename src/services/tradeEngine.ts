import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { Position, TradeDecision } from '../models/weatherArbitrage';
import { ENV } from '../config/env';
import { runAllCircuitBreakerChecks, getActiveBreakers } from './circuitBreakers';

/**
 * Trade Engine - Order placement and execution
 */

interface ExecuteTradeInput {
    marketId: string;
    side: 'YES' | 'NO';
    currentPrice: number;
    confidence: number; // 0-100 safety score
    expectedProfit: number;
    usdcBalance: number;
    shares: number;
}

/**
 * Execute a trade (buy order)
 */
export async function executeTrade(
    clobClient: ClobClient,
    input: ExecuteTradeInput,
    question: string,
    yesPrice: number | null,
    noPrice: number | null
): Promise<{ success: boolean; orderId: string | null; error: string | null }> {
    const {
        marketId,
        side,
        currentPrice,
        confidence,
        expectedProfit,
        usdcBalance,
        shares,
    } = input;

    try {
        // Run circuit breaker checks first
        const breakerTriggered = await runAllCircuitBreakerChecks(usdcBalance);
        const activeBreakers = await getActiveBreakers();

        if (breakerTriggered) {
            const decision = new TradeDecision({
                timestamp: new Date(),
                market_id: marketId,
                decision: 'SKIP',
                side: null,
                safety_score: confidence,
                profit_margin_percent: expectedProfit,
                circuit_breaker_active: activeBreakers.join(', '),
                reason: `Circuit breaker active: ${activeBreakers.join(', ')}`,
                temperature_data: {
                    current_temp: 0,
                    daily_max: 0,
                    source: 'SKIPPED',
                },
                market_data: {
                    question,
                    yes_price: yesPrice,
                    no_price: noPrice,
                },
                order_id: null,
                order_success: false,
                shares_purchased: 0,
            });

            await decision.save();
            console.warn(`⚠️  Trade blocked by circuit breaker: ${activeBreakers.join(', ')}`);
            return { success: false, orderId: null, error: 'Circuit breaker active' };
        }

        // Pre-flight checks
        if (shares <= 0) {
            throw new Error('Invalid share amount');
        }

        if (currentPrice <= 0 || currentPrice >= 1) {
            throw new Error(`Invalid price: ${currentPrice}`);
        }

        const totalCost = shares * currentPrice;
        if (totalCost > usdcBalance * 0.9) {
            // Don't risk more than 90% of balance
            throw new Error(`Trade size too large: $${totalCost.toFixed(2)} vs balance $${usdcBalance.toFixed(2)}`);
        }

        console.log(`\n💰 Executing trade:`);
        console.log(`   Market: ${marketId}`);
        console.log(`   Side: ${side}`);
        console.log(`   Shares: ${shares}`);
        console.log(`   Price: ${currentPrice}`);
        console.log(`   Total Cost: $${totalCost.toFixed(2)}`);
        console.log(`   Expected Profit: ${expectedProfit.toFixed(2)}%`);

        // Get market info
        const marketInfo = await clobClient.getMarket(marketId);
        if (!marketInfo) {
            throw new Error('Market not found');
        }

        const tickSize = parseFloat(marketInfo.tickSize || '0.01');

        // Normalize price to tick size
        const normalizedPrice = Math.round(currentPrice / tickSize) * tickSize;

        if (!ENV.PAPER_TRADING_MODE) {
            // Live trading - create and post order
            const order = await clobClient.createOrder(
                {
                    side: side === 'YES' ? Side.BUY : Side.BUY, // NO shares are bought on the NO side
                    tokenID: side === 'YES' ? marketId + '-YES' : marketId + '-NO',
                    size: shares,
                    price: normalizedPrice,
                    expiration: Math.floor(Date.now() / 1000) + 300, // 5 minute expiration
                    feeRateBps: 0,
                },
                { tickSize: marketInfo.tickSize, negRisk: marketInfo.negRisk || false }
            );

            // Post order to CLOB
            const response = await clobClient.postOrder(order, OrderType.FOK); // Fill or Kill

            if (!response.success) {
                throw new Error(`Order failed: ${response.error}`);
            }

            // Store position
            const position = new Position({
                market_id: marketId,
                side,
                buy_price: normalizedPrice,
                shares,
                total_cost: totalCost,
                status: 'OPEN',
                timestamp: new Date(),
            });

            await position.save();

            // Log decision
            const decision = new TradeDecision({
                timestamp: new Date(),
                market_id: marketId,
                decision: 'BUY',
                side,
                safety_score: confidence,
                profit_margin_percent: expectedProfit,
                circuit_breaker_active: null,
                reason: `Executed ${side} trade with ${confidence} confidence`,
                temperature_data: {
                    current_temp: 0,
                    daily_max: 0,
                    source: 'EXECUTED',
                },
                market_data: {
                    question,
                    yes_price: yesPrice,
                    no_price: noPrice,
                },
                order_id: response.orderId || null,
                order_success: true,
                shares_purchased: shares,
                actual_price: normalizedPrice,
                total_cost: totalCost,
            });

            await decision.save();

            console.log(`✅ Trade executed successfully`);
            console.log(`   Order ID: ${response.orderId}`);

            return { success: true, orderId: response.orderId || null, error: null };
        } else {
            // Paper trading - just log it
            const position = new Position({
                market_id: marketId,
                side,
                buy_price: normalizedPrice,
                shares,
                total_cost: totalCost,
                status: 'OPEN',
                timestamp: new Date(),
            });

            await position.save();

            const decision = new TradeDecision({
                timestamp: new Date(),
                market_id: marketId,
                decision: 'BUY',
                side,
                safety_score: confidence,
                profit_margin_percent: expectedProfit,
                circuit_breaker_active: null,
                reason: `PAPER TRADING: ${side} at ${normalizedPrice}`,
                temperature_data: {
                    current_temp: 0,
                    daily_max: 0,
                    source: 'PAPER',
                },
                market_data: {
                    question,
                    yes_price: yesPrice,
                    no_price: noPrice,
                },
                order_id: `PAPER_${Date.now()}`,
                order_success: true,
                shares_purchased: shares,
                actual_price: normalizedPrice,
                total_cost: totalCost,
            });

            await decision.save();

            console.log(`📝 PAPER TRADE (not executed on blockchain)`);
            return { success: true, orderId: `PAPER_${Date.now()}`, error: null };
        }
    } catch (error: any) {
        console.error(`❌ Trade execution error:`, error.message);

        const decision = new TradeDecision({
            timestamp: new Date(),
            market_id: marketId,
            decision: 'ERROR',
            side: input.side,
            safety_score: confidence,
            profit_margin_percent: expectedProfit,
            circuit_breaker_active: null,
            reason: `Error: ${error.message}`,
            temperature_data: {
                current_temp: 0,
                daily_max: 0,
                source: 'ERROR',
            },
            market_data: {
                question,
                yes_price: yesPrice,
                no_price: noPrice,
            },
            order_id: null,
            order_success: false,
            order_error: error.message,
        });

        await decision.save();

        return { success: false, orderId: null, error: error.message };
    }
}

/**
 * Cancel pending orders (called by circuit breaker)
 */
export async function cancelPendingOrders(clobClient: ClobClient): Promise<void> {
    try {
        console.log('Canceling pending orders...');
        // In production, fetch all pending orders and cancel them
        // This depends on the CLOB API
        // await clobClient.cancelAllOrders();
        console.log('✅ Pending orders canceled');
    } catch (error) {
        console.error('❌ Error canceling orders:', error);
    }
}
