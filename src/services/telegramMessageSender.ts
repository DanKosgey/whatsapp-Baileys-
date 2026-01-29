import TelegramBot from 'node-telegram-bot-api';

export class TelegramMessageSender {
    private bot: TelegramBot;

    constructor(bot: TelegramBot) {
        this.bot = bot;
    }

    async sendText(chatId: number | string, text: string): Promise<void> {
        try {
            await this.bot.sendChatAction(chatId, 'typing');
            // Simulate typing delay based on length (optional, kept short for responsiveness)
            await new Promise(resolve => setTimeout(resolve, Math.min(1000, text.length * 20)));
            await this.bot.sendMessage(chatId, text);
        } catch (error) {
            console.error(`Error sending Telegram message to ${chatId}:`, error);
        }
    }

    async sendImage(chatId: number | string, imageUrl: string, caption?: string): Promise<void> {
        try {
            await this.bot.sendChatAction(chatId, 'upload_photo');
            await this.bot.sendPhoto(chatId, imageUrl, { caption });
        } catch (error) {
            console.error(`Error sending Telegram image to ${chatId}:`, error);
        }
    }

    async sendVoice(chatId: number | string, audioUrl: string): Promise<void> {
        try {
            await this.bot.sendChatAction(chatId, 'record_voice');
            await this.bot.sendVoice(chatId, audioUrl);
        } catch (error) {
            console.error(`Error sending Telegram voice to ${chatId}:`, error);
        }
    }
}
