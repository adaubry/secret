import axios from 'axios';
import { ENV } from '../config/env';

/**
 * Alerts System - Multiple notification channels
 * Sends alerts via Telegram and email
 */

/**
 * Send Telegram alert
 */
export async function sendTelegramAlert(message: string): Promise<boolean> {
    try {
        if (!ENV.TELEGRAM_BOT_TOKEN || !ENV.TELEGRAM_CHAT_ID) {
            console.warn('⚠️  Telegram credentials not configured');
            return false;
        }

        const url = `https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/sendMessage`;
        const response = await axios.post(url, {
            chat_id: ENV.TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML',
        });

        if (response.data.ok) {
            console.log('📱 Telegram alert sent');
            return true;
        }

        return false;
    } catch (error) {
        console.error('❌ Error sending Telegram alert:', error);
        return false;
    }
}

/**
 * Send email alert
 */
export async function sendEmailAlert(subject: string, body: string): Promise<boolean> {
    try {
        if (!ENV.ALERT_EMAIL) {
            console.warn('⚠️  Alert email not configured');
            return false;
        }

        // In production, use nodemailer or similar
        // For now, just log it
        console.log(`📧 Email alert would be sent to ${ENV.ALERT_EMAIL}`);
        console.log(`Subject: ${subject}`);
        console.log(`Body: ${body}`);

        return true;
    } catch (error) {
        console.error('❌ Error sending email alert:', error);
        return false;
    }
}

/**
 * Alert types
 */

export async function alertCircuitBreakerTriggered(breakerName: string, reason: string): Promise<void> {
    const message = `🛑 <b>Circuit Breaker Triggered</b>\n<b>Breaker:</b> ${breakerName}\n<b>Reason:</b> ${reason}\n\nTrading has been paused.`;
    await sendTelegramAlert(message);
    await sendEmailAlert('Circuit Breaker Triggered', `Breaker: ${breakerName}\nReason: ${reason}`);
}

export async function alertTradeExecuted(
    marketId: string,
    side: string,
    shares: number,
    price: number,
    profit: number
): Promise<void> {
    const message = `💰 <b>Trade Executed</b>\n<b>Market:</b> ${marketId}\n<b>Side:</b> ${side}\n<b>Shares:</b> ${shares}\n<b>Price:</b> $${price.toFixed(2)}\n<b>Expected Profit:</b> ${profit.toFixed(2)}%`;
    await sendTelegramAlert(message);
}

export async function alertPositionResolved(
    marketId: string,
    side: string,
    outcome: string,
    pnl: number
): Promise<void> {
    const emoji = pnl > 0 ? '📈' : '📉';
    const message = `${emoji} <b>Position Resolved</b>\n<b>Market:</b> ${marketId}\n<b>Side:</b> ${side}\n<b>Outcome:</b> ${outcome}\n<b>P&L:</b> $${pnl.toFixed(2)}`;
    await sendTelegramAlert(message);
}

export async function alertWalletCreated(address: string): Promise<void> {
    const message = `🔐 <b>Wallet Created</b>\n<b>Address:</b> <code>${address}</code>\n\n<i>Save your mnemonic seed phrase securely!</i>`;
    await sendTelegramAlert(message);
    await sendEmailAlert('Weather Arbitrage Bot - Wallet Created', `Address: ${address}`);
}

export async function alertBotStarted(): Promise<void> {
    const message = `▶️ <b>Weather Arbitrage Bot Started</b>\nPaper trading mode: ${ENV.PAPER_TRADING_MODE}`;
    await sendTelegramAlert(message);
}

export async function alertBotStopped(reason: string): Promise<void> {
    const message = `⏹️ <b>Weather Arbitrage Bot Stopped</b>\n<b>Reason:</b> ${reason}`;
    await sendTelegramAlert(message);
    await sendEmailAlert('Bot Stopped', reason);
}

export async function alertErrorOccurred(error: string): Promise<void> {
    const message = `⚠️ <b>Error Occurred</b>\n<code>${error}</code>`;
    await sendTelegramAlert(message);
    await sendEmailAlert('Bot Error', error);
}

export async function alertDailyReport(stats: {
    totalTrades: number;
    winningTrades: number;
    totalPnL: number;
    positions: number;
}): Promise<void> {
    const winRate = stats.totalTrades > 0 ? ((stats.winningTrades / stats.totalTrades) * 100).toFixed(1) : 'N/A';
    const message = `📊 <b>Daily Report</b>\n<b>Total Trades:</b> ${stats.totalTrades}\n<b>Win Rate:</b> ${winRate}%\n<b>Total P&L:</b> $${stats.totalPnL.toFixed(2)}\n<b>Open Positions:</b> ${stats.positions}`;
    await sendTelegramAlert(message);
}
