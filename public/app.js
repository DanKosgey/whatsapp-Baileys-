// API Configuration
const API_BASE = window.location.origin;
const POLL_INTERVAL = 3000; // Poll every 3 seconds

// State
let currentPage = 'dashboard';
let connectionStatus = 'DISCONNECTED';
let contacts = [];
let chats = [];

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initializeNavigation();
    initializeRefresh();
    initializeSettings();
    startStatusPolling();
    checkNotificationPermission();
    initializeTheme(); // Add this
});

// Theme Logic
// Theme Logic
function initializeTheme() {
    // Select all theme toggles (desktop and mobile)
    const toggleBtns = document.querySelectorAll('.theme-toggle');

    // Check saved theme or system preference
    const savedTheme = localStorage.getItem('theme');

    // Default to light if no save, or follow save
    let currentTheme = savedTheme || 'light';

    // Apply initial
    applyTheme(currentTheme);

    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(currentTheme);
            localStorage.setItem('theme', currentTheme);
        });
    });

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);

        // Update icons for ALL buttons
        toggleBtns.forEach(btn => {
            const sunIcon = btn.querySelector('.sun-icon');
            const moonIcon = btn.querySelector('.moon-icon');
            if (sunIcon && moonIcon) {
                if (theme === 'light') {
                    sunIcon.style.display = 'none';
                    moonIcon.style.display = 'block';
                } else {
                    sunIcon.style.display = 'block';
                    moonIcon.style.display = 'none';
                }
            }
        });
    }
}

// Navigation
function initializeNavigation() {
    // Desktop Sidebar
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            switchPage(page);
        });
    });

    // Mobile Bottom Nav
    const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
    mobileNavItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            switchPage(page);
        });
    });
}

function switchPage(page) {
    // Update nav (Desktop)
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) {
            item.classList.add('active');
        }
    });

    // Update nav (Mobile)
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) {
            item.classList.add('active');
        }
    });

    // Update pages
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });
    document.getElementById(`${page}-page`).classList.add('active');

    currentPage = page;

    // Load page data
    loadPageData(page);
}

function loadPageData(page) {
    switch (page) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'chats':
            loadChats();
            break;
        case 'contacts':
            loadContacts();
            break;
        case 'ai-profile':
            loadAIProfile();
            break;
        case 'user-profile':
            loadUserProfile();
            break;
        case 'settings':
            loadSettings();
            break;
    }
}

// Status Polling
function startStatusPolling() {
    checkStatus();
    setInterval(checkStatus, POLL_INTERVAL);
}

async function checkStatus() {
    try {
        const response = await fetch(`${API_BASE}/api/status`);
        const data = await response.json();

        updateConnectionStatus(data.status, data.qr);

        // If status changed, reload current page
        if (data.status !== connectionStatus) {
            connectionStatus = data.status;
            loadPageData(currentPage);
        }
    } catch (error) {
        console.error('Status check failed:', error);
        updateConnectionStatus('DISCONNECTED');
    }
}

function updateConnectionStatus(status, qr = null) {
    const statusEl = document.getElementById('connection-status');
    const indicator = statusEl.querySelector('.status-indicator');
    const label = statusEl.querySelector('.status-label');
    const detail = statusEl.querySelector('.status-detail');

    indicator.className = 'status-indicator';

    switch (status) {
        case 'CONNECTED':
            indicator.classList.add('connected');
            label.textContent = 'Connected';
            detail.textContent = 'WhatsApp is online';
            hideQRSection();
            break;
        case 'WAITING_FOR_QR':
            label.textContent = 'Waiting for QR';
            detail.textContent = 'Scan to connect';
            showQRCode(qr);
            break;
        default:
            indicator.classList.add('disconnected');
            label.textContent = 'Disconnected';
            detail.textContent = 'Not connected';
            hideQRSection();
    }
}

// QR Code Display
function showQRCode(qrData) {
    const qrSection = document.getElementById('qr-section');
    const qrContainer = document.getElementById('qr-code');
    const statsGrid = document.getElementById('stats-grid');

    qrSection.style.display = 'block';
    statsGrid.style.display = 'none';

    if (qrData) {
        // Use QRCode library or display as ASCII
        qrContainer.innerHTML = `
            <div style="width: 300px; height: 300px; display: flex; align-items: center; justify-content: center; background: white; border-radius: 16px;">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qrData)}" 
                     alt="QR Code" 
                     style="width: 280px; height: 280px;" />
            </div>
        `;
    }
}

function hideQRSection() {
    const qrSection = document.getElementById('qr-section');
    const statsGrid = document.getElementById('stats-grid');

    qrSection.style.display = 'none';
    statsGrid.style.display = 'grid';
}

