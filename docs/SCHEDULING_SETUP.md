# 📅 Customer Scheduling Setup Guide

Enable your customers to book meetings with you directly through WhatsApp! The AI agent will check your calendar, find available slots, and create Google Meet links automatically.

---

## Features

✅ **Automatic Availability Checking** - AI scans your calendar for free slots  
✅ **Smart Scheduling** - Respects working hours and buffer times  
✅ **Google Meet Integration** - Auto-generates video call links  
✅ **Conflict Prevention** - Won't double-book your time  
✅ **Flexible Configuration** - Customize working hours, meeting durations, etc.

---

## Prerequisites

Before you start, make sure you have:
1. ✅ Completed the [Calendar Permissions Upgrade](./CALENDAR_PERMISSIONS_UPGRADE.md)
2. ✅ Service account with **"Make changes to events"** permission
3. ✅ `service-account.json` file in your project root

---

## Configuration

### 1. Update Your `.env` File

Add these variables to your `.env` file:

```env
# Your Google Calendar email
GOOGLE_CALENDAR_ID=your.email@gmail.com

# Working hours (24-hour format)
WORKING_HOURS_START=09:00
WORKING_HOURS_END=18:00

# Minimum meeting duration (minutes)
MIN_MEETING_DURATION=10

# Buffer time between meetings (minutes)
BUFFER_TIME=15

# Days to allow bookings (1=Mon, 7=Sun)
BOOKING_DAYS=1,2,3,4,5
```

### 2. Customize Your Settings

**Working Hours:**
- `WORKING_HOURS_START`: When your workday begins (e.g., `09:00` for 9 AM)
- `WORKING_HOURS_END`: When your workday ends (e.g., `18:00` for 6 PM)

**Meeting Settings:**
- `MIN_MEETING_DURATION`: Shortest meeting allowed (default: 10 minutes)
- `BUFFER_TIME`: Gap between meetings (default: 15 minutes)

**Booking Days:**
- `1` = Monday, `2` = Tuesday, ..., `7` = Sunday
- Example: `1,2,3,4,5` = Monday to Friday only
- Example: `1,3,5` = Monday, Wednesday, Friday only

---

## How It Works

### Customer Experience

**Customer:** "I'd like to schedule a call with you tomorrow"

**AI Agent:**
1. Checks your calendar for tomorrow
2. Finds available slots (e.g., 10:00 AM, 2:00 PM, 4:30 PM)
3. Presents options to customer

**Customer:** "Let's do 2:00 PM"

**AI Agent:**
1. Confirms the slot is still available
2. Creates calendar event with Google Meet link
3. Sends link to customer: "✅ Meeting booked! Join here: [Google Meet Link]"

### What Gets Created

When a meeting is scheduled, the AI creates:
- 📅 **Calendar Event** on your Google Calendar
- 🎥 **Google Meet Link** (automatically generated)
- 📧 **Email Reminder** (if customer provides email)
- 📱 **WhatsApp Confirmation** with all details

---

## Example Conversations

### Scenario 1: Simple Booking

```
Customer: "Can I book a 30-minute call tomorrow?"

AI: "Let me check my availability for tomorrow...

I have these slots available:
- 10:00 AM
- 11:30 AM
- 2:00 PM
- 4:00 PM

Which time works best for you?"

Customer: "2pm please"

AI: "Perfect! What's the purpose of our meeting?"

Customer: "Product demo"

AI: "Great! Could you share your email for the calendar invite?"

Customer: "john@example.com"

AI: "✅ Meeting scheduled!

📅 Date: January 29, 2026
🕐 Time: 2:00 PM
⏱️ Duration: 30 minutes
🎥 Google Meet: https://meet.google.com/abc-defg-hij

I've sent a calendar invite to john@example.com. See you then!"
```

### Scenario 2: Checking Multiple Days

