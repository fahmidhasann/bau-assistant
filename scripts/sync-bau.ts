/**
 * Sync the Entomology in-service teacher directory from BAU.
 *
 * This is deliberately a snapshot sync: the app never scrapes a user's
 * request. If the source is unavailable or looks incomplete, the previous
 * generated snapshot is left untouched.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const FACULTY_URL = "https://entom.bau.edu.bd/pages/faculty";
const API_URL = "https://app.bau.edu.bd/api/department/entom/teachers/inservice";
const OUTPUT = path.join(process.cwd(), "src/data/faculty.generated.json");
const TIMEOUT_MS = 20_000;

type ApiTeacher = {
  EMPLOYEE_ID?: string;
  EMPLOYEE_NAME?: string;
  DESIGNATION?: string;
  MOBILE?: string | null;
  EMAIL?: string | null;
};

type KnowledgeRecord = {
  id: string;
  kind: "faculty_contact";
  title: string;
  aliases: string[];
  department: string;
  designation?: string;
  phone?: string;
  email?: string;
  sourceUrl: string;
  sourceType: "official";
  verifiedAt: string;
  status: "verified";
};

function isOfficialUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "bau.edu.bd" || url.hostname.endsWith(".bau.edu.bd"));
  } catch {
    return false;
  }
}

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.replace(/\s+/g, " ").trim();
  return result || undefined;
}

function aliasesFor(name: string): string[] {
  const aliases = new Set<string>([name]);
  // The site currently includes a Bengali spelling in Shaef Ullah's name.
  const withoutTitle = name.replace(/^(prof\.?|dr\.?|মো\.?|ড\.?)[ .]*/i, "").trim();
  if (withoutTitle) aliases.add(withoutTitle);
  return [...aliases];
}

async function fetchText(url: string, headers?: Record<string, string>): Promise<string> {
  if (!isOfficialUrl(url)) throw new Error(`Refusing non-BAU URL: ${url}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "BAU-Assistant-Hackathon/1.0", ...headers },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function readPrevious(): Promise<KnowledgeRecord[]> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(OUTPUT, "utf8"));
    return Array.isArray(parsed) ? parsed as KnowledgeRecord[] : [];
  } catch {
    return [];
  }
}

function profileLinks(html: string): Map<string, string> {
  const $ = cheerio.load(html);
  const links = new Map<string, string>();
  $("a[href]").each((_, element) => {
    const raw = $(element).attr("href");
    if (!raw) return;
    try {
      const url = new URL(raw, FACULTY_URL);
      if (!isOfficialUrl(url.toString()) || url.hostname !== "entom.bau.edu.bd") return;
      const match = url.pathname.match(/\/teachers\/([^/]+)/i);
      if (match?.[1]) links.set(match[1].toUpperCase(), url.toString());
    } catch {
      // Ignore malformed links from the page.
    }
  });
  return links;
}

async function sync(): Promise<void> {
  const previous = await readPrevious();
  try {
    const apiKey = process.env.BAU_SYNC_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("BAU_SYNC_API_KEY is required to refresh the official directory snapshot");
    }
    // Parse the official page first. Nuxt may render cards client-side, so an
    // empty link map is allowed; IDs from the official BAU API are then used
    // to construct the documented profile route.
    const pageHtml = await fetchText(FACULTY_URL);
    const links = profileLinks(pageHtml);
    const raw = await fetchText(API_URL, { "X-API-KEY": apiKey, accept: "application/json" });
    const teachers: unknown = JSON.parse(raw);
    if (!Array.isArray(teachers) || teachers.length < 2) {
      throw new Error("Official teacher response is missing or incomplete");
    }

    const verifiedAt = new Date().toISOString();
    const records = (teachers as ApiTeacher[]).map((teacher): KnowledgeRecord => {
      const id = clean(teacher.EMPLOYEE_ID);
      const title = clean(teacher.EMPLOYEE_NAME);
      if (!id || !title) throw new Error("Teacher record has no ID or name");
      const sourceUrl = links.get(id.toUpperCase()) ?? `https://entom.bau.edu.bd/teachers/${encodeURIComponent(id)}`;
      if (!isOfficialUrl(sourceUrl)) throw new Error(`Invalid source URL for ${id}`);
      const phone = clean(teacher.MOBILE);
      const email = clean(teacher.EMAIL);
      return {
        id,
        kind: "faculty_contact",
        title,
        aliases: aliasesFor(title),
        department: "Entomology",
        designation: clean(teacher.DESIGNATION),
        ...(phone ? { phone } : {}),
        ...(email ? { email } : {}),
        sourceUrl,
        sourceType: "official",
        verifiedAt,
        status: "verified",
      };
    });

    const ids = new Set(records.map((record) => record.id));
    if (records.length < 2 || ids.size !== records.length) throw new Error("Duplicate or incomplete teacher snapshot");
    await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
    const temp = `${OUTPUT}.tmp-${process.pid}`;
    await fs.writeFile(temp, `${JSON.stringify(records, null, 2)}\n`, "utf8");
    await fs.rename(temp, OUTPUT);
    console.log(`Synced ${records.length} Entomology teachers to ${OUTPUT}`);
  } catch (error) {
    // Never replace a known-good snapshot with an outage or partial response.
    console.error(`BAU sync failed; retained previous snapshot (${previous.length} records).`, error);
    process.exitCode = 1;
  }
}

void sync();