// Dashboard
async function loadDashboard() {
    // Fire both requests in parallel
    // We don't await the second one so the first one can render immediately if it finishes first
    // Or more importantly, if one fails or hangs, it doesn't block the other completely

    // 1. Load Stats
    fetch(`${API_BASE}/api/stats`)
        .then(response => response.json())
        .then(stats => {
            updateDashboardStats({
                totalMessages: stats.totalMessages || 0,
                activeContacts: stats.totalContacts || 0,
                responseRate: stats.responseRate || 98,
                avgResponseTime: stats.avgResponseTime || '12s'
            });
        })
        .catch(error => {
            console.error('Failed to load stats:', error);
            updateDashboardStats({
                totalMessages: 0,
                activeContacts: 0,
                responseRate: 98,
                avgResponseTime: '12s'
            });
        });

    // 2. Load Activity (Independently)
    loadRecentActivity();
}

function updateDashboardStats(stats) {
    document.getElementById('total-messages').textContent = stats.totalMessages;
    document.getElementById('active-contacts').textContent = stats.activeContacts;
}

async function loadRecentActivity() {
    const activityList = document.getElementById('activity-list');

    try {
        const response = await fetch(`${API_BASE}/api/activity`);
        const activities = await response.json();

        if (activities.length === 0) {
            activityList.innerHTML = `
                <div class="activity-empty">
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                        <circle cx="32" cy="32" r="32" fill="#f3f4f6"/>
                        <path d="M32 20v24M20 32h24" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    <p>No recent activity</p>
                </div>
            `;
        } else {
            activityList.innerHTML = activities.map(activity => `
                <div class="activity-item" style="display: flex; gap: 1rem; align-items: start; padding: 1rem; background: var(--bg-primary); border-radius: 12px;">
                    <div class="activity-icon" style="
                        width: 32px; height: 32px; 
                        background: ${activity.type === 'outgoing' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(102, 126, 234, 0.1)'}; 
                        color: ${activity.type === 'outgoing' ? 'var(--success)' : 'var(--primary)'};
                        border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                           ${activity.type === 'outgoing'
                    ? '<path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />' // Send icon
                    : '<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>' // Message icon
                }
                        </svg>
                    </div>
                    <div class="activity-info" style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                            <span style="font-weight: 600; font-size: 0.875rem;">${activity.description}</span>
                            <span style="font-size: 0.75rem; color: var(--text-secondary);">${formatTime(new Date(activity.time).getTime())}</span>
                        </div>
                        <p style="font-size: 0.875rem; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${activity.detail}</p>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Failed to load activity:', error);
        activityList.innerHTML = `
            <div class="activity-empty">
                 <p style="color: var(--danger);">Failed to load activity</p>
            </div>
        `;
    }
}

// Chats
async function loadChats() {
    const chatList = document.getElementById('chat-list');

    try {
        const response = await fetch(`${API_BASE}/api/chats`);
        chats = await response.json();

        if (chats.length === 0) {
            chatList.innerHTML = `
                <div class="chat-empty">
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                        <circle cx="32" cy="32" r="32" fill="#f3f4f6"/>
                        <path d="M20 28h24M20 36h16" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    <p>No conversations yet</p>
                </div>
            `;
        } else {
            renderChatList(chats);
        }

        updateChatCount(chats.length);
    } catch (error) {
        console.error('Failed to load chats:', error);
        chatList.innerHTML = `
            <div class="chat-empty">
                <p style="color: var(--danger);">Failed to load chats</p>
            </div>
        `;
    }
}

function renderChatList(chats) {
    const chatList = document.getElementById('chat-list');
    chatList.innerHTML = chats.map(chat => `
        <div class="chat-item" data-jid="${chat.phone}" onclick="selectChat('${chat.phone}')">
            <div class="chat-avatar">${(chat.name || 'Unknown').charAt(0).toUpperCase()}</div>
            <div class="chat-info">
                <div class="chat-header">
                    <span class="chat-name">${chat.name || 'Unknown'}</span>
                    <span class="chat-time">${chat.lastMessageTime ? formatTime(new Date(chat.lastMessageTime).getTime()) : ''}</span>
                </div>
                <div class="chat-preview">${chat.lastMessage || 'No messages'}</div>
            </div>
        </div>
    `).join('');
}

async function selectChat(phone) {
    const chatDetail = document.getElementById('chat-detail');
    chatDetail.innerHTML = `
        <div style="padding: 2rem; width: 100%;">
            <h3>Loading conversation...</h3>
        </div>
    `;

    try {
        const response = await fetch(`${API_BASE}/api/chats/${phone}/messages`);
        const messages = await response.json();

        const contactResponse = await fetch(`${API_BASE}/api/contacts/${phone}`);
        const contact = await contactResponse.json();

        chatDetail.innerHTML = `
            <div class="chat-messages-container">
                <div class="chat-messages-header">
                    <div class="chat-avatar">${(contact.name || 'Unknown').charAt(0).toUpperCase()}</div>
                    <div>
                        <h3>${contact.name || 'Unknown'}</h3>
                        <p style="font-size: 0.875rem; color: var(--text-secondary);">${phone}</p>
                    </div>
                </div>
                <div class="chat-messages-list">
                    ${messages.map(msg => `
                        <div class="message ${msg.role === 'agent' ? 'message-sent' : 'message-received'}">
                            <div class="message-content">${msg.content}</div>
                            <div class="message-time">${formatTime(new Date(msg.createdAt).getTime())}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // Mobile specific: Show detail view
        if (window.innerWidth <= 768) {
            chatDetail.classList.add('active');

            // Add back button for mobile
            const header = chatDetail.querySelector('.chat-messages-header');
            if (header && !header.querySelector('.mobile-back-btn')) {
                const backBtn = document.createElement('button');
                backBtn.className = 'mobile-back-btn';
                backBtn.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                    </svg>
                `;
                // Use theme variables for colors
                backBtn.style.background = 'transparent';
                backBtn.style.border = 'none';
                backBtn.style.color = 'var(--text-primary)'; // Changed from 'white' to theme variable
                backBtn.style.marginRight = '0.5rem';
                backBtn.style.cursor = 'pointer';
                backBtn.style.display = 'flex';
                backBtn.style.padding = '8px';
                backBtn.style.borderRadius = '50%';

                // Add hover effect via inline style or class
                backBtn.onmouseover = () => backBtn.style.background = 'rgba(128, 128, 128, 0.1)';
                backBtn.onmouseout = () => backBtn.style.background = 'transparent';

                backBtn.onclick = (e) => {
                    e.stopPropagation();
                    chatDetail.classList.remove('active');
                };

                header.insertBefore(backBtn, header.firstChild);
            }
        } else {
            // Desktop: Add a close button
            const header = chatDetail.querySelector('.chat-messages-header');
            if (header && !header.querySelector('.desktop-close-btn')) {
                const closeBtn = document.createElement('button');
                closeBtn.className = 'desktop-close-btn';
                closeBtn.innerHTML = `
                     <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                         <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                     </svg>
                 `;

                closeBtn.style.marginLeft = 'auto'; // Push to right
                closeBtn.style.background = 'transparent';
                closeBtn.style.border = 'none';
                closeBtn.style.color = 'var(--text-secondary)';
                closeBtn.style.cursor = 'pointer';
                closeBtn.style.padding = '8px';
                closeBtn.style.borderRadius = '50%';
                closeBtn.style.display = 'flex';

                closeBtn.onclick = (e) => {
                    e.stopPropagation();
                    // Reset to empty state
                    chatDetail.innerHTML = `
                        <div class="chat-detail-empty">
                            <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                                <circle cx="40" cy="40" r="40" fill="#f3f4f6"/>
                                <path d="M30 35h20M30 45h14" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"/>
                            </svg>
                            <h3>Select a conversation</h3>
                            <p>Choose a chat from the list to view messages</p>
                        </div>
                     `;
                };

                header.appendChild(closeBtn);
            }
        }
    } catch (error) {
        console.error('Failed to load chat:', error);
        chatDetail.innerHTML = `
            <div class="chat-detail-empty">
                <p style="color: var(--danger);">Failed to load conversation</p>
            </div>
        `;
    }
}

function updateChatCount(count) {
    document.getElementById('chat-count').textContent = count;
}

// Contacts
async function loadContacts() {
    const contactsGrid = document.getElementById('contacts-grid');

    try {
        const response = await fetch(`${API_BASE}/api/contacts`);
        contacts = await response.json();

        if (contacts.length === 0) {
            contactsGrid.innerHTML = `
                <div class="contacts-empty">
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                        <circle cx="32" cy="32" r="32" fill="#f3f4f6"/>
                        <circle cx="32" cy="26" r="8" stroke="#9ca3af" stroke-width="2"/>
                        <path d="M20 50c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    <p>No contacts yet</p>
                </div>
            `;
        } else {
            renderContacts(contacts);
        }
    } catch (error) {
        console.error('Failed to load contacts:', error);
        contactsGrid.innerHTML = `
            <div class="contacts-empty">
                <p style="color: var(--danger);">Failed to load contacts</p>
            </div>
        `;
    }
}

function renderContacts(contacts) {
    const contactsGrid = document.getElementById('contacts-grid');
    contactsGrid.innerHTML = contacts.map(contact => `
        <div class="contact-card">
            <div class="contact-avatar">${contact.name.charAt(0).toUpperCase()}</div>
            <div class="contact-name">${contact.name}</div>
            <div class="contact-phone">${contact.phone}</div>
            <span class="contact-trust ${getTrustClass(contact.trustLevel)}">
                Trust Level: ${contact.trustLevel}
            </span>
        </div>
    `).join('');
}

function getTrustClass(level) {
    if (level >= 7) return 'high';
    if (level >= 4) return 'medium';
    return 'low';
}

// Settings
function loadSettings() {
    const statusEl = document.getElementById('settings-status');
    const phoneEl = document.getElementById('settings-phone');

    statusEl.textContent = connectionStatus === 'CONNECTED' ? 'Connected' : 'Disconnected';
    phoneEl.textContent = connectionStatus === 'CONNECTED' ? 'Connected' : 'Not connected';
}

function initializeSettings() {
    // Desktop notifications toggle
    const desktopNotif = document.getElementById('desktop-notifications');
    desktopNotif.checked = localStorage.getItem('desktop-notifications') === 'true';
    desktopNotif.addEventListener('change', (e) => {
        localStorage.setItem('desktop-notifications', e.target.checked);
        if (e.target.checked) {
            requestNotificationPermission();
        }
    });

    // Sound alerts toggle
    const soundAlerts = document.getElementById('sound-alerts');
    soundAlerts.checked = localStorage.getItem('sound-alerts') === 'true';
    soundAlerts.addEventListener('change', (e) => {
        localStorage.setItem('sound-alerts', e.target.checked);
    });

    // Disconnect button
    document.getElementById('disconnect-btn').addEventListener('click', async () => {
        if (confirm('Are you sure you want to disconnect WhatsApp? You will need to scan the QR code again to reconnect.')) {
            const btn = document.getElementById('disconnect-btn');
            const originalText = btn.textContent;
            btn.textContent = 'Disconnecting...';
            btn.disabled = true;

            try {
                const response = await fetch(`${API_BASE}/api/disconnect`, { method: 'POST' });
                const data = await response.json();

                if (data.success) {
                    btn.textContent = 'Disconnected ✓';

                    // Show success message
                    alert('Disconnected successfully! The app will now show a QR code for you to scan.');

                    // Switch to dashboard to show QR code
                    switchPage('dashboard');

                    // Force status check to update UI
                    setTimeout(() => {
                        checkStatus();
                        btn.textContent = originalText;
                        btn.disabled = false;
                    }, 1000);
                } else {
                    throw new Error(data.error || 'Disconnect failed');
                }
            } catch (error) {
                console.error('Disconnect failed:', error);
                alert('Disconnect failed: ' + error.message);
                btn.textContent = originalText;
                btn.disabled = false;
            }
        }
    });
}

// Refresh
function initializeRefresh() {
    // Dashboard (Main) Refresh
    document.getElementById('refresh-btn')?.addEventListener('click', () => {
        const btn = document.getElementById('refresh-btn');
        btn.style.transition = 'transform 0.5s ease';
        btn.style.transform = 'rotate(180deg)';
        loadPageData('dashboard');
        setTimeout(() => btn.style.transform = 'none', 500);
    });

    // Chats Refresh
    document.getElementById('refresh-chats-btn')?.addEventListener('click', () => {
        const btn = document.getElementById('refresh-chats-btn');
        btn.style.transition = 'transform 0.5s ease';
        btn.style.transform = 'rotate(180deg)';
        loadChats();
        setTimeout(() => btn.style.transform = 'none', 500);
    });

    // Contacts Refresh
    document.getElementById('refresh-contacts-btn')?.addEventListener('click', () => {
        const btn = document.getElementById('refresh-contacts-btn');
        btn.style.transition = 'transform 0.5s ease';
        btn.style.transform = 'rotate(180deg)';
        loadContacts();
        setTimeout(() => btn.style.transform = 'none', 500);
    });
}

// Notifications
function checkNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        // Don't auto-request, wait for user to enable in settings
    }
}

