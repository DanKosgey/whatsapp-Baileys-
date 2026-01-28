/**
 * Test script for Calendar Scheduling Feature
 * Tests availability checking and meeting creation
 */

import dotenv from 'dotenv';
dotenv.config();

import { googleCalendar } from '../src/services/googleCalendar';

async function testScheduling() {
    console.log('🧪 Testing Calendar Scheduling Feature\n');

    try {
        // Test 1: Check availability for today
        console.log('📅 Test 1: Checking availability for today...');
        const todaySlots = await googleCalendar.findAvailableSlots('today', 30);
        console.log('Available slots today:', todaySlots.slice(0, 5));
        console.log('✅ Test 1 passed\n');

        // Test 2: Check availability for tomorrow
        console.log('📅 Test 2: Checking availability for tomorrow...');
        const tomorrowSlots = await googleCalendar.findAvailableSlots('tomorrow', 30);
        console.log('Available slots tomorrow:', tomorrowSlots.slice(0, 5));
        console.log('✅ Test 2 passed\n');

        // Test 3: Check with custom duration
        console.log('📅 Test 3: Checking availability for 60-minute meetings...');
        const longSlots = await googleCalendar.findAvailableSlots('tomorrow', 60);
        console.log('Available 60-min slots:', longSlots.slice(0, 5));
        console.log('✅ Test 3 passed\n');

        // Test 4: Create a test meeting (DRY RUN - uncomment to actually create)
        console.log('📅 Test 4: Testing meeting creation (dry run)...');
        console.log('To actually create a meeting, uncomment the code below and provide valid details.');

        /*
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateStr = tomorrow.toISOString().split('T')[0];

        const result = await googleCalendar.createMeeting({
            date: dateStr,
            time: '14:00',
            duration: 30,
            customerName: 'Test Customer',
            customerEmail: 'test@example.com',
            purpose: 'Test meeting via WhatsApp AI Agent',
            customerPhone: '+254712345678'
        });

        if (result.success) {
            console.log('✅ Meeting created successfully!');
            console.log('Meet Link:', result.meetLink);
            console.log('Event ID:', result.eventId);
        } else {
            console.log('❌ Failed to create meeting:', result.error);
        }
        */
        console.log('✅ Test 4 skipped (dry run)\n');

        console.log('🎉 All tests completed successfully!\n');
        console.log('📝 Next steps:');
        console.log('1. Make sure your .env has GOOGLE_CALENDAR_ID set');
        console.log('2. Ensure service-account.json has write permissions');
        console.log('3. Test via WhatsApp: "Can I schedule a meeting tomorrow?"');

    } catch (error: any) {
        console.error('❌ Test failed:', error.message);
        console.error('\n🔍 Troubleshooting:');
        console.error('- Check that service-account.json exists');
        console.error('- Verify GOOGLE_CALENDAR_ID in .env');
        console.error('- Ensure calendar is shared with service account');
        console.error('- Confirm service account has "Make changes to events" permission');
        process.exit(1);
    }
}

// Run tests
testScheduling();
