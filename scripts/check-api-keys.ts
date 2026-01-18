/**
 * Enhanced Gemini API Key Checker
 * Tests all API keys, checks rate limits, and provides detailed diagnostics
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
    timestamp: string;
    availableModels?: string[];
}

interface TestConfig {
    model: string;
    testPrompt: string;
    timeout: number;
}

const CONFIG: TestConfig = {
    model: 'gemini-2.5-flash',
    testPrompt: 'Say "OK" if you can read this.',
    timeout: 10000 // 10 seconds
};

/**
 * Create a safe preview of the API key
 */
function createKeyPreview(key: string): string {
    if (key.length <= 14) return '***';
    return `${key.substring(0, 10)}...${key.substring(key.length - 4)}`;
}

/**
 * Get list of available models for an API key
 */
async function getAvailableModels(key: string): Promise<string[]> {
    try {
        const genAI = new GoogleGenerativeAI(key);

        // Try to list models (this endpoint may not be available for all keys)
        // We'll use a workaround by testing common models
        const commonModels = [
            'gemini-2.0-flash-exp',
            'gemini-1.5-flash',
            'gemini-1.5-flash-8b',
            'gemini-1.5-pro',
            'gemini-pro',
            'gemini-pro-vision'
        ];

        const availableModels: string[] = [];

        // Test each model quickly with a minimal request
        for (const modelName of commonModels) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                // Just try to get the model - if it doesn't throw, it's available
                await Promise.race([
                    model.generateContent('test'),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
                ]);
                availableModels.push(modelName);
            } catch (error: any) {
                // If it's not a 404 or model not found error, the model exists but might be rate limited
                if (error.status !== 404 && !error.message?.toLowerCase().includes('not found')) {
                    availableModels.push(modelName);
                }
            }
        }

        return availableModels;
    } catch (error) {
        return [];
    }
}

/**
 * Test a single API key with timeout
 */
async function testKey(key: string, keyNumber: number, checkModels: boolean = false): Promise<KeyStatus> {
    const keyPreview = createKeyPreview(key);
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), CONFIG.timeout);
    });

    try {
        // First, check available models if requested
        let availableModels: string[] | undefined;
        if (checkModels) {
            console.log(`   Checking available models for key #${keyNumber}...`);
            availableModels = await getAvailableModels(key);
        }

        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: CONFIG.model });

        // Race between API call and timeout
        const result = await Promise.race([
            model.generateContent(CONFIG.testPrompt),
            timeoutPromise
        ]);

        const response = await result.response;
        const text = response.text();
        const responseTime = Date.now() - startTime;

        // Verify we got a reasonable response
        if (!text || text.trim().length === 0) {
            return {
                keyNumber,
                keyPreview,
                status: 'error',
                error: 'Empty response received',
                responseTime,
                timestamp,
                availableModels
            };
        }

        return {
            keyNumber,
            keyPreview,
            status: 'working',
            responseTime,
            model: CONFIG.model,
            timestamp,
            availableModels
        };
    } catch (error: any) {
        const responseTime = Date.now() - startTime;

        // Handle timeout
        if (error.message === 'Request timeout') {
            return {
                keyNumber,
                keyPreview,
                status: 'error',
                error: `Timeout after ${CONFIG.timeout}ms`,
                responseTime,
                timestamp
            };
        }

        // Check for rate limit errors (429)
        if (
            error.status === 429 ||
            error.message?.toLowerCase().includes('429') ||
            error.message?.toLowerCase().includes('quota') ||
            error.message?.toLowerCase().includes('rate limit')
        ) {
            return {
                keyNumber,
                keyPreview,
                status: 'rate_limited',
                error: error.message || 'Rate limit exceeded',
                responseTime,
                timestamp
            };
        }

        // Check for authentication/authorization errors
        if (error.status === 400 || error.status === 401 || error.status === 403) {
            return {
                keyNumber,
                keyPreview,
                status: 'invalid',
                error: `Authentication failed (HTTP ${error.status})`,
                responseTime,
                timestamp
            };
        }

        // Network or other errors
        return {
            keyNumber,
            keyPreview,
            status: 'error',
            error: error.message || 'Unknown error',
            responseTime,
            timestamp
        };
    }
}

/**
 * Collect all API keys from environment variables
 */
function collectApiKeys(): string[] {
    const keys: string[] = [];
    const keysSet = new Set<string>();

    // Check primary key
    if (process.env.GEMINI_API_KEY) {
        keysSet.add(process.env.GEMINI_API_KEY.trim());
    }

    // Check numbered keys (GEMINI_API_KEY1, GEMINI_API_KEY2, etc.)
    for (let i = 1; i <= 100; i++) {
        const key = process.env[`GEMINI_API_KEY${i}`];
        if (key) {
            keysSet.add(key.trim());
        }
    }

    // Check comma-separated keys
    if (process.env.GEMINI_API_KEYS) {
        process.env.GEMINI_API_KEYS.split(',').forEach(k => {
            const trimmed = k.trim();
            if (trimmed) {
                keysSet.add(trimmed);
            }
        });
    }

    // Convert Set to Array to remove duplicates
    return Array.from(keysSet).filter(key => key.length > 0);
}

/**
 * Display results in a formatted table
 */
