/**
 * Check API Keys Script
 * Tests all Gemini API keys to see if they're working and checks for rate limits
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

interface KeyStatus {
    keyNumber: number;
    keyPreview: string;
    status: 'working' | 'rate_limited' | 'invalid' | 'error';
    error?: string;
    responseTime?: number;
    model?: string;
}

async function testKey(key: string, keyNumber: number): Promise<KeyStatus> {
    const keyPreview = `${key.substring(0, 10)}...${key.substring(key.length - 4)}`;
    const startTime = Date.now();

    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

        // Simple test prompt
        const result = await model.generateContent('Say "OK" if you can read this.');
        const response = await result.response;
        const text = response.text();

        const responseTime = Date.now() - startTime;

        return {
            keyNumber,
            keyPreview,
            status: 'working',
            responseTime,
            model: 'gemini-2.0-flash-exp'
        };
    } catch (error: any) {
        const responseTime = Date.now() - startTime;

        // Check for rate limit errors
        if (error.status === 429 || error.message?.includes('429') || error.message?.includes('quota')) {
            return {
                keyNumber,
                keyPreview,
                status: 'rate_limited',
                error: 'Rate limit exceeded',
                responseTime
            };
        }

        // Check for invalid key
        if (error.status === 400 || error.status === 401 || error.status === 403) {
            return {
                keyNumber,
                keyPreview,
                status: 'invalid',
                error: `Invalid API key (${error.status})`,
                responseTime
            };
        }

        // Other errors
        return {
            keyNumber,
            keyPreview,
            status: 'error',
            error: error.message || 'Unknown error',
            responseTime
        };
    }
}

async function checkAllKeys() {
    console.log('🔍 Checking Gemini API Keys...\n');

    const keys: string[] = [];

    // Collect all keys from environment
    if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);

    for (let i = 1; i <= 50; i++) {
        const key = process.env[`GEMINI_API_KEY${i}`];
        if (key) keys.push(key);
    }

    if (process.env.GEMINI_API_KEYS) {
        process.env.GEMINI_API_KEYS.split(',').forEach(k => {
            const trimmed = k.trim();
            if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
        });
    }

    if (keys.length === 0) {
        console.log('❌ No API keys found in environment variables!\n');
        process.exit(1);
    }

    console.log(`📊 Found ${keys.length} API key(s) to test\n`);
    console.log('Testing keys (this may take a moment)...\n');

    // Test all keys in parallel
    const results = await Promise.all(
        keys.map((key, index) => testKey(key, index + 1))
    );

    // Display results
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    API KEY STATUS REPORT                      ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const working = results.filter(r => r.status === 'working');
    const rateLimited = results.filter(r => r.status === 'rate_limited');
    const invalid = results.filter(r => r.status === 'invalid');
    const errors = results.filter(r => r.status === 'error');

    // Summary
    console.log('📈 SUMMARY:');
    console.log(`   ✅ Working:       ${working.length}/${keys.length}`);
    console.log(`   ⏸️  Rate Limited:  ${rateLimited.length}/${keys.length}`);
    console.log(`   ❌ Invalid:       ${invalid.length}/${keys.length}`);
    console.log(`   ⚠️  Errors:        ${errors.length}/${keys.length}\n`);

    // Detailed results
    console.log('📋 DETAILED RESULTS:\n');

    results.forEach(result => {
        const statusIcon = {
            'working': '✅',
            'rate_limited': '⏸️',
            'invalid': '❌',
            'error': '⚠️'
        }[result.status];

        console.log(`${statusIcon} Key #${result.keyNumber}: ${result.keyPreview}`);
        console.log(`   Status: ${result.status.toUpperCase()}`);
        if (result.responseTime) {
            console.log(`   Response Time: ${result.responseTime}ms`);
        }
        if (result.model) {
            console.log(`   Model: ${result.model}`);
        }
        if (result.error) {
            console.log(`   Error: ${result.error}`);
        }
        console.log('');
    });

    // Recommendations
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                      RECOMMENDATIONS                          ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (working.length === 0) {
        console.log('🚨 CRITICAL: No working API keys available!');
        console.log('   → Your agent will not be able to respond to messages');
        console.log('   → Action: Add new API keys or wait for rate limits to reset\n');
    } else if (working.length < keys.length / 2) {
        console.log('⚠️  WARNING: Less than 50% of keys are working');
        console.log('   → Your agent may experience delays');
        console.log('   → Action: Consider adding more API keys\n');
    } else {
        console.log('✅ GOOD: Sufficient working API keys available\n');
    }

    if (rateLimited.length > 0) {
        console.log(`⏸️  ${rateLimited.length} key(s) are rate limited`);
        console.log('   → These keys will automatically reset after cooldown');
        console.log('   → Gemini free tier: 15 requests/minute, 1500 requests/day');
        console.log('   → Cooldown is typically 60 seconds\n');
    }

    if (invalid.length > 0) {
        console.log(`❌ ${invalid.length} key(s) are invalid`);
        console.log('   → These keys should be removed or replaced');
        console.log('   → Check: https://makersuite.google.com/app/apikey\n');
    }

    // Rate limit info
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                   RATE LIMIT INFORMATION                      ');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('Gemini 2.0 Flash (Free Tier):');
    console.log('   • 15 requests per minute (RPM)');
    console.log('   • 1,500 requests per day (RPD)');
    console.log('   • 1 million tokens per minute (TPM)');
    console.log('   • 10 million tokens per day (TPD)\n');
    console.log('Your Setup:');
    console.log(`   • Total Keys: ${keys.length}`);
    console.log(`   • Working Keys: ${working.length}`);
    console.log(`   • Theoretical Max RPM: ${working.length * 15}`);
    console.log(`   • Theoretical Max RPD: ${working.length * 1500}\n`);

    // Exit code
    if (working.length === 0) {
        process.exit(1); // Critical: no working keys
    } else if (working.length < keys.length / 2) {
        process.exit(2); // Warning: less than 50% working
    } else {
        process.exit(0); // Success
    }
}

checkAllKeys();
