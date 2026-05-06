// frontend/js/chatbot.js
// Floating chatbot widget — works on all pages

(function () {
  window.addEventListener('DOMContentLoaded', initChatbot);

  function initChatbot() {
    const btn      = document.getElementById('chatbot-btn');
    const win      = document.getElementById('chatbot-window');
    const closeBtn = document.getElementById('chatbot-close');
    const sendBtn  = document.getElementById('chat-send');
    const input    = document.getElementById('chat-input');
    const messages = document.getElementById('chatbot-messages');
    if (!btn || !win) return;

    btn.addEventListener('click', () => {
      const isOpen = !win.classList.contains('hidden');
      win.classList.toggle('hidden');
      if (!isOpen) {
        // Opening
        btn.querySelector('.notif-dot')?.remove(); // clear notification dot
        if (messages.children.length === 0) {
          addBotMessage('👋 Hi! I\'m **BloodBot**, your blood donation assistant!\n\nAsk me about:\n• Eligibility requirements\n• Blood type compatibility\n• How to donate or request blood\n• Emergency procedures\n• PDF receipts');
        }
        setTimeout(() => input?.focus(), 150);
      }
    });

    closeBtn?.addEventListener('click', () => win.classList.add('hidden'));
    sendBtn?.addEventListener('click', handleSend);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
  }

  async function handleSend() {
    const input = document.getElementById('chat-input');
    const text  = input?.value.trim();
    if (!text) return;
    input.value = '';

    addUserMessage(text);
    const typingId = addBotMessage('⏳ Thinking...', true);

    try {
      const data = await Chatbot.send(text);
      updateMessage(typingId, data.message);
    } catch (e) {
      updateMessage(typingId, '⚠️ Sorry, I\'m having trouble connecting. Please try again.');
    }
  }

  // Quick reply shortcut (called from HTML buttons)
  window.sendQuickReply = function (text) {
    const win   = document.getElementById('chatbot-window');
    const input = document.getElementById('chat-input');
    win?.classList.remove('hidden');
    if (input) { input.value = text; }
    setTimeout(handleSend, 100);
  };

  let msgId = 0;

  function addUserMessage(text) {
    const messages = document.getElementById('chatbot-messages');
    const div = document.createElement('div');
    div.className = 'chat-msg user';
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function addBotMessage(text, isTyping = false) {
    const messages = document.getElementById('chatbot-messages');
    const id  = `cm-${msgId++}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = `chat-msg bot${isTyping ? ' typing' : ''}`;
    div.innerHTML = renderBotText(text);
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return id;
  }

  function updateMessage(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('typing');
    el.innerHTML = renderBotText(text);
    const messages = document.getElementById('chatbot-messages');
    messages.scrollTop = messages.scrollHeight;
  }

  // Simple markdown-lite renderer (bold, bullets, newlines)
  function renderBotText(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^• (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul style="margin:.4rem 0 .4rem 1rem;">$1</ul>')
      .replace(/\n/g, '<br/>');
  }
})();
