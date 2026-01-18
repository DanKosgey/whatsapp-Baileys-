# API Usage Optimization Guide

## Current Issues
All 3 API keys are rate limited (1,500 requests/day quota exceeded).

## Immediate Actions

### 1. Disable Profiling (Saves ~50% API calls)
The profiling system makes an extra API call after every message to update contact profiles.

**To disable temporarily:**
Edit `src/core/whatsapp.ts` line 385:
```typescript
// Comment out this line:
// if (!ownerService.isOwner(remoteJid) && !rateLimitManager.isLimited()) {
//     this.runProfiling(history.concat(`Them: ${userText}`, `Me: ${finalResponse}`), contact);
// }
```

### 2. Increase Short-Circuit Patterns (Saves ~30% API calls)
Add more patterns to ignore simple messages without AI processing.

**Edit `src/core/whatsapp.ts` line 202:**
```typescript
const ignoredPatterns = /^(ok|okay|k|lol|lmao|haha|thanks|thx|cool|nice|wow|great|awesome|perfect|sure|alright|fine|good|👍|✅|❤️|😊|😂|🙏|yes|no|yeah|yup|nope|nah)\\.?$/i;
```

### 3. Increase Message Buffer Delay (Reduces burst usage)
Currently buffers for 5 seconds. Increase to 10-15 seconds.

**Edit `src/services/messageBuffer.ts`:**
```typescript
private debounceTime = 15000; // Changed from 5000 to 15000 (15 seconds)
```

## Long-Term Solutions

### 1. Get More API Keys
- Each Google account = 1,500 requests/day
- 10 accounts = 15,000 requests/day
- Create keys at: https://makersuite.google.com/app/apikey

### 2. Upgrade to Paid Plan
- Gemini Pro: 360 requests/minute
- No daily limits
- Cost: ~$0.00025 per request
- Info: https://ai.google.dev/pricing

### 3. Implement Caching
- Cache common responses
- Reuse AI-generated content for similar queries
- Store frequently asked questions

### 4. Smart Routing
- Use simple regex for common queries (no AI needed)
- Only call AI for complex questions
- Implement command system for owner

## Monitoring

Run this command daily to check key health:
```bash
npm run check-keys
```

## Emergency Mode

If all keys are exhausted, the agent will:
1. Queue messages (up to 100)
2. Process them when keys recover
3. Send error message to owner (if configured)

## Current Usage Estimate

With 3 keys and current settings:
- Max capacity: 4,500 requests/day
- Recommended max messages: ~1,500/day (with profiling)
- Without profiling: ~3,000/day

## Next Steps

1. **Immediate**: Wait for reset (tomorrow ~11 AM EAT)
2. **Short-term**: Add 2-3 more API keys
3. **Long-term**: Implement optimizations above
