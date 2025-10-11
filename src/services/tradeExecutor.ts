import { ClobClient } from '@polymarket/clob-client';
import { UserActivityInterface, UserPositionInterface } from '../interfaces/User';
import { ENV } from '../config/env';
import { getUserActivityModel } from '../models/userHistory';
import fetchData from '../utils/fetchData';
import spinner from '../utils/spinner';
import getMyBalance from '../utils/getMyBalance';
import postOrder from '../utils/postOrder';

const USER_ADDRESS = ENV.USER_ADDRESS;
const RETRY_LIMIT = ENV.RETRY_LIMIT;
const PROXY_WALLET = ENV.PROXY_WALLET;

let temp_trades: UserActivityInterface[] = [];

const UserActivity = getUserActivityModel(USER_ADDRESS);

const readTempTrade = async () => {
    temp_trades = (
        await UserActivity.find({
            $and: [{ type: 'TRADE' }, { bot: false }, { botExcutedTime: { $lt: RETRY_LIMIT } }],
        }).exec()
    ).map((trade) => trade as UserActivityInterface);
};

const doTrading = async (clobClient: ClobClient) => {
    for (const trade of temp_trades) {
        console.log('Trade to copy:', trade);
        // const market = await clobClient.getMarket(trade.conditionId);
        const my_positions: UserPositionInterface[] = await fetchData(
            `https://data-api.polymarket.com/positions?user=${PROXY_WALLET}`
        );
        const user_positions: UserPositionInterface[] = await fetchData(
            `https://data-api.polymarket.com/positions?user=${USER_ADDRESS}`
        );
        const my_position = my_positions.find(
            (position: UserPositionInterface) => position.conditionId === trade.conditionId
        );
        const user_position = user_positions.find(
            (position: UserPositionInterface) => position.conditionId === trade.conditionId
        );
        const my_balance = await getMyBalance(PROXY_WALLET);
        const user_balance = await getMyBalance(USER_ADDRESS);
        console.log('My current balance:', my_balance);
        console.log('User current balance:', user_balance);
        if (trade.side === 'BUY') {
            if (user_position && my_position && my_position.asset !== trade.asset) {
                await postOrder(
                    clobClient,
                    'merge',
                    my_position,
                    user_position,
                    trade,
                    my_balance,
                    user_balance
                );
            } else {
                await postOrder(
                    clobClient,
                    'buy',
                    my_position,
                    user_position,
                    trade,
                    my_balance,
                    user_balance
                );
            }
        } else if (trade.side === 'SELL') {
            await postOrder(
                clobClient,
                'sell',
                my_position,
                user_position,
                trade,
                my_balance,
                user_balance
            );
        } else {
            console.log('Not supported trade type');

            await UserActivity.updateOne(
                { _id: trade._id },

                { bot: true, botExcutedTime: trade.botExcutedTime + 1 }
            );
        }
    }
};

const tradeExcutor = async (clobClient: ClobClient) => {
    console.log(`Executing Copy Trading`);

    while (true) {
        await readTempTrade();
        if (temp_trades.length > 0) {
            console.log('💥 New transactions found 💥');
            spinner.stop();
            await doTrading(clobClient);
        } else {
            spinner.start('Waiting for new transactions');
        }
    }
};

export default tradeExcutor;
