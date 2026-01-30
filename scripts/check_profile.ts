
import { db } from '../src/database';
import { userProfile } from '../src/database/schema';

async function checkProfile() {
    console.log('🔍 Checking User Profile...');
    const profiles = await db.select().from(userProfile);

    if (profiles.length === 0) {
        console.log('❌ No user profile found!');
    } else {
        console.log('✅ Found Profile:', profiles[0]);
        console.log('🌍 Timezone Setting:', profiles[0].timezone);
    }
    process.exit(0);
}

checkProfile();
