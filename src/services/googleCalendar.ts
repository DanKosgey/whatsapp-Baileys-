import { google } from 'googleapis';
import { config } from '../config/env';
import path from 'path';

export class GoogleCalendarService {
    private calendar: any;
    private calendarId: string;
    private workingHoursStart: string;
    private workingHoursEnd: string;
    private minMeetingDuration: number;
    private bufferTime: number;
    private bookingDays: number[];

    constructor() {
        this.calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

        console.log(`📅 Google Calendar Service Initialized with ID: "${this.calendarId}"`);

        // Scheduling configuration from environment
        this.workingHoursStart = process.env.WORKING_HOURS_START || '09:00';
        this.workingHoursEnd = process.env.WORKING_HOURS_END || '18:00';
        this.minMeetingDuration = parseInt(process.env.MIN_MEETING_DURATION || '10');
        this.bufferTime = parseInt(process.env.BUFFER_TIME || '15');
        this.bookingDays = process.env.BOOKING_DAYS
            ? process.env.BOOKING_DAYS.split(',').map(d => parseInt(d.trim()))
            : [1, 2, 3, 4, 5]; // Mon-Fri by default


        // Path to your service account key file
        const keyFilePath = path.join(process.cwd(), 'service-account.json');

        // Check if file exists
        const fs = require('fs');
        if (!fs.existsSync(keyFilePath)) {
            console.warn('⚠️  service-account.json not found. Calendar features will be disabled.');
            console.warn('   To enable: Place service-account.json in the project root directory.');
            // Initialize with a dummy auth that will fail gracefully
            this.calendar = null;
            return;
        }

        const auth = new google.auth.GoogleAuth({
            keyFile: keyFilePath,
            scopes: ['https://www.googleapis.com/auth/calendar.events'], // Upgraded from readonly
        });

        this.calendar = google.calendar({ version: 'v3', auth });
    }

