import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { UserPositionInterface } from '../interfaces/User';
import { ENV } from '../config/env';
import fetchData from '../utils/fetchData';

const PROXY_WALLET = ENV.PROXY_WALLET;

/**
 * EMERGENCY LIQUIDATION SCRIPT
 * Sells ALL positions at market price immediately
 * NO QUESTIONS ASKED
 *
 * Usage: await liquidateAll(clobClient);
 */

const liquidateAll = async (clobClient: ClobClient) => {
    console.log('\n🚨 EMERGENCY LIQUIDATION INITIATED 🚨\n');
    console.log('⚠️  WARNING: Selling ALL positions at market price!');
    console.log('⚠️  This action cannot be undone!\n');

    try {
        // Fetch all current positions
        const my_positions: UserPositionInterface[] = await fetchData(
            `https://data-api.polymarket.com/positions?user=${PROXY_WALLET}`
        );

        if (!my_positions || my_positions.length === 0) {
            console.log('✅ No positions found. Nothing to liquidate.');
            return;
        }

        console.log(`📊 Found ${my_positions.length} positions to liquidate:\n`);

        // Display all positions
        my_positions.forEach((pos, index) => {
            console.log(`   Asset: ${pos.asset}`);
            console.log(`   Size: ${pos.size} tokens`);
            console.log(`   Outcome: ${pos.outcome}\n`);
        });

        console.log('🔥 Starting liquidation process...\n');

        let successCount = 0;
        let failCount = 0;

        // Sell each position at market price
        for (let i = 0; i < my_positions.length; i++) {
            const position = my_positions[i];

            console.log(`\n[${i + 1}/${my_positions.length}] Liquidating position:`);
            console.log(`   Size: ${position.size} tokens`);

            try {
                // Get current order book to find best bid price
                const orderBook = await clobClient.getOrderBook(position.asset);

                if (!orderBook.bids || orderBook.bids.length === 0) {
                    console.log('   ❌ No bids available - SKIPPING');
                    failCount++;
                    continue;
                }

                // Find the best (highest) bid
                const bestBid = orderBook.bids.reduce((max, bid) => {
                    return parseFloat(bid.price) > parseFloat(max.price) ? bid : max;
                }, orderBook.bids[0]);

                const sellPrice = parseFloat(bestBid.price);
                const sellSize = position.size;

                console.log(`   📉 Best bid: ${sellPrice}`);
                console.log(`   💰 Selling ${sellSize} tokens @ ${sellPrice}`);
                console.log(`   💵 Expected USDC: ${(sellSize * sellPrice).toFixed(2)}`);

                // Get market info for proper order creation
                const marketInfo = await clobClient.getMarket(position.asset);
                const negRisk = marketInfo?.negRisk || false;

                // Create sell order at best bid price
                const expiration = Math.floor(Date.now() / 1000) + 60; // 1 minute expiration

                const signedOrder = await clobClient.createOrder(
                    {
                        side: Side.SELL,
                        tokenID: position.asset,
                        size: sellSize,
                        price: sellPrice,
                        expiration: expiration,
                        feeRateBps: 0,
                    },
                    {
                        tickSize: marketInfo.tickSize,
                        negRisk: negRisk,
                    }
                );

                // Post as GTD (Good Til Date) to maximize chance of execution
                const resp = await clobClient.postOrder(signedOrder, OrderType.GTD);

                if (resp.success === true) {
                    console.log('   ✅ ORDER PLACED SUCCESSFULLY');
                    console.log(`   Order ID: ${resp.orderID || 'N/A'}`);
                    successCount++;
                } else {
                    console.log('   ❌ ORDER FAILED:', resp.error || resp);
                    failCount++;
                }
            } catch (error: any) {
                console.log('   ❌ ERROR:', error.message || error);
                failCount++;
            }

            // Small delay to avoid rate limiting
            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        console.log('\n' + '='.repeat(60));
        console.log('📊 LIQUIDATION SUMMARY:');
        console.log(`   Total positions: ${my_positions.length}`);
        console.log(`   ✅ Successfully liquidated: ${successCount}`);
        console.log(`   ❌ Failed: ${failCount}`);
        console.log('='.repeat(60) + '\n');

        if (successCount === my_positions.length) {
            console.log('🎉 ALL POSITIONS LIQUIDATED SUCCESSFULLY!');
        } else if (successCount > 0) {
            console.log('⚠️  PARTIAL LIQUIDATION - Some positions failed');
        } else {
            console.log('❌ LIQUIDATION FAILED - No positions were sold');
        }
    } catch (error: any) {
        console.error('\n💥 FATAL ERROR during liquidation:', error.message || error);
        throw error;
    }
};

export default liquidateAll;
