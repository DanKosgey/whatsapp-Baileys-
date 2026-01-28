/**
 * Owner Service
 * Detects owner and provides owner-specific utilities
 */

import { config } from '../config/env';

export class OwnerService {
    private ownerPhone: string;

    constructor() {
        this.ownerPhone = config.ownerPhone || '';
        if (!this.ownerPhone) {
            console.warn('⚠️ OWNER_PHONE_NUMBER not set in .env - owner features disabled');
        }
    }

    /**
     * Check if a JID belongs to the owner
     */
    isOwner(jid: string): boolean {
        if (!this.ownerPhone) return false;

        // Extract phone number from JID (format: 1234567890@s.whatsapp.net or @lid)
        const phone = jid.split('@')[0];

        // Normalize both numbers (remove + and any spaces)
        const normalizedOwner = this.ownerPhone.replace(/[\+\s]/g, '');
        const normalizedPhone = phone.replace(/[\+\s]/g, '');

        // Check if it matches the main phone number
        if (normalizedPhone === normalizedOwner) return true;

        // Check/Hardcode the specific LID for Kosgey if desired or add logic
        // For now, let's just log the mismatch for debugging if needed, but return false
        // unless we add the LID to the allowed list.

        // Allow the LID seen in logs explicitly if it matches the 'known' lid
        // We will read this from config if present
        if (config.ownerLid && normalizedPhone === config.ownerLid) return true;

        // Fallback: Check known Owner IDs (e.g. from previous logs)
        if (normalizedPhone === '128724850720810') return true;

        return false;
    }

    /**
     * Get owner's phone number
     */
    getOwnerPhone(): string {
        return this.ownerPhone;
    }

    /**
     * Normalize a JID to its canonical phone number format
     * Maps known LIDs to their phone numbers
     */
    normalizeJid(jid: string): string {
        const normalized = jid.replace(/\+/g, '');

        // Map Kosgey's LID to Phone Number
        if (normalized.includes('128724850720810') || normalized === config.ownerLid) {
            return this.getOwnerJid();
        }

        return normalized;
    }

    /**
     * Get owner's JID for WhatsApp
     */
    getOwnerJid(): string {
        const normalizedPhone = this.ownerPhone.replace(/[\+\s]/g, '');
        return `${normalizedPhone}@s.whatsapp.net`;
    }
}

export const ownerService = new OwnerService();
