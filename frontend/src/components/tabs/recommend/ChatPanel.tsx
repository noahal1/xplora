import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, Send, User, Brain } from "lucide-react";
import type { ChatMessage } from "../../../types";

interface ChatPanelProps {
  messages: ChatMessage[];
  isProcessing: boolean;
  onSend: (text: string) => void;
}

export function ChatPanel({ messages, isProcessing, onSend }: ChatPanelProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isProcessing) return;
    setInput("");
    onSend(text);
  };

  return (
    <section className="card overflow-hidden animate-slide-down">
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <MessageSquare size={13} style={{ color: "var(--fg-muted)" }} />
        <span className="text-caption font-[510]">{t("recommend.chat_title")}</span>
      </div>

      <div className="px-4 py-3 max-h-[300px] overflow-y-auto space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 items-start max-w-[90%] ${msg.role === "user" ? "ml-auto flex-row-reverse" : ""}`}>
            <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs"
              style={{ background: msg.role === "user" ? "var(--accent-glow)" : "var(--bg-input)", border: "1px solid var(--border-subtle)" }}>
              {msg.role === "user" ? <User size={12} /> : <Brain size={12} />}
            </div>
            <div className="px-3 py-2 rounded-xl text-sm leading-relaxed break-words"
              style={msg.role === "user"
                ? { background: "var(--accent-glow)", border: "1px solid var(--primary-20)" }
                : { background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }
              }>
              {msg.content}
            </div>
          </div>
        ))}
        {isProcessing && (
          <div className="flex gap-2 items-start max-w-[85%]">
            <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs"
              style={{ background: "var(--bg-input)", border: "1px solid var(--border-subtle)" }}><Brain size={12} /></div>
            <div className="px-3 py-2 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
              <span className="text-sm" style={{ color: "var(--fg-muted)" }}>{t("recommend.chat_thinking")}</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="flex gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("recommend.chat_placeholder")}
          className="input-field flex-1 resize-none min-h-[36px] max-h-[120px] py-2 leading-relaxed"
          rows={1}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 120) + 'px';
          }}
        />
        <button
          onClick={handleSend}
          disabled={isProcessing || !input.trim()}
          className="btn btn-primary w-9 h-9 flex items-center justify-center shrink-0 self-end"
        >
          <Send size={14} />
        </button>
      </div>
    </section>
  );
}
