import { pgTable, text, serial, timestamp, boolean, varchar, integer, jsonb, index } from 'drizzle-orm/pg-core'; // Added index import

// 1. Contacts: The Rolodex with Identity Validation
export const contacts = pgTable('contacts', {
    id: serial('id').primaryKey(),
    phone: varchar('phone', { length: 20 }).notNull().unique(), // +254...

    // Identity fields
    originalPushname: text('original_pushname'), // Name from WhatsApp (for reference)
    confirmedName: text('confirmed_name'), // Name the user actually gave
    isVerified: boolean('is_verified').default(false), // Has identity been confirmed?

    // Legacy field (keeping for backward compatibility)
    name: text('name'), // Will be synced with confirmedName

    // Profile & Context
    contextSummary: text('context_summary'), // "John's brother", "Client from Nairobi", etc.
    summary: text('summary'), // AI-generated detailed profile
    trustLevel: integer('trust_level').default(0), // 0-10

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    lastSeenAt: timestamp('last_seen_at').defaultNow(),
}, (table) => {
    return {
        phoneIdx: index('phone_idx').on(table.phone), // Optimize lookup by phone
    };
});

// 2. Message History: The Memory
export const messageLogs = pgTable('message_logs', {
    id: serial('id').primaryKey(),
    contactPhone: varchar('contact_phone', { length: 20 }).references(() => contacts.phone),
    role: varchar('role', { length: 10 }).notNull(), // 'agent' | 'user'
    content: text('content').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
    return {
        contactPhoneIdx: index('contact_phone_idx').on(table.contactPhone), // Optimize history lookup
        createdAtIdx: index('created_at_idx').on(table.createdAt), // Optimize resizing/sorting
    };
});

// 3. Auth Credentials: session persistence
export const authCredentials = pgTable('auth_credentials', {
    key: text('key').primaryKey(),
    value: text('value').notNull(), // JSON stringified auth data
});

// 4. Session Lock: Prevent multiple instances from connecting
export const sessionLock = pgTable('session_lock', {
    id: serial('id').primaryKey(),
    sessionName: varchar('session_name', { length: 100 }).notNull().unique(),
    instanceId: text('instance_id').notNull(), // Unique ID for this process
    lockedAt: timestamp('locked_at').defaultNow(),
    expiresAt: timestamp('expires_at').notNull(), // Auto-expire after 5 minutes
});

// 5. Conversations: The Smart Snitch Sessions
export const conversations = pgTable('conversations', {
    id: serial('id').primaryKey(),
    contactPhone: varchar('contact_phone', { length: 20 }).references(() => contacts.phone),
    status: varchar('status', { length: 20 }).default('active'), // 'active' | 'completed'
    urgency: varchar('urgency', { length: 10 }), // 'red' | 'yellow' | 'green'
    summary: text('summary'), // The "Traffic Light" report content
    startedAt: timestamp('started_at').defaultNow(),
    endedAt: timestamp('ended_at'),
    unreadByOwner: boolean('unread_by_owner').default(true),
});
