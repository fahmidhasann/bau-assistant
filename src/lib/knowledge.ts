import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Fuse from "fuse.js";
import curatedData from "@/data/curated.json";
import {
  knowledgeRecordSchema,
  type Intent,
  type KnowledgeRecord,
  type RecordKind,
} from "@/lib/types";

export const BAU_ORIGIN = "https://bau.edu.bd/";

function isOfficialBauUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "bau.edu.bd" || url.hostname.endsWith(".bau.edu.bd"));
  } catch {
    return false;
  }
}

function asRecord(value: unknown, fallbackType: "curated" | "generated"): KnowledgeRecord | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const sourceUrl = typeof item.sourceUrl === "string" && isOfficialBauUrl(item.sourceUrl)
    ? item.sourceUrl
    : BAU_ORIGIN;
  const parsed = knowledgeRecordSchema.safeParse({
    ...item,
    aliases: Array.isArray(item.aliases) ? item.aliases.filter((alias): alias is string => typeof alias === "string") : [],
    sourceUrl,
    sourceType: fallbackType,
    verifiedAt: typeof item.verifiedAt === "string" ? item.verifiedAt : new Date().toISOString().slice(0, 10),
    status: item.status === "active" || item.status === "verified"
      ? "active"
      : item.status === "inactive"
        ? "inactive"
        : "unknown",
  });
  return parsed.success ? parsed.data : null;
}

function readGeneratedRecords(): KnowledgeRecord[] {
  // The sync script writes this snapshot. A missing or malformed snapshot must
  // never prevent the app from serving the curated emergency/bus data.
  const candidates = [
    join(process.cwd(), "src/data/generated/entomology.json"),
    join(process.cwd(), "src/data/generated/entomology-teachers.json"),
    join(process.cwd(), "src/data/entomology.json"),
    join(process.cwd(), "src/data/faculty.generated.json"),
  ];
  const filename = candidates.find((candidate) => existsSync(candidate));
  if (!filename) return [];

  try {
    const raw: unknown = JSON.parse(readFileSync(filename, "utf8"));
    const list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && Array.isArray((raw as { records?: unknown }).records)
        ? (raw as { records: unknown[] }).records
        : [];
    return list.map((item) => asRecord(item, "generated")).filter((item): item is KnowledgeRecord => Boolean(item));
  } catch {
    return [];
  }
}

const curatedRecords = (curatedData as unknown[])
  .map((item) => asRecord(item, "curated"))
  .filter((item): item is KnowledgeRecord => Boolean(item));

export const knowledgeRecords: KnowledgeRecord[] = [...readGeneratedRecords(), ...curatedRecords];

