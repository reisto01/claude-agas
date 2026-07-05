// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyC32jU6h1JR9D3J2Lrw8a2J8kW9BJ9kwi4",
  authDomain: "claude-code-1f106.firebaseapp.com",
  projectId: "claude-code-1f106",
  storageBucket: "claude-code-1f106.firebasestorage.app",
  messagingSenderId: "1013459219670",
  appId: "1:1013459219670:web:21804e2a9340ebf1ef4577",
  measurementId: "G-XXDKNXVX9W"
};

// Initialize Firebase using compat syntax
let db = null;
window.firebaseInitError = "None";
try {
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
    } else {
        window.firebaseInitError = "Firebase CDN script not loaded.";
        console.warn("Firebase SDK not found.");
    }
} catch (e) {
    window.firebaseInitError = e.message;
    console.error("Firebase init failed:", e);
    try {
        if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
            db = firebase.firestore();
        }
    } catch(e2) {}
}

// DOM Elements
const textarea = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatHistory = document.getElementById('chat-history');
const greetingWrapper = document.getElementById('greeting-wrapper');
const suggestionChips = document.getElementById('suggestion-chips');

// State
let ws = null;
let messages = {}; // Maps message_id to DOM element
let currentSessionId = null; 

let isGenerating = false;
const sendIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"></path><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
const stopIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12"></rect></svg>`;

function setGenerating(state) {
    isGenerating = state;
    if (sendBtn) {
        sendBtn.innerHTML = state ? stopIcon : sendIcon;
    }
}

// Theme Toggle Logic
const themeToggleBtn = document.getElementById('theme-toggle');
const moonIcon = document.querySelector('.moon-icon');
const sunIcon = document.querySelector('.sun-icon');

function setTheme(isLight) {
    if (isLight) {
        document.body.classList.add('light-mode');
        if (moonIcon) moonIcon.style.display = 'none';
        if (sunIcon) sunIcon.style.display = 'block';
        localStorage.setItem('theme', 'light');
    } else {
        document.body.classList.remove('light-mode');
        if (moonIcon) moonIcon.style.display = 'block';
        if (sunIcon) sunIcon.style.display = 'none';
        localStorage.setItem('theme', 'dark');
    }
}

// Check saved theme on load
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light') {
    setTheme(true);
} else if (!savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    setTheme(true);
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        const isLightMode = document.body.classList.contains('light-mode');
        setTheme(!isLightMode);
    });
}

// History Drawer Logic
const historyBtn = document.getElementById('history-btn');
const historyDrawer = document.getElementById('history-drawer');
const closeDrawerBtn = document.getElementById('close-drawer-btn');
const historyList = document.getElementById('history-list');

if (historyBtn && historyDrawer) {
    historyBtn.addEventListener('click', () => {
        historyDrawer.classList.toggle('open');
        renderHistory();
    });
}

if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener('click', () => {
        historyDrawer.classList.remove('open');
    });
}

// New Chat Logic
const newChatBtn = document.querySelector('.new-chat-btn');
if (newChatBtn) {
    newChatBtn.addEventListener('click', () => {
        currentSessionId = null;
        chatHistory.innerHTML = '';
        chatHistory.style.display = 'none';
        document.querySelector('.chat-container').classList.remove('active-chat');
        if (greetingWrapper) greetingWrapper.style.display = 'flex';
        if (suggestionChips) suggestionChips.style.display = 'flex';
        messages = {};
    });
}

let isCreatingSession = false;
let sessionCreationPromise = null;
let saveTimeouts = {};

async function saveSessionMessage(msgId, role, text, isEdit = false) {
    if (!db) return;
    
    if (!currentSessionId) {
        if (!isCreatingSession) {
            isCreatingSession = true;
            sessionCreationPromise = db.collection('chats').add({
                title: text.substring(0, 30) + (text.length > 30 ? '...' : ''),
                timestamp: Date.now(),
                messages: {} 
            }).then(ref => {
                currentSessionId = ref.id;
                isCreatingSession = false;
            }).catch(e => {
                isCreatingSession = false;
                console.error("Creation error:", e);
                chatHistory.innerHTML += `<div style="color:red; padding:10px;">DB Error: ${e.message}</div>`;
                throw e;
            });
        }
        try {
            await sessionCreationPromise;
        } catch(e) {
            return; // Abort saving if session couldn't be created
        }
    }
    
    // Function to actually write to Firestore
    const writeToDb = async () => {
        try {
            await db.collection('chats').doc(currentSessionId).update({
                [`messages.${msgId}`]: { role, text, timestamp: Date.now() }
            });
        } catch (e) {
            console.error("Error saving message:", e);
        }
    };

    if (saveTimeouts[msgId]) {
        clearTimeout(saveTimeouts[msgId]);
    }
    
    // Only debounce 'edit' events. User messages and final 'message' events save immediately!
    if (isEdit) {
        saveTimeouts[msgId] = setTimeout(() => {
            writeToDb();
            delete saveTimeouts[msgId];
        }, 1000);
    } else {
        await writeToDb();
    }
}

let unsubscribeHistory = null;

