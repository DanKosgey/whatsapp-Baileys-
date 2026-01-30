
import dotenv from 'dotenv';
dotenv.config();

import { geminiService } from '../src/services/ai/gemini';
import { db } from '../src/database';
import { userProfile } from '../src/database/schema';

async function testGreeting() {
    console.log('🧪 Testing AI Greeting Logic...');

    // 1. Fetch Profile
    const profile = await db.select().from(userProfile).limit(1).then(res => res[0]);
    console.log('👤 loaded Profile:', { name: profile.fullName, timezone: profile.timezone });

    const history = [
        "Them: Good afternoon"
    ]; // User says good afternoon in the morning

    // 2. Generate Reply
    // We need to inspect the system prompt, but it's private.
    // However, we can see if the response corrects us or follows along.

    // Sanitize profile (convert nulls to undefined)
    const sanitize = (obj: any) => {
        const newObj: any = {};
        for (const key in obj) {
            if (obj[key] !== null) newObj[key] = obj[key];
        }
        return newObj;
    };

    console.log('🤖 Generating reply for "Good afternoon"...');
    const response = await geminiService.generateReply(
        history,
        "User is testing time awareness.",
        false, // isOwner
        undefined, // aiProfile
        sanitize(profile) // userProfile
    );

    console.log('\n📝 AI Response:', response.content);

    // Check if it corrects the time
    if (response.content?.toLowerCase().includes('morning')) {
        console.log('✅ PASS: AI acknowledged it is morning.');
    } else {
        console.log('⚠️  FAIL: AI did not correct to morning (or politely ignored).');
    }

    process.exit(0);
}

testGreeting();
