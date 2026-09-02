import { useState, useRef, useEffect, useCallback } from 'react';
import { useConversationStore } from '../store/conversationStore';
import { useArchitectureStore } from '../store/architectureStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { api } from '../hooks/useApi';
import type { SendMessageResponse } from '@shared/types/api';

interface ConversationPanelProps {
  projectId: string;
}

export default function ConversationPanel({ projectId }: ConversationPanelProps) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { messages, streaming, streamBuffer, addMessage, appendToStream, finalizeStream } =
    useConversationStore();
  const { setArchitecture, setCostEstimate } = useArchitectureStore();

  const onChunk = useCallback(
    (text: string) => appendToStream(text),
    [appendToStream],
  );
  const onArchitecture = useCallback(
    (data: string) => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.model) setArchitecture(parsed.model);
        if (parsed.costEstimate) setCostEstimate(parsed.costEstimate);
      } catch {
        // ignore
      }
    },
    [setArchitecture, setCostEstimate],
  );
  const onDone = useCallback(() => finalizeStream(), [finalizeStream]);

  const { connected, send: wsSend } = useWebSocket({
    projectId,
    onChunk,
    onArchitecture,
    onDone,
    onError: (msg) => {
      finalizeStream();
      addMessage({ role: 'assistant', content: `Error: ${msg}`, timestamp: new Date().toISOString() });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamBuffer]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    addMessage({ role: 'user', content: text, timestamp: new Date().toISOString() });
    setInput('');
    setSending(true);

    if (connected) {
      wsSend(JSON.stringify({ action: 'sendMessage', projectId, message: text }));
      setSending(false);
      return;
    }

    try {
      const res = await api.post<SendMessageResponse>(`/projects/${projectId}/messages`, {
        projectId,
        message: text,
      });
      addMessage({ role: 'assistant', content: res.response, timestamp: new Date().toISOString() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send message';
      addMessage({ role: 'assistant', content: `Error: ${msg}`, timestamp: new Date().toISOString() });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="conversation-panel">
      <div className="conversation-header">
        <h2>Architecture Chat</h2>
        <span className={`ws-status ${connected ? 'ws-connected' : ''}`}>
          {connected ? 'Live' : 'REST'}
        </span>
      </div>
      <div className="messages">
        {messages.length === 0 && !streaming && (
          <div className="empty-state">
            <p>Describe the architecture you want to build. For example:</p>
            <p>
              <em>
                "I need a serverless REST API with DynamoDB, authentication, and a React
                frontend."
              </em>
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`message message-${msg.role}`}>
            {msg.content}
          </div>
        ))}
        {streaming && (
          <div className="message message-assistant typing">
            {streamBuffer || 'Thinking...'}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="input-area">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Describe your architecture..."
          rows={3}
        />
        <button
          className="btn btn-primary"
          onClick={handleSend}
          disabled={sending || streaming || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
