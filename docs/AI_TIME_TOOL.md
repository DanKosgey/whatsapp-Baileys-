# AI Time Tool Documentation

## Overview
The `get_current_time` tool allows the AI agent to access the current date and time, enabling time-aware responses and scheduling capabilities.

## Tool Details

### Name
`get_current_time`

### Description
Get the current date and time. The AI can use this when it needs to know what time it is now, or to provide time-aware responses.

### Parameters
- **timezone** (optional): String - Timezone identifier (e.g., 'America/New_York', 'Europe/London', 'Africa/Nairobi')
  - **Priority order**:
    1. Explicit timezone argument (if provided)
    2. User's configured timezone from their profile
    3. System's default timezone (fallback)

### Return Format
Returns a formatted string containing:
- **Current time**: Human-readable date and time with day of week
- **Timezone**: The timezone used for formatting
- **ISO**: ISO 8601 formatted timestamp (UTC)

### Example Usage

#### AI Conversation Example
**User**: "What time is it?"

**AI**: *Calls get_current_time tool*

**AI Response**: "It's currently Wednesday, January 28, 2026 at 01:02:52 PM GMT+3 (Africa/Nairobi timezone)."

---

**User**: "What time is it in New York?"

**AI**: *Calls get_current_time with timezone: 'America/New_York'*

**AI Response**: "In New York, it's Wednesday, January 28, 2026 at 05:02:52 AM EST."

---

## Use Cases

### 1. **Time-Aware Greetings**
The AI can now provide appropriate greetings based on the time of day:
- "Good morning!" (before 12 PM)
- "Good afternoon!" (12 PM - 6 PM)
- "Good evening!" (after 6 PM)

### 2. **Scheduling Context**
When discussing appointments or meetings:
- "It's currently 2 PM, so the meeting in 3 hours would be at 5 PM."
- "Today is Wednesday, so the meeting you mentioned for Friday is in 2 days."

### 3. **Timezone Awareness**
Help coordinate across timezones:
- "It's 1 PM here in Nairobi, which means it's 5 AM in New York."
- "The call at 3 PM EST would be 10 PM in your timezone."

### 4. **Time-Sensitive Responses**
Provide context-aware responses:
- "It's quite late (11 PM), perhaps we should discuss this tomorrow?"
- "Since it's early morning, I'll keep this brief."

### 5. **Date Awareness**
Know the current date for:
- Deadline tracking
- Birthday reminders
- Event planning
- Historical context ("That was 3 days ago...")

## Technical Implementation

### Tool Declaration
```typescript
{
    name: "get_current_time",
    description: "Get the current date and time. Use this when you need to know what time it is now, or to provide time-aware responses.",
    parameters: {
        type: "OBJECT",
        properties: {
            timezone: { 
                type: "STRING", 
                description: "Optional timezone (e.g. 'America/New_York', 'Europe/London'). Defaults to system timezone." 
            }
        },
        required: []
    }
}
```

### Tool Execution
```typescript
case 'get_current_time':
    const now = new Date();
    const timezone = args.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    
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
```

## Testing

Run the test script to verify the tool works correctly:

```bash
npx ts-node scripts/test-time-tool.ts
```

This will test the tool with multiple timezones:
- Default (system) timezone
- America/New_York (EST/EDT)
- Asia/Tokyo (JST)
- Europe/London (GMT/BST)
- Africa/Nairobi (EAT)

## Benefits

✅ **Contextual Awareness**: AI can provide time-appropriate responses  
✅ **Global Support**: Works with any IANA timezone identifier  
✅ **Scheduling Help**: Better coordination for meetings and appointments  
✅ **User Experience**: More natural, human-like conversations  
✅ **Accuracy**: Always uses real-time data, never outdated  

## Future Enhancements

Potential improvements:
- Add support for relative time calculations ("in 3 hours", "tomorrow at 2 PM")
- Integration with user's timezone from profile
- Business hours awareness
- Holiday detection
- Time-based reminders

---

**Last Updated**: January 28, 2026  
**Version**: 1.0.0
