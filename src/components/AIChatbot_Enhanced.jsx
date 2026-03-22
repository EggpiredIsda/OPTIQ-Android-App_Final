import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';
import './AIChatbot.css';

const AIChatbot = () => {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Greetings, I am OPTI-BOT. How may I assist you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // The page version of the assistant doesn't require a floating 3D icon animation.
  // Keep minimal for performance and direct navigation experience.


  // Mock chatbot responses (replace with actual API call in production)
  const MOCK_RESPONSES = {
    materials: "We offer three sustainable materials: Recycled HDPE (0% upcharge), Recycled PET (+₱49), and Bio-PLA (+₱99). All are eco-friendly!",
    lens: "Our lens options include Clear, Blue Light Filter (+₱199), Polarised (+₱349), Gradient Tint (+₱249), and Photochromic (+₱449).",
    fit: "Our AI Face Fit Scanner can recommend the perfect size (Small, Medium, Large) based on your facial measurements.",
    price: "Base frame prices start at ₱149 for Wayfarer Bold, up to ₱249 for Cat-Eye Luxe. Customizations adjust the price.",
    shipping: "We ship within 5-7 business days. Delivery typically takes 2-3 business days within metro areas.",
    default: "That's a great question! I'm OPTI-BOT, here to help you customize your perfect pair of glasses. Ask me about materials, lenses, sizing, or our sustainability practices!",
  };

  const generateResponse = (userMsg) => {
    const lower = userMsg.toLowerCase();
    
    if (lower.includes('material')) return MOCK_RESPONSES.materials;
    if (lower.includes('lens')) return MOCK_RESPONSES.lens;
    if (lower.includes('fit') || lower.includes('size')) return MOCK_RESPONSES.fit;
    if (lower.includes('price') || lower.includes('cost')) return MOCK_RESPONSES.price;
    if (lower.includes('shipping') || lower.includes('delivery')) return MOCK_RESPONSES.shipping;
    
    return MOCK_RESPONSES.default;
  };

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
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));

      const botMessage = {
        role: 'assistant',
        content: generateResponse(input),
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "I encountered an error. Please try again." }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="ai-chatbot-container page-chatbot">
      <div className="chat-window page-chat-window">
            <div className="chat-header">
              <h3>OPTI-BOT Assistant</h3>
              <p style={{ fontSize: 11, opacity: 0.6 }}>Chat with your virtual optical assistant</p>
            </div>

            <div className="chat-messages">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  className={`chat-message ${msg.role}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="message-bubble">
                    {msg.content}
                  </div>
                </motion.div>
              ))}
              
              {isLoading && (
                <motion.div
                  className="chat-message assistant"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="message-bubble">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </motion.div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            <form className="chat-form" onSubmit={handleSendMessage}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about materials, lenses, sizing..."
                disabled={isLoading}
              />
              <button type="submit" disabled={!input.trim() || isLoading}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </form>
          </div>
    </div>
  );
};

export default AIChatbot;
