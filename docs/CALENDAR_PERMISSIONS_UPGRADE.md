# 🔐 Upgrading Calendar Permissions for Scheduling

This guide shows you how to upgrade your Google Calendar service account from **read-only** to **read-write** permissions, enabling customer scheduling.

---

## Quick Overview

You need to:
1. Delete your old `service-account.json` file
2. Create a new service account with **Calendar Events** scope (not just readonly)
3. Download the new JSON key
4. Re-share your calendar with the new service account

**Time needed:** ~5 minutes

---

## Step-by-Step Instructions

### Step 1: Delete Old Service Account File

1. Navigate to your project folder: `c:\Users\PC\OneDrive\Desktop\w_app agent`
2. **Delete** the file `service-account.json` (or rename it to `service-account-old.json` as backup)

---

### Step 2: Go to Google Cloud Console

1. Open your browser and go to: [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Select your existing project (the one you used before) **OR** create a new one

---

### Step 3: Enable Google Calendar API

1. In the left sidebar, click **"APIs & Services"** → **"Library"**
2. Search for **"Google Calendar API"**
3. Click on it, then click **"Enable"** (if not already enabled)

---

### Step 4: Create New Service Account

1. In the left sidebar, click **"IAM & Admin"** → **"Service Accounts"**
2. Click **"+ CREATE SERVICE ACCOUNT"** at the top

   **Fill in the form:**
   - **Service account name:** `whatsapp-scheduling-agent`
   - **Service account ID:** (auto-filled, leave as is)
   - **Description:** `WhatsApp AI Agent - Calendar Scheduling`

3. Click **"CREATE AND CONTINUE"**
4. **Skip** the "Grant this service account access to project" section (click **"CONTINUE"**)
5. **Skip** the "Grant users access to this service account" section (click **"DONE"**)

---

### Step 5: Generate JSON Key

1. You'll see your new service account in the list. Click on it (the email address).
2. Go to the **"KEYS"** tab at the top
3. Click **"ADD KEY"** → **"Create new key"**
4. Select **"JSON"** format
5. Click **"CREATE"**

   ✅ A file will download automatically (e.g., `whatsapp-scheduling-agent-abc123.json`)

6. **Rename** this file to exactly: `service-account.json`
7. **Move** it to your project folder: `c:\Users\PC\OneDrive\Desktop\w_app agent\service-account.json`

---

### Step 6: Copy Service Account Email

1. In the Google Cloud Console, you should still be viewing your service account
2. **Copy** the email address (it looks like: `whatsapp-scheduling-agent@your-project-123456.iam.gserviceaccount.com`)
3. Keep this handy—you'll need it in the next step

---

### Step 7: Share Your Calendar with the Service Account

1. Open [Google Calendar](https://calendar.google.com/) in a new tab
2. Look at the **left sidebar** under "My calendars"
3. Find your main calendar (usually your name or email)
4. **Hover** over it and click the **3 vertical dots** (⋮) that appear
5. Click **"Settings and sharing"**

6. Scroll down to **"Share with specific people or groups"**
7. Click **"+ Add people and groups"**

8. **Paste** the service account email you copied in Step 6
9. Set permissions to: **"Make changes to events"** (NOT "See all event details")
10. Click **"Send"**

   ✅ You'll see a warning that this is a service account—click **"OK"** to confirm

---

### Step 8: Update Your .env File

1. Open your `.env` file in the project folder
2. Make sure you have this line (replace with YOUR Gmail):

   ```env
   GOOGLE_CALENDAR_ID=your.email@gmail.com
   ```

3. Add these new lines for scheduling configuration:

   ```env
   # Scheduling Configuration
   WORKING_HOURS_START=09:00
   WORKING_HOURS_END=18:00
   MIN_MEETING_DURATION=10
   BUFFER_TIME=15
   BOOKING_DAYS=1,2,3,4,5
   ```

   **What these mean:**
   - `WORKING_HOURS_START`: When your workday starts (24-hour format)
   - `WORKING_HOURS_END`: When your workday ends
   - `MIN_MEETING_DURATION`: Minimum meeting length in minutes (you requested 10 min)
   - `BUFFER_TIME`: Gap between meetings in minutes
   - `BOOKING_DAYS`: Which days to allow bookings (1=Monday, 5=Friday)

4. **Save** the file

---

### Step 9: Restart Your Bot

1. Stop your bot if it's running (Ctrl+C in the terminal)
2. Restart it:

   ```bash
   npm run dev
   ```

3. Watch for any errors related to calendar authentication

---

## Testing the New Permissions

Once the bot is running, send yourself a WhatsApp message:

```
"Am I able to schedule meetings now?"
```

Or test the full flow:

```
"I'd like to book a call with you tomorrow at 2pm"
```

The AI should:
1. ✅ Check your calendar for availability
2. ✅ Create the event if the slot is free
3. ✅ Generate a Google Meet link
4. ✅ Send you the link

---

## Troubleshooting

### Error: "Insufficient Permission"

**Problem:** The service account doesn't have write access to your calendar.

**Solution:**
1. Go back to Google Calendar settings
2. Find the service account in "Share with specific people"
3. Change permission from "See all event details" to **"Make changes to events"**
4. Save and restart the bot

---

### Error: "Calendar not found"

**Problem:** The `GOOGLE_CALENDAR_ID` in your `.env` doesn't match your actual calendar.

**Solution:**
1. Open `.env`
2. Set `GOOGLE_CALENDAR_ID` to your Gmail address (e.g., `yourname@gmail.com`)
3. Restart the bot

---

### Error: "Service account key file not found"

**Problem:** The `service-account.json` file is missing or in the wrong location.

**Solution:**
1. Make sure the file is named exactly `service-account.json` (not `.txt` or anything else)
2. Place it in the root of your project: `c:\Users\PC\OneDrive\Desktop\w_app agent\service-account.json`
3. Restart the bot

---

## Security Notes

🔒 **Keep your `service-account.json` file private!**
- Never commit it to GitHub (it's already in `.gitignore`)
- Don't share it with anyone
- If compromised, delete the service account in Google Cloud Console and create a new one

---

## What's Next?

Once permissions are upgraded, I'll implement:
- ✅ Availability checking
- ✅ Meeting booking with Google Meet links
- ✅ Smart scheduling suggestions
- ✅ Conflict detection

Ready to proceed? Let me know once you've completed these steps!
