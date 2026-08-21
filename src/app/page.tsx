"use client";

import {
  ArrowUp,
  BusFront,
  Check,
  Clipboard,
  ExternalLink,
  GraduationCap,
  HeartPulse,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

type KnowledgeCard = {
  id: string;
  kind: "bus" | "emergency" | "faculty_contact" | "general" | string;
  title: string;
  aliases?: string[];
  department?: string;
  designation?: string;
  phone?: string;
  email?: string;
  schedule?: string | Array<string | Record<string, unknown>> | Record<string, unknown>;
  sourceUrl: string;
  verifiedAt: string;
  status?: string;
};

type Source = { title: string; url: string; verifiedAt: string };

type ApiResponse = {
  message: string;
  intent: "bus" | "emergency" | "faculty_contact" | "general";
  cards: KnowledgeCard[];
  sources: Source[];
  needsClarification: boolean;
  suggestions: string[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: ApiResponse;
  error?: boolean;
};

const quickPrompts = [
  {
    label: "শিক্ষক খুঁজুন",
    prompt: "এন্টোমলজি বিভাগের সাইফুল্লাহ স্যারের নম্বর দাও",
    icon: GraduationCap,
  },
  {
    label: "বাসের সময়",
    prompt: "জেনারেল বাসের সময়সূচি দেখাও",
    icon: BusFront,
  },
  {
    label: "জরুরি নম্বর",
    prompt: "BAU-এর জরুরি স্বাস্থ্যসেবার যোগাযোগ দাও",
    icon: HeartPulse,
  },
];

const initialMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "আসসালামু আলাইকুম! আমি BAU সহকারী। শিক্ষক যোগাযোগ, পরিবহন ও যাচাই করা জরুরি তথ্য খুঁজে দিতে পারি। কী জানতে চান?",
};

function formatVerifiedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function scheduleText(schedule: KnowledgeCard["schedule"]) {
  if (!schedule) return null;
  if (typeof schedule === "string") return schedule;
  if (Array.isArray(schedule)) {
    return schedule
      .map((item) =>
        typeof item === "string"
          ? item
          : Object.entries(item)
              .map(([key, value]) =>
                `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`,
              )
              .join(" · "),
      )
      .join(" | ");
  }
  return Object.entries(schedule)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

function RecordCard({
  card,
  copied,
  onCopy,
}: {
  card: KnowledgeCard;
  copied: string | null;
  onCopy: (id: string, value: string) => void;
}) {
  const schedule = scheduleText(card.schedule);
  const phoneHref = card.phone?.replace(/[^+\d]/g, "");
  const isVerified = card.status === "active" || card.status === "verified";

  return (
    <article className="record-card">
      <div className="record-card__topline">
        <span className={`record-kind record-kind--${card.kind}`}>
          {card.kind === "faculty_contact"
            ? "শিক্ষক"
            : card.kind === "bus"
              ? "পরিবহন"
              : card.kind === "emergency"
                ? "জরুরি"
                : "তথ্য"}
        </span>
        <span className={`verified-chip ${isVerified ? "" : "verified-chip--pending"}`}>
          <ShieldCheck size={13} /> {isVerified ? "যাচাই করা" : "তথ্য অপেক্ষমাণ"}
        </span>
      </div>

      <h3>{card.title}</h3>
      {(card.designation || card.department) && (
        <p className="record-meta">
          {[card.designation, card.department].filter(Boolean).join(" · ")}
        </p>
      )}

      <div className="record-details">
        {card.phone && (
          <div className="detail-row">
            <Phone size={17} />
            <a href={`tel:${phoneHref}`}>{card.phone}</a>
            <button
              type="button"
              className="copy-button"
              onClick={() => onCopy(card.id, card.phone!)}
              aria-label={`${card.title}-এর ফোন নম্বর কপি করুন`}
            >
              {copied === card.id ? <Check size={15} /> : <Clipboard size={15} />}
            </button>
          </div>
        )}
        {card.email && (
          <div className="detail-row">
            <Mail size={17} />
            <a href={`mailto:${card.email}`}>{card.email}</a>
          </div>
        )}
        {schedule && (
          <div className="detail-row detail-row--schedule">
            <BusFront size={17} />
            <span>{schedule}</span>
          </div>
        )}
      </div>

      <div className="record-footer">
        <span>{isVerified ? "যাচাই" : "শেষবার দেখা"}: {formatVerifiedDate(card.verifiedAt)}</span>
        <a href={card.sourceUrl} target="_blank" rel="noreferrer">
          অফিসিয়াল উৎস <ExternalLink size={13} />
        </a>
      </div>
    </article>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = messageListRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(content: string) {
    const cleanContent = content.trim();
    if (!cleanContent || loading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: cleanContent,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content: messageContent }) => ({
            role,
            content: messageContent,
          })),
        }),
      });

      if (!response.ok) throw new Error("Chat request failed");
      const result = (await response.json()) as ApiResponse;
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: result.message,
          result,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "এই মুহূর্তে তথ্য খোঁজা যাচ্ছে না। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।",
          error: true,
        },
      ]);
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  async function copyValue(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <main className="app-shell">
      <div className="field-pattern" aria-hidden="true" />

      <header className="site-header">
        <a href="#chat" className="brand" aria-label="BAU সহকারী হোম">
          <span className="brand-mark">বা</span>
          <span>
            <strong>BAU সহকারী</strong>
            <small>ক্যাম্পাস তথ্য, এক কথোপকথনে</small>
          </span>
        </a>
        <div className="source-status">
          <span className="status-dot" />
          BAU verified sources
        </div>
      </header>

      <section className="hero-copy">
        <span className="eyebrow">
          <Sparkles size={14} /> বাংলায় জিজ্ঞেস করুন
        </span>
        <h1>
          ক্যাম্পাসের দরকারি তথ্য,
          <span> খোঁজাখুঁজি ছাড়াই।</span>
        </h1>
        <p>
          শিক্ষক যোগাযোগ, বাস ও জরুরি তথ্য—প্রতিটি উত্তরের সঙ্গে পাবেন
          অফিসিয়াল উৎস এবং সর্বশেষ যাচাইয়ের সময়।
        </p>
      </section>

      <div className="workspace" id="chat">
        <aside className="route-panel" aria-label="দ্রুত প্রশ্ন">
          <div className="route-panel__header">
            <MapPin size={17} />
            <span>ক্যাম্পাস রুট</span>
          </div>
          <div className="route-line">
            {quickPrompts.map(({ label, prompt, icon: Icon }, index) => (
              <button
                type="button"
                className="route-stop"
                key={label}
                onClick={() => void sendMessage(prompt)}
                disabled={loading}
              >
                <span className="route-stop__dot">{index + 1}</span>
                <span className="route-stop__icon">
                  <Icon size={18} />
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>{index === 0 ? "নাম বা বিভাগ লিখুন" : "যাচাই করা তথ্য"}</small>
                </span>
              </button>
            ))}
          </div>
          <div className="trust-note">
            <ShieldCheck size={18} />
            <p>
              <strong>অনুমান নয়</strong>
              তথ্য না পেলে সহকারী সেটি পরিষ্কারভাবে জানাবে।
            </p>
          </div>
        </aside>

        <section className="chat-panel" aria-label="BAU সহকারী চ্যাট">
          <div className="chat-panel__bar">
            <div>
              <span className="assistant-avatar">বা</span>
              <span>
                <strong>BAU সহকারী</strong>
                <small>অনলাইন · বাংলা ও English</small>
              </span>
            </div>
            <button
              type="button"
              className="reset-button"
              onClick={() => setMessages([initialMessage])}
              disabled={loading}
              aria-label="নতুন কথোপকথন"
            >
              <RefreshCw size={16} />
              <span>নতুন চ্যাট</span>
            </button>
          </div>

          <div className="message-list" aria-live="polite" ref={messageListRef}>
            {messages.map((message) => (
              <div
                className={`message-row message-row--${message.role}`}
                key={message.id}
              >
                {message.role === "assistant" && (
                  <span className="message-avatar" aria-hidden="true">
                    বা
                  </span>
                )}
                <div className="message-content">
                  <div className={`bubble ${message.error ? "bubble--error" : ""}`}>
                    {message.content}
                  </div>

                  {message.result?.cards?.length ? (
                    <div className="record-grid">
                      {message.result.cards.map((card) => (
                        <RecordCard
                          key={card.id}
                          card={card}
                          copied={copied}
                          onCopy={copyValue}
                        />
                      ))}
                    </div>
                  ) : null}

                  {message.result?.sources?.length ? (
                    <div className="source-list" aria-label="তথ্যের উৎস">
                      {message.result.sources.map((source) => (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          key={`${source.url}-${source.title}`}
                        >
                          <ShieldCheck size={13} />
                          <span>{source.title}</span>
                          <ExternalLink size={12} />
                        </a>
                      ))}
                    </div>
                  ) : null}

                  {message.result?.suggestions?.length ? (
                    <div className="suggestion-list" aria-label="প্রস্তাবিত প্রশ্ন">
                      {message.result.suggestions.map((suggestion) => (
                        <button
                          type="button"
                          key={suggestion}
                          onClick={() => void sendMessage(suggestion)}
                          disabled={loading}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {loading && (
              <div className="message-row message-row--assistant">
                <span className="message-avatar" aria-hidden="true">
                  বা
                </span>
                <div className="typing-bubble" aria-label="উত্তর খোঁজা হচ্ছে">
                  <span /> <span /> <span />
                  <em>যাচাই করা তথ্য খুঁজছি</em>
                </div>
              </div>
            )}
          </div>

          <div className="mobile-prompts">
            {quickPrompts.map(({ label, prompt, icon: Icon }) => (
              <button
                type="button"
                key={label}
                onClick={() => void sendMessage(prompt)}
                disabled={loading}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <label htmlFor="question" className="sr-only">
              আপনার প্রশ্ন লিখুন
            </label>
            <textarea
              id="question"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (input.trim()) void sendMessage(input);
                }
              }}
              placeholder="যেমন: সাইফুল্লাহ স্যারের নম্বর দাও…"
              rows={1}
              maxLength={500}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              aria-label="প্রশ্ন পাঠান"
            >
              <ArrowUp size={20} />
            </button>
          </form>
          <p className="composer-note">
            ফোন ও ইমেইল সরাসরি যাচাই করা রেকর্ড থেকে দেখানো হয়।
          </p>
        </section>
      </div>

      <footer>
        Hackathon MVP · Bangladesh Agricultural University-এর অফিসিয়াল সাইটের
        তথ্যভিত্তিক
      </footer>
    </main>
  );
}
