import dotenv from 'dotenv';
dotenv.config();

const getGeminiKeys = () => {
    const keys: string[] = [];

    // 1. Check legacy single key
    if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);

    // 2. Check sequential keys (1-50)
    for (let i = 1; i <= 50; i++) {
        const key = process.env[`GEMINI_API_KEY${i}`];
        if (key) keys.push(key);
    }

    // 3. Fallback: Parse comma-separated list if provided
    if (process.env.GEMINI_API_KEYS) {
        process.env.GEMINI_API_KEYS.split(',').forEach(k => {
            const trimmed = k.trim();
            if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
        });
    }

    return keys;
};

export const config = {
    port: process.env.PORT || 3000,
    ownerPhone: process.env.OWNER_PHONE_NUMBER?.replace(/[^0-9]/g, '') || '', // Cleaned phone number
    ownerLid: process.env.OWNER_LID, // Optional secondary ID (LID)
    geminiKey: process.env.GEMINI_API_KEY,      // Fallback/Legacy
    geminiKeys: getGeminiKeys(),                // The full pool
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    databaseUrl: process.env.DATABASE_URL,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    nodeEnv: process.env.NODE_ENV || 'development'
};