function requestNotificationPermission() {
    if ('Notification' in window) {
        Notification.requestPermission();
    }
}

function showNotification(title, body) {
    if ('Notification' in window &&
        Notification.permission === 'granted' &&
        localStorage.getItem('desktop-notifications') === 'true') {
        new Notification(title, {
            body,
            icon: '/icon.png',
            badge: '/badge.png'
        });
    }
}

// Utilities
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
}

// Search functionality
document.getElementById('chat-search')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    filterChats(query);
});

document.getElementById('contact-search')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    filterContacts(query);
});

function filterChats(query) {
    const filtered = chats.filter(chat =>
        chat.name.toLowerCase().includes(query) ||
        chat.lastMessage.toLowerCase().includes(query)
    );
    renderChatList(filtered);
}

function filterContacts(query) {
    const filtered = contacts.filter(contact =>
        contact.name.toLowerCase().includes(query) ||
        contact.phone.includes(query)
    );
    renderContacts(filtered);
}

// Export for global access
window.switchPage = switchPage;
window.selectChat = selectChat;

// AI Profile Functions
async function loadAIProfile() {
    try {
        const response = await fetch(`${API_BASE}/api/ai-profile`);
        const profile = await response.json();

        // Populate form fields
        document.getElementById('agent-name').value = profile.agentName || '';
        document.getElementById('agent-role').value = profile.agentRole || '';
        document.getElementById('personality-traits').value = profile.personalityTraits || '';
        document.getElementById('communication-style').value = profile.communicationStyle || '';
        document.getElementById('system-prompt').value = profile.systemPrompt || '';
        document.getElementById('response-length').value = profile.responseLength || 'medium';
        document.getElementById('formality-level').value = profile.formalityLevel || 5;
        document.getElementById('formality-value').textContent = profile.formalityLevel || 5;
        document.getElementById('use-emojis').checked = profile.useEmojis !== false;

        // Add formality slider listener
        document.getElementById('formality-level').addEventListener('input', (e) => {
            document.getElementById('formality-value').textContent = e.target.value;
        });

        // Add save button listener
        document.getElementById('save-ai-profile').addEventListener('click', saveAIProfile);
    } catch (error) {
        console.error('Failed to load AI profile:', error);
        alert('Failed to load AI profile');
    }
}

