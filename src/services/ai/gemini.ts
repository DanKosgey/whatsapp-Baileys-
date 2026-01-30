import { GoogleGenerativeAI, GenerativeModel, FunctionCall } from '@google/generative-ai';
import { config } from '../../config/env';
import { SYSTEM_PROMPTS } from './prompts';
import { AI_TOOLS } from './tools';
import { keyManager } from '../keyManager';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface AIProfile {
  agentName?: string;
  agentRole?: string;
  personalityTraits?: string;
  communicationStyle?: string;
  formalityLevel?: number;
  systemPrompt?: string;
  greetingMessage?: string;
  responseLength?: 'short' | 'long';
}

interface UserProfile {
  fullName?: string;
  preferredName?: string;
  title?: string;
  company?: string;
  priorities?: string;
  availability?: string;
  backgroundInfo?: string;
  communicationPreferences?: string;
  timezone?: string;
}

interface GeminiResponse {
  type: 'text' | 'tool_call';
  content?: string;
  functionCall?: {
    name: string;
    args: any;
  };
}

interface AnalysisResult {
  urgency: number;
  status: string;
  summary_for_owner: string;
}

interface ProfileUpdate {
  [key: string]: any;
}

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

const RATE_LIMIT_CONFIG = {
  MIN_REQUEST_SPACING_MS: 3000,      // 3 seconds between requests (Gemini free tier: 2 RPM)
  MAX_RETRIES: 50,                   // Maximum retry attempts
  RETRY_DELAY_MS: 2000,              // Delay before trying next key after rate limit
  DEFAULT_RETRY_SECONDS: 60,         // Default wait time if retry-after not specified
} as const;

const ERROR_CODES = {
  ALL_KEYS_EXHAUSTED: 'ALL_KEYS_EXHAUSTED',
  RATE_LIMIT: 429,
  INVALID_KEY: 400,
} as const;

const ERROR_MESSAGES = {
  CONNECTION_ERROR: "I'm having a bit of trouble connecting right now. One moment.",
  ANALYSIS_DEFAULT: 'Error analyzing',
  REPORT_ERROR_PREFIX: '⚠️ Error generating report for',
} as const;

// ============================================================================
// GEMINI SERVICE CLASS
// ============================================================================

export class GeminiService {
  private requestQueue: Promise<any> = Promise.resolve();

  constructor() { }

  // --------------------------------------------------------------------------
  // CORE REQUEST HANDLING WITH RETRY & QUEUEING
  // --------------------------------------------------------------------------