function renderHistory() {
    if (!historyList) return;
    if (!db) {
        historyList.innerHTML = `<div class="empty-history" style="font-size:12px; color:#ff6b6b; padding:15px;">Database unavailable.<br><br>Error: ${window.firebaseInitError}</div>`;
        return;
    }
    
    if (unsubscribeHistory) {
        // Already listening
        return;
    }
    
    historyList.innerHTML = '<div class="empty-history">Loading chats...</div>';
    
    unsubscribeHistory = db.collection('chats').orderBy('timestamp', 'desc').limit(20).onSnapshot(snapshot => {
        if (snapshot.empty) {
            historyList.innerHTML = '<div class="empty-history">No saved chats yet</div>';
            return;
        }
        
        historyList.innerHTML = '';
        snapshot.forEach(doc => {
            const chat = doc.data();
            const btn = document.createElement('button');
            btn.className = 'history-item';
            btn.textContent = chat.title || 'Untitled';
            btn.title = new Date(chat.timestamp).toLocaleDateString();
            
            btn.addEventListener('click', () => loadSession(doc.id, chat));
            historyList.appendChild(btn);
        });
    }, error => {
        console.error("Error loading history:", error);
        historyList.innerHTML = `<div class="empty-history" style="color:red;">Error: ${error.message}</div>`;
    });
}