async function saveAIProfile() {
    const btn = document.getElementById('save-ai-profile');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        const data = {
            agentName: document.getElementById('agent-name').value,
            agentRole: document.getElementById('agent-role').value,
            personalityTraits: document.getElementById('personality-traits').value,
            communicationStyle: document.getElementById('communication-style').value,
            systemPrompt: document.getElementById('system-prompt').value || null,
            responseLength: document.getElementById('response-length').value,
            formalityLevel: parseInt(document.getElementById('formality-level').value),
            useEmojis: document.getElementById('use-emojis').checked
        };

        const response = await fetch(`${API_BASE}/api/ai-profile`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            btn.textContent = 'Saved ✓';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
            alert('AI Profile saved successfully! The changes will take effect in new conversations.');
        } else {
            throw new Error(result.error || 'Save failed');
        }
    } catch (error) {
        console.error('Failed to save AI profile:', error);
        alert('Failed to save AI profile: ' + error.message);
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// User Profile Functions
async function loadUserProfile() {
    try {
        const response = await fetch(`${API_BASE}/api/user-profile`);
        const profile = await response.json();

        // Populate form fields
        document.getElementById('user-full-name').value = profile.fullName || '';
        document.getElementById('user-preferred-name').value = profile.preferredName || '';
        document.getElementById('user-title').value = profile.title || '';
        document.getElementById('user-company').value = profile.company || '';
        document.getElementById('user-email').value = profile.email || '';
        document.getElementById('user-phone').value = profile.phone || '';
        document.getElementById('user-location').value = profile.location || '';
        document.getElementById('user-timezone').value = profile.timezone || '';
        document.getElementById('user-industry').value = profile.industry || '';
        document.getElementById('user-role').value = profile.role || '';
        document.getElementById('user-responsibilities').value = profile.responsibilities || '';
        document.getElementById('user-working-hours').value = profile.workingHours || '';
        document.getElementById('user-priorities').value = profile.priorities || '';
        document.getElementById('user-background').value = profile.backgroundInfo || '';

        // Add save button listener
        document.getElementById('save-user-profile').addEventListener('click', saveUserProfile);
    } catch (error) {
        console.error('Failed to load user profile:', error);
        alert('Failed to load user profile');
    }
}

async function saveUserProfile() {
    const btn = document.getElementById('save-user-profile');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        const data = {
            fullName: document.getElementById('user-full-name').value,
            preferredName: document.getElementById('user-preferred-name').value,
            title: document.getElementById('user-title').value,
            company: document.getElementById('user-company').value,
            email: document.getElementById('user-email').value,
            phone: document.getElementById('user-phone').value,
            location: document.getElementById('user-location').value,
            timezone: document.getElementById('user-timezone').value,
            industry: document.getElementById('user-industry').value,
            role: document.getElementById('user-role').value,
            responsibilities: document.getElementById('user-responsibilities').value,
            workingHours: document.getElementById('user-working-hours').value,
            priorities: document.getElementById('user-priorities').value,
            backgroundInfo: document.getElementById('user-background').value
        };

        const response = await fetch(`${API_BASE}/api/user-profile`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            btn.textContent = 'Saved ✓';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
            alert('Profile saved successfully! The AI will use this information to provide better responses.');
        } else {
            throw new Error(result.error || 'Save failed');
        }
    } catch (error) {
        console.error('Failed to save user profile:', error);
        alert('Failed to save user profile: ' + error.message);
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// Toast Notification System
function showToast(message, type = 'info', title = null) {
    const container = document.getElementById('toast-container');

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Icon based on type
    let icon = '';
    switch (type) {
        case 'success': icon = '✓'; break;
        case 'error': icon = '✕'; break;
        case 'info': icon = 'ℹ'; break;
        default: icon = '•';
    }

    // Title defaults
    if (!title) {
        switch (type) {
            case 'success': title = 'Success'; break;
            case 'error': title = 'Error'; break;
            case 'info': title = 'Info'; break;
        }
    }

    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Sound effect (optional, subtle)
    if (localStorage.getItem('sound-alerts') === 'true') {
        // const audio = new Audio('/notification.mp3'); 
        // audio.volume = 0.2;
        // audio.play().catch(() => {});
    }

    // Auto remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 400);
    }, 4000);
}