```
Customer: "When are you free this week?"

AI: "Let me check my availability for this week...

**Tuesday, Jan 28:**
- 9:00 AM, 11:00 AM, 3:30 PM

**Wednesday, Jan 29:**
- 10:00 AM, 2:00 PM, 4:00 PM

**Thursday, Jan 30:**
- 9:30 AM, 1:00 PM, 5:00 PM

**Friday, Jan 31:**
- Fully booked

Which day and time works for you?"
```

### Scenario 3: Handling Conflicts

```
Customer: "I need a meeting tomorrow at 10am"

AI: "Let me check... I'm already booked at 10:00 AM tomorrow.

However, I have these nearby slots:
- 9:00 AM
- 11:30 AM
- 2:00 PM

Would any of these work instead?"
```

---

## Testing Your Setup

### 1. Restart Your Bot

```bash
npm run dev
```

### 2. Send Test Messages

Try these commands via WhatsApp:

**Test 1: Check Availability**
```
"Are you free tomorrow?"
```

**Test 2: Book a Meeting**
```
"I'd like to schedule a 15-minute call for tomorrow at 2pm"
```

**Test 3: Check This Week**
```
"When can we meet this week?"
```

### 3. Verify in Google Calendar

1. Open [Google Calendar](https://calendar.google.com/)
2. Check that the event was created
3. Click the event to see the Google Meet link
4. Test the Meet link (it should work!)

---

## Advanced Features

### Custom Meeting Durations

Customers can request specific durations:
- "I need a 10-minute quick call"
- "Can we do a 1-hour consultation?"

The AI will automatically adjust the search for slots that fit.

### Email Integration

If customers provide their email, they'll receive:
- Google Calendar invite
- Email reminders (60 min before, 15 min before)

### Phone Number Tracking

The AI automatically includes the customer's WhatsApp number in the event description for easy reference.

---

## Troubleshooting

### "Unable to check availability"

**Cause:** Calendar permissions issue

**Fix:**
1. Verify `service-account.json` exists in project root
2. Check that calendar is shared with service account
3. Ensure permission is "Make changes to events" (not just "See all event details")

---

### "No available slots for this day"

**Causes:**
- Day is outside `BOOKING_DAYS` (e.g., trying to book on Sunday when only Mon-Fri allowed)
- All slots are booked
- Working hours don't allow for the requested duration

**Fix:**
- Check your `BOOKING_DAYS` setting
- Extend `WORKING_HOURS_END` if needed
- Clear some calendar events to free up slots

---

### "Failed to create meeting"

**Cause:** Service account doesn't have write permission

**Fix:**
1. Go to Google Calendar settings
2. Find service account in "Share with specific people"
3. Change permission to **"Make changes to events"**
4. Restart the bot

---

### Google Meet link not generated

**Cause:** Conference data not enabled

**Fix:**
- This should work automatically with the updated code
- If still failing, check Google Workspace settings (some organizations disable Meet)
- Verify the service account has proper Calendar API access

---

## Privacy & Security

🔒 **Your calendar data is safe:**
- Service account only accesses YOUR calendar (the one you shared)
- No customer data is stored in Google (only in your local database)
- Meet links are unique and secure
- You can revoke access anytime by unsharing the calendar

---

## Tips for Best Results

1. **Keep your calendar updated** - Block personal time so customers don't book during it
2. **Use buffer time** - The 15-minute buffer prevents back-to-back meetings
3. **Set realistic working hours** - Don't make yourself available 24/7
4. **Ask for emails** - Calendar invites work better with email addresses
5. **Test regularly** - Make sure the integration stays working

---

## What's Next?

Once scheduling is working, you can:
- 📊 Track meeting analytics (who books most, peak times, etc.)
- 🔔 Get notified when someone books a meeting
- 📧 Send automated follow-up messages after meetings
- 💰 Integrate payment for paid consultations

---

**Need help?** Check the main [README](../README.md) or review the [Calendar Permissions Upgrade Guide](./CALENDAR_PERMISSIONS_UPGRADE.md).

Happy scheduling! 🚀
