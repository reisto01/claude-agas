// DOM Elements
const textarea = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatHistory = document.getElementById('chat-history');
const greetingWrapper = document.getElementById('greeting-wrapper');
const suggestionChips = document.getElementById('suggestion-chips');

// State
let ws = null;
let messages = {}; // Maps message_id to DOM element

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
    ws = new WebSocket('ws://localhost:8082/v1/ws/chat');
    
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
    }
}

function sendMessage() {
    const text = textarea.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

    // Hide intro screen elements
    if (greetingWrapper) greetingWrapper.style.display = 'none';
    if (suggestionChips) suggestionChips.style.display = 'none';
    
    // Add active-chat class
    document.querySelector('.chat-container').classList.add('active-chat');
    
    // Show chat history
    chatHistory.style.display = 'flex';

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
    let icon = '✹';
    
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