export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("bn-BD")
    .replace(/[ঁংঃ]/g, "")
    .replace(/[েৈোৌ]/g, "")
    .replace(/[^ঀ-৿a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const stopWords = new Set([
  "দাও", "দিন", "দিয়ে", "দিয়", "দিয়েন", "বল", "বলুন", "চাই", "আমাকে", "এর", "এবং", "ও", "টা", "টি",
  "স্যার", "স্যারের", "ম্যাডাম", "ম্যাডামের", "অধ্যাপক", "অধ্যাপকের",
  "নম্বর", "নাম্বার", "ফোন", "মোবাইল", "যোগাযোগ", "তথ্য", "খুঁজে", "খুজে", "দেখাও", "কোথায়", "কোথায়",
  "the", "a", "an", "of", "and", "for", "please", "give", "me", "number", "phone", "contact", "info",
  "er", "e", "sir", "madam", "professor", "prof", "teacher", "department", "dept",
  "সময়", "সময়", "সময়টা", "সময়টা", "সময়সূচি", "সময়সূচি", "সূচি", "রুট", "জরুরি", "নম্বরটি",
  "বাস", "বস", "শাটল", "পরিবহন", "যাতায়াত", "যাতায়াত", "bus", "shuttle", "transport", "route", "schedule",
  "অ্যাম্বুলেন্স", "এম্বুলেন্স", "স্বাস্থ্য", "স্বাস্থ্যকেন্দ্র", "হেলথ", "মেডিকেল", "চিকিৎসা", "ambulance", "emergency", "health", "medical", "help",
  "বিভাগ", "বিভাগের", "শিক্ষক", "শিক্ষকের", "শিক্ষকদের", "এন্টোমলজি", "entomology",
  "dao", "den", "diben", "bolun", "number", "numbar", "mobail", "care",
]);

const normalizedStopWords = new Set([...stopWords].map((word) => normalizeText(word)));
const queryAliases: Record<string, string> = {
  [normalizeText("এন্টোমলজি")]: "entomology",
  [normalizeText("রহমান")]: "rahman",
  [normalizeText("মোহাম্মদ")]: "mohammad",
  [normalizeText("সাইফুল্লাহ")]: "shaef ullah",
  [normalizeText("সাইফুল্লা")]: "shaef ulla",
};

const intentTokens: Record<Intent, string[]> = {
  bus: ["বাস", "বস", "শাটল", "রুট", "পরিবহন", "যাতায়াত", "যাতায়াত", "bus", "shuttle", "transport", "route", "schedule"],
  emergency: ["জরুরি", "অ্যাম্বুলেন্স", "এম্বুলেন্স", "স্বাস্থ্য", "স্বাস্থ্যকেন্দ্র", "হেলথ", "মেডিকেল", "চিকিৎসা", "নিরাপত্তা", "পুলিশ", "ambulance", "emergency", "health", "medical", "help"],
  faculty_contact: ["শিক্ষক", "অধ্যাপক", "প্রফেসর", "স্যার", "ম্যাডাম", "ফ্যাকাল্টি", "অনুষদ", "যোগাযোগ", "নম্বর", "ফোন", "ইমেইল", "teacher", "professor", "faculty", "sir", "madam", "email", "phone", "contact"],
  general: [],
};

function containsAny(query: string, tokens: string[]): boolean {
  return tokens.some((token) => query.includes(normalizeText(token)));
}

export function detectIntent(query: string): Intent {
  const normalized = normalizeText(query);
  const hasBus = containsAny(normalized, intentTokens.bus);
  const hasEmergency = containsAny(normalized, intentTokens.emergency);
  const hasFaculty = containsAny(normalized, intentTokens.faculty_contact);
  if (hasEmergency) return "emergency";
  if (hasBus) return "bus";
  if (hasFaculty) return "faculty_contact";
  return "general";
}

export function searchableQuery(query: string): string {
  return normalizeText(query)
    .split(" ")
    .filter((token) => token.length > 1 && !normalizedStopWords.has(token) && ![...normalizedStopWords].some((stopWord) => stopWord.length > 2 && (token.startsWith(stopWord) || token.includes(stopWord))))
    .map((token) => queryAliases[token] ?? token)
    .join(" ");
}

export function findRecords(query: string, intent: Intent): KnowledgeRecord[] {
  if (intent === "general") return [];
  const kind: RecordKind = intent;
  const candidates = knowledgeRecords.filter((record) => record.kind === kind);
  if (candidates.length === 0) return [];

  const search = searchableQuery(query);
  // For curated categories, only category-only questions may show the
  // inactive placeholder. A route, destination, or unknown service must not
  // be made to look like a verified match merely because it contains “বাস”.
  if (intent !== "faculty_contact" && search) return [];

  const normalized = `${normalizeText(query)} ${searchableQuery(query)}`;
  const exactName = candidates.filter((record) => {
    const fields = [record.title, ...record.aliases]
      .filter((field): field is string => Boolean(field))
      .map(normalizeText);
    return fields.some((field) => field.length > 2 && normalized.includes(field));
  });
  if (exactName.length > 0) return exactName.slice(0, 8);

  // Department-only queries are useful, but do not let the department token
  // make an unknown person (e.g. “কাল্পনিক অধ্যাপক X”) match every teacher.
  const departmentMatches = candidates.filter((record) => record.department && normalized.includes(normalizeText(record.department)));
  const remainingSearch = searchableQuery(query)
    .split(" ")
    .filter((token) => token && token !== "entomology" && token !== "এন্টোমলজি");
  if (departmentMatches.length > 0 && remainingSearch.length === 0) return departmentMatches.slice(0, 8);

  // A generic category question should show all category records, including
  // inactive placeholders, so the UI can explain what still needs verification.
  if (!search) return candidates.slice(0, 8);
  // Curated bus/emergency data must never appear to answer an unknown route
  // or service. Exact aliases above are the only valid match for these kinds.
  if (intent !== "faculty_contact") return [];

  const fuse = new Fuse(candidates, {
    includeScore: true,
    threshold: 0.58,
    ignoreLocation: true,
    keys: [
      { name: "title", weight: 0.45 },
      { name: "aliases", weight: 0.3 },
      { name: "department", weight: 0.2 },
      { name: "designation", weight: 0.05 },
    ],
  });
  return fuse.search(search, { limit: 8 })
    .filter((result) => (result.score ?? 1) <= 0.58)
    .map((result) => result.item);
}

export function isContactQuestion(query: string): boolean {
  return containsAny(normalizeText(query), ["নম্বর", "নাম্বার", "ফোন", "মোবাইল", "ইমেইল", "যোগাযোগ", "phone", "number", "mobile", "email", "contact"]);
}

/** Small synchronous helper for local tests and non-HTTP consumers. */
export function answerQuery(query: string) {
  const intent = detectIntent(query);
  const cards = findRecords(query, intent);
  const normalized = normalizeText(query);
  const hasSpecificName = cards.some((record) =>
    [record.title, ...record.aliases].some(
      (field) => normalizeText(field).length > 2 && normalized.includes(normalizeText(field)),
    ),
  );
  const needsClarification = intent === "faculty_contact" && cards.length > 1 && !hasSpecificName;
  return {
    message: cards.length > 0 ? "অফিসিয়াল BAU তথ্য পাওয়া গেছে।" : "এই বিষয়ে যাচাই করা তথ্য পাওয়া যায়নি।",
    intent,
    cards,
    sources: cards.map((record) => ({ title: record.title, url: record.sourceUrl, verifiedAt: record.verifiedAt })),
    needsClarification,
    suggestions: [],
  };
}
