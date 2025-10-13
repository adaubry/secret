import connectDB from './config/db';
import { ENV } from './config/env';
import createClobClient from './utils/createClobClient';
import tradeExecutor from './services/tradeExecutor';
import tradeMonitor from './services/tradeMonitor';
import liquidateAll from './services/liquidateAll';

const USER_ADDRESS = ENV.USER_ADDRESS;
const PROXY_WALLET = ENV.PROXY_WALLET;

export const main = async () => {
    await connectDB();
    console.log(`Target User Wallet addresss is: ${USER_ADDRESS}`);
    console.log(`My Wallet addresss is: ${PROXY_WALLET}`);
    const clobClient = await createClobClient();

    liquidateAll(clobClient); //Uncomment to liquidate all positions immediately
    //tradeMonitor(); //Monitor target user's transactions
    //tradeExecutor(clobClient); //Execute transactions on your wallet
};

main();
