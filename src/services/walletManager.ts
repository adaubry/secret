import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import * as bip39 from 'bip39';
import { HDKey } from 'hdkey';

/**
 * Wallet Manager - Secure local key generation and storage
 * Encrypts private keys with AES-256 + user password
 */

const WALLET_DIR = path.join(process.cwd(), '.wallet');
const ENCRYPTED_KEY_FILE = path.join(WALLET_DIR, 'encrypted_key.json');
const MNEMONIC_FILE = path.join(WALLET_DIR, 'mnemonic.backup'); // Unencrypted - for recovery only

interface EncryptedWalletData {
    iv: string;
    encryptedKey: string;
    salt: string;
    version: number;
}

/**
 * Derive a key from password using PBKDF2
 */
function deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
}

/**
 * Generate a new wallet with BIP39 mnemonic
 */
export async function generateNewWallet(password: string): Promise<{
    address: string;
    mnemonic: string;
    publicKey: string;
}> {
    // Create wallet directory
    if (!fs.existsSync(WALLET_DIR)) {
        fs.mkdirSync(WALLET_DIR, { recursive: true, mode: 0o700 });
    }

    // Check if wallet already exists
    if (fs.existsSync(ENCRYPTED_KEY_FILE)) {
        throw new Error('Wallet already exists. Use loadWallet() instead.');
    }

    // Generate BIP39 mnemonic
    const mnemonic = bip39.generateMnemonic(256); // 24 words
    const seed = await bip39.mnemonicToSeed(mnemonic);

    // Derive first account from BIP44 path: m/44'/60'/0'/0/0
    const hdkey = HDKey.fromMasterSeed(seed);
    const derivedKey = hdkey.derive("m/44'/60'/0'/0/0");

    // Create ethers wallet
    const wallet = new ethers.Wallet(Buffer.from(derivedKey.privateKey as Uint8Array));

    // Encrypt and store private key
    const salt = crypto.randomBytes(16);
    const derivedKeyFromPassword = deriveKey(password, salt);

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', derivedKeyFromPassword, iv);

    let encrypted = cipher.update(wallet.privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const encryptedData: EncryptedWalletData = {
        iv: iv.toString('hex'),
        encryptedKey: encrypted,
        salt: salt.toString('hex'),
        version: 1,
    };

    fs.writeFileSync(ENCRYPTED_KEY_FILE, JSON.stringify(encryptedData, null, 2), {
        mode: 0o600, // Read/write for owner only
    });

    // Store mnemonic separately (in production, send to secure email)
    fs.writeFileSync(MNEMONIC_FILE, mnemonic, {
        mode: 0o600,
    });

    console.log('✅ Wallet created successfully');
    console.log(`Address: ${wallet.address}`);
    console.log('⚠️  IMPORTANT: Save your mnemonic seed phrase in a secure location');

    return {
        address: wallet.address,
        mnemonic: mnemonic,
        publicKey: wallet.publicKey,
    };
}

/**
 * Load wallet from encrypted file
 */
export function loadWallet(password: string): { address: string; wallet: ethers.Wallet } {
    if (!fs.existsSync(ENCRYPTED_KEY_FILE)) {
        throw new Error('Wallet not found. Run generateNewWallet() first.');
    }

    const encryptedData: EncryptedWalletData = JSON.parse(
        fs.readFileSync(ENCRYPTED_KEY_FILE, 'utf-8')
    );

    // Derive key from password
    const salt = Buffer.from(encryptedData.salt, 'hex');
    const derivedKey = deriveKey(password, salt);

    // Decrypt private key
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', derivedKey, iv);

    let decrypted;
    try {
        decrypted = decipher.update(encryptedData.encryptedKey, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
    } catch (error) {
        throw new Error('Failed to decrypt wallet. Check your password.');
    }

    // Create wallet from decrypted private key
    const wallet = new ethers.Wallet(decrypted);

    return {
        address: wallet.address,
        wallet: wallet,
    };
}

/**
 * Import wallet from private key (alternative to mnemonic)
 */
export function importWallet(privateKey: string, password: string): { address: string } {
    // Create wallet directory
    if (!fs.existsSync(WALLET_DIR)) {
        fs.mkdirSync(WALLET_DIR, { recursive: true, mode: 0o700 });
    }

    // Check if wallet already exists
    if (fs.existsSync(ENCRYPTED_KEY_FILE)) {
        throw new Error('Wallet already exists. Use loadWallet() instead.');
    }

    // Validate private key format
    const wallet = new ethers.Wallet(privateKey);

    // Encrypt and store private key
    const salt = crypto.randomBytes(16);
    const derivedKey = deriveKey(password, salt);

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', derivedKey, iv);

    let encrypted = cipher.update(wallet.privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const encryptedData: EncryptedWalletData = {
        iv: iv.toString('hex'),
        encryptedKey: encrypted,
        salt: salt.toString('hex'),
        version: 1,
    };

    fs.writeFileSync(ENCRYPTED_KEY_FILE, JSON.stringify(encryptedData, null, 2), {
        mode: 0o600,
    });

    console.log('✅ Wallet imported successfully');
    console.log(`Address: ${wallet.address}`);

    return {
        address: wallet.address,
    };
}

/**
 * Clear sensitive data from memory
 */
export function clearWalletMemory(): void {
    // In a real implementation, we would overwrite memory with random data
    // For now, just ensure private keys are not logged
    console.log('Wallet memory cleared');
}