  /**
   * Executes Gemini operations with key rotation, retries, and request queueing.
   * Ensures sequential execution and enforces rate limit spacing.
   */
  private async executeWithRetry<T>(
    operation: (model: GenerativeModel) => Promise<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue = this.requestQueue
        .then(async () => {
          const startTime = Date.now();

          try {
            const result = await this._retryWithKeyRotation(operation);
            await this._enforceRateLimit(startTime);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        })
        .catch(reject);
    });
  }

  /**
   * Internal retry logic with automatic key rotation on failures
   */
  private async _retryWithKeyRotation<T>(
    operation: (model: GenerativeModel) => Promise<T>
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < RATE_LIMIT_CONFIG.MAX_RETRIES; attempt++) {
      try {
        const key = this._getNextKey();
        const model = this._createModel(key);
        return await operation(model);
      } catch (error: any) {
        lastError = error;

        const shouldRetry = await this._handleOperationError(error);
        if (!shouldRetry) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  /**
   * Handles operation errors and determines retry strategy
   */
  private async _handleOperationError(error: any): Promise<boolean> {
    // All keys exhausted - propagate immediately
    if (error.message === ERROR_CODES.ALL_KEYS_EXHAUSTED) {
      return false;
    }

    const currentKey = keyManager.getCurrentKey?.() || 'unknown';

    // Rate limit error (429) OR Service Overload (503)
    if (this._isRateLimitError(error)) {
      const isOverloaded = error.status === 503 || error.code === 503 || error.message?.includes('503') || error.message?.includes('overloaded');

      if (isOverloaded) {
        // 503 Service Unavailable: Wait with exponential strategy, don't necessarily switch keys (problem is global)
        console.warn(`⚠️ Gemini Service Overloaded (503). Waiting ${RATE_LIMIT_CONFIG.MIN_REQUEST_SPACING_MS}ms before retry...`);
        await this._delay(RATE_LIMIT_CONFIG.MIN_REQUEST_SPACING_MS * 2); // Wait longer for 503
        return true;
      } else {
        // 429 Rate Limit: Switch keys
        const retrySeconds = this._extractRetryDelay(error);
        console.warn(
          `⚠️ Key ending in ...${currentKey.slice(-4)} hit Rate Limit (429). ` +
          `Retry after ${retrySeconds}s. Switching keys...`
        );
        keyManager.markRateLimited(currentKey, retrySeconds);
        await this._delay(RATE_LIMIT_CONFIG.RETRY_DELAY_MS);
        return true;
      }
    }

    // Invalid or expired key - skip this key
    if (this._isInvalidKeyError(error)) {
      console.warn(`❌ Key ending in ...${currentKey.slice(-4)} is INVALID/EXPIRED. Skipping...`);
      return true;
    }

    // Other errors should not retry
    return false;
  }

  /**
   * Retrieves next available API key from key manager
   */
  private _getNextKey(): string {
    try {
      return keyManager.getNextKey();
    } catch (error: any) {
      if (error.message === ERROR_CODES.ALL_KEYS_EXHAUSTED) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * Creates a Gemini model instance with the provided API key
   */
  private _createModel(apiKey: string): GenerativeModel {
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({ model: config.geminiModel });
  }

  /**
   * Enforces minimum spacing between API requests for rate limiting
   */
  private async _enforceRateLimit(startTime: number): Promise<void> {
    const elapsed = Date.now() - startTime;
    const remainingWait = RATE_LIMIT_CONFIG.MIN_REQUEST_SPACING_MS - elapsed;

    if (remainingWait > 0) {
      await this._delay(remainingWait);
    }
  }

  // --------------------------------------------------------------------------
  // ERROR DETECTION HELPERS
  // --------------------------------------------------------------------------

  private _isRateLimitError(error: any): boolean {
    return (
      error.status === ERROR_CODES.RATE_LIMIT ||
      error.code === ERROR_CODES.RATE_LIMIT ||
      error.status === 503 || // Handle Service Unavailable
      error.code === 503 ||
      error.message?.includes('429') ||
      error.message?.includes('503') ||
      error.message?.includes('overloaded') // Catch "The model is overloaded"
    );
  }

  private _isInvalidKeyError(error: any): boolean {
    return (
      error.status === ERROR_CODES.INVALID_KEY ||
      error.message?.includes('API_KEY_INVALID') ||
      error.message?.includes('API key expired')
    );
  }

  private _extractRetryDelay(error: any): number {
    const retryInfo = error.errorDetails?.find(
      (detail: any) => detail['@type']?.includes('RetryInfo')
    );

    if (retryInfo?.retryDelay) {
      const seconds = parseInt(retryInfo.retryDelay, 10);
      return isNaN(seconds) ? RATE_LIMIT_CONFIG.DEFAULT_RETRY_SECONDS : seconds;
    }

    return RATE_LIMIT_CONFIG.DEFAULT_RETRY_SECONDS;
  }

  // --------------------------------------------------------------------------
  // SYSTEM PROMPT CONSTRUCTION
  // --------------------------------------------------------------------------

  /**
   * Builds the complete system prompt from various sources with priority hierarchy
   */
  private _buildSystemPrompt(
    userContext: string,
    isOwner: boolean,
    aiProfile?: AIProfile,
    userProfile?: UserProfile,
    customPrompt?: string
  ): string {
    let systemPrompt: string;

    // Priority 1: Custom prompt override (e.g. Identity Guard)
    if (customPrompt) {
      systemPrompt = customPrompt;
      // Ensure specific instructions don't lose context of who we are talking to if valid
      if (userContext) systemPrompt += `\n\nCONTEXT:\n${userContext}`;
    }
    // Priority 2: AI profile hardcoded system prompt (from UI Settings)
    else if (aiProfile?.systemPrompt) {
      systemPrompt = aiProfile.systemPrompt;

      // CRITICAL FIX 2: Inject Agent Identity from UI fields so it doesn't forget its name
      const identityInfo = [];
      if (aiProfile.agentName) identityInfo.push(`Name: ${aiProfile.agentName}`);
      if (aiProfile.agentRole) identityInfo.push(`Role: ${aiProfile.agentRole}`);
      if (aiProfile.personalityTraits) identityInfo.push(`Traits: ${aiProfile.personalityTraits}`);

      if (identityInfo.length > 0) {
        systemPrompt += `\n\nAGENT PROFILE (Adopt this identity):\n${identityInfo.join('\n')}`;
      }

      // CRITICAL FIX: Append contact context so AI knows who it's talking to
      if (userContext) systemPrompt += `\n\nCONTEXT ABOUT THIS CONTACT:\n${userContext}`;
    }
    // Priority 3: Construct from AI profile components
    else if (aiProfile) {
      systemPrompt = this._constructProfilePrompt(aiProfile, userContext);
    }
    // Priority 4: Default fallback with Persona Switch
    else {
      systemPrompt = isOwner
        ? SYSTEM_PROMPTS.OWNER(userContext)
        : SYSTEM_PROMPTS.REPRESENTATIVE(userContext);
    }

    // Append user/boss profile information
    if (userProfile) {
      systemPrompt = this._appendUserProfile(systemPrompt, userProfile);
    }

    // Inject Current Time Context (CRITICAL for correct greetings and relative time)
    const timezone = userProfile?.timezone || 'UTC';
    const now = new Date();
    const timeString = now.toLocaleString('en-US', { timeZone: timezone, hour12: true });
    const dayString = now.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long' });

    systemPrompt += `\n\n=== TEMPORAL CONTEXT ===\nCURRENT DATE/TIME: ${dayString}, ${timeString} (${timezone})\nINSTRUCTION: You MUST use this time to determine the appropriate greeting (Good Morning/Afternoon/Evening). Do not blindly repeat the user's greeting if it is temporally incorrect.`;

    // Apply response length constraint
    if (aiProfile?.responseLength === 'short') {
      systemPrompt = this._appendShortResponseConstraint(systemPrompt);
    }

    return systemPrompt;
  }

  /**
   * Constructs system prompt from AI profile components
   */
  private _constructProfilePrompt(aiProfile: AIProfile, userContext: string): string {
    const sections = [
      this._buildIdentitySection(aiProfile),
      this._buildInstructionsSection(aiProfile),
      this._buildContextSection(userContext),
      this._buildGreetingSection(aiProfile),
    ];

    return sections.filter(Boolean).join('\n\n');
  }

  private _buildIdentitySection(aiProfile: AIProfile): string {
    return `IDENTITY & ROLE:
You are ${aiProfile.agentName || 'the Representative'}, ${aiProfile.agentRole || 'a personal assistant'}.
Personality: ${aiProfile.personalityTraits || 'Professional and helpful'}.
Style: ${aiProfile.communicationStyle || 'Friendly'}.
Formality Level: ${aiProfile.formalityLevel || 5}/10.`;
  }

  private _buildInstructionsSection(aiProfile: AIProfile): string {
    const instructions = this._getCoreInstructions(aiProfile);
    return `CORE INSTRUCTIONS:
${instructions}`;
  }

  private _getCoreInstructions(aiProfile: AIProfile): string {
    if (aiProfile.agentRole === 'Discipline Guardian') {
      return "You are a strict but supportive mentor. Your goal is to help the user conserve energy and maintain discipline. Do not be a sycophant. Call them out on weakness, but encourage their strength.";
    }
    return "You manage communications autonomously. Be helpful but protective of the owner's time.";
  }

  private _buildContextSection(userContext: string): string {
    return `CONTEXT ABOUT THIS CONTACT:
${userContext}`;
  }

  private _buildGreetingSection(aiProfile: AIProfile): string | null {
    if (aiProfile.greetingMessage) {
      return `Preferred Greeting: "${aiProfile.greetingMessage}"`;
    }
    return null;
  }

  /**
   * Appends user/boss profile context to system prompt
   */
  private _appendUserProfile(prompt: string, userProfile: UserProfile): string {
    const bossInfo = `
**Information about the Boss (Your User):**
Name: ${userProfile.fullName || userProfile.preferredName || 'The Boss'}
Title/Role: ${userProfile.title || 'Owner'} at ${userProfile.company || 'N/A'}
Priorities: ${userProfile.priorities || 'Not specified'}
Availability: ${userProfile.availability || 'Not specified'}
Background: ${userProfile.backgroundInfo || 'N/A'}
Communication Prefs: ${userProfile.communicationPreferences || 'N/A'}`;

    return `${prompt}\n${bossInfo}`;
  }

  /**
   * Adds constraint for short, concise responses
   */
  private _appendShortResponseConstraint(prompt: string): string {
    return `${prompt}

CRITICAL INSTRUCTION: Your response MUST be short, concise, and direct. Use short sentences. Avoid flowery language or unnecessary pleasantries. Maximum 2-3 sentences unless explaining a complex topic.`;
  }

  /**
   * Builds the final conversation prompt with history
   */
  private _buildConversationPrompt(systemPrompt: string, history: string[]): string {
    return `${systemPrompt}

**CONVERSATION HISTORY:**
${history.join('\n')}

**YOUR REPLY:**`;
  }

  // --------------------------------------------------------------------------
  // PUBLIC API METHODS
  // --------------------------------------------------------------------------

  /**
   * Generates AI reply to conversation with tool calling support
   */
  async generateReply(
    history: string[],
    userContext: string,
    isOwner: boolean,
    aiProfile?: AIProfile,
    userProfile?: UserProfile,
    customPrompt?: string
  ): Promise<GeminiResponse> {
    try {
      const systemPrompt = this._buildSystemPrompt(
        userContext,
        isOwner,
        aiProfile,
        userProfile,
        customPrompt
      );

      const fullPrompt = this._buildConversationPrompt(systemPrompt, history);

      return await this.executeWithRetry(async (model) => {
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
          tools: AI_TOOLS as any,
        });

        const response = result.response;
        const functionCalls = response.functionCalls();

        // Handle tool/function calls
        if (functionCalls && functionCalls.length > 0) {
          return this._createToolCallResponse(functionCalls[0]);
        }

        // Handle text response
        return this._createTextResponse(response.text());
      });
    } catch (error: any) {
      return this._handleGenerateReplyError(error);
    }
  }

  /**
   * Updates user profile based on conversation history
   */
  async updateProfile(
    history: string[],
    currentSummary: string
  ): Promise<ProfileUpdate | null> {
    try {
      const prompt = `${SYSTEM_PROMPTS.PROFILER}

**CURRENT SUMMARY:**
${currentSummary || 'None'}

**RECENT HISTORY:**
${history.join('\n')}

**OUTPUT JSON:**`;

      return await this.executeWithRetry(async (model) => {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return this._parseJsonResponse(text);
      });
    } catch (error) {
      // Silent fail for profiling - non-critical operation
      return null;
    }
  }

  /**
   * Analyzes conversation for urgency, status, and generates summary
   */
  async analyzeConversation(history: string[]): Promise<AnalysisResult> {
    try {
      const prompt = `${SYSTEM_PROMPTS.ANALYSIS}

**HISTORY:**
${history.join('\n')}

**OUTPUT JSON:**`;

      return await this.executeWithRetry(async (model) => {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return this._parseJsonResponse(text);
      });
    } catch (error) {
      console.error('Gemini Analysis Error:', error);
      return this._getDefaultAnalysisResult();
    }
  }

  /**
   * Generates formatted conversation report
   */
  async generateReport(
    history: string[],
    contactName: string,
    metadata?: { lastMessageTime?: Date }
  ): Promise<string> {
    try {
      let metadataSection = '';
      if (metadata?.lastMessageTime) {
        metadataSection = `\n**LAST MESSAGE TIME:** ${metadata.lastMessageTime.toLocaleString()}\n`;
      }

      const prompt = `${SYSTEM_PROMPTS.REPORT_GENERATOR}

**CONTACT NAME:** ${contactName}${metadataSection}

**CONVERSATION HISTORY:**
${history.join('\n')}

**YOUR REPORT:**`;

      return await this.executeWithRetry(async (model) => {
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
      });
    } catch (error) {
      console.error('Gemini Report Error:', error);
      return this._getDefaultReportError(contactName);
    }
  }

  // --------------------------------------------------------------------------
  // RESPONSE BUILDERS
  // --------------------------------------------------------------------------

  private _createToolCallResponse(functionCall: FunctionCall): GeminiResponse {
    console.log('🤖 Gemini wants to call tool:', functionCall.name);
    return {
      type: 'tool_call',
      functionCall: {
        name: functionCall.name,
        args: functionCall.args,
      },
    };
  }

  private _createTextResponse(text: string): GeminiResponse {
    return {
      type: 'text',
      content: text.trim(),
    };
  }

  // --------------------------------------------------------------------------
  // ERROR HANDLERS
  // --------------------------------------------------------------------------

  private _handleGenerateReplyError(error: any): GeminiResponse {
    if (error.message === ERROR_CODES.ALL_KEYS_EXHAUSTED) {
      throw error; // Let caller handle key exhaustion
    }

    console.error('Gemini Generate Error:', error);
    return {
      type: 'text',
      content: ERROR_MESSAGES.CONNECTION_ERROR,
    };
  }

  private _getDefaultAnalysisResult(): AnalysisResult {
    return {
      urgency: 5,
      status: 'active',
      summary_for_owner: ERROR_MESSAGES.ANALYSIS_DEFAULT,
    };
  }

  private _getDefaultReportError(contactName: string): string {
    return `${ERROR_MESSAGES.REPORT_ERROR_PREFIX} ${contactName}. Check logs.`;
  }

  // --------------------------------------------------------------------------
  // UTILITY METHODS
  // --------------------------------------------------------------------------

  /**
   * Parses JSON response from Gemini, removing markdown code blocks
   */
  private _parseJsonResponse<T = any>(text: string): T {
    const cleanJson = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(cleanJson);
  }

  /**
   * Promise-based delay utility
   */
  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const geminiService = new GeminiService();