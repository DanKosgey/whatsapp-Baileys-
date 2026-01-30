
import cron, { ScheduledTask } from 'node-cron';
import { eq } from 'drizzle-orm';
import { WhatsAppClient } from '../core/whatsapp';
import { ownerService } from './ownerService';
import { getDailySummary } from './ai/ownerTools';
import { db } from '../database';
import { userProfile } from '../database/schema';

export class SchedulerService {
    private client: WhatsAppClient | undefined;
    private tasks: ScheduledTask[] = [];

    init(client: WhatsAppClient) {
        this.client = client;
        this.start();
    }

    async start() {
        // Stop existing tasks to prevent duplicates
        this.stop();

        console.log('⏰ Starting Scheduler Service...');

        // Fetch owner's timezone
        let timezone = 'UTC'; // Default fallback
        try {
            const ownerPhone = ownerService.getOwnerPhone();
            if (ownerPhone) {
                // Try to find profile by phone
                const profiles = await db.select().from(userProfile).where(eq(userProfile.phone, ownerPhone)).limit(1);
                if (profiles.length > 0 && profiles[0].timezone) {
                    timezone = profiles[0].timezone;
                    console.log(`🌍 Scheduler using owner's timezone: ${timezone}`);
                } else {
                    // Fallback: try to find ANY profile with a timezone (assuming single user mode)
                    const anyProfile = await db.select().from(userProfile).limit(1);
                    if (anyProfile.length > 0 && anyProfile[0].timezone) {
                        timezone = anyProfile[0].timezone;
                        console.log(`🌍 Scheduler using generic profile timezone: ${timezone}`);
                    } else {
                        console.log('⚠️ No timezone found in user profile, defaulting to system time/UTC.');
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error fetching timezone:', error);
        }

        const cronOptions = {
            scheduled: true,
            timezone: timezone
        };

        // 1. Morning Motivation (7:00 AM)
        // Cron format: Minute Hour Day Month DayOfWeek
        const morningTask = cron.schedule('0 7 * * *', async () => {
            console.log('🌅 Running morning motivation task...');
            await this.sendMorningMotivation();
        }, cronOptions);
        this.tasks.push(morningTask);

        // 2. Evening Summary (9:00 PM)
        const eveningTask = cron.schedule('0 21 * * *', async () => {
            console.log('🌙 Running evening summary task...');
            await this.sendEveningSummary();
        }, cronOptions);
        this.tasks.push(eveningTask);

        console.log(`✅ Scheduler initialized with ${this.tasks.length} jobs: Morning (7am), Evening (9pm) in ${timezone}`);
    }

    stop() {
        if (this.tasks.length > 0) {
            console.log(`🛑 Stopping ${this.tasks.length} active scheduler tasks...`);
            this.tasks.forEach(task => task.stop());
            this.tasks = [];
        }
    }

    private async sendMorningMotivation() {
        if (!this.client) return;

        const ownerJid = ownerService.getOwnerJid();
        if (!ownerJid) {
            console.log('⚠️ No owner check found, skipping morning motivation.');
            return;
        }

        try {
            const quotes = [
                "Discipline is doing what needs to be done, even if you don't want to do it.",
                "Your future is created by what you do today, not tomorrow.",
                "Success is the sum of small efforts, repeated day in and day out.",
                "Focus on the goal, not the obstacle.",
                "The only way to do great work is to love what you do.",
                "Don't watch the clock; do what it does. Keep going.",
                "Believe you can and you're halfway there."
            ];
            const quote = quotes[Math.floor(Math.random() * quotes.length)];

            await this.client.sendText(ownerJid, `🌅 *Morning Motivation*\n\n"${quote}"\n\nHave a productive day!`);
            console.log('✅ Sent morning motivation to owner.');
        } catch (error) {
            console.error('Error sending motivation:', error);
        }
    }

    private async sendEveningSummary() {
        if (!this.client) return;

        const ownerJid = ownerService.getOwnerJid();
        if (!ownerJid) {
            console.log('⚠️ No owner check found, skipping evening summary.');
            return;
        }

        try {
            console.log('📊 Generating evening summary...');
            // Calculate yesterday's date if needed, or getDailySummary defaults to today
            const summary = await getDailySummary();

            await this.client.sendText(ownerJid, summary);
            console.log('✅ Sent evening summary to owner.');
        } catch (error) {
            console.error('Error sending evening summary:', error);
        }
    }
}

export const schedulerService = new SchedulerService();
