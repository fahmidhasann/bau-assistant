import { z } from "zod";

export const intentSchema = z.enum(["bus", "emergency", "faculty_contact", "general"]);
export type Intent = z.infer<typeof intentSchema>;

export const recordKindSchema = z.enum(["faculty_contact", "bus", "emergency"]);
export type RecordKind = z.infer<typeof recordKindSchema>;

export const recordStatusSchema = z.enum(["active", "inactive", "unknown"]);
export type RecordStatus = z.infer<typeof recordStatusSchema>;

export const scheduleItemSchema = z.object({
  route: z.string().optional(),
  days: z.array(z.string()).optional(),
  departures: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
export type ScheduleItem = z.infer<typeof scheduleItemSchema>;

export const knowledgeRecordSchema = z.object({
  id: z.string().min(1),
  kind: recordKindSchema,
  title: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  department: z.string().optional(),
  designation: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  schedule: z.array(scheduleItemSchema).optional(),
  notes: z.string().optional(),
  sourceUrl: z.string().url(),
  sourceType: z.enum(["official_bau", "curated", "generated"]),
  verifiedAt: z.string().min(1),
  status: recordStatusSchema,
});
export type KnowledgeRecord = z.infer<typeof knowledgeRecordSchema>;

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(50),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatSourceSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  verifiedAt: z.string(),
});
export type ChatSource = z.infer<typeof chatSourceSchema>;

export interface ChatResponse {
  message: string;
  intent: Intent;
  cards: KnowledgeRecord[];
  sources: ChatSource[];
  needsClarification: boolean;
  suggestions: string[];
}
