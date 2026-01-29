import { config } from '../src/config/env';
import TelegramBot from 'node-telegram-bot-api';

const testConnection = async () => {
    console.log('🧪 Testing Telegram Bot Connection...');

    if (!config.telegramBotToken) {
        console.error('❌ Error: TELEGRAM_BOT_TOKEN is missing in .env file.');
        console.log('Please add your token to .env and try again.');
        process.exit(1);
    }

    try {
        const bot = new TelegramBot(config.telegramBotToken, { polling: false });
        const me = await bot.getMe();

        console.log('✅ Success! Bot connected.');
        console.log(`🤖 Bot Username: @${me.username}`);
        console.log(`🆔 Bot ID: ${me.id}`);
        console.log(`📝 Name: ${me.first_name}`);

        if (config.telegramChatId) {
            console.log(`👤 Configured Owner Chat ID: ${config.telegramChatId}`);
            try {
                await bot.sendMessage(config.telegramChatId, '🤖 Configuration Test: Bot connected successfully!');
                console.log('✅ Test message sent to owner.');
            } catch (msgError: any) {
                console.warn('⚠️ Could not send test message to owner. Check if Chat ID is correct and you have started a chat with the bot.');
                console.warn('Error:', msgError.message);
            }
        } else {
            console.log('ℹ️ No Owner Chat ID configured. Skipping test message.');
        }

    } catch (error: any) {
        console.error('❌ Connection Failed:', error.message);
        if (error.code === 'ETELEGRAM') {
            console.error('   Verify your token is correct.');
        }
    }
};

testConnection();
