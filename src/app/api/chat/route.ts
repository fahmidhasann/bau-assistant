import { NextResponse } from "next/server";
import { classifyWithOpenRouter } from "@/lib/openrouter";
import {
  detectIntent,
  findRecords,
  isContactQuestion,
  normalizeText,
  searchableQuery,
} from "@/lib/knowledge";
import { chatRequestSchema, type ChatResponse, type Intent, type KnowledgeRecord } from "@/lib/types";

export const runtime = "nodejs";

const noAnswer = "এই বিষয়ে যাচাই করা তথ্য পাওয়া যায়নি। BAU-এর অফিসিয়াল ওয়েবসাইটে তথ্যটি খুঁজে দেখুন, অথবা প্রশাসনের কাছে নিশ্চিত করে নিন।";

function suggestionsFor(intent: Intent): string[] {
  if (intent === "faculty_contact") return ["এন্টোমলজি বিভাগের শিক্ষকদের খুঁজুন", "একজন শিক্ষকের নাম লিখুন", "ড্যাশবোর্ডে ফিরে যান"];
  if (intent === "bus") return ["বাসের সময়সূচি", "কোন রুটে বাস চলে?", "জরুরি নম্বর"];
  if (intent === "emergency") return ["অ্যাম্বুলেন্স নম্বর", "Health Care নম্বর", "বাসের সময়সূচি"];
  return ["বাসের সময়সূচি", "জরুরি নম্বর", "এন্টোমলজি বিভাগের শিক্ষক খুঁজুন"];
}

function formatRecord(record: KnowledgeRecord): string {
  const label = record.kind === "faculty_contact" ? "শিক্ষক" : record.kind === "bus" ? "বাস" : "জরুরি যোগাযোগ";
  if (record.status !== "active") {
    return `${label}: ${record.title}\n${record.notes ?? "এই রেকর্ডটি এখনো সক্রিয় নয়।"}`;
  }
  const fields = [
    record.phone ? `ফোন: ${record.phone}` : "ফোন: যাচাই করা নম্বর নেই",
    record.email ? `ইমেইল: ${record.email}` : "ইমেইল: দেওয়া নেই",
    record.department ? `বিভাগ: ${record.department}` : "",
    record.designation ? `পদবি: ${record.designation}` : "",
  ].filter(Boolean);
  return `${label}: ${record.title}\n${fields.join("\n")}${record.notes ? `\n${record.notes}` : ""}`;
}

function buildMessage(intent: Intent, records: KnowledgeRecord[], query: string, clarified = false): string {
  if (records.length === 0) return noAnswer;
  if (clarified || (intent === "faculty_contact" && records.length > 1 && !isContactQuestion(query))) {
    return `আপনার প্রশ্নের সঙ্গে মিলে ${records.length}টি রেকর্ড পাওয়া গেছে। সঠিক শিক্ষকটি বেছে নিতে নাম বা বিভাগটি আরও নির্দিষ্ট করে লিখুন।`;
  }
  const body = records.map(formatRecord).join("\n\n");
  const preface = intent === "faculty_contact" ? "অফিসিয়াল BAU তথ্য অনুযায়ী:" : "BAU-এর সংরক্ষিত তথ্য অনুযায়ী:";
  return `${preface}\n\n${body}`;
}

function officialSources(records: KnowledgeRecord[]) {
  return records.map((record) => ({ title: record.title, url: record.sourceUrl, verifiedAt: record.verifiedAt }));
}

function response(intent: Intent, records: KnowledgeRecord[], query: string, needsClarification = false): ChatResponse {
  return {
    message: buildMessage(intent, records, query, needsClarification),
    intent,
    cards: records,
    sources: officialSources(records),
    needsClarification,
    suggestions: suggestionsFor(intent),
  };
}

export async function POST(request: Request) {
  try {
    const raw: unknown = await request.json();
    const parsed = chatRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "বার্তাটি সঠিকভাবে পাঠানো হয়নি।" }, { status: 400 });
    }

    const lastUserMessage = [...parsed.data.messages].reverse().find((message) => message.role === "user");
    if (!lastUserMessage) {
      return NextResponse.json({ error: "একটি প্রশ্ন লিখুন।" }, { status: 400 });
    }

    const query = lastUserMessage.content;
    let intent = detectIntent(query);
    let records = findRecords(query, intent);
    let needsClarification = false;

    // OpenRouter is an optional query classifier. It never sees knowledge
    // records and therefore cannot become a source of contact information.
    if (intent === "general" || (records.length === 0 && searchableQuery(query).length > 0)) {
      const hints = await classifyWithOpenRouter(query);
      if (hints) {
        intent = hints.intent;
        const refinedQuery = [query, ...hints.searchTerms].join(" ");
        records = findRecords(refinedQuery, intent);
      }
    }

    if (intent === "faculty_contact" && records.length > 1) {
      const normalized = normalizeText(query);
      const hasSpecificName = records.some((record) => [record.title, ...record.aliases].some((field) => normalizeText(field).length > 2 && normalized.includes(normalizeText(field))));
      needsClarification = !hasSpecificName;
    }

    return NextResponse.json(response(intent, records, query, needsClarification));
  } catch {
    return NextResponse.json({ error: "সার্ভারে সাময়িক সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।" }, { status: 500 });
  }
}