// Override native alert
window.alert = (msg) => {
    // Determine type based on msg content simplistic check
    if (msg && (typeof msg === 'string')) {
        if (msg.toLowerCase().includes('success') || msg.toLowerCase().includes('saved')) {
            showToast(msg, 'success');
        } else if (msg.toLowerCase().includes('failed') || msg.toLowerCase().includes('error')) {
            showToast(msg, 'error');
        } else {
            showToast(msg, 'info');
        }
    } else {
        showToast(String(msg), 'info');
    }
};

// Auto-scroll function
function scrollToBottom(element) {
    if (element) {
        element.scrollTop = element.scrollHeight;
    }
}

// Hook into chat rendering to auto-scroll
const originalSelectChat = window.selectChat;
window.selectChat = async function (phone) {
    if (originalSelectChat) await originalSelectChat(phone);
    const container = document.querySelector('.chat-messages-list');
    scrollToBottom(container);
};

// ===== TIMEZONE PICKER =====
const timezoneData = [
    // Americas
    { city: 'New York', country: 'USA', timezone: 'America/New_York', offset: 'UTC-5' },
    { city: 'Los Angeles', country: 'USA', timezone: 'America/Los_Angeles', offset: 'UTC-8' },
    { city: 'Chicago', country: 'USA', timezone: 'America/Chicago', offset: 'UTC-6' },
    { city: 'Denver', country: 'USA', timezone: 'America/Denver', offset: 'UTC-7' },
    { city: 'Phoenix', country: 'USA', timezone: 'America/Phoenix', offset: 'UTC-7' },
    { city: 'Toronto', country: 'Canada', timezone: 'America/Toronto', offset: 'UTC-5' },
    { city: 'Vancouver', country: 'Canada', timezone: 'America/Vancouver', offset: 'UTC-8' },
    { city: 'Mexico City', country: 'Mexico', timezone: 'America/Mexico_City', offset: 'UTC-6' },
    { city: 'São Paulo', country: 'Brazil', timezone: 'America/Sao_Paulo', offset: 'UTC-3' },
    { city: 'Buenos Aires', country: 'Argentina', timezone: 'America/Argentina/Buenos_Aires', offset: 'UTC-3' },
    { city: 'Lima', country: 'Peru', timezone: 'America/Lima', offset: 'UTC-5' },
    { city: 'Bogotá', country: 'Colombia', timezone: 'America/Bogota', offset: 'UTC-5' },
    { city: 'Santiago', country: 'Chile', timezone: 'America/Santiago', offset: 'UTC-3' },

    // Europe
    { city: 'London', country: 'UK', timezone: 'Europe/London', offset: 'UTC+0' },
    { city: 'Paris', country: 'France', timezone: 'Europe/Paris', offset: 'UTC+1' },
    { city: 'Berlin', country: 'Germany', timezone: 'Europe/Berlin', offset: 'UTC+1' },
    { city: 'Madrid', country: 'Spain', timezone: 'Europe/Madrid', offset: 'UTC+1' },
    { city: 'Rome', country: 'Italy', timezone: 'Europe/Rome', offset: 'UTC+1' },
    { city: 'Amsterdam', country: 'Netherlands', timezone: 'Europe/Amsterdam', offset: 'UTC+1' },
    { city: 'Brussels', country: 'Belgium', timezone: 'Europe/Brussels', offset: 'UTC+1' },
    { city: 'Vienna', country: 'Austria', timezone: 'Europe/Vienna', offset: 'UTC+1' },
    { city: 'Zurich', country: 'Switzerland', timezone: 'Europe/Zurich', offset: 'UTC+1' },
    { city: 'Stockholm', country: 'Sweden', timezone: 'Europe/Stockholm', offset: 'UTC+1' },
    { city: 'Oslo', country: 'Norway', timezone: 'Europe/Oslo', offset: 'UTC+1' },
    { city: 'Copenhagen', country: 'Denmark', timezone: 'Europe/Copenhagen', offset: 'UTC+1' },
    { city: 'Helsinki', country: 'Finland', timezone: 'Europe/Helsinki', offset: 'UTC+2' },
    { city: 'Warsaw', country: 'Poland', timezone: 'Europe/Warsaw', offset: 'UTC+1' },
    { city: 'Prague', country: 'Czech Republic', timezone: 'Europe/Prague', offset: 'UTC+1' },
    { city: 'Budapest', country: 'Hungary', timezone: 'Europe/Budapest', offset: 'UTC+1' },
    { city: 'Athens', country: 'Greece', timezone: 'Europe/Athens', offset: 'UTC+2' },
    { city: 'Istanbul', country: 'Turkey', timezone: 'Europe/Istanbul', offset: 'UTC+3' },
    { city: 'Moscow', country: 'Russia', timezone: 'Europe/Moscow', offset: 'UTC+3' },
    { city: 'Dublin', country: 'Ireland', timezone: 'Europe/Dublin', offset: 'UTC+0' },
    { city: 'Lisbon', country: 'Portugal', timezone: 'Europe/Lisbon', offset: 'UTC+0' },

    // Asia
    { city: 'Dubai', country: 'UAE', timezone: 'Asia/Dubai', offset: 'UTC+4' },
    { city: 'Mumbai', country: 'India', timezone: 'Asia/Kolkata', offset: 'UTC+5:30' },
    { city: 'Delhi', country: 'India', timezone: 'Asia/Kolkata', offset: 'UTC+5:30' },
    { city: 'Bangalore', country: 'India', timezone: 'Asia/Kolkata', offset: 'UTC+5:30' },
    { city: 'Singapore', country: 'Singapore', timezone: 'Asia/Singapore', offset: 'UTC+8' },
    { city: 'Hong Kong', country: 'Hong Kong', timezone: 'Asia/Hong_Kong', offset: 'UTC+8' },
    { city: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo', offset: 'UTC+9' },
    { city: 'Seoul', country: 'South Korea', timezone: 'Asia/Seoul', offset: 'UTC+9' },
    { city: 'Beijing', country: 'China', timezone: 'Asia/Shanghai', offset: 'UTC+8' },
    { city: 'Shanghai', country: 'China', timezone: 'Asia/Shanghai', offset: 'UTC+8' },
    { city: 'Bangkok', country: 'Thailand', timezone: 'Asia/Bangkok', offset: 'UTC+7' },
    { city: 'Kuala Lumpur', country: 'Malaysia', timezone: 'Asia/Kuala_Lumpur', offset: 'UTC+8' },
    { city: 'Jakarta', country: 'Indonesia', timezone: 'Asia/Jakarta', offset: 'UTC+7' },
    { city: 'Manila', country: 'Philippines', timezone: 'Asia/Manila', offset: 'UTC+8' },
    { city: 'Hanoi', country: 'Vietnam', timezone: 'Asia/Ho_Chi_Minh', offset: 'UTC+7' },
    { city: 'Taipei', country: 'Taiwan', timezone: 'Asia/Taipei', offset: 'UTC+8' },
    { city: 'Karachi', country: 'Pakistan', timezone: 'Asia/Karachi', offset: 'UTC+5' },
    { city: 'Dhaka', country: 'Bangladesh', timezone: 'Asia/Dhaka', offset: 'UTC+6' },
    { city: 'Riyadh', country: 'Saudi Arabia', timezone: 'Asia/Riyadh', offset: 'UTC+3' },
    { city: 'Tel Aviv', country: 'Israel', timezone: 'Asia/Jerusalem', offset: 'UTC+2' },

    // Africa
    { city: 'Cairo', country: 'Egypt', timezone: 'Africa/Cairo', offset: 'UTC+2' },
    { city: 'Lagos', country: 'Nigeria', timezone: 'Africa/Lagos', offset: 'UTC+1' },
    { city: 'Nairobi', country: 'Kenya', timezone: 'Africa/Nairobi', offset: 'UTC+3' },
    { city: 'Johannesburg', country: 'South Africa', timezone: 'Africa/Johannesburg', offset: 'UTC+2' },
    { city: 'Cape Town', country: 'South Africa', timezone: 'Africa/Johannesburg', offset: 'UTC+2' },
    { city: 'Casablanca', country: 'Morocco', timezone: 'Africa/Casablanca', offset: 'UTC+0' },
    { city: 'Accra', country: 'Ghana', timezone: 'Africa/Accra', offset: 'UTC+0' },
    { city: 'Addis Ababa', country: 'Ethiopia', timezone: 'Africa/Addis_Ababa', offset: 'UTC+3' },

    // Oceania
    { city: 'Sydney', country: 'Australia', timezone: 'Australia/Sydney', offset: 'UTC+10' },
    { city: 'Melbourne', country: 'Australia', timezone: 'Australia/Melbourne', offset: 'UTC+10' },
    { city: 'Brisbane', country: 'Australia', timezone: 'Australia/Brisbane', offset: 'UTC+10' },
    { city: 'Perth', country: 'Australia', timezone: 'Australia/Perth', offset: 'UTC+8' },
    { city: 'Auckland', country: 'New Zealand', timezone: 'Pacific/Auckland', offset: 'UTC+12' },
    { city: 'Wellington', country: 'New Zealand', timezone: 'Pacific/Auckland', offset: 'UTC+12' },
    { city: 'Fiji', country: 'Fiji', timezone: 'Pacific/Fiji', offset: 'UTC+12' }
];

function initializeTimezonePicker() {
    const searchInput = document.getElementById('timezone-search');
    const dropdown = document.getElementById('timezone-dropdown');
    const timezoneList = document.getElementById('timezone-list');
    const hiddenInput = document.getElementById('user-timezone');
    const displayEl = document.getElementById('timezone-display');

    if (!searchInput || !dropdown || !timezoneList) return;

    let selectedTimezone = null;

    // Render timezone list
    function renderTimezones(filter = '') {
        const filtered = timezoneData.filter(tz =>
            tz.city.toLowerCase().includes(filter.toLowerCase()) ||
            tz.country.toLowerCase().includes(filter.toLowerCase()) ||
            tz.timezone.toLowerCase().includes(filter.toLowerCase())
        );

        timezoneList.innerHTML = filtered.map(tz => `
            <div class="timezone-item" data-timezone="${tz.timezone}">
                <div class="timezone-item-city">${tz.city}, ${tz.country}</div>
                <div class="timezone-item-details">
                    <span class="timezone-item-offset">${tz.offset}</span>
                    <span>${tz.timezone}</span>
                </div>
            </div>
        `).join('');

        // Add click handlers
        timezoneList.querySelectorAll('.timezone-item').forEach(item => {
            item.addEventListener('click', () => {
                const timezone = item.dataset.timezone;
                const tzData = timezoneData.find(tz => tz.timezone === timezone);
                selectTimezone(tzData);
            });
        });
    }

    // Select timezone
    function selectTimezone(tzData) {
        selectedTimezone = tzData;
        hiddenInput.value = tzData.timezone;
        searchInput.value = `${tzData.city}, ${tzData.country}`;
        displayEl.textContent = `${tzData.timezone} (${tzData.offset})`;
        dropdown.classList.remove('active');
    }

    // Show/hide dropdown
    searchInput.addEventListener('focus', () => {
        dropdown.classList.add('active');
        renderTimezones(searchInput.value);
    });

    searchInput.addEventListener('input', (e) => {
        renderTimezones(e.target.value);
        dropdown.classList.add('active');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });

    // Load existing timezone if present
    const existingTimezone = hiddenInput.value;
    if (existingTimezone) {
        const tzData = timezoneData.find(tz => tz.timezone === existingTimezone);
        if (tzData) {
            searchInput.value = `${tzData.city}, ${tzData.country}`;
            displayEl.textContent = `${tzData.timezone} (${tzData.offset})`;
        }
    }

    // Initial render
    renderTimezones();
}

// Initialize timezone picker when user profile page loads
const originalLoadUserProfile = loadUserProfile;
loadUserProfile = async function () {
    await originalLoadUserProfile();
    initializeTimezonePicker();
};
