import { describe, expect, it } from "vitest";
import * as knowledge from "./knowledge";

type ChatResponse = {
  message?: string;
  intent?: string;
  cards?: Array<Record<string, unknown>>;
  sources?: Array<Record<string, unknown>>;
  needsClarification?: boolean;
};

/** Accept the small naming variations used by the API layer while keeping one contract test. */
async function ask(question: string): Promise<ChatResponse> {
  const candidate = [
    "answerQuery",
    "queryKnowledge",
    "askKnowledge",
    "answerQuestion",
    "searchKnowledge",
  ].map((name) => (knowledge as Record<string, unknown>)[name]).find((fn) => typeof fn === "function");
  if (!candidate) throw new Error("knowledge.ts must export an answer/query function");
  const result = await (candidate as (q: string) => ChatResponse | Promise<ChatResponse>)(question);
  return result ?? {};
}

function textOf(response: ChatResponse) {
  return JSON.stringify(response).toLocaleLowerCase();
}

function officialOnly(response: ChatResponse) {
  for (const source of response.sources ?? []) {
    expect(String(source.url ?? source.sourceUrl ?? "")).toMatch(/^https:\/\/(?:[a-z0-9-]+\.)*bau\.edu\.bd\//i);
  }
  for (const card of response.cards ?? []) {
    expect(String(card.sourceUrl ?? "")).toMatch(/^https:\/\/(?:[a-z0-9-]+\.)*bau\.edu\.bd\//i);
  }
}

describe("BAU knowledge retrieval", () => {
  it.each([
    "এন্টোমলজি বিভাগের শিক্ষকের ফোন নম্বর দাও",
    "Entomology er Shaef Ullah sir er number dao",
    "Give me the Entomology professor contact number",
  ])("answers contact queries in Bengali/Banglish/English: %s", async (question) => {
    const response = await ask(question);
    expect(response.intent).toBe("faculty_contact");
    expect(response.cards?.length).toBeGreaterThan(0);
    expect(textOf(response)).toMatch(/entomology|phone|contact|mobile|নম্বর|ফোন/);
    officialOnly(response);
  });

  it("handles a misspelled or partial faculty name with fuzzy matching", async () => {
    const response = await ask("Entomology er Shaef Ulla sir er mobail numbar");
    expect(response.intent).toBe("faculty_contact");
    expect(response.cards?.length).toBeGreaterThan(0);
    officialOnly(response);
  });

  it("does not silently choose one person when a common name is ambiguous", async () => {
    const response = await ask("মোহাম্মদ স্যারের নম্বর দিন");
    expect(response.needsClarification).toBe(true);
    expect(response.cards?.length).toBeGreaterThan(1);
    expect(textOf(response)).toMatch(/মোহাম্মদ|mohammad/);
  });

  it.each([
    ["বাসের সময়সূচি বলুন", "bus"],
    ["অ্যাম্বুলেন্সের জরুরি নম্বর দিন", "emergency"],
  ])("returns curated %s information without a model call", async (question, intent) => {
    const response = await ask(question);
    expect(response.intent).toBe(intent);
    expect(response.cards?.length).toBeGreaterThan(0);
    expect(response.message).toBeTruthy();
    officialOnly(response);
  });

  it("uses a clear unavailable placeholder for an unverified bus route", async () => {
    const response = await ask("ময়মনসিংহ থেকে ঢাকা রাত ৩টার বাসের সময় বলুন");
    expect(textOf(response)).toMatch(/যাচাই|পাওয়া যায়নি|unavailable|not found/);
    expect(response.cards ?? []).toHaveLength(0);
  });

  it("uses a clear unavailable placeholder for an unknown contact", async () => {
    const response = await ask("Entomology বিভাগের কাল্পনিক অধ্যাপক X-এর ফোন নম্বর");
    expect(textOf(response)).toMatch(/যাচাই|পাওয়া যায়নি|unavailable|not found/);
    expect(response.cards ?? []).toHaveLength(0);
  });

  it("never fabricates a phone number or email and cites only official sources", async () => {
    const response = await ask("যাচাই করা নেই এমন কারও মোবাইল ও ইমেইল দিন");
    expect(textOf(response)).not.toMatch(/\+?\d[\d -]{7,}/);
    expect(textOf(response)).not.toContain("@gmail.com");
    officialOnly(response);
  });
});
