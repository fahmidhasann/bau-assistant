import { z } from "zod";
import "server-only";
import { intentSchema } from "@/lib/types";

const hintSchema = z.object({
  intent: intentSchema,
  searchTerms: z.array(z.string().trim().min(1)).max(8).default([]),
});

export type QueryHints = z.infer<typeof hintSchema>;

function parseJsonObject(value: string): unknown {
  const cleaned = value.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Optional classifier only. It receives the student's query, never a contact
 * record, and it is not allowed to answer the question or invent facts.
 */
export async function classifyWithOpenRouter(query: string): Promise<QueryHints | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://bau-assistant.vercel.app",
        "X-OpenRouter-Title": "BAU Campus Assistant",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL ?? "openrouter/free",
        temperature: 0,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content: "You classify a Bangladesh Agricultural University student query. Return JSON only: {\"intent\":\"bus|emergency|faculty_contact|general\",\"searchTerms\":[\"short names or departments from the query\"]}. Never answer, guess, or add phone numbers, emails, schedules, URLs, or facts. Preserve Bengali and English names exactly.",
          },
          { role: "user", content: query.slice(0, 4000) },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = hintSchema.safeParse(parseJsonObject(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