function loadSession(sessionId, chatData) {
    currentSessionId = sessionId;
    
    // Clear screen
    if (greetingWrapper) greetingWrapper.style.display = 'none';
    if (suggestionChips) suggestionChips.style.display = 'none';
    chatHistory.style.display = 'flex';
    document.querySelector('.chat-container').classList.add('active-chat');
    
    chatHistory.innerHTML = '';
    messages = {};
    
    // Close drawer
    historyDrawer.classList.remove('open');
    
    // Render all messages
    if (!chatData.messages || Object.keys(chatData.messages).length === 0) {
        chatHistory.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-secondary);">This conversation has no saved messages.</div>';
        return;
    }
    
    const msgArray = Object.keys(chatData.messages).map(id => {
        return { id, ...chatData.messages[id] };
    }).sort((a, b) => a.timestamp - b.timestamp);
    
    msgArray.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${msg.role}`;
        msgDiv.id = `msg-${msg.id}`;
        
        if (msg.role === 'assistant') {
            msgDiv.innerHTML = parseMarkdown(msg.text);
        } else {
            msgDiv.textContent = msg.text;
        }
        
        chatHistory.appendChild(msgDiv);
        messages[msg.id] = msgDiv;
    });
    
    scrollToBottom();
}

// Add auto-resize functionality to textarea
if (textarea) {
    textarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.value === '') {
            this.style.height = 'auto';
        }
    });

    textarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
}

function connectWebSocket() {
    let wsUrl = 'ws://localhost:8082/v1/ws/chat';
    
    // Check if we are hosted on the internet (like Vercel) instead of local machine
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        const urlParams = new URLSearchParams(window.location.search);
        let customWs = urlParams.get('ws');
        
        if (!customWs) {
            customWs = localStorage.getItem('tunnel_ws_url');
        } else {
            localStorage.setItem('tunnel_ws_url', customWs);
        }
        
        if (!customWs) {
            customWs = prompt("Enter your secure WebSocket Tunnel URL\n(e.g., wss://your-id.ngrok-free.app/v1/ws/chat):");
            if (customWs) {
                localStorage.setItem('tunnel_ws_url', customWs);
            }
        }
        
        if (customWs) {
            wsUrl = customWs;
        }
    }

    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log("Connected to Claude Agent backend");
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleServerMessage(data);
        } catch (e) {
            console.error("Error parsing websocket message:", e);
        }
    };
    
    ws.onclose = () => {
        console.log("Disconnected from backend. Reconnecting in 3s...");
        setTimeout(connectWebSocket, 3000);
    };
}

function handleServerMessage(data) {
    if (data.type === 'message') {
        setGenerating(true);
        saveSessionMessage(data.id, 'assistant', data.text);
        
        // Create new assistant message block
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message assistant';
        msgDiv.id = `msg-${data.id}`;
        
        // Simple markdown parsing for the chat view (using innerHTML for simplicity in this demo)
        msgDiv.innerHTML = parseMarkdown(data.text);
        
        chatHistory.appendChild(msgDiv);
        messages[data.id] = msgDiv;
        scrollToBottom();
    } else if (data.type === 'edit') {
        setGenerating(true);
        saveSessionMessage(data.id, 'assistant', data.text, true);
        
        const msgDiv = messages[data.id];
        if (msgDiv) {
            msgDiv.innerHTML = parseMarkdown(data.text);
            scrollToBottom();
        }
    } else if (data.type === 'delete') {
        const msgDiv = messages[data.id];
        if (msgDiv) {
            msgDiv.remove();
            delete messages[data.id];
        }
    } else if (data.type === 'done') {
        setGenerating(false);
    }
    
    if (idleTimeout) clearTimeout(idleTimeout);
    
    let isComplete = false;
    let timeoutDuration = 3000;
    
    if (data.text) {
        if (data.text.includes('thinking...') || 
            data.text.includes('Tool call:') || 
            data.text.includes('Launching')) {
            timeoutDuration = 30000;
        }
        
        if (data.text.includes('✅') || 
            data.text.includes('❌') || 
            data.text.includes('Complete') || 
            data.text.includes('Error')) {
            isComplete = true;
        }
    }

    if (isComplete) {
        setGenerating(false);
    } else {
        idleTimeout = setTimeout(() => {
            setGenerating(false);
        }, timeoutDuration);
    }
}

// 100% Foolproof DOM Observer to guarantee the Stop button reverts
const chatObserver = new MutationObserver(() => {
    if (!isGenerating) return;
    
    // Only check the very last message in the chat
    const lastMessage = chatHistory.lastElementChild;
    if (lastMessage) {
        const textContent = lastMessage.textContent || "";
        if (textContent.includes('✅') || textContent.includes('❌')) {
            setGenerating(false);
            if (idleTimeout) clearTimeout(idleTimeout);
        }
    }
});
chatObserver.observe(chatHistory, { childList: true, subtree: true, characterData: true });

function sendMessage() {
    if (isGenerating) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ command: "stop" }));
        }
        setGenerating(false);
        return;
    }

    const text = textarea.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

    // Hide intro screen elements
    if (greetingWrapper) greetingWrapper.style.display = 'none';
    if (suggestionChips) suggestionChips.style.display = 'none';
    
    // Add active-chat class
    document.querySelector('.chat-container').classList.add('active-chat');
    
    // Show chat history
    chatHistory.style.display = 'flex';

    // Save to Firestore
    const msgId = 'user-' + Date.now();
    saveSessionMessage(msgId, 'user', text);

    // Add user message to UI
    const userMsgDiv = document.createElement('div');
    userMsgDiv.className = 'message user';
    userMsgDiv.textContent = text;
    chatHistory.appendChild(userMsgDiv);
    
    // Clear input
    textarea.value = '';
    textarea.style.height = 'auto';
    scrollToBottom();

    // Send to backend
    setGenerating(true);
    ws.send(JSON.stringify({ text: text }));
}

function scrollToBottom() {
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

// Very basic markdown parser for demonstration
function parseMarkdown(text) {
    if (!text) return "";
    
    // 1. Remove "Thinking" sections explicitly
    // This catches "● Thinking", "Thinking:", "**Thinking**", etc., followed by a code block
    text = text.replace(/(?:●\s*)?\*?Thinking\*?:?[\s\n]*```[\s\S]*?```\n*/gi, '');
    
    // 2. Remove <thought>, <think>, <thinking> tags
    text = text.replace(/<(?:thought|thinking|think)>[\s\S]*?<\/(?:thought|thinking|think)>\n?/gi, '');

    // 2.5 Remove Tool Calls (Matches variations of 💭 🛠️ Tool call)
    text = text.replace(/💭.*?Tool call:[\s\S]*?(?:```[\s\S]*?```|`[^`]+`)[\s\n]*/gi, '');
    
    // 3. Remove standalone code blocks at the very beginning of the message that act as thoughts
    text = text.replace(/^[\s\n]*```(?:thought|thinking|text)?\s*\n[\s\S]*?```\n?/gi, function(match) {
        const lowerMatch = match.toLowerCase();
        if (lowerMatch.includes("thought") || lowerMatch.includes("thinking") || lowerMatch.includes("the user is") || lowerMatch.includes("hello! i can see")) {
            return "";
        }
        return match;
    });
    
    let html = text;
                   
    // Remove specific stdin error warning injected by the backend environment
    html = html.replace(/⚠️[\s\S]*?wait longer\.?/gi, '');
    html = html.replace(/⚠️\s*Error:[\s\S]*?(?=\n\n|$)/gi, '');

    html = html
        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/`/g, '') // Remove any unmatched stray backticks
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\\(.)/g, '$1') // Catch-all for markdown escapes
        .replace(/\n/g, '<br>');
        
    // Clean up any stray <br> at the beginning
    html = html.replace(/^(?:<br>\s*)+/, '');
    
    return html;
}

// Initialize dynamic greeting based on time of day
function updateGreeting() {
    const greetingElement = document.getElementById('greeting-text');
    const greetingIcon = document.getElementById('greeting-icon');
    if (!greetingElement || !greetingIcon) return;
    
    const hour = new Date().getHours();
    let timeOfDay = 'Evening';
    let icon = '☾';
    
    if (hour >= 5 && hour < 12) {
        timeOfDay = 'Morning';
        icon = '☼';
    } else if (hour >= 12 && hour < 17) {
        timeOfDay = 'Afternoon';
        icon = '✹';
    } else if (hour >= 17 && hour < 21) {
        timeOfDay = 'Evening';
        icon = '☾';
    } else {
        timeOfDay = 'Night';
        icon = '✧';
    }
    
    greetingElement.textContent = `${timeOfDay}, Agas`;
    greetingIcon.textContent = icon;
}

// Initialize
connectWebSocket();
updateGreeting();

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered', reg))
            .catch(err => console.error('Service Worker registration failed', err));
    });
}
