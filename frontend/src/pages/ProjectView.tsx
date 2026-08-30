import { useParams } from 'react-router-dom';
import { useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export default function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const userMessage: Message = { role: 'user', content: input, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSending(true);

    // TODO: Send message to API, receive architecture updates
    const assistantMessage: Message = {
      role: 'assistant',
      content: 'Architecture advisor response will appear here.',
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMessage]);
    setSending(false);
  };

  return (
    <div className="project-view">
      <div className="conversation-panel">
        <div className="conversation-header">
          <h2>Project: {projectId}</h2>
        </div>
        <div className="messages">
          {messages.length === 0 && (
            <div className="empty-state">
              <p>Describe the architecture you want to build. For example:</p>
              <p><em>"I need a serverless REST API with DynamoDB, authentication, and a React frontend."</em></p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`message message-${msg.role}`}>
              <div className="message-content">{msg.content}</div>
            </div>
          ))}
          {sending && <div className="message message-assistant typing">Thinking...</div>}
        </div>
        <div className="input-area">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Describe your architecture..."
            rows={3}
          />
          <button className="btn btn-primary" onClick={handleSend} disabled={sending || !input.trim()}>
            Send
          </button>
        </div>
      </div>
      <div className="diagram-panel">
        <div className="diagram-header">
          <h2>Architecture Diagram</h2>
        </div>
        <div className="diagram-canvas">
          <div className="empty-state">
            <p>Your architecture diagram will appear here as you describe your system.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
