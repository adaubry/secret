import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { UserActivityInterface, UserPositionInterface } from '../interfaces/User';
import { getUserActivityModel } from '../models/userHistory';
import { ENV } from '../config/env';

const RETRY_LIMIT = ENV.RETRY_LIMIT;
const USER_ADDRESS = ENV.USER_ADDRESS;
const UserActivity = getUserActivityModel(USER_ADDRESS);

const postOrder = async (
    clobClient: ClobClient,
    condition: string,
    my_position: UserPositionInterface | undefined,
    user_position: UserPositionInterface | undefined,
    trade: UserActivityInterface,
    my_balance: number,
    user_balance: number
) => {
    //Merge strategy
    if (condition === 'merge') {
        console.log('Merging Strategy...');
        if (!my_position) {
            console.log('my_position is undefined');
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
            return;
        }
        let remaining = my_position.size;
        let retry = 0;
        while (remaining > 0 && retry < RETRY_LIMIT) {
            const orderBook = await clobClient.getOrderBook(trade.asset);
            if (!orderBook.bids || orderBook.bids.length === 0) {
                console.log('No bids found');
                await UserActivity.updateOne({ _id: trade._id }, { bot: true });
                break;
            }

            const maxPriceBid = orderBook.bids.reduce((max, bid) => {
                return parseFloat(bid.price) > parseFloat(max.price) ? bid : max;
            }, orderBook.bids[0]);

            console.log('Max price bid:', maxPriceBid);

            let sellSize: number;
            if (remaining <= parseFloat(maxPriceBid.size)) {
                sellSize = remaining;
            } else {
                sellSize = parseFloat(maxPriceBid.size);
            }

            // For SELL orders:
            // - size is in outcome tokens (what you're selling)
            // - makerAmount = size (tokens to sell)
            // - takerAmount = size * price (USDC to receive)
            const order_args = {
                tokenID: my_position.asset,
                price: parseFloat(maxPriceBid.price),
                side: Side.SELL,
                size: sellSize,
                feeRateBps: 0,
            };

            console.log('Order args:', order_args);
            const signedOrder = await clobClient.createOrder(order_args);
            const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);

            if (resp.success === true) {
                retry = 0;
                console.log('Successfully posted MERGE order:', resp);
                remaining -= sellSize;
            } else {
                retry += 1;
                console.log('Error posting MERGE order: retrying...', resp);
            }
        }
        if (retry >= RETRY_LIMIT) {
            await UserActivity.updateOne({ _id: trade._id }, { bot: true, botExcutedTime: retry });
        } else {
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
        }
    } else if (condition === 'buy') {
        //Buy strategy
        console.log('Buy Strategy...');
        const ratio = my_balance / (user_balance + trade.usdcSize);
        console.log('ratio', ratio);
        let remainingUSDC: number;
        if (ratio > 1) {
            remainingUSDC = trade.usdcSize * 2;
            console.log('ratio > 1 thus ratio is set to 2');
        } else {
            remainingUSDC = trade.usdcSize * ratio;
        }

        let retry = 0;
        while (remainingUSDC > 0 && retry < RETRY_LIMIT) {
            const orderBook = await clobClient.getOrderBook(trade.asset);
            if (!orderBook.asks || orderBook.asks.length === 0) {
                console.log('No asks found');
                await UserActivity.updateOne({ _id: trade._id }, { bot: true });
                break;
            }

            const minPriceAsk = orderBook.asks.reduce((min, ask) => {
                return parseFloat(ask.price) < parseFloat(min.price) ? ask : min;
            }, orderBook.asks[0]);

            console.log('Min price ask:', minPriceAsk);
            if (parseFloat(minPriceAsk.price) - 0.05 > trade.price) {
                console.log('Too big different price - do not copy');
                await UserActivity.updateOne({ _id: trade._id }, { bot: true });
                break;
            }

            // For BUY orders:
            // - size is in outcome tokens (what you're buying)
            // - makerAmount = size * price (USDC to spend)
            // - takerAmount = size (tokens to receive)
            const maxSizeAvailable = parseFloat(minPriceAsk.size);
            const pricePerToken = parseFloat(minPriceAsk.price);
            const maxUSDCForAsk = maxSizeAvailable * pricePerToken;

            let buySize: number;
            if (remainingUSDC <= maxUSDCForAsk) {
                // We can spend all remaining USDC
                buySize = remainingUSDC / pricePerToken;
            } else {
                // We can only buy what's available
                buySize = maxSizeAvailable;
            }

            const order_args = {
                tokenID: trade.asset,
                price: pricePerToken,
                side: Side.BUY,
                size: buySize,
                feeRateBps: 0,
            };

            console.log('Order args:', order_args);
            const signedOrder = await clobClient.createOrder(order_args);
            const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);

            if (resp.success === true) {
                retry = 0;
                console.log('Successfully posted BUY order:', resp);
                remainingUSDC -= buySize * pricePerToken;
            } else {
                retry += 1;
                console.log('Error posting BUY order: retrying...', resp);
            }
        }
        if (retry >= RETRY_LIMIT) {
            await UserActivity.updateOne({ _id: trade._id }, { bot: true, botExcutedTime: retry });
        } else {
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
        }
    } else if (condition === 'sell') {
        //Sell strategy
        console.log('Sell Strategy...');
        let remainingTokens = 0;
        if (!my_position) {
            console.log('No position to sell');
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
        } else if (!user_position) {
            remainingTokens = my_position.size;
        } else {
            const ratio = trade.size / (user_position.size + trade.size);
            if (ratio > 1) {
                remainingTokens = my_position.size * 2;
                console.log('ratio > 1 thus ratio is set to 2');
            } else {
                console.log('ratio', ratio);
                remainingTokens = my_position.size * ratio;
            }
        }

        let retry = 0;
        while (remainingTokens > 0 && retry < RETRY_LIMIT) {
            const orderBook = await clobClient.getOrderBook(trade.asset);
            if (!orderBook.bids || orderBook.bids.length === 0) {
                await UserActivity.updateOne({ _id: trade._id }, { bot: true });
                console.log('No bids found');
                break;
            }

            const maxPriceBid = orderBook.bids.reduce((max, bid) => {
                return parseFloat(bid.price) > parseFloat(max.price) ? bid : max;
            }, orderBook.bids[0]);

            console.log('Max price bid:', maxPriceBid);

            let sellSize: number;
            if (remainingTokens <= parseFloat(maxPriceBid.size)) {
                sellSize = remainingTokens;
            } else {
                sellSize = parseFloat(maxPriceBid.size);
            }

            // For SELL orders:
            // - size is in outcome tokens (what you're selling)
            // - makerAmount = size (tokens to sell)
            // - takerAmount = size * price (USDC to receive)
            const order_args = {
                tokenID: trade.asset,
                price: parseFloat(maxPriceBid.price),
                side: Side.SELL,
                size: sellSize,
                feeRateBps: 0,
            };

            console.log('Order args:', order_args);
            const signedOrder = await clobClient.createOrder(order_args);
            const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);

            if (resp.success === true) {
                retry = 0;
                console.log('Successfully posted order:', resp);
                remainingTokens -= sellSize;
            } else {
                retry += 1;
                console.log('Error posting order: retrying...', resp);
            }
        }
        if (retry >= RETRY_LIMIT) {
            await UserActivity.updateOne({ _id: trade._id }, { bot: true, botExcutedTime: retry });
        } else {
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
        }
    } else {
        console.log('Condition not supported');
    }
};

export default postOrder;
