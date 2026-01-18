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
});

// Navigation
function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            switchPage(page);
        });
    });
}

function switchPage(page) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
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
        if (confirm('Are you sure you want to disconnect WhatsApp? This will log you out and you will need to scan the QR code again.')) {
            const btn = document.getElementById('disconnect-btn');
            const originalText = btn.textContent;
            btn.textContent = 'Disconnecting...';
            btn.disabled = true;

            try {
                const response = await fetch(`${API_BASE}/api/disconnect`, { method: 'POST' });
                const data = await response.json();

                if (data.success) {
                    alert('Disconnected successfully. The page will reload to show the new QR code.');
                    window.location.reload();
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
    document.getElementById('refresh-btn').addEventListener('click', () => {
        loadPageData(currentPage);
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
