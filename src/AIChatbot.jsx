import React, { useState, useRef, useEffect } from 'react';
import './AIChatbot.css';

const WORKER_URL = "https://optiq.lloydthomas54321.workers.dev";

const AIChatbot = () => {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Greetings, I am OPTI-BOT, how may I assist you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: "If the user asks to try on glasses, go to the AR try-on tab, use the configurator, view the impact page, or recycle their lenses, you MUST include a special command in your response exactly like this: [NAVIGATE: <tab_name>] where <tab_name> is one of 'ar', 'configurator', 'scanner', 'impact', or 'recycle'. Do not include this command unless you are directing them to a tab." },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage.content }
          ]
        }),
      });

      if (!res.ok) throw new Error(`Worker error ${res.status}`);

      const data = await res.json();
      const botContent = data.reply || "I'm sorry, I couldn't process that request.";
      const navMatch = botContent.match(/\[NAVIGATE:\s*([a-zA-Z]+)\]/i);
      let cleanContent = botContent;
      if (navMatch) {
        cleanContent = botContent.replace(navMatch[0], '').trim();
        const targetTab = navMatch[1].toLowerCase();
        window.dispatchEvent(new CustomEvent('ai-navigate', { detail: targetTab }));
      }

      const botMessage = {
        role: 'assistant',
        content: cleanContent || "Directing you now..."
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error("Worker/Groq Error:", error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "⚠️ Could not reach the AI service. Please try again later." }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="ai-chatbot-container">
      <div className="chat-window">
        <div className="chat-header">
          <div className="header-info">
            <h3>OPTI-BOT</h3>
            <span className="status-badge">Online • Llama 3.3</span>
          </div>
        </div>

        <div className="chat-messages">
          {messages.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.role}`}>
              <div className="message-bubble">
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message-wrapper assistant">
              <div className="message-bubble loading">
                <div className="typing-dots">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="chat-input-area" onSubmit={handleSendMessage}>
          <input
            type="text"
            placeholder="Ask me about our glasses..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading || !input.trim()} className="send-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </form>
      </div>
    </div>
  );
};

export default AIChatbot;