    async listEvents(dateSpecifier: string): Promise<string> {
        if (!this.calendar) {
            return "Calendar integration not configured. Please contact the owner directly to schedule.";
        }

        try {
            const { timeMin, timeMax } = this.parseDate(dateSpecifier);

            console.log(`📅 Fetching events for ${dateSpecifier} (${timeMin} - ${timeMax})`);

            const res = await this.calendar.events.list({
                calendarId: this.calendarId,
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
            });

            const events = res.data.items;
            if (!events || events.length === 0) {
                return `No events found for ${dateSpecifier}.`;
            }

            return events.map((event: any) => {
                const start = event.start.dateTime || event.start.date;
                const end = event.end.dateTime || event.end.date;
                // Simple formatting
                const timeStr = event.start.dateTime
                    ? `${new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'All Day';

                return `- [${timeStr}] ${event.summary}`;
            }).join('\n');

        } catch (error) {
            console.error('Calendar Error:', error);
            // Fallback for demo if users haven't set up keys yet
            return "Unable to access calendar (Check credentials). Assuming Free.";
        }
    }

    private parseDate(specifier: string): { timeMin: Date, timeMax: Date } {
        const now = new Date();
        const lower = specifier.toLowerCase();

        let targetDate = new Date();

        if (lower.includes('tomorrow')) {
            targetDate.setDate(now.getDate() + 1);
        } else if (lower.includes('today')) {
            // targetDate is already now
        } else {
            // Try parse logic or AI might pass specific date
            // For MVP, default to today/tomorrow logic or basic check
        }

        const timeMin = new Date(targetDate.setHours(0, 0, 0, 0));
        const timeMax = new Date(targetDate.setHours(23, 59, 59, 999));

        return { timeMin, timeMax };
    }

    /**
     * Find available time slots for a given date
     * @param dateSpecifier - Date string (YYYY-MM-DD, 'today', 'tomorrow')
     * @param durationMinutes - Meeting duration in minutes (defaults to minMeetingDuration)
     * @returns Array of available time slots as strings
     */
    async findAvailableSlots(dateSpecifier: string, durationMinutes?: number): Promise<string[]> {
        if (!this.calendar) {
            return ['Calendar integration not configured. Please contact the owner directly.'];
        }

        try {
            const duration = durationMinutes || this.minMeetingDuration;
            const { timeMin, timeMax } = this.parseDate(dateSpecifier);

            // Check if the day is a valid booking day
            const dayOfWeek = timeMin.getDay() || 7; // Convert Sunday (0) to 7
            if (!this.bookingDays.includes(dayOfWeek)) {
                return [`No bookings available on ${timeMin.toLocaleDateString('en-US', { weekday: 'long' })}`];
            }

            console.log(`📅 Finding available slots for ${dateSpecifier} (duration: ${duration} min)`);

            // Fetch existing events
            const res = await this.calendar.events.list({
                calendarId: this.calendarId,
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
            });

            const events = res.data.items || [];

            // Parse working hours
            const [startHour, startMin] = this.workingHoursStart.split(':').map(Number);
            const [endHour, endMin] = this.workingHoursEnd.split(':').map(Number);

            const workStart = new Date(timeMin);
            workStart.setHours(startHour, startMin, 0, 0);

            const workEnd = new Date(timeMin);
            workEnd.setHours(endHour, endMin, 0, 0);

            // If the date is today, start from current time if it's later than work start
            const now = new Date();
            if (timeMin.toDateString() === now.toDateString() && now > workStart) {
                // Round up to next 15-minute interval
                const minutes = now.getMinutes();
                const roundedMinutes = Math.ceil(minutes / 15) * 15;
                workStart.setHours(now.getHours(), roundedMinutes, 0, 0);
            }

            // Build list of busy periods
            const busyPeriods: Array<{ start: Date; end: Date }> = events
                .filter((event: any) => event.start.dateTime && event.end.dateTime)
                .map((event: any) => ({
                    start: new Date(event.start.dateTime),
                    end: new Date(event.end.dateTime),
                }));

            // Find free slots
            const freeSlots: string[] = [];
            let currentTime = new Date(workStart);

            while (currentTime < workEnd) {
                const slotEnd = new Date(currentTime.getTime() + duration * 60000);

                // Check if this slot extends beyond working hours
                if (slotEnd > workEnd) break;

                // Check if this slot conflicts with any busy period
                const hasConflict = busyPeriods.some(busy => {
                    const slotStart = currentTime.getTime();
                    const slotEndTime = slotEnd.getTime() + this.bufferTime * 60000; // Add buffer
                    const busyStart = busy.start.getTime();
                    const busyEnd = busy.end.getTime();

                    return (slotStart < busyEnd && slotEndTime > busyStart);
                });

                if (!hasConflict) {
                    freeSlots.push(currentTime.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    }));
                }

                // Move to next slot (15-minute intervals)
                currentTime = new Date(currentTime.getTime() + 15 * 60000);
            }

            if (freeSlots.length === 0) {
                return ['No available slots for this day'];
            }

            return freeSlots;

        } catch (error) {
            console.error('Error finding available slots:', error);
            return ['Unable to check availability. Please try again.'];
        }
    }

    /**
     * Create a meeting event with Google Meet link
     * @param params - Meeting details
     * @returns Object with success status, event details, and Meet link
     */
    async createMeeting(params: {
        date: string;
        time: string;
        duration: number;
        customerName: string;
        customerEmail?: string;
        purpose: string;
        customerPhone?: string;
    }): Promise<{ success: boolean; meetLink?: string; eventId?: string; error?: string }> {
        if (!this.calendar) {
            return {
                success: false,
                error: 'Calendar integration not configured. Please contact the owner directly to schedule.'
            };
        }

        try {
            // Parse date and time
            const [hours, minutes] = params.time.split(':').map(Number);
            const startDate = new Date(params.date);
            startDate.setHours(hours, minutes, 0, 0);

            const endDate = new Date(startDate.getTime() + params.duration * 60000);

            console.log(`📅 Creating meeting: ${params.customerName} on ${startDate.toISOString()}`);

            // Build event object
            const event = {
                summary: `Meeting with ${params.customerName}`,
                description: `Purpose: ${params.purpose}

Customer Details:
- Name: ${params.customerName}
- Phone: ${params.customerPhone || 'N/A'}
- Email: ${params.customerEmail || 'N/A'}

Scheduled via WhatsApp AI Agent`,
                start: {
                    dateTime: startDate.toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
                end: {
                    dateTime: endDate.toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },

                conferenceData: {
                    createRequest: {
                        requestId: `whatsapp-${Date.now()}`,
                        conferenceSolutionKey: { type: 'hangoutsMeet' },
                    },
                },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'popup', minutes: 15 },
                    ],
                },
            };

            // Create the event (try with Google Meet first, fallback without if it fails)
            let response;
            console.log(`🔍 Inserting event into calendar: "${this.calendarId}"`);

            try {
                response = await this.calendar.events.insert({
                    calendarId: this.calendarId,
                    resource: event,
                    conferenceDataVersion: 1, // Required for Google Meet link generation
                });
            } catch (conferenceError: any) {
                // If Google Meet creation fails (common with service accounts), create without it
                console.log('⚠️  Google Meet creation failed, creating event without conference link...');
                const { conferenceData, ...eventWithoutConference } = event;
                response = await this.calendar.events.insert({
                    calendarId: this.calendarId,
                    resource: eventWithoutConference,
                });
            }

            const meetLink = response.data.hangoutLink || response.data.conferenceData?.entryPoints?.[0]?.uri;

            if (meetLink) {
                console.log(`✅ Meeting created with Google Meet! Event ID: ${response.data.id}, Meet Link: ${meetLink}`);
            } else {
                console.log(`✅ Meeting created! Event ID: ${response.data.id} (No Google Meet link - you can add one manually in Google Calendar)`);
            }

            return {
                success: true,
                meetLink: meetLink,
                eventId: response.data.id,
            };

        } catch (error: any) {
            console.error('Error creating meeting:', error);
            return {
                success: false,
                error: error.message || 'Failed to create meeting',
            };
        }
    }
}

export const googleCalendar = new GoogleCalendarService();

