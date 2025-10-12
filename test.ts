import { ClobClient } from '@polymarket/clob-client';
import { Wallet } from '@ethersproject/wallet';
import postOrder from './src/utils/postOrder';
import { UserActivityInterface, UserPositionInterface } from './src/interfaces/User';

/**
 * Simple test runner - just change the parameters below and run
 * Run with: ts-node index.ts
 */

async function main() {
    // ===== CONFIGURE YOUR CLOB CLIENT =====
    const host = 'https://clob.polymarket.com';
    const chainId = 137;
    const privateKey = process.env.PRIVATE_KEY || 'your_private_key';
    const funderAddress = process.env.FUNDER_ADDRESS || '0xYourAddress';
    const creds = {
        key: process.env.POLY_API_KEY || 'your_api_key',
        secret: process.env.POLY_API_SECRET || 'your_secret',
        passphrase: process.env.POLY_PASSPHRASE || 'your_passphrase',
    };
    
    const signer = new Wallet(privateKey);
    const clobClient = new ClobClient(host, chainId, signer, creds, 1, funderAddress);
    
    
    // ===== CHANGE THESE PARAMETERS =====
    
    const condition = 'buy'; // 'buy', 'sell', or 'merge'
    
    const trade: UserActivityInterface = {
        _id: 'test' as any,
        proxyWallet: '0x7c2c96af5bdadc1818360ac33ba77718c5a3407e',
        timestamp: Date.now(),
        conditionId: '0xtest',
        type: 'TRADE',
        size: 87.14,
        usdcSize: 0.8714,
        transactionHash: '0xtest',
        price: 0.01,
        asset: '49945677446949854939249813961357533799656959277424929759437590321236921505383',
        side: 'BUY',
        outcomeIndex: 0,
        title: 'Test Market',
        slug: 'test',
        icon: '',
        eventSlug: 'test',
        outcome: 'Yes',
        name: 'Test',
        pseudonym: 'Test',
        bio: '',
        profileImage: '',
        profileImageOptimized: '',
        bot: false,
        botExcutedTime: 0,
        __v: 0
    };
    
    const my_position: UserPositionInterface | undefined = undefined;
    const user_position: UserPositionInterface | undefined = undefined;
    const my_balance = 615.655469;
    const user_balance = 103.515172;
    
    // ===== RUN THE ORDER =====
    
    console.log('🚀 Executing postOrder with:');
    console.log(`   Condition: ${condition}`);
    console.log(`   Token: ${trade.asset}`);
    console.log(`   Size: ${trade.size}`);
    console.log(`   Price: ${trade.price}`);
    console.log(`   USDC Size: ${trade.usdcSize}`);
    console.log(`   My Balance: ${my_balance}`);
    console.log(`   User Balance: ${user_balance}\n`);
    
    await postOrder(
        clobClient,
        condition,
        my_position,
        user_position,
        trade,
        my_balance,
        user_balance
    );
    
    console.log('\n✅ Done!');
}

main().catch(console.error);
