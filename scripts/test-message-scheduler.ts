
import dotenv from 'dotenv';
dotenv.config();

import { schedulerService } from '../src/services/scheduler';

async function testMessageScheduler() {
    console.log('🧪 Testing Message Scheduler Timezone Logic\n');

    try {
        console.log('⏳ Starting scheduler service...');
        // We call start() directly. It should query DB for timezone and log it.
        await schedulerService.start();

        console.log('\n✅ Scheduler started successfully.');
        console.log('Check the logs above for "🌍 Scheduler using owner\'s timezone" or fallback message.');

        // Stop tasks to allow process to exit
        schedulerService.stop();
        process.exit(0);

    } catch (error: any) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

testMessageScheduler();
