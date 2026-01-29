import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/env';
import { TelegramMessageSender } from '../services/telegramMessageSender';
import { ConversationManager } from '../services/conversationManager';
import { geminiService } from '../services/ai/gemini';
import { executeLocalTool } from '../services/ai/tools';
import { db } from '../database';
import { contacts, messageLogs, aiProfile, userProfile } from '../database/schema';
import { eq, desc } from 'drizzle-orm';

export class TelegramClient {
    private bot: TelegramBot | undefined;
    private messageSender: TelegramMessageSender | undefined;
    private conversationManager: ConversationManager;

    constructor() {
        this.conversationManager = new ConversationManager();
    }

    async initialize() {
        if (!config.telegramBotToken) {
            console.log('ℹ️ TELEGRAM_BOT_TOKEN not found. Skipping Telegram bot initialization.');
            return;
        }

        console.log('🔄 Initializing Telegram Bot...');

        try {
            this.bot = new TelegramBot(config.telegramBotToken, { polling: true });
            this.messageSender = new TelegramMessageSender(this.bot);

            // Print Bot Info
            const me = await this.bot.getMe();
            console.log(`✅ Telegram Bot Connected: @${me.username} (ID: ${me.id})`);

            this.setupListeners();
        } catch (error) {
            console.error('❌ Failed to initialize Telegram Bot:', error);
        }
    }

    private setupListeners() {
        if (!this.bot) return;

        // Handle incoming text messages
        this.bot.on('message', async (msg) => {
            // Ignore group messages for now, only DMs
            if (msg.chat.type !== 'private') return;

            // Ignore messages from self (shouldn't happen in polling but good practice)
            if (msg.from?.is_bot) return;

            await this.handleIncomingMessage(msg);
        });

        // Error handling
        this.bot.on('polling_error', (error) => {
            console.error('Telegram Polling Error:', error);
        });
    }

    private async handleIncomingMessage(msg: TelegramBot.Message) {
        if (!msg.text && !msg.photo && !msg.voice) return; // Only handle text/photo/voice for now

        const chatId = msg.chat.id.toString(); // Use string for consistency
        const contactName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'Unknown Telegram User';
        const contactUsername = msg.from?.username;
        const text = msg.text || (msg.caption ? `[Media with caption] ${msg.caption}` : '[Media Message]');

        console.log(`📩 Telegram Message from ${contactName} (${chatId}): ${text}`);

        try {
            // 1. Get or Create Contact
            let contact = await db.select().from(contacts).where(eq(contacts.phone, chatId)).then(rows => rows[0]);

            if (!contact) {
                console.log(`👤 Creating new Telegram contact: ${contactName}`);
                const result = await db.insert(contacts).values({
                    phone: chatId, // Reusing phone column for Chat ID
                    name: contactName,
                    type: 'individual',
                    platform: 'telegram',
                    trustLevel: 1,
                    lastSeenAt: new Date(),
                    createdAt: new Date()
                } as any).returning();
                contact = result[0];
            } else {
                // Update last seen
                await db.update(contacts).set({ lastSeenAt: new Date() }).where(eq(contacts.phone, chatId));
            }

            // 2. Log Incoming Message
            await db.insert(messageLogs).values({
                contactPhone: chatId,
                role: 'user',
                content: text,
                type: 'text',
                platform: 'telegram',
                createdAt: new Date()
            } as any);

            // 3. Process with AI
            await this.processMessage(chatId, text, contact);

        } catch (error) {
            console.error('Error handling Telegram message:', error);
        }
    }

