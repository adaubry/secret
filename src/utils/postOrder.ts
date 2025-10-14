import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { UserActivityInterface, UserPositionInterface } from '../interfaces/User';
import { getUserActivityModel } from '../models/userHistory';
import { ENV } from '../config/env';

const RETRY_LIMIT = ENV.RETRY_LIMIT;
const USER_ADDRESS = ENV.USER_ADDRESS;
const UserActivity = getUserActivityModel(USER_ADDRESS);

// --- Round a number down to N decimals ---
const roundDown = (num: number, decimals: number) =>
    Math.floor(num * 10 ** decimals) / 10 ** decimals;

// --- Normalize order price and size for Polymarket ---
// Polymarket uses 6 decimals internally for amounts
// But API requires: makerAmount max 2 decimals, takerAmount max 5 decimals
const normalizeOrder = (size: number, price: number, tickSize: number) => {
    // Step 1: Snap price to nearest tick and round to 2 decimals (USDC precision)
    let normalizedPrice = Math.max(
        tickSize,
        Math.min(1 - tickSize, Math.round(price / tickSize) * tickSize)
    );
    normalizedPrice = roundDown(normalizedPrice, 2);

    // Step 2: Round size to 5 decimals (token precision)
    let normalizedSize = roundDown(size, 5);

    // Step 3: Calculate makerAmount (size * price) and ensure it has max 2 decimals
    const rawMakerAmount = normalizedSize * normalizedPrice;
    //console.log(`  rawMakerAmount (size * price): ${rawMakerAmount}`);
    const roundedMakerAmount = roundDown(rawMakerAmount, 2);

    // Step 4: CRITICAL FIX - Back-calculate size to ensure size * price = exactly 2 decimals
    // This prevents floating point precision issues
    if (normalizedPrice > 0) {
        // Recalculate size from the rounded maker amount
        const recalculatedSize = roundedMakerAmount / normalizedPrice;
        normalizedSize = roundDown(recalculatedSize, 5);
    }
    const recalculatedSize = roundedMakerAmount / normalizedPrice;
    // Final verification
    const finalMakerAmount = recalculatedSize * normalizedPrice;
    const finalMakerAmountRounded = Math.round(finalMakerAmount * 100) / 100;

    /*
    console.log(`---- debug info (normalizeOrder) -----`);
    console.log(`  Input: size=${size}, price=${price}, tickSize=${tickSize}`);
    console.log(`  Step 1 - normalizedPrice: ${normalizedPrice}`);
    console.log(`  Step 2 - normalizedSize (initial): ${size} → ${roundDown(size, 5)}`);
    console.log(`  Step 3 - rawMakerAmount: ${rawMakerAmount} → rounded: ${roundedMakerAmount}`);
    console.log(`  Step 4 - recalculated size: ${normalizedSize}`);
    console.log(`  Final - size: ${normalizedSize}, price: ${normalizedPrice}`);
    console.log(
        `  Final - makerAmount: ${finalMakerAmount} (should equal ${finalMakerAmountRounded})`
    );
    console.log(
        `  Final - in 6-decimals: makerAmount=${Math.round(finalMakerAmountRounded * 1000000)}, takerAmount=${Math.round(normalizedSize * 1000000)}`
    );
*/

    // Verify the 6-decimal conversion meets requirements
    const makerAmount6Dec = Math.round(finalMakerAmountRounded * 1000000);
    const takerAmount6Dec = Math.round(normalizedSize * 1000000);
    console.log(`  Verification: makerAmount % 10000 = ${makerAmount6Dec % 10000} (must be 0)`);
    console.log(`  Verification: takerAmount % 10 = ${takerAmount6Dec % 10} (must be 0)`);

    return { normalizedSize, normalizedPrice, finalMakerAmountRounded };
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
    // Fetch market info once for all strategies
    const marketInfo = await clobClient.getMarket(trade.conditionId);
    const tickSize = parseFloat(marketInfo?.tickSize || '0.01');
    const minSize = parseFloat(marketInfo?.min_order_size || '0.01');
    const negRisk = marketInfo?.negRisk || false;

    console.log(`Market Info - tickSize: ${tickSize}, minSize: ${minSize}, negRisk: ${negRisk}`);

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

            if (sellSize < minSize) {
                console.log(`⚠️ Order size ${sellSize} below market minimum ${minSize}, adjusting`);
                sellSize = minSize;
            }

            let { normalizedSize, normalizedPrice, finalMakerAmountRounded } = normalizeOrder(
                sellSize,
                parseFloat(maxPriceBid.price),
                tickSize
            );

            normalizedSize = +(finalMakerAmountRounded / normalizedPrice).toFixed(5);
            const oneMinute = parseInt(
                ((new Date().getTime() + 60 * 1000 + 10 * 1000) / 1000).toString()
            );

            const signedOrder = await clobClient.createOrder(
                {
                    side: Side.SELL,
                    tokenID: my_position.asset,
                    size: normalizedSize,
                    price: normalizedPrice,
                    feeRateBps: 0,
                    expiration: oneMinute,
                },
                {
                    tickSize: marketInfo.tickSize,
                    negRisk: negRisk,
                }
            );
            console.log('Created MERGE order:', signedOrder);

            const resp = await clobClient.postOrder(signedOrder, OrderType.GTD);

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
            remainingUSDC = trade.usdcSize * 0.5;
            console.log('ratio > 1,  ratio is set to 0.5');
        } else {
            remainingUSDC = trade.usdcSize * (ratio / 2) ;
        }
	console.log('Reminder: Ratio is halved')
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

            const askPrice = parseFloat(minPriceAsk.price);
            if (askPrice - 0.05 > trade.price) {
                console.log('Too big different price - do not copy');
                await UserActivity.updateOne({ _id: trade._id }, { bot: true });
                break;
            }

            const maxSizeAvailable = parseFloat(minPriceAsk.size);
            const maxUSDCForAsk = maxSizeAvailable * askPrice;

            let buyAmount: number;
            if (remainingUSDC <= maxUSDCForAsk) {
                // We can spend all remaining USDC
                buyAmount = remainingUSDC;
            } else {
                // We can only buy what's available
                buyAmount = maxUSDCForAsk;
            }

            console.log('Placing BUY order - amount (USDC):', buyAmount, 'price:', askPrice);

            // For BUY limit orders: use size (tokens) and price
            const buySize = buyAmount / askPrice;

            let { normalizedSize, normalizedPrice, finalMakerAmountRounded } = normalizeOrder(
                buySize,
                askPrice,
                tickSize
            );

            normalizedSize = +(finalMakerAmountRounded / normalizedPrice).toFixed(5);

            /*
            console.log('🔍 After normalization:');
            console.log(`   normalizedSize: ${normalizedSize}`);
            console.log(`   normalizedPrice: ${normalizedPrice}`);
            console.log(
                `   Expected makerAmount (size * price): ${normalizedSize * normalizedPrice}`
            );
            console.log(
                `   Expected in 6-decimals: ${Math.round(normalizedSize * normalizedPrice * 1000000)}`
            );
            */

            const oneMinute = parseInt(
                ((new Date().getTime() + 60 * 1000 + 10 * 1000) / 1000).toString()
            );

            console.log('Expiration timestamp:', oneMinute);
            const signedOrder = await clobClient.createOrder(
                {
                    side: Side.BUY,
                    tokenID: trade.asset,
                    size: normalizedSize,
                    price: normalizedPrice,
                    expiration: oneMinute,
                    feeRateBps: 0,
                },
                { tickSize: marketInfo.tickSize, negRisk: negRisk }
            );
            console.log('Signed order expiration:', signedOrder.expiration);
            console.log('Created BUY order:', signedOrder);
            const resp = await clobClient.postOrder(signedOrder, OrderType.GTD);

            if (resp.success === true) {
                retry = 0;
                console.log('Successfully posted BUY order:', resp);
                remainingUSDC -= buyAmount;
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
                remainingTokens = my_position.size * 0.5;
                console.log('ratio > 1 , ratio is set to 0.5');
            } else {
                console.log('ratio', ratio);
                remainingTokens = my_position.size * (ratio / 2);
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

            if (sellSize < minSize) {
                console.log(`⚠️ Order size ${sellSize} below market minimum ${minSize}, adjusting`);
                sellSize = minSize;
            }

            // normalize sell amount and price
            let { normalizedSize, normalizedPrice, finalMakerAmountRounded } = normalizeOrder(
                sellSize,
                parseFloat(maxPriceBid.price),
                tickSize
            );

            normalizedSize = +(finalMakerAmountRounded / normalizedPrice).toFixed(5);
            const signedOrder = await clobClient.createOrder(
                {
                    side: Side.SELL,
                    tokenID: trade.asset,
                    size: normalizedSize,
                    price: normalizedPrice,
                    feeRateBps: 0,
                },
                {
                    tickSize: marketInfo.tickSize,
                    negRisk: negRisk,
                }
            );

            console.log('Created SELL order:', signedOrder);

	    //Intentionnaly changing sell to GTC to liquidate
            const resp = await clobClient.postOrder(signedOrder, OrderType.GTC);

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
