import makeWASocket, { DisconnectReason, useMultiFileAuthState, WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { config } from '../config/env';
import { db, withRetry } from '../database';
import { contacts, messageLogs, aiProfile, userProfile, authCredentials } from '../database/schema';
import { eq, desc } from 'drizzle-orm';
import { geminiService } from '../services/ai/gemini';
import { calculateHumanDelay, sleep } from '../utils/delay';
import { usePostgresAuthState } from '../database/auth/postgresAuth';
import { MessageSender } from '../utils/messageSender';
import pino from 'pino';
import { IdentityValidator } from '../utils/identityValidator';
import { ConversationManager } from '../services/conversationManager';
import { MessageBuffer } from '../services/messageBuffer';
import { executeLocalTool } from '../services/ai/tools';
import { rateLimitManager } from '../services/rateLimitManager';
import { ownerService } from '../services/ownerService';
import { notificationService } from '../services/notificationService';
import { sessionManager } from '../services/sessionManager';
import { messageQueueService } from '../services/queue/messageQueue';
import { WorkerPool } from '../services/queue/workerPool';
import { schedulerService } from '../services/scheduler';
import { ConcurrencyController } from '../services/queue/concurrencyController';

export class WhatsAppClient {
  private sock: WASocket | undefined;
  private messageSender: MessageSender | undefined;
  private conversationManager: ConversationManager | undefined;
  private messageBuffer: MessageBuffer | undefined;
  private workerPool: WorkerPool | undefined;
  private concurrencyController: ConcurrencyController | undefined;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private qrCode: string | null = null; // Store QR code
  private lastConnectTime: number = 0;
  private isLoggingOut: boolean = false;

  constructor() { }

  public getStatus() {
    return {
      status: this.sock?.user ? 'CONNECTED' : (this.qrCode ? 'WAITING_FOR_QR' : 'DISCONNECTED'),
      qr: this.qrCode
    };
  }

  public async logout(): Promise<void> {
    this.isLoggingOut = true;
    try {
      if (this.sock) {
        console.log('📤 Logging out from WhatsApp...');
        await this.sock.logout();
        this.sock = undefined;
        this.qrCode = null;
        this.reconnectAttempts = 0;
        console.log('✅ Logged out successfully');

        // Reinitialize to get new QR code
        setTimeout(() => this.initialize(), 2000);
      } else {
        console.log('⚠️ No active connection to logout from');
      }
    } catch (error) {
      console.error('❌ Logout error:', error);
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    console.log('🛑 Shutting down WhatsApp client...');

    try {
      // Stop concurrency controller
      if (this.concurrencyController) {
        this.concurrencyController.stop();
      }

      // Stop worker pool
      if (this.workerPool) {
        await this.workerPool.shutdown();
      }

      // Stop queue metrics collection
      messageQueueService.stopMetricsCollection();

      // Cleanup old queue messages
      await messageQueueService.cleanup();

      console.log('✅ WhatsApp client shutdown complete');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }


  async initialize() {
    this.isLoggingOut = false;
    console.log('🔌 Initializing Representative Agent...');

    // 1. Try to acquire session lock
    console.log('🔒 Attempting to acquire session lock...');
    // Wait slightly longer than the 2-minute lock expiry to ensure we catch the release
    const lockAcquired = await sessionManager.waitForLock(150000);

    if (!lockAcquired) {
      console.log('❌ Could not acquire session lock after 2.5 minutes.');
      console.log('   Another instance is likely stuck or running.');
      console.log('💡 The updated lock expiry is 2 minutes. This instance will exit and retry.');
      process.exit(1);
      return;
    }

    console.log('✅ Session lock acquired. Proceeding with connection...');

    // Use Postgres Auth for persistence
    const { state, saveCreds } = await usePostgresAuthState('whatsapp_session');

    console.log('🔍 Auth State Check:');
    console.log('   - Has existing credentials:', !!state.creds.me);
    console.log('   - Registration ID:', state.creds.registrationId);

    this.sock = makeWASocket({
      logger: pino({ level: 'silent' }) as any,
      auth: state,
      browser: ['Representative', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      // Add retry configuration
      retryRequestDelayMs: 500,
      maxMsgRetryCount: 3,
      // Prevent auto-reconnect on conflict
      shouldIgnoreJid: () => false,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('📌 Scan the QR Code below to connect:');
        this.qrCode = qr; // Save QR to state
        require('qrcode-terminal').generate(qr, { small: true });
      }

      if (connection === 'close') {
        const error = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const errorData = (lastDisconnect?.error as any)?.data;

        console.log('⚠️ Connection closed.');
        console.log('   Status Code:', error);
        console.log('   Error Data:', errorData);

        // Handle conflict (440) - another instance connected
        if (error === 440 && errorData?.tag === 'conflict') {
          console.log('❌ Session conflict detected (440: replaced).');
          console.log('   This means another instance connected with the same credentials.');
          console.log('💡 Releasing lock and exiting to prevent conflict loop...');

          // Release our lock since we've been replaced
          await sessionManager.releaseLock();
          process.exit(1);
          return;
        }

        // Handle corrupted session (405)
        if (error === 405) {
          console.log('❌ Session data is corrupted or invalid (405 error).');
          console.log('💡 Solution: Run "npx ts-node scripts/clear-auth.ts" to clear session and generate a new QR code.');
          await sessionManager.releaseLock();
          process.exit(1);
          return;
        }

        // Handle 401 (logged out)
        // Skip if intentional logout (prevent process exit loop)
        if ((error === 401 || error === DisconnectReason.loggedOut) && !this.isLoggingOut) {
          console.log('❌ Session logged out or invalid (401).');
          console.log('💡 Clearing auth credentials to allow re-scan...');
          // Import authCredentials in the file header first, but assuming it is available or I will fix the import
          await db.delete(authCredentials);
          await sessionManager.releaseLock();
          console.log('✅ Credentials cleared. Exiting to restart...');
          process.exit(1);
          return;
        }

        // Handle decryption errors (usually means corrupted keys)
        if (lastDisconnect?.error?.message?.includes('Unsupported state or unable to authenticate data')) {
          console.log('❌ Decryption error detected. Session keys are corrupted.');
          console.log('💡 Solution: Clear the auth_credentials table and restart to get a new QR code.');
          await sessionManager.releaseLock();
          process.exit(1);
          return;
        }

        const shouldReconnect = error !== DisconnectReason.loggedOut;

        // FLAPPING CHECK: Only reset attempts if last session was > 60s
        if (shouldReconnect) {
          const sessionDuration = Date.now() - this.lastConnectTime;
          if (this.lastConnectTime > 0 && sessionDuration > 60000) {
            console.log(`✅ Connection stable (${Math.round(sessionDuration / 1000)}s). Resetting backoff.`);
            this.reconnectAttempts = 0;
          } else if (this.lastConnectTime > 0) {
            console.warn(`⚠️ Connection unstable (${Math.round(sessionDuration / 1000)}s). Escalating backoff to avoid conflict loop.`);
          }
        }

        if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(3000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
          console.log(`⏳ Reconnecting in ${delay / 1000} seconds... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.initialize(), delay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.log('❌ Max reconnection attempts reached. Please check your connection and try again.');
          await sessionManager.releaseLock();
          process.exit(1);
        }
      } else if (connection === 'open') {
        console.log('✅ Representative Online!');
        this.qrCode = null;
        this.lastConnectTime = Date.now();

        // Initialize MessageSender with the connected socket
        this.messageSender = new MessageSender(this.sock!);

        // Initialize ConversationManager
        this.conversationManager = new ConversationManager(this.messageSender);

        // Initialize MessageBuffer
        this.messageBuffer = new MessageBuffer((jid, messages) => this.processMessageBatch(jid, messages));

        // Restore queue from database
        await messageQueueService.restoreQueue();

        // Initialize Worker Pool
        this.workerPool = new WorkerPool(
          messageQueueService,
          this.processMessageBatch.bind(this)
        );

        // Initialize Concurrency Controller
        this.concurrencyController = new ConcurrencyController(
          messageQueueService,
          this.workerPool
        );

        // Start worker pool and concurrency controller
        this.workerPool.start().catch(err => {
          console.error('❌ Worker pool error:', err);
        });
        this.concurrencyController.start();

        console.log('🎯 Advanced queue system initialized');

        // Initialize Notification Service
        if (this.sock) {
          notificationService.init(this.sock);
        }

        // Initialize Scheduler Service
        // This starts the cron jobs for morning motivation and evening summaries
        schedulerService.init(this);

        // Set presence to "available" (online)
        await this.messageSender.setOnline();
        console.log('👁️ Presence set to: Online');
      }
    });

    // ============================================================================
    // ERROR HANDLING: Bad MAC / Decryption Errors
    // ============================================================================

    // Track failed decryption attempts per JID to avoid spam
    const decryptionFailures = new Map<string, number>();
    const MAX_DECRYPT_FAILURES = 3;

    // Listen for Baileys internal errors (including Bad MAC)
    this.sock.ev.on('messaging-history.set', ({ isLatest }) => {
      if (isLatest) {
        console.log('✅ Message history synced');
        // Clear decryption failure tracking on successful sync
        decryptionFailures.clear();
      }
    });

    // Handle connection errors gracefully
    this.sock.ev.on('call', async (callEvents) => {
      // Handle incoming calls (optional: auto-reject)
      for (const call of callEvents) {
        console.log(`📞 Incoming call from ${call.from}, status: ${call.status}`);
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      // 🔍 DEBUG: Log every raw event to see if Baileys is firing
      console.log(`📨 Raw Event: ${type}, Count: ${messages.length}`);

      if (type !== 'notify') {
        console.log('Skipping event (not "notify")');
        return;
      }

      for (const msg of messages) {
        const jid = msg.key.remoteJid;
        const fromMe = msg.key.fromMe;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        const type = Object.keys(msg.message || {})[0];

        console.log(`🔍 Inspecting Msg: JID=${jid}, Me=${fromMe}, Type=${type}, Text=${text ? `"${text.substring(0, 20)}..."` : 'N/A'}`);

        if (!jid) {
          console.log('⏩ Skipping: No JID');
          continue;
        }

        if (fromMe) {
          console.log('⏩ Skipping: Sent by Me (Bot)');
          continue;
        }

        // ============================================================================
        // HANDLE DECRYPTION FAILURES (Bad MAC errors)
        // ============================================================================
        if (!msg.message || Object.keys(msg.message).length === 0) {
          console.warn(`⚠️  Message from ${jid} could not be decrypted (likely Bad MAC error)`);

          // Track failures
          const failureCount = (decryptionFailures.get(jid) || 0) + 1;
          decryptionFailures.set(jid, failureCount);

          if (failureCount >= MAX_DECRYPT_FAILURES) {
            console.error(`❌ Too many decryption failures for ${jid}. Notifying user and clearing session.`);

            // Send a helpful message to the user
            try {
              if (this.sock) {
                await this.sock.sendMessage(jid, {
                  text: "⚠️ I'm having trouble reading your messages due to an encryption issue. This usually happens when:\n\n" +
                    "1. You're using WhatsApp Web/Desktop\n2. Your session keys are out of sync\n\n" +
                    "**To fix this:**\n" +
                    "• Try sending your message again from your phone (not Web/Desktop)\n" +
                    "• Or wait a few minutes and try again\n\n" +
                    "If the problem persists, the bot admin may need to reset the connection."
                });
              }
            } catch (e) {
              console.error('Failed to send decryption error message:', e);
            }

            // Reset counter to avoid spam
            decryptionFailures.delete(jid);
          }

          continue; // Skip processing this undecryptable message
        }

        try {
          await this.handleIncomingMessage(msg);
        } catch (err: any) {
          console.error('❌ Error handling message:', err.message);
        }
      }
    });
  }

  /**
   * 1. Entry point for all incoming messages.
   * Handles "Local Guard" logic, Contact Creation, and Buffering.
   */
  private async handleIncomingMessage(msg: any) {
    let remoteJid = msg.key.remoteJid!;

    // Normalize JID (unifies Desktop/Phone history and logs)
    // e.g. Maps 128724850720810@lid -> 254745026933@s.whatsapp.net
    remoteJid = ownerService.normalizeJid(remoteJid);

    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    const pushName = msg.pushName;

    if (!text) return;
    if (remoteJid === 'status@broadcast') return;

    // Filter: Only respond to personal/direct messages (DMs)
    // Ignore group chats (@g.us) and broadcast channels (@broadcast, @newsletter)
    if (remoteJid.endsWith('@g.us')) {
      console.log(`⏩ Skipping: Group message from ${remoteJid}`);
      return;
    }

    if (remoteJid.includes('@broadcast') || remoteJid.includes('@newsletter')) {
      console.log(`⏩ Skipping: Broadcast/Channel message from ${remoteJid}`);
      return;
    }

    // Only process personal messages (ending with @s.whatsapp.net or @lid)
    // NOTE: This includes WhatsApp Business accounts as they use the same suffix
    if (!remoteJid.endsWith('@s.whatsapp.net') && !remoteJid.endsWith('@lid')) {
      console.log(`⏩ Skipping: Unknown JID format ${remoteJid}`);
      return;
    }

    console.log(`📥 Incoming DM: ${remoteJid} ("${text}")`);

    // Check OWNER Logic
    if (ownerService.isOwner(remoteJid)) {
      console.log(`👑 Owner Message Detected from ${remoteJid}`);
      // Add owner messages to buffer too - they will be processed as "Owner Commands" in processMessageBatch
      // We don't want to skip them, we want the AI to handle them as commands
    }

    // 1. Ensure Contact Exists (So we don't lose PushName info)
    let contact = await withRetry(async () => {
      return await db.select().from(contacts).where(eq(contacts.phone, remoteJid)).then(res => res[0]);
    });

    if (!contact) {
      console.log('✨ New Contact Detected! Creating profile...');
      const newContacts = await withRetry(async () => {
        return await db.insert(contacts).values({
          phone: remoteJid,
          originalPushname: pushName,
          name: IdentityValidator.extractDisplayName(pushName) || 'Unknown',
          summary: 'New contact. Interaction started.',
          trustLevel: 0,
          isVerified: false
        }).returning();
      });
      contact = newContacts[0];
    } else {
      // Update PushName if missing
      if (!contact.originalPushname && pushName) {
        await withRetry(async () => {
          await db.update(contacts).set({ originalPushname: pushName }).where(eq(contacts.phone, remoteJid));
        });
      }
    }

    // 2. Add to Buffer (Debounce)
    if (this.messageBuffer) {
      this.messageBuffer.add(remoteJid, text);
      // EMERGENCY FIX: Disabled ConversationManager to stop duplicate snitch reports
      // TODO: Re-enable after fixing rate limit loop
      // if (this.conversationManager) {
      //   this.conversationManager.touchConversation(remoteJid);
      // }
    }
  }

  /**
   * 2. Process a Batch of Messages from MessageBuffer.
   * This is where the AI actually runs (Costly).
   */
  private async processMessageBatch(remoteJid: string, messages: string[]) {
    // Combine messages into one context
    const fullText = messages.join('\n');
    const isOwner = ownerService.isOwner(remoteJid);

    // 0. Short Circuit: Ignore simple acks (UNLESS it's the owner, who might be commanding)
    if (!isOwner) {
      const ignoredPatterns = /^(ok|okay|k|lol|lmao|haha|thanks|thx|cool|👍|✅|yes|no|yeah|yup|nope)\.?$/i;
      if (ignoredPatterns.test(fullText.trim())) {
        console.log(`⏩ Short-circuit: Ignoring non-actionable message: "${fullText}"`);
        return;
      }
    }

    console.log(`🤖 AI Processing Batch for ${remoteJid} (Owner: ${isOwner}): "${fullText}"`);

    // 1. Check Rate Limit FIRST - Queue if limited (Owner bypasses limits optional, but keeping for safety)
    if (rateLimitManager.isLimited() && !isOwner) {
      console.log(`⏸️ Rate limited. Queueing message from ${remoteJid} (silent mode)`);
      rateLimitManager.enqueue(remoteJid, messages);
      return;
    }

    // 2. Get Contact
    const contact = await withRetry(async () => {
      return await db.select().from(contacts).where(eq(contacts.phone, remoteJid)).then(res => res[0]);
    });
    if (!contact) return;

    // Note: Conversation summaries will be sent after 20 min of inactivity via reportQueueService


    // 3. Identity Validation Logic (Skip for owner)
    let systemPrompt: string | undefined = undefined;

    if (!contact.isVerified && !isOwner) {
      const extractedName = IdentityValidator.extractNameFromMessage(fullText);
      if (extractedName) {
        console.log(`✅ Identity Discovered: ${extractedName}`);
        await withRetry(async () => {
          await db.update(contacts).set({
            confirmedName: extractedName,
            name: extractedName,
            isVerified: true,
            summary: `${contact.summary || ''}\n[Identity Confirmed: ${extractedName}]`
          }).where(eq(contacts.phone, remoteJid));
        });
        contact.name = extractedName;
        contact.isVerified = true;
      } else {
        const currentName = contact.confirmedName || contact.originalPushname;
        if (!IdentityValidator.isValidName(currentName)) {
          systemPrompt = IdentityValidator.getIdentityPrompt(currentName);
        }
      }
    }

    // 4. Load History
    const historyLogs = await withRetry(async () => {
      return await db.select()
        .from(messageLogs)
        .where(eq(messageLogs.contactPhone, remoteJid))
        .orderBy(desc(messageLogs.createdAt))
        .limit(10);
    });

    const history = historyLogs.reverse().map(m => `${m.role === 'agent' ? 'Me' : 'Them'}: ${m.content}`);

    // Log User Input
    await withRetry(async () => {
      await db.insert(messageLogs).values({
        contactPhone: remoteJid,
        role: 'user',
        content: fullText
      });
    });

    // 5. Generate Response
    // Inject OWNER Role into context
    const userRoleContext = isOwner ?
      `⚠️ IMPORTANT: You are chatting with the OWNER (Boss). You have full access to all tools including summaries, system status, and analytics. Obey all commands.` :
      `Contact Name: ${contact.name || "Unknown"}\nSummary: ${contact.summary}\nTrust Level: ${contact.trustLevel}`;

    // Helper to remove nulls
    const sanitizeProfile = (profile: any) => {
      if (!profile) return undefined;
      const sanitized: any = {};
      for (const [key, value] of Object.entries(profile)) {
        if (value !== null) sanitized[key] = value;
      }
      return sanitized;
    };

    // Fetch AI and User Profiles
    const currentAiProfile = await withRetry(async () => {
      return await db.select().from(aiProfile).limit(1).then(res => res[0]);
    });

    const currentUserProfile = await withRetry(async () => {
      return await db.select().from(userProfile).limit(1).then(res => res[0]);
    });

    let geminiResponse;
    try {
      geminiResponse = await geminiService.generateReply(
        history.concat(`Them: ${fullText}`),
        userRoleContext,
        isOwner,
        sanitizeProfile(currentAiProfile),
        sanitizeProfile(currentUserProfile),
        systemPrompt
      );
      console.log(`🧠 Gemini Response Type: ${geminiResponse.type}`);
      if (geminiResponse.type === 'text') console.log(`📝 Text Content: "${geminiResponse.content?.substring(0, 50)}..."`);
      if (geminiResponse.type === 'tool_call') console.log(`🛠️ Initial Tool Call: ${geminiResponse.functionCall?.name}`);
    } catch (error: any) {
      if ((error.status === 429 || error.code === 429 || error.message === 'ALL_KEYS_EXHAUSTED')) {
        // Queue message for later processing
        const { messageQueueService } = await import('../services/messageQueueService');
        await messageQueueService.enqueue(remoteJid, messages, isOwner ? 'owner' : 'normal');
        console.log(`⏸️ Rate limit hit. Queued ${messages.length} messages for ${remoteJid}. BackgroundWorker will retry.`);
        return;
      }
      console.error('Gemini Error:', error.message || error);
      if (isOwner && this.sock) await this.sock.sendMessage(remoteJid, { text: "⚠️ AI Error: " + (error.message || "Unknown error") });
      return;
    }



    // 6. Handle Tool Calls
    const MAX_TOOL_DEPTH = 5; // Increased from 2 to 5 to handle complex web searches
    let toolDepth = 0;

    while (geminiResponse.type === 'tool_call' && geminiResponse.functionCall && toolDepth < MAX_TOOL_DEPTH) {
      const { name, args } = geminiResponse.functionCall;
      console.log(`🛠️ Tool Execution: ${name}`);

      // Execute Tool
      let toolResult;
      try {
        toolResult = await executeLocalTool(name, args, { contact, userProfile: currentUserProfile });
      } catch (toolError: any) {
        console.error(`Tool error:`, toolError.message);
        toolResult = { error: "Tool failed: " + toolError.message };
      }

      // Feed result back
      const toolOutputText = `[System: Tool '${name}' returned: ${JSON.stringify(toolResult)}]`;

      try {
        geminiResponse = await geminiService.generateReply(
          history.concat(`Them: ${fullText}`, toolOutputText),
          userRoleContext,
          isOwner,
          sanitizeProfile(currentAiProfile),
          sanitizeProfile(currentUserProfile),
          systemPrompt
        );
      } catch (error: any) {
        if ((error.status === 429 || error.code === 429 || error.message === 'ALL_KEYS_EXHAUSTED') && !isOwner) {
          console.log(`⏸️ Rate limit hit during tool execution. Re-queueing batch.`);
          const retryAfter = error.errorDetails?.find((d: any) => d['@type']?.includes('RetryInfo'))?.retryDelay;
          const seconds = retryAfter ? parseInt(retryAfter) : 60;
          rateLimitManager.setRateLimited(seconds);
          rateLimitManager.enqueue(remoteJid, messages); // Re-queue original messages
          setTimeout(() => rateLimitManager.processQueue(this.processMessageBatch.bind(this)), seconds * 1000);
          return; // Exit completely
        }
        console.error('Gemini Tool Response Error:', error);
        if (isOwner && this.sock) await this.sock.sendMessage(remoteJid, { text: "⚠️ AI Error during tool: " + (error.message || "Unknown") });
        break;
      }
      toolDepth++;
    }

    // 7. Send Final Response
    if (geminiResponse.type === 'text' && geminiResponse.content) {
      await this.sendResponseAndLog(remoteJid, geminiResponse.content, contact, history, fullText);
    } else if (geminiResponse.type === 'tool_call') {
      // Loop exited but AI still wants to call tools. Prevent silent failure.
      console.warn(`⚠️ Max tool depth (${MAX_TOOL_DEPTH}) exceeded. Sending failover message.`);
      const errorMsg = "I'm having trouble getting all the information. I might be getting stuck in a research loop. Could you ask a more specific question?";
      await this.sendResponseAndLog(remoteJid, errorMsg, contact, history, fullText);
    }
  }

  // Helper to deduplicate sending logic
  private async sendResponseAndLog(remoteJid: string, responseText: string, contact: any, history: string[], userText: string) {
    console.log(`📤 Sending Response to ${remoteJid}: "${responseText.substring(0, 50)}..."`);
    let finalResponse = responseText;
    let shouldEndSession = false;

    // Check for Closing Tag
    if (responseText.includes('#END_SESSION#')) {
      shouldEndSession = true;
      finalResponse = responseText.replace('#END_SESSION#', '').trim();
    }

    // Send response
    if (this.messageSender) {
      await this.messageSender.sendText(remoteJid, finalResponse);
    } else {
      await this.sock!.sendMessage(remoteJid, { text: finalResponse });
    }

    // Log Outgoing
    await withRetry(async () => {
      await db.insert(messageLogs).values({
        contactPhone: remoteJid,
        role: 'agent',
        content: finalResponse
      });
    });

    // Manage Session
    if (this.conversationManager) {
      if (shouldEndSession) {
        console.log('🏁 Closing Intent Detected. Ending session.');
        this.conversationManager.endConversation(remoteJid);
      } else {
        this.conversationManager.touchConversation(remoteJid);
      }
    }

    // Profiling (Skip for owner or if rate limited)
    if (!ownerService.isOwner(remoteJid) && !rateLimitManager.isLimited()) {
      this.runProfiling(history.concat(`Them: ${userText}`, `Me: ${finalResponse}`), contact);
    }
  }

  /**
   * Public method to send a text message to any JID.
   * Useful for scheduled tasks and external triggers.
   */
  public async sendText(jid: string, text: string): Promise<void> {
    if (this.messageSender) {
      await this.messageSender.sendText(jid, text);
    } else if (this.sock) {
      await this.sock.sendMessage(jid, { text });
    } else {
      console.warn('⚠️ Cannot send message: Client not initialized');
    }
  }

  private async runProfiling(history: string[], contact: any) {
    if (rateLimitManager.isLimited()) return; // Double check

    // Add delay to avoid hitting rate limit immediately after response (Gemini free tier: 2 RPM)
    await new Promise(resolve => setTimeout(resolve, 5000));

    const profileUpdate = await geminiService.updateProfile(history, contact.summary || "");

    if (profileUpdate) {
      console.log(`📝 Updating profile for ${contact.phone}...`);

      await withRetry(async () => {
        await db.update(contacts)
          .set({
            name: profileUpdate.name || contact.name,
            summary: profileUpdate.summary,
            trustLevel: profileUpdate.trust_level
          })
          .where(eq(contacts.phone, contact.phone));
      });

      // 6. Alert Owner if Action Required - DISABLED (user wants summaries only, no alerts)
      // if (profileUpdate.action_required && config.ownerPhone) {
      //   const alertMsg = `*🛎️ ACTION REQUIRED*\n\nContact: ${profileUpdate.name || contact.phone}\nReason: ${profileUpdate.summary}\n\nReview chat to decide.`;
      //   const ownerJid = config.ownerPhone.includes('@s.whatsapp.net') ? config.ownerPhone : config.ownerPhone + '@s.whatsapp.net';
      //   console.log(`🛎️ Sending Profile Alert to Owner (${ownerJid})...`);
      //   await this.sock!.sendMessage(ownerJid, { text: alertMsg });
      // }
    }
  }
}