function displayResults(results: KeyStatus[]) {
    const working = results.filter(r => r.status === 'working');
    const rateLimited = results.filter(r => r.status === 'rate_limited');
    const invalid = results.filter(r => r.status === 'invalid');
    const errors = results.filter(r => r.status === 'error');

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                    API KEY STATUS REPORT                      ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Summary
    console.log('📈 SUMMARY:');
    console.log(`   ✅ Working:       ${working.length}/${results.length}`);
    console.log(`   ⏸️  Rate Limited:  ${rateLimited.length}/${results.length}`);
    console.log(`   ❌ Invalid:       ${invalid.length}/${results.length}`);
    console.log(`   ⚠️  Errors:        ${errors.length}/${results.length}\n`);

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

        if (result.responseTime !== undefined) {
            console.log(`   Response Time: ${result.responseTime}ms`);
        }

        if (result.model) {
            console.log(`   Tested Model: ${result.model}`);
        }

        if (result.availableModels && result.availableModels.length > 0) {
            console.log(`   Available Models: ${result.availableModels.join(', ')}`);
        }

        if (result.error) {
            console.log(`   Error: ${result.error}`);
        }

        console.log('');
    });

    return { working, rateLimited, invalid, errors };
}

/**
 * Display recommendations based on results
 */
function displayRecommendations(
    working: KeyStatus[],
    rateLimited: KeyStatus[],
    invalid: KeyStatus[],
    totalKeys: number
) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                      RECOMMENDATIONS                          ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (working.length === 0) {
        console.log('🚨 CRITICAL: No working API keys available!');
        console.log('   → Your agent will not be able to respond to messages');
        console.log('   → Action: Add new API keys or wait for rate limits to reset');
        console.log('   → Get keys at: https://makersuite.google.com/app/apikey\n');
    } else if (working.length < totalKeys / 2) {
        console.log('⚠️  WARNING: Less than 50% of keys are working');
        console.log('   → Your agent may experience delays or failures');
        console.log('   → Action: Consider adding more API keys\n');
    } else {
        console.log('✅ GOOD: Sufficient working API keys available\n');
    }

    if (rateLimited.length > 0) {
        console.log(`⏸️  ${rateLimited.length} key(s) are rate limited`);
        console.log('   → These keys will automatically reset after cooldown');
        console.log('   → Gemini free tier: 15 requests/minute, 1500 requests/day');
        console.log('   → Minute-based limits reset after 60 seconds');
        console.log('   → Daily limits reset at midnight UTC\n');
    }

    if (invalid.length > 0) {
        console.log(`❌ ${invalid.length} key(s) are invalid or unauthorized`);
        console.log('   → These keys should be removed or replaced');
        console.log('   → Check: https://makersuite.google.com/app/apikey');
        console.log('   → Verify: API key permissions and project settings\n');
    }
}

/**
 * Display rate limit information
 */
function displayRateLimitInfo(workingCount: number, totalKeys: number) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                   RATE LIMIT INFORMATION                      ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('Gemini 2.0 Flash (Free Tier):');
    console.log('   • 15 requests per minute (RPM)');
    console.log('   • 1,500 requests per day (RPD)');
    console.log('   • 1 million tokens per minute (TPM)');
    console.log('   • 10 million tokens per day (TPD)\n');

    console.log('Your Setup:');
    console.log(`   • Total Keys: ${totalKeys}`);
    console.log(`   • Working Keys: ${workingCount}`);
    console.log(`   • Theoretical Max RPM: ${workingCount * 15}`);
    console.log(`   • Theoretical Max RPD: ${workingCount * 1500}`);
    console.log(`   • Recommended concurrent users: ${Math.floor(workingCount * 15 / 2)}\n`);
}

/**
 * Main function to check all API keys
 */
async function checkAllKeys() {
    console.log('🔍 Gemini API Key Checker');
    console.log(`📅 Started at: ${new Date().toLocaleString()}\n`);

    // Collect keys
    const keys = collectApiKeys();

    if (keys.length === 0) {
        console.error('❌ No API keys found in environment variables!\n');
        console.error('Please set one of the following:');
        console.error('   • GEMINI_API_KEY');
        console.error('   • GEMINI_API_KEY1, GEMINI_API_KEY2, ...');
        console.error('   • GEMINI_API_KEYS (comma-separated)\n');
        process.exit(1);
    }

    console.log(`📊 Found ${keys.length} unique API key(s) to test`);
    console.log(`⚙️  Using model: ${CONFIG.model}`);
    console.log(`⏱️  Timeout: ${CONFIG.timeout}ms\n`);
    console.log('Testing keys in parallel...\n');

    // Test keys sequentially to avoid hitting rate limits
    const results = [];
    for (let i = 0; i < keys.length; i++) {
        console.log(`Testing key #${i + 1}...`);
        results.push(await testKey(keys[i], i + 1, true)); // Keep model check true
        // Add a small delay between keys
        if (i < keys.length - 1) await new Promise(r => setTimeout(r, 1000));
    }

    // Display results
    const { working, rateLimited, invalid, errors } = displayResults(results);

    // Display recommendations
    displayRecommendations(working, rateLimited, invalid, keys.length);

    // Display rate limit info
    displayRateLimitInfo(working.length, keys.length);

    // Footer
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`✅ Check completed at: ${new Date().toLocaleString()}\n`);

    // Determine exit code
    if (working.length === 0) {
        console.error('❌ Exiting with error: No working keys\n');
        process.exit(1); // Critical: no working keys
    } else if (working.length < keys.length / 2) {
        console.warn('⚠️  Exiting with warning: Less than 50% keys working\n');
        process.exit(2); // Warning: degraded performance
    } else {
        console.log('✅ All checks passed!\n');
        process.exit(0); // Success
    }
}

// Run the checker
checkAllKeys().catch(error => {
    console.error('\n💥 Fatal error during key checking:');
    console.error(error);
    process.exit(1);
});