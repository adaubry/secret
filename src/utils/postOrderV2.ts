import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { UserActivityInterface, UserPositionInterface } from '../interfaces/User';
import { getUserActivityModel } from '../models/userHistory';
import { ENV } from '../config/env';

const RETRY_LIMIT = ENV.RETRY_LIMIT;
const USER_ADDRESS = ENV.USER_ADDRESS;
const UserActivity = getUserActivityModel(USER_ADDRESS);

// Simplified normalization - just ensure proper decimal places
const normalizeAmount = (amount: number, decimals: number): number => {
    return Math.floor(amount * 10 ** decimals) / 10 ** decimals;
};

const postOrder = async (
    clobClient: ClobClient,
    condition: string,
    my_position: UserPositionInterface | undefined,
    user_position: UserPositionInterface | undefined,
    trade: UserActivityInterface,
    my_balance: number,
    user_balance: number
) => {
    // Fetch market info ONCE - cache it
    const marketInfo = await clobClient.getMarket(trade.conditionId);
    const tickSize = parseFloat(marketInfo?.tickSize || '0.01');
    const negRisk = marketInfo?.negRisk || false;
    const expiration = Math.floor(Date.now() / 1000) + 70; // 70 seconds

    if (condition === 'merge') {
        console.log('🔄 Merging Strategy...');
        if (!my_position) {
            console.log('❌ No position to merge');
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
            return;
        }

        // Get order book ONCE
        const orderBook = await clobClient.getOrderBook(trade.asset);
        if (!orderBook.bids?.length) {
            console.log('❌ No bids available');
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
            return;
        }

        // Take best bid immediately
        const bestBid = orderBook.bids[0];
        const sellPrice = normalizeAmount(parseFloat(bestBid.price), 2);
        const sellSize = normalizeAmount(my_position.size, 5);

        console.log(`📤 SELL ${sellSize} @ ${sellPrice}`);

        try {
            const signedOrder = await clobClient.createOrder(
                {
                    side: Side.SELL,
                    tokenID: my_position.asset,
                    size: sellSize,
                    price: sellPrice,
                    feeRateBps: 0,
                },
                { tickSize: marketInfo.tickSize, negRisk: negRisk }
            );

            const resp = await clobClient.postOrder(signedOrder, OrderType.GTC);

            if (resp.success) {
                console.log('✅ Merge order filled');
                await UserActivity.updateOne({ _id: trade._id }, { bot: true });
            } else {
                console.log('❌ Merge failed:', resp.error);
                await UserActivity.updateOne({ _id: trade._id }, { bot: true });
            }
        } catch (error: any) {
            console.error('❌ Merge error:', error.message);
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
        }
    } else if (condition === 'buy') {
        console.log('💰 Buy Strategy...');

        // Calculate amount to buy
        const ratio = Math.min(my_balance / (user_balance + trade.usdcSize), 1);
        const targetUSDC = trade.usdcSize * ratio;

        console.log(`💵 Target: $${targetUSDC.toFixed(2)} (ratio: ${ratio.toFixed(2)})`);

        // Get order book ONCE
        const orderBook = await clobClient.getOrderBook(trade.asset);
        if (!orderBook.asks?.length) {
            console.log('❌ No asks available');
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
            return;
        }

        // Take best ask immediately
        const bestAsk = orderBook.asks[0];
        const buyPrice = normalizeAmount(parseFloat(bestAsk.price), 2);

        // Price protection: don't buy if price moved too much
        if (buyPrice > trade.price + 0.05) {
            console.log(`⚠️ Price too high: ${buyPrice} vs ${trade.price} - SKIP`);
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
            return;
        }

        const buySize = normalizeAmount(targetUSDC / buyPrice, 5);

        console.log(`📥 BUY ${buySize} @ ${buyPrice} = $${(buySize * buyPrice).toFixed(2)}`);

        try {
            const signedOrder = await clobClient.createOrder(
                {
                    side: Side.BUY,
                    tokenID: trade.asset,
                    size: buySize,
                    price: buyPrice,
                    expiration: expiration,
                    feeRateBps: 0,
                },
                { tickSize: marketInfo.tickSize, negRisk: negRisk }
            );

            const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);

            if (resp.success) {
                console.log('✅ Buy order filled');
                await UserActivity.updateOne({ _id: trade._id }, { bot: true });
            } else {
                console.log('❌ Buy failed:', resp.error);
                await UserActivity.updateOne({ _id: trade._id }, { bot: true });
            }
        } catch (error: any) {
            console.error('❌ Buy error:', error.message);
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
        }
    } else if (condition === 'sell') {
        console.log('📉 Sell Strategy...');

        if (!my_position) {
            console.log('❌ No position to sell');
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
            return;
        }

        // Calculate amount to sell
        let sellSize: number;
        if (!user_position) {
            sellSize = my_position.size;
        } else {
            const ratio = Math.min(trade.size / (user_position.size + trade.size), 1);
            sellSize = my_position.size * ratio;
        }

        sellSize = normalizeAmount(sellSize, 5);
        console.log(`📤 Selling ${sellSize} tokens`);

        // Get order book ONCE
        const orderBook = await clobClient.getOrderBook(trade.asset);
        if (!orderBook.bids?.length) {
            console.log('❌ No bids available');
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
            return;
        }

        // Take best bid immediately
        const bestBid = orderBook.bids[0];
        const sellPrice = normalizeAmount(parseFloat(bestBid.price), 2);

        console.log(`📤 SELL ${sellSize} @ ${sellPrice} = $${(sellSize * sellPrice).toFixed(2)}`);

        try {
            const signedOrder = await clobClient.createOrder(
                {
                    side: Side.SELL,
                    tokenID: trade.asset,
                    size: sellSize,
                    price: sellPrice,
                    expiration: expiration,
                    feeRateBps: 0,
                },
                { tickSize: marketInfo.tickSize, negRisk: negRisk }
            );

            const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);

            if (resp.success) {
                console.log('✅ Sell order filled');
                await UserActivity.updateOne({ _id: trade._id }, { bot: true });
            } else {
                console.log('❌ Sell failed:', resp.error);
                await UserActivity.updateOne({ _id: trade._id }, { bot: true });
            }
        } catch (error: any) {
            console.error('❌ Sell error:', error.message);
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
        }
    } else {
        console.log('❌ Condition not supported');
    }
};

export default postOrder;
