import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import { ENV } from '../config/env';
import spinner from '../utils/spinner';

const PROXY_WALLET = ENV.PROXY_WALLET;
const PRIVATE_KEY = ENV.PRIVATE_KEY;
const CLOB_HTTP_URL = ENV.CLOB_HTTP_URL;

const createClobClient = async (): Promise<ClobClient> => {
    const chainId = 137;
    const host = CLOB_HTTP_URL as string;
    const wallet = new ethers.Wallet(PRIVATE_KEY as string);
    let clobClient = new ClobClient(
        host,
        chainId,
        wallet,
        undefined,
        SignatureType.POLY_PROXY,
        PROXY_WALLET as string
    );

    const originalConsoleError = console.error;
    console.error = function () {};
    let creds = await clobClient.createApiKey();
    console.error = originalConsoleError;
    if (creds.key) {
        console.log(
            'API Key created',
            creds.key,
            '\n',
            'secret:',
            spinner.start(44),
            '\n',
            'passphrase: ',
            spinner.start(64)
        );
    } else {
        creds = await clobClient.deriveApiKey();
        console.log(
            'API Key derived',
            creds.key,
            '\n',
            'secret:',
            spinner.start(44),
            '\n',
            'passphrase: ',
            spinner.start(64)
        );
    }

    clobClient = new ClobClient(
        host,
        chainId,
        wallet,
        creds,
        SignatureType.POLY_PROXY,
        PROXY_WALLET as string
    );
    console.log(clobClient);
    return clobClient;
};

export default createClobClient;
