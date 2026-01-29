/**
 * Identity Validation Utility
 * Determines if a WhatsApp PushName is valid for professional use
 */

export class IdentityValidator {
    /**
     * Check if a PushName looks like a real, usable name
     */
    static isValidName(pushName: string | null | undefined): boolean {
        if (!pushName || pushName.trim() === '') return false;

        const name = pushName.trim();

        // Check 1: Too short (just "." or single character)
        if (name.length <= 1) return false;

        // Check 2: Only emojis or symbols
        const emojiRegex = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u;
        const symbolsRegex = /^[^\w\s]+$/;
        if (emojiRegex.test(name) || symbolsRegex.test(name)) return false;

        // Check 3: Generic placeholders
        const genericNames = [
            'user', 'iphone', 'android', 'whatsapp', 'wa',
            'phone', 'mobile', 'number', 'contact', 'unknown',
            'me', 'myself', 'i', 'hey', 'hi', 'hello',
            '.', '...', 'no name', 'noname', 'test'
        ];
        if (genericNames.includes(name.toLowerCase())) return false;

        // Check 4: Too long (likely a sentence or spam)
        if (name.length > 50) return false;

        // Check 5: Mostly numbers (e.g., "254712345678")
        const digitCount = (name.match(/\d/g) || []).length;
        if (digitCount / name.length > 0.7) return false;

        // Check 6: Contains too many special characters
        const specialCharCount = (name.match(/[^a-zA-Z0-9\s]/g) || []).length;
        if (specialCharCount / name.length > 0.5) return false;

        // Passed all checks - looks like a real name
        return true;
    }

    /**
     * Extract a usable display name from PushName
     * Returns null if name is invalid
     */
    static extractDisplayName(pushName: string | null | undefined): string | null {
        if (!this.isValidName(pushName)) return null;

        // Clean up the name
        const cleaned = pushName!.trim()
            .replace(/\s+/g, ' ') // Normalize spaces
            .replace(/[^\w\s'-]/g, ''); // Remove special chars except hyphens and apostrophes

        return cleaned || null;
    }

    /**
     * Generate a friendly prompt for the AI to ask for identity
     */
    static getIdentityPrompt(pushName: string | null | undefined): string {
        const reason = this.getInvalidReason(pushName);

        return `IDENTITY DISCOVERY REQUIRED:
The user's WhatsApp display name is "${pushName || 'not set'}" which ${reason}.

Your PRIMARY GOAL in this conversation is to:
1. Politely discover their real name
2. Find out how they know the owner (connection/context)
3. Understand why they're reaching out today

Be natural and professional. Don't make it feel like an interrogation.
Example: "Hey there! I don't have your name saved in my system—who am I speaking with so I can update my notes?"

After they provide their name, acknowledge it warmly and continue the conversation.`;
    }

    /**
     * Get the reason why a name is invalid
     */
    private static getInvalidReason(pushName: string | null | undefined): string {
        if (!pushName || pushName.trim() === '') return 'is not set';

        const name = pushName.trim();

        if (name.length <= 1) return 'is too short to be a real name';

        const emojiRegex = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u;
        if (emojiRegex.test(name)) return 'contains only emojis';

        const symbolsRegex = /^[^\w\s]+$/;
        if (symbolsRegex.test(name)) return 'contains only symbols';

        const genericNames = ['user', 'iphone', 'android', 'whatsapp', 'wa'];
        if (genericNames.includes(name.toLowerCase())) return 'appears to be a generic placeholder';

        if (name.length > 50) return 'is too long to be a real name';

        const digitCount = (name.match(/\d/g) || []).length;
        if (digitCount / name.length > 0.7) return 'is mostly numbers';

        return 'doesn\'t look like a professional name';
    }

    /**
     * Check if a message contains identity information
     * Returns extracted name if found, null otherwise
     */
    /**
     * Check if a message contains identity information
     * Returns extracted name if found, null otherwise
     */
    static extractNameFromMessage(message: string): string | null {
        // Disabled automatic extraction to prevent capturing phrases like "I am interested" as names.
        // We will rely on the AI agent to explicitly verify and update the contact name.
        return null;
    }
}