    private async processMessage(chatId: string, text: string, contact: any) {
        if (!this.messageSender) return;

        // Simulate typing
        await this.bot?.sendChatAction(Number(chatId), 'typing');

        try {
            // 4. Load History
            const historyLogs = await db.select()
                .from(messageLogs)
                .where(eq(messageLogs.contactPhone, chatId))
                .orderBy(desc(messageLogs.createdAt))
                .limit(10);

            const history = historyLogs.reverse().map(m => `${m.role === 'agent' ? 'Me' : 'Them'}: ${m.content}`);

            // 5. Generate Response
            const isOwner = chatId === config.telegramChatId; // Check if user matches configured owner ID
            const userRoleContext = isOwner ?
                `⚠️ IMPORTANT: You are chatting with the OWNER (Boss). You have full access to all tools including summaries, system status, and analytics. Obey all commands.` :
                `Contact Name: ${contact.name || "Unknown"}\nSummary: ${contact.summary}\nTrust Level: ${contact.trustLevel}`;

            // Identity Validation Logic
            let systemPrompt: string | undefined = undefined;
            if (!contact.isVerified && !isOwner) {
                const currentName = contact.name || 'Unknown';
                // Using IdentityValidator helper to generate a prompt that forces the AI to ask for the name
                const { IdentityValidator } = await import('../utils/identityValidator');
                systemPrompt = IdentityValidator.getIdentityPrompt(currentName);
                console.log(`🔒 Identity Verification Mode Active for ${chatId}`);
            }

            // Helper to remove nulls
            const sanitizeProfile = (profile: any) => {
                if (!profile) return undefined;
                const sanitized: any = {};
                for (const [key, value] of Object.entries(profile)) {
                    if (value !== null) sanitized[key] = value;
                }
                return sanitized;
            };

            const currentAiProfile = await db.select().from(aiProfile).then(res => res[0]);
            const currentUserProfile = await db.select().from(userProfile).then(res => res[0]);

            let geminiResponse = await geminiService.generateReply(
                history.concat(`Them: ${text}`),
                userRoleContext,
                isOwner,
                sanitizeProfile(currentAiProfile),
                sanitizeProfile(currentUserProfile),
                systemPrompt
            );

            // 6. Handle Tool Calls
            const MAX_TOOL_DEPTH = 5;
            let toolDepth = 0;

            while (geminiResponse.type === 'tool_call' && geminiResponse.functionCall && toolDepth < MAX_TOOL_DEPTH) {
                const { name, args } = geminiResponse.functionCall;
                console.log(`🛠️ Tool Execution: ${name}`);

                // Execute Tool
                let toolResult;
                try {
                    // Pass context to tools
                    toolResult = await executeLocalTool(name, args, { contact, userProfile: currentUserProfile });
                } catch (toolError: any) {
                    console.error(`Tool error:`, toolError.message);
                    toolResult = { error: "Tool failed: " + toolError.message };
                }

                // Feed result back
                const toolOutputText = `[System: Tool '${name}' returned: ${JSON.stringify(toolResult)}]`;

                geminiResponse = await geminiService.generateReply(
                    history.concat(`Them: ${text}`, toolOutputText),
                    userRoleContext,
                    isOwner,
                    sanitizeProfile(currentAiProfile),
                    sanitizeProfile(currentUserProfile),
                    systemPrompt
                );

                toolDepth++;
            }

            // 7. Send Final Response
            if (geminiResponse.type === 'text' && geminiResponse.content) {
                await this.sendResponseAndLog(chatId, geminiResponse.content, contact);
            }

        } catch (error) {
            console.error('Error serving AI response:', error);
            await this.messageSender.sendText(chatId, "I'm having a bit of trouble thinking right now. Please try again later.");
        }
    }

    private async sendResponseAndLog(chatId: string, responseText: string, contact: any) {
        if (!this.messageSender) return;

        let finalResponse = responseText;
        let shouldEndSession = false;

        // Check for Closing Tag
        if (responseText.includes('#END_SESSION#')) {
            shouldEndSession = true;
            finalResponse = responseText.replace('#END_SESSION#', '').trim();
        }

        // Send response
        await this.messageSender.sendText(chatId, finalResponse);

        // Log Outgoing Message
        await db.insert(messageLogs).values({
            contactPhone: chatId,
            role: 'agent',
            content: finalResponse,
            type: 'text',
            platform: 'telegram',
            createdAt: new Date()
        } as any);

        // Manage Session using ConversationManager
        if (shouldEndSession) {
            this.conversationManager.endConversation(chatId);
        } else {
            this.conversationManager.touchConversation(chatId);
        }
    }

    async shutdown() {
        if (this.bot) {
            console.log('🛑 Stopping Telegram Bot...');
            await this.bot.stopPolling();
        }
    }
}
