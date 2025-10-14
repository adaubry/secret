import { Wallet } from '@ethersproject/wallet';
import { ClobClient } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import { ENV } from '../config/env';

const PROXY_WALLET = ENV.PROXY_WALLET;
const PRIVATE_KEY = ENV.PRIVATE_KEY;
//const CLOB_HTTP_URL = ENV.CLOB_HTTP_URL;  --- DEBUG ---

const createClobClient = async (): Promise<ClobClient> => {
    const chainId = 137;
    //const host = CLOB_HTTP_URL as string;  --- DEBUG ---
    const host = 'https://clob.polymarket.com';
    const wallet = new Wallet(PRIVATE_KEY as string);
    let clobClient = new ClobClient(
        host,
        chainId,
        wallet

        /*,
        undefined,
        SignatureType.POLY_PROXY,
        PROXY_WALLET as string*/
    );

    const originalConsoleError = console.error;
    console.error = function () {};
    let creds = await clobClient.createApiKey();
    console.error = originalConsoleError;
    if (creds.key) {
        console.log('API Key created', creds);
    } else {
        creds = await clobClient.deriveApiKey();
        console.log('API Key derived', creds);
    }

    clobClient = new ClobClient(
        host,
        chainId,
        wallet,
        creds
        /*,
        SignatureType.POLY_PROXY,
        PROXY_WALLET as string*/
    );
    console.log(clobClient);
    return clobClient;
};

export default createClobClient;
