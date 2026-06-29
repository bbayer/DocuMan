"use client";

import { useState, useRef, useEffect } from "react";
import { updateRequirement } from "@/app/actions";

interface Requirement {
  id: string;
  itemNumber: string;
  uniqueId: string;
  category: string;
  title: string;
  content: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function AIChatPanel({
  open,
  onClose,
  requirement,
  projectId,
  documentId,
}: {
  open: boolean;
  onClose: () => void;
  requirement: Requirement | null;
  projectId: string;
  documentId: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastSuggestion, setLastSuggestion] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
    if (open && requirement) {
      setMessages([]);
      setLastSuggestion("");
    }
  }, [open, requirement?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: userMessage }],
          requirement: requirement
            ? {
                id: requirement.id,
                uniqueId: requirement.uniqueId,
                category: requirement.category,
                title: requirement.title,
                content: requirement.content,
              }
            : null,
          documentId,
          projectId,
        }),
      });

      if (!res.ok) {
        throw new Error("Chat request failed");
      }

      // Handle streaming response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          fullResponse += chunk;

          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: fullResponse,
            };
            return updated;
          });
        }
      }

      // Extract suggested requirement text from response (between ``` markers)
      const codeMatch = fullResponse.match(/```(?:requirement)?\n?([\s\S]*?)```/);
      if (codeMatch) {
        setLastSuggestion(codeMatch[1].trim());
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please check your AI API configuration.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!requirement || !lastSuggestion) return;
    await updateRequirement(
      requirement.id,
      lastSuggestion,
      requirement.title,
      projectId,
      documentId
    );
    setLastSuggestion("");
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "✅ Changes applied to the requirement." },
    ]);
  }

  return (
    <div className={`chat-panel ${open ? "open" : ""}`}>
      {/* Header */}
      <div className="chat-header">
        <div>
          <div className="font-semibold" style={{ fontSize: "var(--font-size-sm)" }}>
            AI Assistant
          </div>
          <div className="text-xs text-secondary">
            Requirements Engineering
          </div>
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Requirement reference */}
      {requirement && (
        <div className="chat-reference">
          <div className="flex items-center gap-2">
            <span className="chat-reference-id">{requirement.uniqueId}</span>
            <span className={`badge ${
              requirement.category === "REQUIREMENT"
                ? "badge-requirement"
                : requirement.category === "TITLE"
                ? "badge-title"
                : "badge-paragraph"
            }`} style={{ fontSize: "9px" }}>
              {requirement.category}
            </span>
          </div>
          <div className="chat-reference-content">
            {requirement.title && <strong>{requirement.title}: </strong>}
            {requirement.content}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "var(--space-8)", color: "var(--color-text-tertiary)" }}>
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              style={{ margin: "0 auto var(--space-3)" }}
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <div className="text-sm">
              {requirement
                ? "Ask me to edit, improve, or analyze this requirement."
                : "Select a requirement and click the AI Assist button."}
            </div>
            {requirement && (
              <div className="flex flex-col gap-2" style={{ marginTop: "var(--space-4)" }}>
                {[
                  "Make this more specific and measurable",
                  "Check for ambiguity",
                  "Rewrite for MIL-STD-498 compliance",
                  "Split into multiple requirements",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: "var(--font-size-xs)" }}
                    onClick={() => {
                      setInput(suggestion);
                      setTimeout(() => handleSend(), 0);
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-message chat-message-${msg.role === "user" ? "user" : "ai"}`}>
            <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2" style={{ padding: "var(--space-2)", color: "var(--color-text-tertiary)" }}>
            <div className="spinner" />
            <span className="text-xs">Thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Apply suggestion button */}
      {lastSuggestion && requirement && (
        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            borderTop: "1px solid var(--color-border)",
            background: "var(--color-accent-muted)",
          }}
        >
          <button
            className="btn btn-primary btn-sm"
            onClick={handleApply}
            style={{ width: "100%" }}
            id="apply-ai-suggestion"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Apply Suggested Changes
          </button>
        </div>
      )}

      {/* Input */}
      <div className="chat-input-area">
        <input
          ref={inputRef}
          className="chat-input"
          type="text"
          placeholder={requirement ? "Ask about this requirement..." : "Select a requirement first..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={!requirement || loading}
          id="chat-input"
        />
        <button
          className="btn btn-primary btn-icon"
          onClick={handleSend}
          disabled={!input.trim() || loading || !requirement}
          id="chat-send-btn"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
