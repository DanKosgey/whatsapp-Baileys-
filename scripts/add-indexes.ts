
import { db } from '../src/database';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('🚀 Running migration: Adding Indexes...');

    try {
        // 1. Session Lock Table (Already exists, but good to ensure)
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS session_lock (
                id SERIAL PRIMARY KEY,
                session_name VARCHAR(100) NOT NULL UNIQUE,
                instance_id TEXT NOT NULL,
                locked_at TIMESTAMP DEFAULT NOW(),
                expires_at TIMESTAMP NOT NULL
            );
        `);

        // 2. Add Indexes Concurrently (Safe for production)
        // Note: Drizzle kit usually handles this but we want to force it for the fix

        console.log('Creating phone_idx on contacts...');
        await db.execute(sql`CREATE INDEX IF NOT EXISTS phone_idx ON contacts(phone);`);

        console.log('Creating contact_phone_idx on message_logs...');
        await db.execute(sql`CREATE INDEX IF NOT EXISTS contact_phone_idx ON message_logs(contact_phone);`);

        console.log('Creating created_at_idx on message_logs...');
        await db.execute(sql`CREATE INDEX IF NOT EXISTS created_at_idx ON message_logs(created_at);`);

        console.log('✅ Indexes created successfully!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

main();
