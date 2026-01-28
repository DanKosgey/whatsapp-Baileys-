/**
 * Test script for the get_current_time AI tool
 */

import { executeLocalTool } from '../src/services/ai/tools';

async function testTimeTool() {
    console.log('🕐 Testing get_current_time tool...\n');

    // Test 1: Default timezone
    console.log('Test 1: Default timezone');
    const result1 = await executeLocalTool('get_current_time', {}, {});
    console.log(result1);
    console.log('\n---\n');

    // Test 2: Specific timezone (New York)
    console.log('Test 2: New York timezone');
    const result2 = await executeLocalTool('get_current_time', { timezone: 'America/New_York' }, {});
    console.log(result2);
    console.log('\n---\n');

    // Test 3: Specific timezone (Tokyo)
    console.log('Test 3: Tokyo timezone');
    const result3 = await executeLocalTool('get_current_time', { timezone: 'Asia/Tokyo' }, {});
    console.log(result3);
    console.log('\n---\n');

    // Test 4: Specific timezone (London)
    console.log('Test 4: London timezone');
    const result4 = await executeLocalTool('get_current_time', { timezone: 'Europe/London' }, {});
    console.log(result4);
    console.log('\n---\n');

    // Test 5: Nairobi timezone (your timezone!)
    console.log('Test 5: Nairobi timezone');
    const result5 = await executeLocalTool('get_current_time', { timezone: 'Africa/Nairobi' }, {});
    console.log(result5);

    console.log('\n✅ All tests completed!');
}

testTimeTool().catch(console.error);
