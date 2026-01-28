/**
 * Gemini Function Declarations
 * These define the "Toolbox" the AI can use.
 */

import { googleCalendar } from '../googleCalendar';
import { db } from '../../database';
import { messageLogs } from '../../database/schema';
import { ilike, desc } from 'drizzle-orm';
import * as ownerTools from './ownerTools';
import { webScraper } from '../webScraper';

export const AI_TOOLS = [
    {
        functionDeclarations: [
            {
                name: "update_contact_info",
                description: "Update the contact's name, summary, or trust level in the database when new information is learned.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        name: { type: "STRING", description: "The confirmed name of the contact." },
                        summary_addition: { type: "STRING", description: "New critical info to append to their bio (e.g. 'Is a lawyer', 'Birthday Oct 5')." },
                        trust_level: { type: "NUMBER", description: "New trust level (0-10) if changed." }
                    },
                    required: ["summary_addition"]
                }
            },
            {
                name: "check_schedule",
                description: "Check the owner's calendar alignment when asked about availability.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        day: { type: "STRING", description: "Day of the week or date to check (e.g. 'Monday', '2023-10-25')." },
                        time_range: { type: "STRING", description: "Time range (e.g. 'morning', '2pm-4pm')." }
                    },
                    required: ["day"]
                }
            },
            {
                name: "search_messages",
                description: "Search the database of past messages for a specific keyword or topic.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        query: { type: "STRING", description: "The keyword to search for (e.g. 'price', 'address', 'appointment')." },
                        limit: { type: "NUMBER", description: "Max number of results (default 5)." }
                    },
                    required: ["query"]
                }
            },
            {
                name: "get_daily_summary",
                description: "Generate a summary of conversations for a specific date. OWNER ONLY.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        date: { type: "STRING", description: "Date to summarize (YYYY-MM-DD). Defaults to today." }
                    },
                    required: []
                }
            },
            {
                name: "search_all_conversations",
                description: "Search ALL conversations across all contacts. OWNER ONLY.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        query: { type: "STRING", description: "Keyword to search for." },
                        limit: { type: "NUMBER", description: "Max results (default 10)." }
                    },
                    required: ["query"]
                }
            },
            {
                name: "get_recent_conversations",
                description: "Get list of recent conversations with all contacts. OWNER ONLY.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        limit: { type: "NUMBER", description: "Number of conversations (default 10)." }
                    },
                    required: []
                }
            },
            {
                name: "get_system_status",
                description: "Check agent health, queue size, and database stats. OWNER ONLY.",
                parameters: {
                    type: "OBJECT",
                    properties: {},
                    required: []
                }
            },
            {
                name: "get_analytics",
                description: "Get conversation analytics for the last 7 days. OWNER ONLY.",
                parameters: {
                    type: "OBJECT",
                    properties: {},
                    required: []
                }
            },
            {
                name: "get_current_time",
                description: "Get the current date and time. Use this when you need to know what time it is now, or to provide time-aware responses.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        timezone: { type: "STRING", description: "Optional timezone (e.g. 'America/New_York', 'Europe/London'). Defaults to system timezone." }
                    },
                    required: []
                }
            },
            {
                name: "check_availability",
                description: "Check the owner's calendar for available meeting slots on a specific date. Use this when a customer asks about availability or wants to schedule a meeting.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        date: {
                            type: "STRING",
                            description: "Date to check (YYYY-MM-DD, 'today', or 'tomorrow'). Example: '2026-01-29' or 'tomorrow'"
                        },
                        duration: {
                            type: "NUMBER",
                            description: "Meeting duration in minutes (default: 30). Common values: 10, 15, 30, 60"
                        }
                    },
                    required: ["date"]
                }
            },
            {
                name: "schedule_meeting",
                description: "Book a meeting slot on the owner's calendar and generate a Google Meet link. ONLY use this AFTER confirming availability with check_availability and getting customer confirmation.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        date: {
                            type: "STRING",
                            description: "Meeting date in YYYY-MM-DD format. Example: '2026-01-29'"
                        },
                        time: {
                            type: "STRING",
                            description: "Start time in HH:MM format (24-hour). Example: '14:30' for 2:30 PM"
                        },
                        duration: {
                            type: "NUMBER",
                            description: "Meeting duration in minutes. Example: 30"
                        },
                        customer_name: {
                            type: "STRING",
                            description: "Customer's full name"
                        },
                        customer_email: {
                            type: "STRING",
                            description: "Customer's email address (optional, but recommended for calendar invites)"
                        },
                        purpose: {
                            type: "STRING",
                            description: "Brief description of the meeting purpose. Example: 'Product demo' or 'Consultation call'"
                        }
                    },
                    required: ["date", "time", "duration", "customer_name", "purpose"]
                }
            },
            {
                name: "browse_url",
                description: "Fetch and extract content from a website URL. ONLY use this when the user explicitly requests information that requires browsing external websites (e.g., 'check the news', 'what is the price of X'). Do NOT use for general knowledge queries the AI can answer itself.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        url: {
                            type: "STRING",
                            description: "The full URL to fetch (e.g., 'https://example.com/article'). Must be a valid http or https URL."
                        },
                        extract_type: {
                            type: "STRING",
                            description: "What to extract: 'metadata' (title + description only), 'summary' (title + first paragraphs, default), or 'full' (entire page content)."
                        }
                    },
                    required: ["url"]
                }
            },
            {
                name: "search_web",
                description: "Search for information on any topic by intelligently determining the best source URL. Use this when the user asks for current information on news, sports, finance, weather, geopolitics, or any topic requiring real-time data. The AI will automatically find and browse the appropriate website.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        query: {
                            type: "STRING",
                            description: "The search query or topic (e.g., 'latest AI news', 'Bitcoin price', 'weather in Nairobi', 'Premier League scores')"
                        },
                        category: {
                            type: "STRING",
                            description: "Optional category hint: 'news', 'sports', 'finance', 'weather', 'tech', or 'general'. Helps determine the best source."
                        }
                    },
                    required: ["query"]
                }
            }
        ]
    }
];

