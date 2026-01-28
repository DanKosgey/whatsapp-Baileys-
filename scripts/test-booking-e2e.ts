/**
 * End-to-End Test: Actually create a meeting on Google Calendar
 * This will book a real meeting and generate a Google Meet link
 */

import dotenv from 'dotenv';
dotenv.config();

import { googleCalendar } from '../src/services/googleCalendar';

async function testEndToEnd() {
    console.log('🧪 END-TO-END TEST: Calendar Meeting Booking\n');
    console.log('⚠️  WARNING: This will create a REAL calendar event!\n');

    try {
        // Step 1: Check availability for tomorrow
        console.log('📅 Step 1: Checking availability for tomorrow...');
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateStr = tomorrow.toISOString().split('T')[0];

        console.log(`   Date: ${dateStr}`);

        const slots = await googleCalendar.findAvailableSlots('tomorrow', 30);

        if (slots.length === 0 || slots[0].includes('No')) {
            console.log('❌ No available slots found for tomorrow');
            console.log('   Reason:', slots[0]);
            process.exit(1);
        }

        console.log(`✅ Found ${slots.length} available slots`);
        console.log(`   First 5 slots: ${slots.slice(0, 5).join(', ')}`);
        console.log('');

        // Step 2: Pick the first available slot and convert to 24-hour format
        console.log('📅 Step 2: Selecting first available slot...');
        const selectedSlot = slots[0]; // e.g., "09:00 AM"

        // Convert to 24-hour format
        const [time, period] = selectedSlot.split(' ');
        const [hours, minutes] = time.split(':');
        let hour24 = parseInt(hours);

        if (period === 'PM' && hour24 !== 12) {
            hour24 += 12;
        } else if (period === 'AM' && hour24 === 12) {
            hour24 = 0;
        }

        const time24 = `${hour24.toString().padStart(2, '0')}:${minutes}`;
        console.log(`   Selected: ${selectedSlot} (${time24} in 24-hour format)`);
        console.log('');

        // Step 3: Create the meeting
        console.log('📅 Step 3: Creating meeting on Google Calendar...');
        console.log('   Customer: Test Customer (WhatsApp AI Agent)');
        console.log('   Purpose: End-to-end test of scheduling feature');
        console.log('   Duration: 30 minutes');
        console.log('');

        const result = await googleCalendar.createMeeting({
            date: dateStr,
            time: time24,
            duration: 30,
            customerName: 'Test Customer',
            customerEmail: process.env.GOOGLE_CALENDAR_ID || 'test@example.com', // Use your own email
            purpose: 'End-to-end test of WhatsApp AI Agent scheduling feature',
            customerPhone: '+254712345678'
        });

        // Step 4: Verify result
        console.log('📅 Step 4: Verifying result...');
        console.log('');

        if (result.success) {
            console.log('✅ ✅ ✅ SUCCESS! Meeting created successfully! ✅ ✅ ✅\n');
            console.log('📋 Meeting Details:');
            console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`   📅 Date: ${tomorrow.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
            console.log(`   🕐 Time: ${selectedSlot}`);
            console.log(`   ⏱️  Duration: 30 minutes`);
            console.log(`   👤 Attendee: Test Customer`);
            console.log(`   📧 Email: ${process.env.GOOGLE_CALENDAR_ID || 'test@example.com'}`);
            console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('');
            console.log('🎥 Google Meet Link:');
            console.log(`   ${result.meetLink}`);
            console.log('');
            console.log('🔗 Event ID:');
            console.log(`   ${result.eventId}`);
            console.log('');
            console.log('📝 Next Steps:');
            console.log('   1. Open Google Calendar: https://calendar.google.com/');
            console.log('   2. Find the event for tomorrow');
            console.log('   3. Click the Google Meet link to verify it works');
            console.log('   4. Delete the test event if you don\'t need it');
            console.log('');
            console.log('🎉 The scheduling feature is FULLY WORKING!');
            console.log('   Your customers can now book meetings via WhatsApp!');
            console.log('');

        } else {
            console.log('❌ Failed to create meeting');
            console.log('   Error:', result.error);
            console.log('');
            console.log('🔍 Troubleshooting:');
            console.log('   - Check that service account has "Make changes to events" permission');
            console.log('   - Verify calendar is shared with service account');
            console.log('   - Ensure GOOGLE_CALENDAR_ID is set correctly in .env');
            process.exit(1);
        }

    } catch (error: any) {
        console.error('❌ Test failed with error:', error.message);
        console.error('');
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run the end-to-end test
console.log('⏳ Starting in 3 seconds... (Press Ctrl+C to cancel)');
setTimeout(() => {
    testEndToEnd();
}, 3000);
