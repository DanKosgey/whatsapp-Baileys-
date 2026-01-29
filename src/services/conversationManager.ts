import { db } from '../database';
import { conversations, messageLogs, contacts } from '../database/schema';
import { eq, and, desc } from 'drizzle-orm';
import { geminiService } from './ai/gemini';
// import { MessageSender } from '../utils/messageSender'; // Removing direct dependency if possible or using union
import { config } from '../config/env';

export class ConversationManager {
    private activeTimers: Map<string, NodeJS.Timeout> = new Map();
    private CONVERSATION_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

    constructor() { } // Removed MessageSender dependency from constructor as it wasn't used

    /**
     * Called whenever a message is received or sent.
     * Manages the "Active" state of a conversation.
     */
    async touchConversation(contactPhone: string) {
        // 1. Clear existing timeout if any
        if (this.activeTimers.has(contactPhone)) {
            clearTimeout(this.activeTimers.get(contactPhone));
        }

        // 2. Ensure there is an active conversation record in DB
        const activeConv = await db.select().from(conversations)
            .where(and(eq(conversations.contactPhone, contactPhone), eq(conversations.status, 'active')))
            .then(res => res[0]);

        if (!activeConv) {
            console.log(`🆕 Starting new conversation session for ${contactPhone}`);
            await db.insert(conversations).values({
                contactPhone,
                status: 'active',
                startedAt: new Date()
            });
        }

        // 3. Set new timeout to detect "End of Conversation"
        const timeout = setTimeout(() => {
            this.endConversation(contactPhone);
        }, this.CONVERSATION_TIMEOUT_MS);

        this.activeTimers.set(contactPhone, timeout);
    }

    /**
     * Triggered when silence is detected (20 mins) or manually closed.
     * Queues the "Smart Snitch" report for async generation.
     */
    async endConversation(contactPhone: string) {
        console.log(`🛑 Conversation ended for ${contactPhone} (Timeout/Closed). Queueing Report...`);

        // Remove timer
        this.activeTimers.delete(contactPhone);

        // 1. Get the conversation ID
        const activeConv = await db.select().from(conversations)
            .where(and(eq(conversations.contactPhone, contactPhone), eq(conversations.status, 'active')))
            .then(res => res[0]);

        if (!activeConv) return;

        // 2. Mark as completed in DB
        await db.update(conversations)
            .set({ status: 'completed', endedAt: new Date() })
            .where(eq(conversations.id, activeConv.id));

        // 3. Get Contact Info
        const contact = await db.select().from(contacts)
            .where(eq(contacts.phone, contactPhone))
            .then(res => res[0]);

        // 4. Get last message time
        const lastMessage = await db.select()
            .from(messageLogs)
            .where(eq(messageLogs.contactPhone, contactPhone))
            .orderBy(desc(messageLogs.createdAt))
            .limit(1)
            .then(res => res[0]);

        // 5. Queue report for async generation (don't block here!)
        const { reportQueueService } = await import('./reportQueueService');
        await reportQueueService.enqueue(
            contactPhone,
            activeConv.id,
            contact?.confirmedName || contact?.originalPushname || 'Unknown',
            lastMessage?.createdAt || undefined
        );

        console.log(`📋 Queued conversation report for ${contactPhone}. Will generate when API keys are available.`);
    }
}