// Helper to execute tools locally
export async function executeLocalTool(name: string, args: any, context: any) {
    console.log(`🛠️ Executing Tool: ${name}`, args);

    switch (name) {
        case 'update_contact_info':
            return { result: "Contact info updated. You can confirm this to the user." };

        case 'check_schedule':
            return await googleCalendar.listEvents(args.day || 'today');

        case 'search_messages':
            try {
                const results = await db.select()
                    .from(messageLogs)
                    .where(ilike(messageLogs.content, `%${args.query}%`))
                    .orderBy(desc(messageLogs.createdAt))
                    .limit(args.limit || 5);

                if (results.length === 0) return { result: "No messages found matching that query." };

                return {
                    result: results.map(r => `[${r.createdAt?.toISOString()}] ${r.role}: ${r.content}`).join('\n')
                };
            } catch (e) {
                console.error(e);
                return { error: "Database search failed." };
            }

        // Owner-only tools
        case 'get_daily_summary':
            return { result: await ownerTools.getDailySummary(args.date) };

        case 'search_all_conversations':
            return { result: await ownerTools.searchConversations(args.query, args.limit || 10) };

        case 'get_recent_conversations':
            return { result: await ownerTools.getRecentConversations(args.limit || 10) };

        case 'get_system_status':
            return { result: await ownerTools.getSystemStatus() };

        case 'get_analytics':
            return { result: await ownerTools.getAnalytics() };

        case 'check_availability':
            try {
                const { date, duration } = args;
                console.log(`📅 Checking availability for ${date} (${duration || 'default'} min)`);
                const slots = await googleCalendar.findAvailableSlots(date, duration);

                if (slots.length === 0 || slots[0].includes('No')) {
                    return { result: slots[0] };
                }

                return {
                    result: `Available slots for ${date}:\n${slots.slice(0, 10).join(', ')}${slots.length > 10 ? ` (and ${slots.length - 10} more)` : ''}`
                };
            } catch (e: any) {
                console.error('Check availability error:', e);
                return { error: `Failed to check availability: ${e.message}` };
            }

        case 'schedule_meeting':
            try {
                const { date, time, duration, customer_name, customer_email, purpose } = args;

                // Get customer phone from context if available
                const customerPhone = context?.contact?.phone;

                console.log(`📅 Scheduling meeting for ${customer_name} on ${date} at ${time}`);

                const result = await googleCalendar.createMeeting({
                    date,
                    time,
                    duration,
                    customerName: customer_name,
                    customerEmail: customer_email,
                    purpose,
                    customerPhone
                });

                if (result.success) {
                    return {
                        result: `✅ Meeting scheduled successfully!\n\nDate: ${date}\nTime: ${time}\nDuration: ${duration} minutes\nGoogle Meet Link: ${result.meetLink}\n\nEvent ID: ${result.eventId}`
                    };
                } else {
                    return { error: `Failed to schedule meeting: ${result.error}` };
                }
            } catch (e: any) {
                console.error('Schedule meeting error:', e);
                return { error: `Failed to schedule meeting: ${e.message}` };
            }

        case 'get_current_time':
            try {
                const now = new Date();

                // Priority: 1. Explicit timezone argument, 2. User's profile timezone, 3. System timezone
                const userTimezone = context?.userProfile?.timezone;
                const timezone = args.timezone || userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

                console.log(`🕐 Getting time for timezone: ${timezone}${userTimezone ? ' (from user profile)' : ''}`);

                // Format the date and time
                const options: Intl.DateTimeFormatOptions = {
                    timeZone: timezone,
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    timeZoneName: 'short'
                };

                const formattedTime = now.toLocaleString('en-US', options);

                return {
                    result: `Current time: ${formattedTime}\nTimezone: ${timezone}\nISO: ${now.toISOString()}`
                };
            } catch (e) {
                console.error('Error getting current time:', e);
                return {
                    result: `Current time: ${new Date().toLocaleString()}\nTimezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
                };
            }

        case 'browse_url':
            try {
                const { url, extract_type = 'summary' } = args;
                console.log(`🌐 Browsing URL: ${url} (extract: ${extract_type})`);
                const content = await webScraper.scrapeUrl(url, extract_type);
                return { result: content };
            } catch (e: any) {
                console.error('Browse URL error:', e.message);
                return { error: `Failed to browse URL: ${e.message}` };
            }

        case 'search_web':
            try {
                const { query, category } = args;
                console.log(`🔍 Web search: "${query}"${category ? ` (category: ${category})` : ''}`);
                const content = await webScraper.searchWeb(query, category);
                return { result: content };
            } catch (e: any) {
                console.error('Search web error:', e.message);
                return { error: `Failed to search web: ${e.message}` };
            }

        default:
            return { error: "Tool not found." };
    }
}
