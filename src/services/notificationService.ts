/**
 * Notification Service
 * Sends notifications to the owner
 */

import { WASocket } from '@whiskeysockets/baileys';
import { ownerService } from './ownerService';
import { formatPhoneNumber } from '../utils/phoneFormatter';

import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/env';

export class NotificationService {
    private sock: WASocket | undefined;
    private telegramBot: TelegramBot | undefined;

    /**
     * Initialize with WhatsApp socket and optionally Telegram
     */
    init(sock: WASocket) {
        this.sock = sock;

        if (config.telegramBotToken) {
            this.telegramBot = new TelegramBot(config.telegramBotToken, { polling: false });
        }
    }

    /**
     * Send notification to owner (WhatsApp + Telegram)
     */
    async notifyOwner(message: string): Promise<void> {
        const notifications: Promise<void>[] = [];

        // 1. WhatsApp Notification
        if (this.sock) {
            const ownerPhone = ownerService.getOwnerPhone();
            if (ownerPhone) {
                const normalizedPhone = ownerPhone.replace(/[\+\s]/g, '');
                const ownerJid = `${normalizedPhone}@s.whatsapp.net`;
                notifications.push(
                    this.sock.sendMessage(ownerJid, { text: message })
                        .then(() => console.log(`📨 Notification sent to WhatsApp owner`))
                        .catch(err => console.error('Failed to send WhatsApp notification:', err))
                );
            } else {
                console.warn('⚠️ NotificationService: WhatsApp owner phone not set. Skipping WhatsApp notification.');
            }
        }

        // 2. Telegram Notification
        if (this.telegramBot && config.telegramChatId) {
            notifications.push(
                this.telegramBot.sendMessage(config.telegramChatId, message)
                    .then(() => console.log(`📨 Notification sent to Telegram owner`))
                    .catch(err => console.error('Failed to send Telegram notification:', err))
            );
        } else if (this.telegramBot && !config.telegramChatId) {
            console.warn('⚠️ NotificationService: Telegram Chat ID not set. Skipping Telegram notification.');
        }

        await Promise.allSettled(notifications);
    }

    /**
     * Send conversation summary (only notification type)
     * This is called after 20 minutes of conversation inactivity
     */
    async sendConversationSummary(summary: string): Promise<void> {
        await this.notifyOwner(summary);
    }
}

export const notificationService = new NotificationService();
