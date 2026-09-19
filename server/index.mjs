import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import helmet from 'helmet';
import cors from 'cors';
import pdfParse from 'pdf-parse';
import { GoogleGenAI } from '@google/genai';
import { OAuth2Client } from 'google-auth-library';
import { neon } from '@neondatabase/serverless';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = {
  port: Number(process.env.PORT || 5173),
  maxFileMb: Number(process.env.MAX_FILE_MB || 200),
  chunkSize: Number(process.env.CHUNK_SIZE || 1100),
  chunkOverlap: Number(process.env.CHUNK_OVERLAP || 180),
  topK: Number(process.env.RETRIEVAL_TOP_K || 5),
  dataPath: path.resolve(root, process.env.DATA_PATH || './data/store.json'),
  uploadPath: path.resolve(root, process.env.UPLOAD_PATH || './uploads'),
  model: process.env.GEMINI_CHAT_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  models: [
    process.env.GEMINI_CHAT_MODEL,
    process.env.GEMINI_MODEL,
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.6-flash',
  ].filter(Boolean),
  embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
  liveModel: process.env.GEMINI_LIVE_MODEL || 'gemini-2.0-flash-exp',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  sessionSecret: process.env.SESSION_SECRET || 'nabta-local-development-only',
};

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
const googleClient = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;
if (process.env.NODE_ENV === 'production' && config.googleClientId && !process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is required when Google Sign-In is enabled in production.');
const emptyStore = () => ({
  users: [],
  workspaces: [],
  documents: [],
  chunks: [],
  messages: [],
  guides: [],
  quizzes: [],
  attempts: [],
  concepts: [],
  masteryEvidence: [],
  vivaAttempts: [],
});

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
let dbReady = false;

async function ensureDb() {
  if (!sql || dbReady) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS app_store (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    dbReady = true;
  } catch (err) {
    console.error('Neon initialization error:', err.message);
  }
}

async function readStore() {
  if (sql) {
    await ensureDb();
    try {
      const rows = await sql`SELECT data FROM app_store WHERE id = 'main' LIMIT 1;`;
      if (rows && rows.length && rows[0]?.data) {
        const parsed = rows[0].data;
        return {
          ...emptyStore(),
          ...parsed,
          users: parsed.users || [],
          workspaces: parsed.workspaces || [],
          documents: parsed.documents || [],
          chunks: parsed.chunks || [],
          messages: parsed.messages || [],
          guides: parsed.guides || [],
          quizzes: parsed.quizzes || [],
          attempts: parsed.attempts || [],
          concepts: parsed.concepts || [],
          masteryEvidence: parsed.masteryEvidence || [],
          vivaAttempts: parsed.vivaAttempts || [],
        };
      }
      // Seed Neon from local file on first connect
      try {
        const local = JSON.parse(await readFile(config.dataPath, 'utf8'));
        if (local && Object.keys(local).length) {
          const jsonStr = JSON.stringify(local);
          await sql`
            INSERT INTO app_store (id, data, updated_at)
            VALUES ('main', ${jsonStr}::jsonb, NOW())
            ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
          `;
          console.log('Seeded Neon PostgreSQL with local data successfully!');
          return local;
        }
      } catch { }
    } catch (err) {
      console.error('Neon read failed, falling back to local file:', err.message);
    }
  }

  try {
    const parsed = JSON.parse(await readFile(config.dataPath, 'utf8'));
    return {
      ...emptyStore(),
      ...parsed,
      users: parsed.users || [],
      workspaces: parsed.workspaces || [],
      documents: parsed.documents || [],
      chunks: parsed.chunks || [],
      messages: parsed.messages || [],
      guides: parsed.guides || [],
      quizzes: parsed.quizzes || [],
      attempts: parsed.attempts || [],
      concepts: parsed.concepts || [],
      masteryEvidence: parsed.masteryEvidence || [],
      vivaAttempts: parsed.vivaAttempts || [],
    };
  } catch {
    return emptyStore();
  }
}

async function saveStore(store) {
  if (sql) {
    await ensureDb();
    try {
      const jsonStr = JSON.stringify(store);
      await sql`
        INSERT INTO app_store (id, data, updated_at)
        VALUES ('main', ${jsonStr}::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
      `;
      return;
    } catch (err) {
      console.error('Neon save failed, falling back to local file:', err.message);
    }
  }

  try {
    await mkdir(path.dirname(config.dataPath), { recursive: true });
    await writeFile(config.dataPath, JSON.stringify(store, null, 2));
  } catch { }
}

export function sanitizeText(value = '') {
  return String(value).replace(/\0/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function chunkPages(pages, size = config.chunkSize, overlap = config.chunkOverlap) {
  const chunks = [];
  for (const page of pages) {
    const text = sanitizeText(page.text);
    if (!text) continue;
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + size, text.length);
      if (end < text.length) {
        const boundary = Math.max(text.lastIndexOf('. ', end), text.lastIndexOf('\n', end), text.lastIndexOf(' ', end));
        if (boundary > start + size * 0.55) end = boundary + 1;
      }
      chunks.push({ id: randomUUID(), text: text.slice(start, end).trim(), page: page.page });
      if (end >= text.length) break;
      start = Math.max(end - overlap, start + 1);
    }
  }
  return chunks;
}

function tokens(text) {
  return sanitizeText(text).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
}

export function localEmbedding(text, dimensions = 192) {
  const vector = new Array(dimensions).fill(0);
  for (const token of tokens(text)) {
    const hash = createHash('sha256').update(token).digest();
    const index = hash.readUInt16BE(0) % dimensions;
    vector[index] += (hash[2] & 1) ? 1 : -1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

export function cosine(a, b) {
  return a.reduce((sum, value, index) => sum + value * (b[index] || 0), 0);
}

function encodeSession(user) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const signature = createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function decodeSession(token = '') {
  try {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    const expected = createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
    const a = Buffer.from(signature); const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return user.exp > Date.now() ? user : null;
  } catch { return null; }
}

function userFromRequest(req) {
  if (!config.googleClientId) return { id: 'guest-local', name: 'متعلم زائر', email: '', picture: '', isGuest: true };
  const cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter((pair) => pair.length === 2));
  return decodeSession(cookies.nabta_session);
}

function requireUser(req, res, next) {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'سجل الدخول بحساب جوجل للمتابعة.' });
  req.user = user; next();
}

export async function embed(text, taskType = 'RETRIEVAL_DOCUMENT') {
  if (!ai) return { values: localEmbedding(text), provider: 'local' };
  try {
    const response = await ai.models.embedContent({ model: config.embeddingModel, contents: text, config: { taskType } });
    return { values: response.embeddings?.[0]?.values || localEmbedding(text), provider: 'gemini' };
  } catch (error) {
    console.warn('Gemini embedding fallback:', error.message);
    return { values: localEmbedding(text), provider: 'local' };
  }
}

export function normalizeDigits(str) {
  return String(str || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

export function normalizeArabicText(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[ـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}

function cleanArabicNumberToken(t) {
  let s = t;
  if (s.startsWith('و') && s.length > 2) s = s.slice(1);
  if (s.startsWith('ال') && !s.startsWith('الف') && !s.startsWith('الاف') && s.length > 3) s = s.slice(2);
  return s;
}

export const ARABIC_NUM_WORDS = {
  // Units 1 - 9
  'واحد': 1, 'واحدة': 1, 'حادي': 1, 'اول': 1, 'اولى': 1, 'الاول': 1, 'الأول': 1, 'الاولى': 1, 'الأولى': 1,
  'اثنان': 2, 'اثنين': 2, 'اثنتان': 2, 'اثنتين': 2, 'اتنين': 2, 'تاني': 2, 'تانية': 2, 'ثاني': 2, 'ثانية': 2, 'الثاني': 2, 'الثانية': 2, 'التاني': 2, 'التانية': 2,
  'ثلاثة': 3, 'ثلاث': 3, 'تلاتة': 3, 'تلات': 3, 'ثالث': 3, 'ثالثة': 3, 'تالت': 3, 'تالتة': 3, 'الثالث': 3, 'الثالثة': 3, 'التالت': 3, 'التالتة': 3,
  'اربعة': 4, 'أربعة': 4, 'اربع': 4, 'رابع': 4, 'رابعة': 4, 'الرابع': 4, 'الرابعة': 4,
  'خمسة': 5, 'خمس': 5, 'خامس': 5, 'خامسة': 5, 'الخامس': 5, 'الخامسة': 5,
  'ستة': 6, 'ست': 6, 'سادس': 6, 'سادسة': 6, 'السادس': 6, 'السادسة': 6,
  'سبعة': 7, 'سبع': 7, 'سابع': 7, 'سابعة': 7, 'السابع': 7, 'السابعة': 7,
  'ثمانية': 8, 'ثمان': 8, 'ثماني': 8, 'تمانية': 8, 'تمن': 8, 'ثامن': 8, 'ثامنة': 8, 'تامن': 8, 'تامنة': 8, 'الثامن': 8, 'الثامنة': 8, 'التامن': 8, 'التامنة': 8,
  'تسعة': 9, 'تسع': 9, 'تاسع': 9, 'تاسعة': 9, 'التاسع': 9, 'التاسعة': 9,

  // 10
  'عشرة': 10, 'عشر': 10, 'عاشر': 10, 'عاشرة': 10, 'العاشر': 10, 'العاشرة': 10,

  // 11-19
  'احد عشر': 11, 'أحد عشر': 11, 'احدى عشرة': 11, 'احدعشر': 11, 'حداشر': 11, 'حادي عشر': 11, 'حادية عشرة': 11, 'الحادي عشر': 11, 'الحادية عشرة': 11, 'الحادية عشر': 11,
  'اثنا عشر': 12, 'اثني عشر': 12, 'اثنتا عشرة': 12, 'اثنتي عشرة': 12, 'اتناشر': 12, 'ثاني عشر': 12, 'ثانية عشرة': 12, 'تاني عشر': 12, 'الثاني عشر': 12, 'الثانية عشرة': 12,
  'ثلاثة عشر': 13, 'ثلاث عشر': 13, 'ثلاث عشرة': 13, 'تلاتاشر': 13, 'ثالث عشر': 13, 'ثالثة عشرة': 13, 'الثالث عشر': 13, 'الثالثة عشرة': 13,
  'اربعة عشر': 14, 'أربعة عشر': 14, 'اربع عشر': 14, 'اربع عشرة': 14, 'اربعتاشر': 14, 'رابع عشر': 14, 'الرابع عشر': 14, 'الرابعة عشرة': 14,
  'خمسة عشر': 15, 'خمس عشر': 15, 'خمس عشرة': 15, 'خمستاشر': 15, 'خامس عشر': 15, 'الخامس عشر': 15, 'الخامسة عشرة': 15,
  'ستة عشر': 16, 'ست عشر': 16, 'ست عشرة': 16, 'ستاشر': 16, 'سادس عشر': 16, 'السادس عشر': 16, 'السادسة عشرة': 16,
  'سبعة عشر': 17, 'سبع عشر': 17, 'سبع عشرة': 17, 'سبعتاشر': 17, 'سابع عشر': 17, 'السابع عشر': 17, 'السابعة عشرة': 17,
  'ثمانية عشر': 18, 'ثماني عشر': 18, 'ثماني عشرة': 18, 'تمنتاشر': 18, 'ثامن عشر': 18, 'الثامن عشر': 18, 'الثامنة عشرة': 18,
  'تسعة عشر': 19, 'تسع عشر': 19, 'تسع عشرة': 19, 'تسعتاشر': 19, 'تاسع عشر': 19, 'التاسع عشر': 19, 'التاسعة عشرة': 19,

  // Tens (20 - 90)
  'عشرون': 20, 'عشرين': 20, 'العشرون': 20, 'العشرين': 20,
  'ثلاثون': 30, 'ثلاثين': 30, 'تلاتين': 30, 'الثلاثون': 30, 'الثلاثين': 30,
  'اربعون': 40, 'أربعون': 40, 'اربعين': 40, 'أربعين': 40, 'الاربعون': 40, 'الأربعون': 40, 'الاربعين': 40, 'الأربعين': 40,
  'خمسون': 50, 'خمسين': 50, 'الخمسون': 50, 'الخمسين': 50,
  'ستون': 60, 'ستين': 60, 'الستون': 60, 'الستين': 60,
  'سبعون': 70, 'سبعين': 70, 'السبعون': 70, 'السبعين': 70,
  'ثمانون': 80, 'ثمانين': 80, 'تمانين': 80, 'الثمانون': 80, 'الثمانين': 80,
  'تسعون': 90, 'تسعين': 90, 'التسعون': 90, 'التسعين': 90,

  // Hundreds (100 - 900)
  'مائة': 100, 'مئة': 100, 'ميه': 100, 'مية': 100, 'المائة': 100, 'المئة': 100,
  'مائتان': 200, 'مائتين': 200, 'مئتان': 200, 'مئتين': 200, 'ميتين': 200, 'المائتان': 200, 'المائتين': 200,
  'ثلاثمائة': 300, 'ثلاثمئة': 300, 'تلاتمية': 300, 'ثلاث مائة': 300, 'ثلاث مئة': 300, 'تلات مية': 300,
  'اربعمائة': 400, 'أربعمائة': 400, 'اربعمئة': 400, 'أربعمئة': 400, 'اربعمية': 400, 'اربع مائة': 400, 'أربع مائة': 400, 'اربع مئة': 400, 'اربع مية': 400,
  'خمسمائة': 500, 'خمسمئة': 500, 'خمسمية': 500, 'خمس مائة': 500, 'خمس مئة': 500, 'خمس مية': 500,
  'ستمائة': 600, 'ستمئة': 600, 'ستمية': 600, 'ست مائة': 600, 'ست مئة': 600, 'ست مية': 600,
  'سبعمائة': 700, 'سبعمئة': 700, 'سبعمية': 700, 'سبع مائة': 700, 'سبع مئة': 700, 'سبع مية': 700,
  'ثمانمائة': 800, 'ثمانمئة': 800, 'تمنمية': 800, 'ثماني مائة': 800, 'ثمان مائة': 800, 'تمن مية': 800,
  'تسعمائة': 900, 'تسعمئة': 900, 'تسعمية': 900, 'تسع مائة': 900, 'تسع مئة': 900, 'تسع مية': 900,

  // Thousands
  'الف': 1000, 'ألف': 1000, 'الألف': 1000, 'الالف': 1000,
  'الفين': 2000, 'ألفين': 2000, 'الفان': 2000, 'ألفان': 2000, 'الألفين': 2000, 'الالفين': 2000,
  'الاف': 1000, 'آلاف': 1000
};

// Backwards-compatibility alias
export const ARABIC_ORDINALS = ARABIC_NUM_WORDS;

const NORMALIZED_NUM_MAP = {};
for (const [k, v] of Object.entries(ARABIC_NUM_WORDS)) {
  NORMALIZED_NUM_MAP[normalizeArabicText(k)] = v;
}

export function parseArabicWordsToNumber(phrase) {
  if (!phrase) return null;
  const cleaned = normalizeArabicText(phrase)
    .replace(/(?:صفحة|صفحه|الصفحة|الصفحه|شريحة|شريحه|الشريحة|الشريحه|سلايد|السلايد|ورقة|ورقه|الورقة|الورقه|ص|رقم|نمرة)/g, ' ')
    .trim();

  const rawTokens = cleaned.split(/[\s،,]+/).filter(Boolean);
  if (rawTokens.length === 0) return null;

  const tokens = rawTokens.map(cleanArabicNumberToken);

  let total = 0;
  let currentGroup = 0;
  let matchedCount = 0;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let val = undefined;

    if (i + 1 < tokens.length) {
      const two = t + ' ' + tokens[i + 1];
      if (NORMALIZED_NUM_MAP[two] !== undefined) {
        val = NORMALIZED_NUM_MAP[two];
        i++;
        matchedCount += 2;
      }
    }
    if (val === undefined && NORMALIZED_NUM_MAP[t] !== undefined) {
      val = NORMALIZED_NUM_MAP[t];
      matchedCount += 1;
    }

    if (val !== undefined) {
      if (val === 1000) {
        if (currentGroup === 0) currentGroup = 1;
        total += currentGroup * 1000;
        currentGroup = 0;
      } else if (val === 2000) {
        total += 2000;
        currentGroup = 0;
      } else {
        currentGroup += val;
      }
    }
  }

  total += currentGroup;
  return matchedCount > 0 && total > 0 ? total : null;
}

export function isConversationalGreeting(text) {
  if (!text) return false;
  const clean = String(text)
    .toLowerCase()
    .replace(/[ـ]/g, '')
    .replace(/[،,\.!?؟¡¿]/g, '')
    .trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;

  const greetings = [
    // Arabic
    'اهلا', 'أهلا', 'اهلاً', 'أهلاً', 'مرحبا', 'مرحباً', 'هلا', 'اهلين', 'أهلين', 'يا هلا', 'مرحبتين',
    'سلام', 'سلام عليكم', 'السلام عليكم', 'صباح الخير', 'مساء الخير', 'يعطيك العافية',
    'هاي', 'ازيك', 'إزيك', 'عامل ايه', 'كيفك', 'كيف حالك', 'شخبارك', 'شو اخبارك',
    'شكرا', 'شكراً', 'تمام', 'مين انت', 'من انت', 'انت مين', 'صباح النور', 'مساء النور',
    // English
    'hello', 'hi', 'hey', 'good morning', 'good evening', 'good afternoon',
    'how are you', 'who are you', 'thanks', 'thank you',
    // French
    'bonjour', 'salut', 'bonsoir', 'merci', 'comment vas tu', 'comment allez vous', 'qui es tu',
    // Spanish
    'hola', 'buenos dias', 'buenas tardes', 'buenas noches', 'gracias', 'como estas', 'quien eres',
    // German
    'hallo', 'guten morgen', 'guten tag', 'guten abend', 'danke', 'wie gehts', 'wer bist du'
  ];

  return greetings.some((g) => clean === g || clean.startsWith(g + ' ') || clean.endsWith(' ' + g) || clean.includes(' ' + g + ' '));
}

export function detectGreetingLanguage(text) {
  const clean = String(text || '').toLowerCase();
  if (/[\u0600-\u06FF]/.test(clean)) return 'ar';
  if (/(?:bonjour|salut|bonsoir|merci|comment vas|allez-vous|qui es-tu)/i.test(clean)) return 'fr';
  if (/(?:hola|buenos d[ií]as|buenas tardes|buenas noches|gracias|c[oó]mo est[aá]s|qui[eé]n eres)/i.test(clean)) return 'es';
  if (/(?:hallo|guten morgen|guten tag|guten abend|danke|wie geht'?s|wer bist du)/i.test(clean)) return 'de';
  return 'en';
}

export function detectPageNumber(query) {
  if (!query) return null;
  const norm = normalizeDigits(query.toLowerCase().replace(/[ـ]/g, ''));

  // 1. Direct digit patterns with prefixes: page, slide, p, صفحة, شريحة, سلايد, ورقة, ص
  // Supports optional "رقم / نمرة" and optional "ال / الـ" prefix - UNLIMITED digits (\d+)
  const PAGE_PREFIXES = [
    'page', 'slide', 'p\\.', 'p',
    'صفحة', 'صفحه', 'الصفحة', 'الصفحه',
    'شريحة', 'شريحه', 'الشريحة', 'الشريحه',
    'سلايد', 'السلايد',
    'ورقة', 'ورقه', 'الورقة', 'الورقه',
    'ص\\.', 'ص'
  ].join('|');

  const digitMatch = norm.match(
    new RegExp(`(?:^|\\s)(?:(?:${PAGE_PREFIXES})\\s*(?:رقم\\s*|نمرة\\s*|number\\s*|no\\.?\\s*)?(?:ال\\s*|الـ\\s*)?(\\d+))`, 'i')
  );
  if (digitMatch) {
    return parseInt(digitMatch[1], 10);
  }

  // 2. Standalone "ال + digits" in explanation/summary context (e.g. "اشرح ال 20", "لخص الـ 200")
  const standaloneAlNumber = norm.match(/(?:اشرح|شرح|لخص|تلخيص|معنى|ماذا يوجد في|ما في|محتوى|عن)\s+(?:ال|الـ)\s*(\d+)/i);
  if (standaloneAlNumber) {
    return parseInt(standaloneAlNumber[1], 10);
  }

  // 3. Written Arabic numbers with page prefixes (e.g. "صفحة مائتين", "صفحة ألف ومائة", "صفحة خمسين")
  const pageWordMatch = norm.match(/(?:صفحة|صفحه|الصفحة|الصفحه|شريحة|شريحه|الشريحة|الشريحه|سلايد|ص)\s+([^\d\n\r]+)/i);
  if (pageWordMatch) {
    const parsed = parseArabicWordsToNumber(pageWordMatch[1]);
    if (parsed !== null) return parsed;
  }

  // 4. Contextual explanation / query with Arabic words (e.g. "اشرح الصفحة الخامسة والعشرين", "لخص مائتين وخمسين")
  const contextualWordMatch = norm.match(/(?:اشرح|شرح|لخص|تلخيص|معنى|ماذا يوجد في|ما في|محتوى|عن)\s+(.+)/i);
  if (contextualWordMatch) {
    const parsed = parseArabicWordsToNumber(contextualWordMatch[1]);
    if (parsed !== null) return parsed;
  }

  // 5. Fallback check for pure written numbers
  return parseArabicWordsToNumber(norm);
}

export async function retrieve(storeOrChunks, workspaceIdOrQuery, queryOrTopK, topK = config.topK) {
  let chunks = [];
  let query = '';
  if (Array.isArray(storeOrChunks)) {
    chunks = storeOrChunks;
    query = workspaceIdOrQuery;
  } else {
    const workspaceId = workspaceIdOrQuery;
    query = queryOrTopK;
    chunks = (storeOrChunks.chunks || []).filter((chunk) => chunk.workspaceId === workspaceId);
  }

  const targetPage = detectPageNumber(query);
  if (targetPage !== null) {
    const pageChunks = chunks.filter((chunk) => chunk.page === targetPage);
    if (pageChunks.length > 0) {
      return pageChunks.map((chunk) => ({ ...chunk, score: 1.0 }));
    }
  }

  const queryEmbedding = await embed(query, 'RETRIEVAL_QUERY');
  const localQueryEmbedding = localEmbedding(query);

  const semanticMatches = chunks
    .map((chunk) => {
      let score = 0;
      if (chunk.embedding && chunk.embedding.length === queryEmbedding.values.length) {
        score = cosine(queryEmbedding.values, chunk.embedding);
      } else if (chunk.embedding && chunk.embedding.length === localQueryEmbedding.length) {
        score = cosine(localQueryEmbedding, chunk.embedding);
      } else {
        score = cosine(localQueryEmbedding, localEmbedding(chunk.text || ''));
      }
      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score >= 0.15)
    .sort((a, b) => b.score - a.score);

  if (semanticMatches.length === 0 && chunks.length > 0) {
    return chunks.slice(0, topK).map((c) => ({ ...c, score: 0.5 }));
  }

  return semanticMatches.slice(0, topK);
}

function cleanJson(text) {
  const raw = String(text || '').replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(raw);
}

export async function geminiText(prompt, options = {}) {
  if (!ai) return null;
  const models = [...new Set(config.models)];
  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: options.temperature ?? 0.2,
          ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
        },
      });
      if (response.text && response.text.trim()) {
        return response.text.trim();
      }
    } catch (error) {
      console.warn(`Gemini text failed on ${model}:`, error.message);
    }
  }
  return null;
}

export async function geminiJson(prompt) {
  if (!ai) return null;
  const models = [...new Set(config.models)];
  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.2 },
      });
      const parsed = cleanJson(response.text);
      if (parsed) return parsed;
    } catch (error) {
      console.warn(`Gemini json failed on ${model}:`, error.message);
    }
  }
  return null;
}

export function cleanPdfText(text) {
  if (!text) return '';
  return text
    .replace(/(?:page\s*\d+\s*(?:of|\/)\s*\d+|\b\d+\s*\/\s*\d+\b)/gi, '')
    .replace(/^(?:slide|lecture|chapter|dr\.|prof\.|department of)[\s\d\w\-_.]*$/gim, '')
    .replace(/^[\s\-_=*#]{3,}$/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdf(buffer) {
  const pages = [];
  const data = await pdfParse(buffer, {
    pagerender: async (pageData) => {
      const content = await pageData.getTextContent({ normalizeWhitespace: true });
      const text = content.items.map((item) => item.str).join(' ');
      const cleaned = cleanPdfText(text);
      pages.push({ page: pages.length + 1, text: cleaned });
      return cleaned;
    },
  });
  const filtered = pages.filter((p) => p.text.length > 5);
  return { pages: filtered.length ? filtered : [{ page: 1, text: cleanPdfText(data.text) }], pageCount: data.numpages || pages.length || 1 };
}

function contextText(chunks) {
  return chunks.map((chunk, index) => `[Source ${index + 1}: ${chunk.documentName}, page ${chunk.page}]\n${chunk.text}`).join('\n\n');
}

export function computeNextBestAction(workspace, concepts = [], quizzes = [], attempts = []) {
  if (!concepts.length) {
    return {
      type: 'review',
      concept: 'Key Foundations',
      reason: 'Read through your uploaded material to initialize your study twin.',
      sourcePages: [1],
      estimatedMinutes: 5,
    };
  }

  // Sort concepts by mastery ascending
  const sorted = [...concepts].sort((a, b) => (a.masteryScore || 0) - (b.masteryScore || 0));
  const weakest = sorted[0];

  if (weakest && weakest.masteryScore < 40) {
    return {
      type: 'quiz',
      concept: weakest.name,
      reason: `Your mastery in "${weakest.name}" is at ${weakest.masteryScore}%. A focused quiz will boost your confidence.`,
      sourcePages: weakest.sourcePages || [1],
      estimatedMinutes: 6,
    };
  }

  const unattempted = quizzes.find((q) => !attempts.some((a) => a.quizId === q.id));
  if (unattempted) {
    return {
      type: 'quiz',
      concept: unattempted.topic || unattempted.title,
      reason: `Quiz #${unattempted.quizNumber} is ready for your first test session.`,
      sourcePages: [1],
      estimatedMinutes: Math.max(5, Math.round(unattempted.questionCount * 1.5)),
    };
  }

  if (sorted[sorted.length - 1]?.masteryScore >= 60) {
    return {
      type: 'viva',
      concept: weakest.name,
      reason: `Test your oral recall with a quick Viva session on "${weakest.name}".`,
      sourcePages: weakest.sourcePages || [1],
      estimatedMinutes: 8,
    };
  }

  return {
    type: 'review',
    concept: weakest.name,
    reason: `Review core definitions for "${weakest.name}" on pages ${(weakest.sourcePages || [1]).join(', ')}.`,
    sourcePages: weakest.sourcePages || [1],
    estimatedMinutes: 5,
  };
}

export async function extractConceptsFromNotebook(store, workspaceId) {
  const workspaceChunks = store.chunks.filter((c) => c.workspaceId === workspaceId);
  if (!workspaceChunks.length) return [];
  const textSample = workspaceChunks.slice(0, 12).map((c) => `[Page ${c.page}]: ${c.text}`).join('\n\n');

  const prompt = `You are an academic curriculum analyzer.
Identify 5 to 8 fundamental core concepts from this lecture text that form the primary syllabus for student mastery.
For each concept provide:
- name: standard academic concept title (e.g., "Confidentiality", "Integrity", "Availability", "Access Control")
- parentConcept: overarching category (e.g., "CIA Triad", "Security Architecture") or null
- description: concise 1-2 sentence definition strictly based on the text
- sourcePages: array of page numbers where this concept appears
- commonMistakes: array of 1-2 common student misconceptions about this topic

Return JSON strictly:
{
  "concepts": [
    {
      "name": "...",
      "parentConcept": "...",
      "description": "...",
      "sourcePages": [1, 2],
      "commonMistakes": ["..."]
    }
  ]
}

Text:
${textSample}`;

  let extracted = null;
  if (ai) {
    extracted = await geminiJson(prompt);
  }

  const rawConcepts = extracted?.concepts && Array.isArray(extracted.concepts) && extracted.concepts.length
    ? extracted.concepts
    : [
      { name: 'Confidentiality', parentConcept: 'CIA Triad', description: 'Ensuring that sensitive information is accessible only to authorized users.', sourcePages: [4, 5], commonMistakes: ['Confusing confidentiality with integrity'] },
      { name: 'Integrity', parentConcept: 'CIA Triad', description: 'Guarding against improper information modification or deletion.', sourcePages: [4, 5], commonMistakes: ['Assuming encryption alone guarantees data integrity'] },
      { name: 'Availability', parentConcept: 'CIA Triad', description: 'Ensuring timely and reliable access to and use of information and computing resources.', sourcePages: [4, 5], commonMistakes: ['Overlooking denial of service risks'] },
      { name: 'Access Control', parentConcept: 'Security Controls', description: 'Limiting access to resources only to authorized entities.', sourcePages: [6, 7], commonMistakes: ['Mixing authentication with authorization'] },
      { name: 'Authentication', parentConcept: 'Security Controls', description: 'Verifying that an entity is who they claim to be before granting entry.', sourcePages: [7, 8], commonMistakes: ['Assuming identification equals authentication'] }
    ];

  const concepts = rawConcepts.map((c) => ({
    id: randomUUID(),
    workspaceId,
    name: sanitizeText(c.name),
    parentConcept: c.parentConcept ? sanitizeText(c.parentConcept) : null,
    description: sanitizeText(c.description),
    sourcePages: Array.isArray(c.sourcePages) && c.sourcePages.length ? c.sourcePages : [1],
    masteryScore: 20,
    status: 'weak',
    commonMistakes: Array.isArray(c.commonMistakes) ? c.commonMistakes : [],
    updatedAt: new Date().toISOString(),
  }));

  store.concepts = store.concepts.filter((item) => item.workspaceId !== workspaceId);
  store.concepts.push(...concepts);
  await saveStore(store);
  return concepts;
}

function mockGuide(document) {
  const text = document.preview || '';
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return {
    title: document.name.replace(/\.[^.]+$/, ''),
    overview: sentences.slice(0, 3).join(' ') || 'تشرح هذه المادة الأفكار الرئيسية، والآليات، والمفاهيم الأساسية التي تحتاجها لثقة الاسترجاع الأكاديمي.',
    learningObjectives: [
      'فهم الأركان الأساسية والمفاهيم الجوهرية في المادة',
      'التمييز بين المبادئ والآليات العملية والتطبيقات',
      'تطبيق المفاهيم لحل المسائل والاختبارات الأكاديمية بنجاح'
    ],
    coreConcepts: [
      { name: 'المفهوم الأساسي', explanation: sentences[0] || 'المفهوم المحوري الموضح في المادة المرفوعة.', sourcePages: [1] },
      { name: 'الآلية والمنهجية', explanation: sentences[1] || 'الخطوات والآليات التي تضمن تحقيق الهدف.', sourcePages: [1, 2] },
      { name: 'الأهمية والتطبيق', explanation: sentences[2] || 'التطبيق العملي وتأثير هذا المفهوم في النظام.', sourcePages: [2] }
    ],
    keyDefinitions: [
      { term: 'المصطلح الأول', definition: sentences[0] || 'التعريف الدقيق كما ورد في المذكرات الدراسية.', sourcePages: [1] },
      { term: 'المصطلح الثاني', definition: sentences[1] || 'عنصر مكمل يشرح كيفية عمل النظام.', sourcePages: [2] }
    ],
    importantRelationships: [
      'العلاقة التكاملية بين المفاهيم لضمان تماسك النظام الأكاديمي والعملي'
    ],
    formulasOrRules: [
      'القاعدة الذهبية: التحقق المسبق قبل منح الصلاحيات'
    ],
    commonMistakes: [
      'الخلط بين المفاهيم المتقاربة في الأسئلة النظرية'
    ],
    quickRecap: [
      'راجع التعاريف الأساسية قبل الانتقال للتطبيقات',
      'تأكد من حفظ الفروق الدقيقة بين الخيارات في الاختبارات'
    ],
    suggestedQuizTopics: ['المفاهيم الجوهرية', 'المقارنات والتعاريف', 'الحالات التطبيقية']
  };
}

function mockQuiz(difficulty, count, topic, questionType = 'mcq') {
  const mcqBank = [
    { id: randomUUID(), type: 'mcq', topic: topic || 'Confidentiality', question: 'Which of the following ensures that only authorized users can access data?', options: [{ id: 'A', text: 'Integrity' }, { id: 'B', text: 'Confidentiality' }, { id: 'C', text: 'Availability' }, { id: 'D', text: 'Accountability' }], correctAnswer: 'B', explanation: 'Confidentiality guarantees that data access is restricted to authorized individuals.', difficulty, sourcePage: 5 },
    { id: randomUUID(), type: 'mcq', topic: topic || 'Integrity', question: 'What does the principle of integrity protect?', options: [{ id: 'A', text: 'Ensuring data is only modified by authorized users' }, { id: 'B', text: 'Ensuring data is accessible at all times' }, { id: 'C', text: 'Encrypting all stored files' }, { id: 'D', text: 'Allowing unrestricted system access' }], correctAnswer: 'A', explanation: 'Integrity guarantees data cannot be modified or destroyed improperly.', difficulty, sourcePage: 5 },
    { id: randomUUID(), type: 'mcq', topic: topic || 'Availability', question: 'Which security principle ensures systems remain functional and reachable for authorized users?', options: [{ id: 'A', text: 'Integrity' }, { id: 'B', text: 'Confidentiality' }, { id: 'C', text: 'Availability' }, { id: 'D', text: 'Authentication' }], correctAnswer: 'C', explanation: 'Availability ensures timely and reliable system operation.', difficulty, sourcePage: 5 },
    { id: randomUUID(), type: 'mcq', topic: topic || 'Access Control', question: 'What is the primary role of Access Control in computer security?', options: [{ id: 'A', text: 'Limiting permissions so each user only accesses authorized data' }, { id: 'B', text: 'Increasing storage bandwidth' }, { id: 'C', text: 'Rebuilding corrupt databases automatically' }, { id: 'D', text: 'Running operating system updates' }], correctAnswer: 'A', explanation: 'Access Control regulates which authorized users can open or modify specific resources.', difficulty, sourcePage: 6 },
    { id: randomUUID(), type: 'mcq', topic: topic || 'Authentication', question: 'Which mechanism is commonly used to verify user identity before access?', options: [{ id: 'A', text: 'Username and password or OTP' }, { id: 'B', text: 'Display monitor resolution' }, { id: 'C', text: 'Network cable length' }, { id: 'D', text: 'CPU cooling speed' }], correctAnswer: 'A', explanation: 'Authentication verifies user identity using credentials like passwords or OTPs.', difficulty, sourcePage: 7 }
  ];

  const essayBank = [
    { id: randomUUID(), type: 'essay', topic: topic || 'CIA Triad', question: 'Explain the three pillars of the CIA Triad (Confidentiality, Integrity, Availability) and give a practical example for each.', referenceAnswer: 'Confidentiality ensures only authorized users can view data (e.g. encrypting grades). Integrity ensures data is not altered improperly (e.g. digital signatures on grades). Availability ensures systems are operational when needed (e.g. student portal uptime).', rubric: [{ criterion: 'Defines and explains Confidentiality with example', weight: 0.35 }, { criterion: 'Defines and explains Integrity with example', weight: 0.35 }, { criterion: 'Defines and explains Availability with example', weight: 0.3 }], explanation: 'A complete answer covers definition and distinct examples for all three pillars.', difficulty, sourcePage: 5 },
    { id: randomUUID(), type: 'essay', topic: topic || 'Access Control & Authentication', question: 'Compare Authentication and Access Control (Authorization). How do they work together in an educational system?', referenceAnswer: 'Authentication verifies who the user is (e.g., student logs in with password). Access Control determines what they can do (e.g., viewing own grades, but not editing them). Authentication must succeed before Access Control policies are enforced.', rubric: [{ criterion: 'Defines Authentication clearly', weight: 0.35 }, { criterion: 'Defines Access Control / Authorization clearly', weight: 0.35 }, { criterion: 'Explains the sequential relationship between them', weight: 0.3 }], explanation: 'The distinction between identity verification and permission enforcement is essential.', difficulty, sourcePage: 7 }
  ];

  if (questionType === 'essay') return essayBank.slice(0, count);
  if (questionType === 'mixed') {
    const mcqCount = Math.ceil(count * 0.6);
    const essayCount = count - mcqCount;
    return [...mcqBank.slice(0, mcqCount), ...essayBank.slice(0, essayCount)];
  }
  return mcqBank.slice(0, count);
}

function workspaceView(store, workspaceId, userId) {
  const workspace = store.workspaces.find((item) => item.id === workspaceId && (!userId || item.ownerId === userId || item.ownerId === 'guest-local' || !item.ownerId));
  if (!workspace) return null;
  const documents = store.documents.filter((item) => item.workspaceId === workspaceId);
  const messages = store.messages.filter((item) => item.workspaceId === workspaceId);
  const guide = store.guides.filter((item) => item.workspaceId === workspaceId).at(-1) || null;
  const rawQuizzes = store.quizzes.filter((item) => item.workspaceId === workspaceId);
  const attempts = store.attempts.filter((item) => item.workspaceId === workspaceId);
  const concepts = store.concepts.filter((item) => item.workspaceId === workspaceId);
  const masteryEvidence = store.masteryEvidence.filter((item) => item.workspaceId === workspaceId);
  const vivaAttempts = store.vivaAttempts.filter((item) => item.workspaceId === workspaceId);

  // Stats per quiz
  const quizzes = rawQuizzes.map((quiz) => {
    const quizAttempts = attempts.filter((a) => a.quizId === quiz.id);
    const bestScore = quizAttempts.length ? Math.max(...quizAttempts.map((a) => a.score)) : null;
    const lastAttempt = quizAttempts.at(-1) || null;
    return {
      ...quiz,
      attemptsCount: quizAttempts.length,
      bestScore,
      lastScore: lastAttempt ? lastAttempt.score : null,
      lastAttemptAt: lastAttempt ? lastAttempt.createdAt : null,
    };
  });

  // Weak topics calculation
  const weakMap = {};
  for (const attempt of attempts) for (const topic of attempt.weakTopics || []) weakMap[topic] = (weakMap[topic] || 0) + 1;
  for (const c of concepts.filter((c) => c.status === 'weak')) weakMap[c.name] = (weakMap[c.name] || 0) + 2;
  const weakTopics = Object.entries(weakMap).sort((a, b) => b[1] - a[1]).map(([topic]) => topic);

  // Overall mastery calculation
  const overallMastery = concepts.length
    ? Math.round(concepts.reduce((acc, c) => acc + (c.masteryScore || 0), 0) / concepts.length)
    : attempts.length
      ? Math.round(attempts.reduce((acc, a) => acc + a.score, 0) / attempts.length)
      : 0;

  const masteryCounts = {
    weak: concepts.filter((c) => c.status === 'weak').length,
    learning: concepts.filter((c) => c.status === 'learning').length,
    good: concepts.filter((c) => c.status === 'good').length,
    strong: concepts.filter((c) => c.status === 'strong').length,
  };

  const nextBestAction = computeNextBestAction(workspace, concepts, quizzes, attempts);

  return {
    ...workspace,
    documents,
    messages,
    guide,
    quizzes,
    attempts,
    concepts,
    masteryEvidence,
    vivaAttempts,
    overallMastery,
    masteryCounts,
    nextBestAction,
    weakTopics,
    aiMode: ai ? 'live' : 'demo',
  };
}

const app = express();
app.disable('x-powered-by');

// 1. Helmet: Official Production Security Headers
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com/gsi/client"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://db.onlinewebfonts.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://db.onlinewebfonts.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https://lh3.googleusercontent.com"],
        mediaSrc: ["'self'", "blob:", "https://*.cloudfront.net", "https://*.amazonaws.com"],
        connectSrc: ["'self'", "https://accounts.google.com", "https://*.googleapis.com"],
        frameSrc: ["https://accounts.google.com/"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    } : false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// 2. Strict CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || process.env.NODE_ENV !== 'production' || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Blocked by CORS policy.'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  })
);

// 3. Source code & sensitive file protection (Immediately blocks access to source and system files)
app.use((req, res, next) => {
  const url = req.path.toLowerCase();
  if (
    url.includes('/.env') ||
    url.startsWith('/server') ||
    url.includes('/server/') ||
    url.startsWith('/data') ||
    url.includes('/data/') ||
    url.includes('/.git')
  ) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  next();
});

// 4. Anti-Prototype Pollution & SQL Injection Inspection
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      delete obj[key];
      continue;
    }
    if (typeof obj[key] === 'object') {
      sanitizeObject(obj[key]);
    }
  }
  return obj;
}

const SQLI_REGEX = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b.{1,50}\b(FROM|INTO|TABLE|DATABASE|WHERE)\b)|(--\s*$)|(\bOR\b\s+['"\d]+=\s*['"\d]+)/i;

function hasSqlInjection(value) {
  if (typeof value === 'string') return SQLI_REGEX.test(value);
  if (value && typeof value === 'object') {
    for (const val of Object.values(value)) {
      if (hasSqlInjection(val)) return true;
    }
  }
  return false;
}

app.use((req, res, next) => {
  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);

  if (hasSqlInjection(req.query) || hasSqlInjection(req.params)) {
    return res.status(400).json({ error: 'Potential malicious payload detected.' });
  }
  next();
});

// 3. In-Memory Anti-DDoS & Brute-Force Rate Limiter
function createRateLimiter({ windowMs = 60 * 1000, max = 100, message = 'Too many requests. Please slow down.' } = {}) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of hits.entries()) {
      if (now - data.resetTime > windowMs) hits.delete(key);
    }
  }, 5 * 60 * 1000).unref();

  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test') return next();
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();
    let record = hits.get(ip);

    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      hits.set(ip, record);
    } else {
      record.count += 1;
    }

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({ error: message, retryAfter: retryAfterSec });
    }

    next();
  };
}

const generalLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 300, message: 'Too many requests. Please slow down.' });
const authLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 30, message: 'Too many authentication attempts. Please wait a minute.' });
const aiLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 60, message: 'Too many AI requests. Please wait a moment before sending another query.' });

app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter);

app.use(express.json({ limit: '2mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxFileMb * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'application/pdf' || file.mimetype === 'text/plain') });

app.get('/api/status', (_req, res) => res.json({ ok: true, aiMode: ai ? 'live' : 'demo', model: config.model, maxFileMb: config.maxFileMb }));
app.get('/api/config', (_req, res) => res.json({ googleClientId: config.googleClientId, googleAuthEnabled: Boolean(config.googleClientId) }));
app.get('/api/auth/me', (req, res) => { const user = userFromRequest(req); res.status(user ? 200 : 401).json(user || { error: 'Not signed in.' }); });
app.post('/api/auth/google', async (req, res, next) => {
  try {
    if (!googleClient) return res.status(503).json({ error: 'Google Sign-In is not configured yet.' });
    const ticket = await googleClient.verifyIdToken({ idToken: req.body.credential, audience: config.googleClientId });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.email_verified) return res.status(401).json({ error: 'Google could not verify this account.' });
    const user = { id: payload.sub, name: payload.name || payload.email.split('@')[0], email: payload.email, picture: payload.picture || '', isGuest: false };
    const store = await readStore();
    const existing = store.users.find((item) => item.id === user.id);
    if (existing) Object.assign(existing, { googleName: user.name, email: user.email, picture: user.picture, lastLoginAt: new Date().toISOString() });
    else store.users.push({ id: user.id, displayName: user.name, googleName: user.name, email: user.email, picture: user.picture, fieldOfStudy: '', studyLevel: '', dailyGoal: 30, joinedAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() });
    await saveStore(store);
    const cookie = `nabta_session=${encodeURIComponent(encodeSession(user))}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
    res.setHeader('Set-Cookie', cookie); res.json(user);
  } catch (error) { next(error); }
});
app.post('/api/auth/guest', async (_req, res) => {
  const store = await readStore();
  const primaryUser = store.users[0] || { id: 'guest-local', name: 'متعلم نبتة', email: 'guest@nabta.ai', picture: '' };
  const user = { id: primaryUser.id, name: primaryUser.displayName || primaryUser.googleName || 'متعلم نبتة', email: primaryUser.email, picture: primaryUser.picture || '', isGuest: true };
  const cookie = `nabta_session=${encodeURIComponent(encodeSession(user))}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', cookie);
  res.json(user);
});
app.post('/api/auth/logout', (_req, res) => { res.setHeader('Set-Cookie', 'nabta_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'); res.json({ ok: true }); });
app.get('/api/account', requireUser, async (req, res) => {
  const store = await readStore();
  const account = store.users.find((item) => item.id === req.user.id) || { id: req.user.id, displayName: req.user.name, googleName: req.user.name, email: req.user.email, picture: req.user.picture, fieldOfStudy: '', studyLevel: '', dailyGoal: 30, joinedAt: new Date().toISOString() };
  res.json({ ...account, googleName: account.googleName || req.user.name, email: account.email || req.user.email, picture: account.picture || req.user.picture });
});
app.patch('/api/account', requireUser, async (req, res) => {
  const store = await readStore();
  const updates = { displayName: sanitizeText(req.body.displayName).slice(0, 60) || req.user.name, fieldOfStudy: sanitizeText(req.body.fieldOfStudy).slice(0, 100), studyLevel: sanitizeText(req.body.studyLevel).slice(0, 60), dailyGoal: Math.min(Math.max(Number(req.body.dailyGoal) || 30, 10), 240), updatedAt: new Date().toISOString() };
  let account = store.users.find((item) => item.id === req.user.id);
  if (account) Object.assign(account, { email: account.email || req.user.email, picture: account.picture || req.user.picture, googleName: account.googleName || req.user.name }, updates);
  else { account = { id: req.user.id, googleName: req.user.name, email: req.user.email, picture: req.user.picture, joinedAt: new Date().toISOString(), ...updates }; store.users.push(account); }
  await saveStore(store); res.json(account);
});

app.get('/api/workspaces', requireUser, async (req, res) => {
  const store = await readStore();
  const allowed = store.workspaces.filter((workspace) => workspace.ownerId === req.user.id || workspace.ownerId === 'guest-local' || !workspace.ownerId);
  res.json(allowed.map((workspace) => workspaceView(store, workspace.id, req.user.id)).filter(Boolean));
});



app.post('/api/workspaces', requireUser, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file && !sanitizeText(req.body.text)) return res.status(400).json({ error: 'قم برفع ملف PDF/TXT أو لصق بعض نصوص المذاكرة.' });
    const store = await readStore();
    const filename = req.file?.originalname || req.body.title || 'ملاحظات مذاكرة ملصقة';
    const workspace = {
      id: randomUUID(),
      ownerId: req.user.id,
      title: req.body.title || filename.replace(/\.[^.]+$/, ''),
      lastQuizNumber: 0,
      createdAt: new Date().toISOString(),
      lastStudiedAt: new Date().toISOString()
    };
    let extracted;
    if (req.file?.mimetype === 'application/pdf') extracted = await extractPdf(req.file.buffer);
    else extracted = { pages: [{ page: 1, text: cleanPdfText(sanitizeText(req.file ? req.file.buffer.toString('utf8') : req.body.text)) }], pageCount: 1 };
    const fullText = sanitizeText(extracted.pages.map((page) => page.text).join('\n'));
    if (fullText.length < 40) return res.status(422).json({ error: 'لم نتمكن من استخراج نصوص مقروءة كافية من هذه المادة.' });
    const document = { id: randomUUID(), workspaceId: workspace.id, name: filename, type: req.file?.mimetype || 'text/plain', status: 'ready', pageCount: extracted.pageCount, size: req.file?.size || Buffer.byteLength(fullText), uploadedAt: new Date().toISOString(), preview: fullText.slice(0, 3200) };
    const chunks = chunkPages(extracted.pages);
    for (const chunk of chunks) Object.assign(chunk, { workspaceId: workspace.id, documentId: document.id, documentName: document.name, embedding: (await embed(chunk.text)).values });
    store.workspaces.unshift(workspace); store.documents.push(document); store.chunks.push(...chunks);
    await saveStore(store);

    // Initial concept extraction
    try {
      await extractConceptsFromNotebook(store, workspace.id);
    } catch (err) {
      console.warn('Initial concept extraction notice:', err.message);
    }

    res.status(201).json(workspaceView(store, workspace.id, req.user.id));
  } catch (error) { next(error); }
});

app.get('/api/workspaces/:id', requireUser, async (req, res) => {
  const store = await readStore(); const view = workspaceView(store, req.params.id, req.user.id);
  if (!view) return res.status(404).json({ error: 'لم يتم العثور على الدفتر.' });
  res.json(view);
});

app.delete('/api/workspaces/:id', requireUser, async (req, res, next) => {
  try {
    const store = await readStore();
    const index = store.workspaces.findIndex((item) => item.id === req.params.id && item.ownerId === req.user.id);
    if (index === -1) return res.status(404).json({ error: 'لم يتم العثور على الدفتر.' });
    store.workspaces.splice(index, 1);
    store.documents = store.documents.filter((item) => item.workspaceId !== req.params.id);
    store.chunks = store.chunks.filter((item) => item.workspaceId !== req.params.id);
    store.messages = store.messages.filter((item) => item.workspaceId !== req.params.id);
    store.guides = store.guides.filter((item) => item.workspaceId !== req.params.id);
    store.quizzes = store.quizzes.filter((item) => item.workspaceId !== req.params.id);
    store.attempts = store.attempts.filter((item) => item.workspaceId !== req.params.id);
    store.concepts = store.concepts.filter((item) => item.workspaceId !== req.params.id);
    store.masteryEvidence = store.masteryEvidence.filter((item) => item.workspaceId !== req.params.id);
    store.vivaAttempts = store.vivaAttempts.filter((item) => item.workspaceId !== req.params.id);
    await saveStore(store);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post('/api/workspaces/:id/chat', requireUser, aiLimiter, async (req, res, next) => {
  try {
    const question = sanitizeText(req.body.question).slice(0, 2000);
    const grounded = req.body.grounded !== false;
    const isVoice = req.body.isVoice === true || req.body.mode === 'voice';
    if (!question) return res.status(400).json({ error: 'Please ask a question.' });
    const store = await readStore(); const view = workspaceView(store, req.params.id, req.user.id);
    if (!view) return res.status(404).json({ error: 'Workspace not found.' });
    const userLang = req.body.language || (isConversationalGreeting(question) ? detectGreetingLanguage(question) : 'ar');

    // 1. Natural greeting interception: answer politely in the user's language without dumping random PDF chunks
    if (isConversationalGreeting(question)) {
      const gLang = req.body.language || detectGreetingLanguage(question);
      let greetingAnswer = `Hello! I am Nabta, your smart tutor for "${view.workspace.title}". Feel free to ask me about any concept or page from your notes!`;
      if (gLang === 'ar') {
        greetingAnswer = `أهلاً بك! أنا نبتة، معلمك الذكي لـ "${view.workspace.title}". تفضل بسؤالي عن أي مفهوم أو صفحة في مذكرتك، وأنا جاهز لشرحه وتبسيطه لك!`;
      } else if (gLang === 'fr') {
        greetingAnswer = `Bonjour ! Je suis Nabta, votre tuteur intelligent pour « ${view.workspace.title} ». Posez-moi vos questions sur votre cours, je suis là pour vous aider !`;
      } else if (gLang === 'es') {
        greetingAnswer = `¡Hola! Soy Nabta, tu tutor inteligente para « ${view.workspace.title} ». ¡Pregúntame sobre cualquier concepto o página de tus apuntes y te ayudaré con gusto!`;
      } else if (gLang === 'de') {
        greetingAnswer = `Hallo! Ich bin Nabta, dein intelligenter Tutor für „${view.workspace.title}“. Frag mich einfach nach einem Konzept oder einer Seite aus deinen Unterlagen!`;
      }

      const now = new Date().toISOString();
      store.messages.push(
        { id: randomUUID(), workspaceId: req.params.id, role: 'user', content: question, createdAt: now },
        { id: randomUUID(), workspaceId: req.params.id, role: 'assistant', content: greetingAnswer, citations: [], createdAt: now }
      );
      const workspace = store.workspaces.find((item) => item.id === req.params.id);
      if (workspace) workspace.lastStudiedAt = now;
      await saveStore(store);
      return res.json({ answer: greetingAnswer, citations: [] });
    }

    const relevant = await retrieve(store, req.params.id, question);
    let answer;
    if (ai && relevant.length) {
      const targetPage = detectPageNumber(question);
      const pageInstruction = targetPage !== null
        ? `The user specifically asked for Page/Slide ${targetPage}. Provide a thorough, complete, and meticulous explanation of all concepts, questions, and details from Page ${targetPage} found in the sources.`
        : '';

      const prompt = isVoice
        ? `You are Nabta AI (نبتة) in an interactive LIVE SPOKEN VOICE conversation with a student studying "${view.workspace.title}".
CRITICAL SPOKEN VOICE GUIDELINES:
- Provide a direct, crystal-clear explanation in 2 to 3 sentences maximum (around 35-50 words total).
- Speak warmly and naturally like a real human tutor talking aloud.
- DO NOT use any Markdown formatting: NO asterisks (**), NO hashes (###), NO bullets (- or •), NO divider lines (---).
- Speak in natural, fluent ${userLang === 'en' ? 'English' : userLang === 'fr' ? 'French' : userLang === 'es' ? 'Spanish' : userLang === 'de' ? 'German' : 'Arabic'}.
- Do NOT include English words in parentheses alongside Arabic terms. Use clear Arabic phrases so speech synthesis flows smoothly and articulately.
- Give the core explanation directly so the student immediately understands without having to listen to a long speech.
${pageInstruction}

Student Spoken Question:
${question}

Source Context from Student's Notebook:
${contextText(relevant.slice(0, 3))}`
        : grounded
          ? `You are Nabta AI (نبتة), an expert academic tutor.
Your goal is to provide a clean, beautifully organized, and crystal-clear explanation for a student.

CRITICAL FORMATTING RULES:
- DO NOT use conversational greetings (e.g. do NOT say "أهلاً بك بصفتي نبتة...").
- DO NOT use closing boilerplate (e.g. do NOT say "أتمنى لك التوفيق...").
- DO NOT clutter the text with stars (avoid excessive asterisks ** or *), hashes (###), blockquotes (>), or divider lines (---).
- Keep the presentation clean, calm, and very easy on the eyes.

CONTENT & PEDAGOGY:
- Answer STRICTLY from the provided source context below.
- If explaining multiple-choice questions or exercises:
  For each question:
  1. Write the question clearly.
  2. List the options (A, B, C, D) clearly on separate lines.
  3. Clearly state the correct answer: "الإجابة الصحيحة: [الرمز] [النص]".
  4. Provide a simple, clear explanation: explain the core concept, why this choice is right, and briefly why other options are not.
- Keep sentences concise, clear, and easy to read.
- Preserve technical English terms in parentheses alongside Arabic terms (e.g. التهديد (Threat), الثغرة الأمنية (Vulnerability), السرية (Confidentiality)).
${pageInstruction}

User Question:
${question}

Source Context from User's Notebook:
${contextText(relevant)}`
          : `You are Nabta AI (نبتة), an expert academic tutor.
Your goal is to provide a clean, beautifully organized, and crystal-clear explanation.

CRITICAL FORMATTING RULES:
- DO NOT use conversational greetings or closing boilerplate.
- DO NOT clutter the text with stars (avoid excessive asterisks ** or *), hashes (###), blockquotes (>), or divider lines (---).
- Keep the presentation clean, calm, and very easy on the eyes.

CONTENT & PEDAGOGY:
- Grounded Mode is OFF: Use the sources as your foundation, expanding with clear analogies and examples.
- If explaining questions: state the question, list options, state the correct answer, and explain clearly.
- Preserve technical English terms in parentheses.
${pageInstruction}

User Question:
${question}

Source Context from User's Notebook:
${contextText(relevant)}`;

      answer = await geminiText(prompt, isVoice ? { maxOutputTokens: 200, temperature: 0.3 } : {});
    }

    // Resilient fallback if AI is offline or unavailable
    if (!answer) {
      const isArabic = /[\u0600-\u06FF]/.test(question);
      if (relevant.length) {
        const topTexts = relevant.slice(0, 2).map((c) => `• [صفحة/Page ${c.page}]:\n${c.text}`).join('\n\n');
        answer = isArabic
          ? `بناءً على محتوى مذكراتك المرفوعة:\n\n${topTexts}`
          : `Here is what your uploaded study material covers:\n\n${topTexts}`;
      } else {
        answer = isArabic
          ? 'لم أتمكن من العثور على معلومات مطابقة في مذكراتك المرفوعة حالياً. يمكنك تجربة صياغة السؤال بشكل مختلف أو تعطيل الوضع الموثق.'
          : 'I could not find matching information in your uploaded material. Try asking differently or turn off Grounded Mode.';
      }
    }

    const citations = relevant.slice(0, 3).map((chunk) => ({ document: chunk.documentName, page: chunk.page, excerpt: chunk.text.slice(0, 220) }));
    const now = new Date().toISOString();
    store.messages.push({ id: randomUUID(), workspaceId: req.params.id, role: 'user', content: question, createdAt: now }, { id: randomUUID(), workspaceId: req.params.id, role: 'assistant', content: answer, citations, createdAt: now });
    const workspace = store.workspaces.find((item) => item.id === req.params.id); workspace.lastStudiedAt = now;
    await saveStore(store); res.json({ answer, citations });
  } catch (error) { next(error); }
});

// Concepts extraction
app.post('/api/workspaces/:id/concepts/extract', requireUser, async (req, res, next) => {
  try {
    const store = await readStore();
    const concepts = await extractConceptsFromNotebook(store, req.params.id);
    res.json(concepts);
  } catch (error) { next(error); }
});

// Full Mastery details
app.get('/api/workspaces/:id/mastery', requireUser, async (req, res, next) => {
  try {
    const store = await readStore();
    const view = workspaceView(store, req.params.id, req.user.id);
    if (!view) return res.status(404).json({ error: 'Workspace not found.' });
    res.json({
      overallMastery: view.overallMastery,
      masteryCounts: view.masteryCounts,
      concepts: view.concepts,
      evidence: view.masteryEvidence,
      nextBestAction: view.nextBestAction,
    });
  } catch (error) { next(error); }
});

// Structured Study Guide
app.post('/api/workspaces/:id/guide', requireUser, aiLimiter, async (req, res, next) => {
  try {
    const store = await readStore();
    const view = workspaceView(store, req.params.id, req.user.id);
    if (!view) return res.status(404).json({ error: 'لم يتم العثور على الدفتر.' });
    const chunks = store.chunks.filter((item) => item.workspaceId === req.params.id).slice(0, 15);
    const body = req.body || {};
    const languageMap = {
      ar: 'Fluent Modern Academic Arabic',
      en: 'Clear Academic English',
      fr: 'Academic French',
      es: 'Academic Spanish',
      de: 'Academic German',
    };
    const targetLanguage = languageMap[body.language] || (body.language === 'en' ? 'Clear Academic English' : 'Fluent Modern Academic Arabic');
    let content = null;
    if (ai) {
      const prompt = `You are a master academic study guide author.
Analyze these lecture note sources and produce an exhaustive, beautifully organized study guide.
Target Language: Generate ALL fields (title, overview, objectives, explanations, definitions, rules) strictly in ${targetLanguage}.

Return JSON strictly in this schema:
{
  "title": "Clear subject title",
  "overview": "Comprehensive 3-4 sentence summary of the lecture core themes.",
  "learningObjectives": [
    "Objective 1...",
    "Objective 2...",
    "Objective 3..."
  ],
  "coreConcepts": [
    {
      "name": "Concept Name",
      "explanation": "Deep 2-3 sentence explanation with practical examples.",
      "sourcePages": [1, 2]
    }
  ],
  "keyDefinitions": [
    {
      "term": "Term",
      "definition": "Precise formal definition.",
      "sourcePages": [1]
    }
  ],
  "importantRelationships": [
    "Detailed relationship explaining how concept A enforces concept B."
  ],
  "formulasOrRules": [
    "Golden rule or security equation."
  ],
  "commonMistakes": [
    "Misconception students often have and how to correctly understand it."
  ],
  "quickRecap": [
    "Key memory takeaway 1",
    "Key memory takeaway 2"
  ],
  "suggestedQuizTopics": [
    "Topic 1",
    "Topic 2"
  ]
}

Sources:
${contextText(chunks)}`;
      content = await geminiJson(prompt);
    }
    content ||= mockGuide(view.documents[0] || { name: 'Study Notebook' });
    const guide = { id: randomUUID(), workspaceId: req.params.id, content, createdAt: new Date().toISOString() };
    store.guides.push(guide);
    await saveStore(store);
    res.json(guide);
  } catch (error) { next(error); }
});

// Regenerate single study guide section
app.patch('/api/workspaces/:id/guide/section', requireUser, aiLimiter, async (req, res, next) => {
  try {
    const store = await readStore();
    const guide = store.guides.filter((g) => g.workspaceId === req.params.id).at(-1);
    if (!guide) return res.status(404).json({ error: 'No study guide found to update.' });
    const { sectionKey, language = 'ar' } = req.body || {};
    const languageMap = {
      ar: 'Fluent Academic Arabic',
      en: 'Clear Academic English',
      fr: 'Academic French',
      es: 'Academic Spanish',
      de: 'Academic German',
    };
    const targetLanguage = languageMap[language] || (language === 'en' ? 'Clear Academic English' : 'Fluent Academic Arabic');
    const chunks = store.chunks.filter((c) => c.workspaceId === req.params.id).slice(0, 12);
    if (ai && sectionKey) {
      const prompt = `Regenerate only the section "${sectionKey}" of the study guide based on these notes.
Target Language: Generate this section strictly in ${targetLanguage}.
Return JSON strictly: { "data": ... } matching the expected format of this section (${sectionKey}).
Context:
${contextText(chunks)}`;
      const result = await geminiJson(prompt);
      if (result?.data) {
        guide.content[sectionKey] = result.data;
        await saveStore(store);
      }
    }
    res.json(guide);
  } catch (error) { next(error); }
});

// Create Quiz (MCQ, Essay, Mixed) with Monotonic Numbering
app.post('/api/workspaces/:id/quizzes', requireUser, aiLimiter, async (req, res, next) => {
  try {
    const store = await readStore();
    const view = workspaceView(store, req.params.id, req.user.id);
    if (!view) return res.status(404).json({ error: 'لم يتم العثور على الدفتر.' });

    const body = req.body || {};
    const difficulty = ['easy', 'medium', 'hard', 'adaptive'].includes(body.difficulty) ? body.difficulty : 'medium';
    const questionType = ['mcq', 'essay', 'mixed'].includes(body.questionType) ? body.questionType : 'mcq';
    const count = Math.min(Math.max(Number(body.count) || 5, 1), 20);
    const topic = sanitizeText(body.topic).slice(0, 120);
    const language = body.language === 'en' ? 'English' : 'Arabic';
    const chunks = topic ? await retrieve(store, req.params.id, topic, 12) : store.chunks.filter((item) => item.workspaceId === req.params.id).slice(0, 12);

    let questions = null;
    if (ai) {
      let promptInstruction = '';
      if (questionType === 'mcq') {
        promptInstruction = `Generate ${count} multiple choice questions (type: "mcq").
Every question must have:
- id: string uuid
- type: "mcq"
- topic: specific concept name
- question: clear, unambiguous question
- options: array of 4 options [{ "id": "A", "text": "..." }, { "id": "B", "text": "..." }, { "id": "C", "text": "..." }, { "id": "D", "text": "..." }]
- correctAnswer: letter ("A" | "B" | "C" | "D")
- explanation: educational explanation of why the correct answer is right and why others are wrong
- difficulty: "${difficulty}"
- sourcePage: page number where found in sources`;
      } else if (questionType === 'essay') {
        promptInstruction = `Generate ${count} essay / short answer questions (type: "essay").
Every question must have:
- id: string uuid
- type: "essay"
- topic: specific concept name
- question: deep conceptual question requiring 2-4 sentences explanation
- referenceAnswer: complete standard model answer
- rubric: array of criteria [{ "criterion": "description of required point", "weight": 0.5 }] with weights summing to 1.0
- explanation: educational context
- difficulty: "${difficulty}"
- sourcePage: page number where found in sources`;
      } else {
        const mcqCount = Math.ceil(count * (Number(req.body.mcqRatio) || 0.6));
        const essayCount = count - mcqCount;
        promptInstruction = `Generate ${mcqCount} MCQ questions (type: "mcq" with 4 options A/B/C/D) and ${essayCount} Essay questions (type: "essay" with referenceAnswer and rubric).
Every question needs: id, type, topic, question, explanation, difficulty: "${difficulty}", sourcePage.`;
      }

      const prompt = `You are a university examination board member creating a rigorous exam.
Target Language: ${language}.
Topic: ${topic || 'Comprehensive coverage of uploaded lecture material'}.
Difficulty: ${difficulty}.
${promptInstruction}

Strictly ground all questions in these lecture notes. Return JSON:
{
  "questions": [...]
}

Context:
${contextText(chunks)}`;

      const result = await geminiJson(prompt);
      if (result?.questions && Array.isArray(result.questions) && result.questions.length) {
        questions = result.questions.map((q) => ({
          ...q,
          id: q.id || randomUUID(),
          difficulty: q.difficulty || difficulty,
          options: q.type === 'mcq' && Array.isArray(q.options)
            ? q.options.map((opt, idx) => typeof opt === 'string' ? { id: String.fromCharCode(65 + idx), text: opt } : opt)
            : undefined,
        }));
      }
    }

    questions = (questions || mockQuiz(difficulty, count, topic, questionType)).slice(0, count).map((q) => ({ id: q.id || randomUUID(), ...q }));

    // Monotonic persistent numbering per notebook
    const workspace = store.workspaces.find((w) => w.id === req.params.id);
    workspace.lastQuizNumber = (Number(workspace.lastQuizNumber) || store.quizzes.filter(q => q.workspaceId === req.params.id).length) + 1;
    const quizNumber = workspace.lastQuizNumber;

    const title = req.body.title || (topic ? `${topic} Quiz` : `Quiz #${quizNumber}`);
    const quiz = {
      id: randomUUID(),
      workspaceId: req.params.id,
      quizNumber,
      title,
      questionType,
      difficulty,
      questionCount: questions.length,
      topic: topic || 'Comprehensive Review',
      questions,
      createdAt: new Date().toISOString(),
    };

    store.quizzes.push(quiz);
    await saveStore(store);
    res.status(201).json(quiz);
  } catch (error) { next(error); }
});

// Rename Quiz
app.patch('/api/workspaces/:id/quizzes/:quizId', requireUser, async (req, res, next) => {
  try {
    const store = await readStore();
    const quiz = store.quizzes.find((q) => q.id === req.params.quizId && q.workspaceId === req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
    if (req.body.title) quiz.title = sanitizeText(req.body.title).slice(0, 100);
    await saveStore(store);
    res.json(quiz);
  } catch (error) { next(error); }
});

// Duplicate Quiz (assigns next monotonic quiz number)
app.post('/api/workspaces/:id/quizzes/:quizId/duplicate', requireUser, async (req, res, next) => {
  try {
    const store = await readStore();
    const original = store.quizzes.find((q) => q.id === req.params.quizId && q.workspaceId === req.params.id);
    if (!original) return res.status(404).json({ error: 'Quiz not found.' });
    const workspace = store.workspaces.find((w) => w.id === req.params.id);
    workspace.lastQuizNumber = (Number(workspace.lastQuizNumber) || store.quizzes.filter(q => q.workspaceId === req.params.id).length) + 1;
    const duplicated = {
      ...original,
      id: randomUUID(),
      quizNumber: workspace.lastQuizNumber,
      title: `${original.title} (Copy)`,
      createdAt: new Date().toISOString(),
      questions: original.questions.map((q) => ({ ...q, id: randomUUID() })),
    };
    store.quizzes.unshift(duplicated);
    await saveStore(store);
    res.status(201).json(duplicated);
  } catch (error) { next(error); }
});

// Delete Quiz (monotonic numbering preserved)
app.delete('/api/workspaces/:id/quizzes/:quizId', requireUser, async (req, res, next) => {
  try {
    const store = await readStore();
    const index = store.quizzes.findIndex((q) => q.id === req.params.quizId && q.workspaceId === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Quiz not found.' });
    store.quizzes.splice(index, 1);
    store.attempts = store.attempts.filter((a) => a.quizId !== req.params.quizId);
    await saveStore(store);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// Submit & Grade Quiz (MCQ + Essay Rubrics + Mastery Engine)
app.post('/api/workspaces/:id/quizzes/:quizId/submit', requireUser, async (req, res, next) => {
  try {
    const store = await readStore();
    const allowed = workspaceView(store, req.params.id, req.user.id);
    const quiz = allowed && store.quizzes.find((item) => item.id === req.params.quizId && item.workspaceId === req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });

    const submitted = req.body.answers || {};
    const results = [];
    let mcqTotal = 0;
    let mcqEarned = 0;
    let essayTotal = 0;
    let essayEarned = 0;

    for (const question of quiz.questions) {
      const answer = sanitizeText(submitted[question.id]);
      if (question.type === 'mcq') {
        mcqTotal += 1;
        const correct = answer.toUpperCase() === String(question.correctAnswer || '').toUpperCase() ||
          (question.options && question.options.some((o) => o.id === question.correctAnswer && o.text.toLowerCase() === answer.toLowerCase()));
        const questionScore = correct ? 100 : 0;
        if (correct) mcqEarned += 1;
        results.push({
          questionId: question.id,
          type: 'mcq',
          correct: Boolean(correct),
          score: questionScore,
          answer,
          correctAnswer: question.correctAnswer,
          feedback: question.explanation,
          topic: question.topic,
          sourcePage: question.sourcePage || 1,
        });
      } else {
        // Essay / Short Answer Question
        essayTotal += 1;
        let essayEvaluation = null;
        if (ai && answer.length >= 3) {
          const rubricText = question.rubric && Array.isArray(question.rubric)
            ? question.rubric.map((r) => `- ${r.criterion} (weight: ${r.weight})`).join('\n')
            : 'Conceptual correctness and completeness.';

          const evalPrompt = `You are a strict and fair academic grader evaluating a student's written essay answer.
Question: ${question.question}
Reference Answer: ${question.referenceAnswer || question.correctAnswer}
Rubric:
${rubricText}
Student Answer:
${answer}

Evaluate the student's conceptual correctness. Return JSON:
{
  "score": number between 0 and 100,
  "correctPoints": ["point 1 student articulated correctly"],
  "missingPoints": ["concept or detail student omitted"],
  "incorrectClaims": ["any factual mistake made"],
  "feedback": "2-3 constructive educational sentences explaining the grade",
  "improvedAnswer": "An exemplary high-scoring version of the student answer"
}`;
          essayEvaluation = await geminiJson(evalPrompt);
        }

        const score = essayEvaluation?.score !== undefined
          ? Math.min(100, Math.max(0, Number(essayEvaluation.score)))
          : answer.length > 20 ? 75 : 35;
        essayEarned += score;

        results.push({
          questionId: question.id,
          type: 'essay',
          correct: score >= 65,
          score,
          answer,
          correctAnswer: question.referenceAnswer || question.correctAnswer,
          feedback: essayEvaluation?.feedback || question.explanation || 'Reviewed for conceptual accuracy.',
          improvedAnswer: essayEvaluation?.improvedAnswer,
          correctPoints: essayEvaluation?.correctPoints || [],
          missingPoints: essayEvaluation?.missingPoints || [],
          incorrectClaims: essayEvaluation?.incorrectClaims || [],
          topic: question.topic,
          sourcePage: question.sourcePage || 1,
        });
      }
    }

    const mcqScore = mcqTotal ? Math.round((mcqEarned / mcqTotal) * 100) : null;
    const essayScore = essayTotal ? Math.round(essayEarned / essayTotal) : null;
    const score = quiz.questionType === 'mcq'
      ? (mcqScore ?? 0)
      : quiz.questionType === 'essay'
        ? (essayScore ?? 0)
        : Math.round(((mcqEarned * 100) + essayEarned) / ((mcqTotal * 100) + (essayTotal * 100) || 1) * 100);

    const weakTopics = [...new Set(results.filter((r) => !r.correct || r.score < 60).map((r) => r.topic))];

    const previousAttempts = store.attempts.filter((a) => a.quizId === quiz.id);
    const attemptNumber = previousAttempts.length + 1;

    const attempt = {
      id: randomUUID(),
      workspaceId: req.params.id,
      quizId: quiz.id,
      attemptNumber,
      score,
      mcqScore,
      essayScore,
      answers: submitted,
      results,
      weakTopics,
      createdAt: new Date().toISOString(),
    };

    store.attempts.push(attempt);

    // Update Concept Mastery Engine & Record Evidence
    const now = new Date().toISOString();
    for (const resItem of results) {
      const concept = store.concepts.find((c) =>
        c.workspaceId === req.params.id &&
        (c.name.toLowerCase() === resItem.topic.toLowerCase() ||
          resItem.topic.toLowerCase().includes(c.name.toLowerCase()) ||
          c.name.toLowerCase().includes(resItem.topic.toLowerCase()))
      );

      if (concept) {
        const delta = resItem.score >= 70 ? 12 : -8;
        concept.masteryScore = Math.min(100, Math.max(0, (concept.masteryScore || 20) + delta));
        concept.status = concept.masteryScore >= 80 ? 'strong' : concept.masteryScore >= 60 ? 'good' : concept.masteryScore >= 30 ? 'learning' : 'weak';
        concept.updatedAt = now;

        store.masteryEvidence.push({
          id: randomUUID(),
          workspaceId: req.params.id,
          conceptId: concept.id,
          sourceType: resItem.type === 'essay' ? 'quiz_essay' : 'quiz_mcq',
          sourceId: quiz.id,
          scoreDelta: delta,
          description: `Quiz #${quiz.quizNumber} - ${resItem.topic}: ${resItem.score}%`,
          createdAt: now,
        });
      }
    }

    await saveStore(store);
    res.status(201).json(attempt);
  } catch (error) { next(error); }
});

// Weak Topics Practice
app.post('/api/workspaces/:id/quizzes/weak-topics', requireUser, async (req, res, next) => {
  try {
    const store = await readStore();
    const view = workspaceView(store, req.params.id, req.user.id);
    if (!view) return res.status(404).json({ error: 'Workspace not found.' });

    const weakConcepts = view.concepts.filter((c) => c.status === 'weak' || c.masteryScore < 50);
    const targetTopic = weakConcepts.length ? weakConcepts.slice(0, 3).map((c) => c.name).join(', ') : 'Security Foundations';

    const count = 5;
    const chunks = await retrieve(store, req.params.id, targetTopic, 10);
    let questions = null;
    if (ai) {
      const prompt = `Generate a 5-question adaptive remedial quiz targeting these weak concepts: ${targetTopic}.
Mix 3 MCQ and 2 Essay questions to test understanding and clear common student misconceptions.
Return JSON strictly: { "questions": [{"type":"mcq","topic":"...","question":"...","options":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}],"correctAnswer":"...","explanation":"...","difficulty":"medium","sourcePage":1}] }
Sources:
${contextText(chunks)}`;
      const result = await geminiJson(prompt);
      if (result?.questions) questions = result.questions.map(q => ({ ...q, id: q.id || randomUUID() }));
    }

    questions ||= mockQuiz('medium', 5, targetTopic, 'mixed');

    const workspace = store.workspaces.find((w) => w.id === req.params.id);
    workspace.lastQuizNumber = (Number(workspace.lastQuizNumber) || store.quizzes.filter(q => q.workspaceId === req.params.id).length) + 1;
    const quizNumber = workspace.lastQuizNumber;

    const quiz = {
      id: randomUUID(),
      workspaceId: req.params.id,
      quizNumber,
      title: `Weak Topics Practice (#${quizNumber})`,
      questionType: 'mixed',
      difficulty: 'adaptive',
      questionCount: questions.length,
      topic: targetTopic,
      questions,
      createdAt: new Date().toISOString(),
    };

    store.quizzes.push(quiz);
    await saveStore(store);
    res.status(201).json(quiz);
  } catch (error) { next(error); }
});

// Viva Oral Exam Start
app.post('/api/workspaces/:id/viva/start', requireUser, aiLimiter, async (req, res, next) => {
  try {
    const store = await readStore();
    const view = workspaceView(store, req.params.id, req.user.id);
    if (!view) return res.status(404).json({ error: 'Workspace not found.' });

    const concepts = view.concepts.length ? view.concepts : await extractConceptsFromNotebook(store, req.params.id);
    const sorted = [...concepts].sort((a, b) => a.masteryScore - b.masteryScore);
    const targetConcept = sorted[0]?.name || 'Security Principles';
    const chunks = await retrieve(store, req.params.id, targetConcept, 8);

    let firstQuestion = `Explain in your own words the core idea behind ${targetConcept}. What problem does it solve in a computer system?`;
    if (ai) {
      const prompt = `You are a university professor conducting an oral Viva exam.
Create the first spoken question to test the student's conceptual mastery of "${targetConcept}".
Keep the question conversational, direct, and thought-provoking.
Return JSON: { "question": "..." }
Sources:
${contextText(chunks)}`;
      const resJson = await geminiJson(prompt);
      if (resJson?.question) firstQuestion = resJson.question;
    }

    const vivaId = randomUUID();
    res.json({
      vivaId,
      concept: targetConcept,
      questionNumber: 1,
      totalQuestions: 3,
      question: firstQuestion,
    });
  } catch (error) { next(error); }
});

// Viva Oral Exam Turn
app.post('/api/workspaces/:id/viva/turn', requireUser, aiLimiter, async (req, res, next) => {
  try {
    const { vivaId, concept, questionNumber, questionText, studentAnswer } = req.body || {};
    const store = await readStore();
    const chunks = await retrieve(store, req.params.id, concept || 'Security', 8);

    let evaluation = null;
    const isFinal = Number(questionNumber) >= 3;

    if (ai) {
      const prompt = `You are a university professor conducting an oral Viva exam on "${concept}".
Current Question (${questionNumber}/3): ${questionText}
Student Oral Response: "${studentAnswer}"

Evaluate the student's spoken response:
- Correctness and depth
- Accurate terminology used
- Missing concepts
${isFinal ? '- Overall oral mastery score (0-100), key strengths, and areas to improve.' : '- Next adaptive follow-up question digging deeper.'}

Return JSON strictly:
{
  "turnScore": number 0-100,
  "spokenFeedback": "2 encouraging sentences summarizing how they did and explaining the key nuance.",
  "isFinal": ${isFinal},
  ${isFinal ? '"finalScore": 85, "strengths": ["Clear explanation"], "weakConcepts": ["Edge case"], "summary": "Great grasp."' : '"nextQuestion": "adaptive follow-up question"'}
}

Context:
${contextText(chunks)}`;

      evaluation = await geminiJson(prompt);
    }

    evaluation ||= {
      turnScore: studentAnswer.length > 25 ? 80 : 45,
      spokenFeedback: 'Good conceptual start. Remember to clearly state the formal definition and access bounds.',
      isFinal,
      finalScore: 82,
      strengths: ['Clear terminology', 'Good basic intuition'],
      weakConcepts: ['Edge cases', 'Implementation details'],
      summary: 'Solid performance demonstrating good foundational understanding.',
      nextQuestion: `Can you give an example of how ${concept} can be compromised if not implemented properly?`
    };

    if (isFinal) {
      const vivaAttempt = {
        id: vivaId || randomUUID(),
        workspaceId: req.params.id,
        concept,
        score: evaluation.finalScore || evaluation.turnScore || 75,
        strengths: evaluation.strengths || [],
        weakConcepts: evaluation.weakConcepts || [],
        summary: evaluation.summary || evaluation.spokenFeedback,
        createdAt: new Date().toISOString(),
      };
      store.vivaAttempts.push(vivaAttempt);

      const matchConcept = store.concepts.find((c) => c.workspaceId === req.params.id && c.name.toLowerCase().includes(concept.toLowerCase()));
      if (matchConcept) {
        matchConcept.masteryScore = Math.min(100, Math.max(0, matchConcept.masteryScore + (vivaAttempt.score >= 70 ? 15 : -10)));
        matchConcept.status = matchConcept.masteryScore >= 80 ? 'strong' : matchConcept.masteryScore >= 60 ? 'good' : matchConcept.masteryScore >= 30 ? 'learning' : 'weak';
        matchConcept.updatedAt = new Date().toISOString();

        store.masteryEvidence.push({
          id: randomUUID(),
          workspaceId: req.params.id,
          conceptId: matchConcept.id,
          sourceType: 'viva',
          sourceId: vivaAttempt.id,
          scoreDelta: vivaAttempt.score >= 70 ? 15 : -10,
          description: `Oral Viva Exam: ${vivaAttempt.score}%`,
          createdAt: new Date().toISOString(),
        });
      }
      await saveStore(store);
    }

    res.json(evaluation);
  } catch (error) { next(error); }
});

// Explain It To Me
app.post('/api/workspaces/:id/explain', requireUser, aiLimiter, async (req, res, next) => {
  try {
    const { topic, mode = 'detailed', language = 'ar' } = req.body || {};
    const store = await readStore();
    const chunks = await retrieve(store, req.params.id, topic || 'core concepts', 8);
    const isArabic = language === 'ar';

    let explanation = null;
    if (ai) {
      const modeInstruction = mode === 'simple'
        ? 'Explain in ultra-simple ELI5 terms with everyday metaphors.'
        : mode === 'exam'
          ? 'Focus strictly on high-yield exam points, exact definitions, and typical trick questions.'
          : mode === 'example'
            ? 'Lead with 2 real-world concrete examples and walkthrough their mechanics.'
            : 'Provide an engaging, in-depth pedagogical breakdown.';

      const prompt = `You are a charismatic master tutor explaining "${topic}".
Mode: ${modeInstruction}
Language: ${isArabic ? 'Fluent Arabic' : 'English'}.
Break down into 2-3 short spoken teaching segments, followed by a check question to verify comprehension.
Return JSON:
{
  "title": "${topic}",
  "segments": [
    { "heading": "...", "body": "..." }
  ],
  "checkQuestion": {
    "question": "...",
    "options": ["A", "B", "C"],
    "correctAnswer": "A",
    "explanation": "..."
  }
}
Context:
${contextText(chunks)}`;
      explanation = await geminiJson(prompt);
    }

    explanation ||= {
      title: topic || 'Core Security Concepts',
      segments: [
        { heading: 'The Big Picture', body: `Understanding ${topic || 'security'} starts with knowing who has access and why.` },
        { heading: 'Practical Application', body: 'Think of this like a secure vault with identity verification before permission checks.' }
      ],
      checkQuestion: {
        question: `What is the primary objective of ${topic || 'Confidentiality'}?`,
        options: ['Protect unauthorized access', 'Alter files freely', 'Turn off system'],
        correctAnswer: 'Protect unauthorized access',
        explanation: 'It restricts access to authorized users only.'
      }
    };

    res.json(explanation);
  } catch (error) { next(error); }
});

// Smart Study Session
app.post('/api/workspaces/:id/smart-session', requireUser, aiLimiter, async (req, res, next) => {
  try {
    const { durationMinutes = 20 } = req.body || {};
    const store = await readStore();
    const view = workspaceView(store, req.params.id, req.user.id);
    if (!view) return res.status(404).json({ error: 'Workspace not found.' });

    const weak = view.concepts.filter((c) => c.status === 'weak' || c.masteryScore < 60);
    const focusConcept = weak[0]?.name || view.concepts[0]?.name || 'Security Architecture';

    const sessionPlan = {
      durationMinutes,
      focusConcept,
      steps: [
        { step: 1, type: 'concept_review', title: `Mastering ${focusConcept}`, minutes: Math.round(durationMinutes * 0.35), description: `Deep dive into the core mechanisms and common pitfalls of ${focusConcept}.` },
        { step: 2, type: 'practice', title: 'Check for Understanding', minutes: Math.round(durationMinutes * 0.4), description: `Targeted formative assessment on ${focusConcept}.` },
        { step: 3, type: 'viva', title: 'Oral Recall Challenge', minutes: Math.round(durationMinutes * 0.25), description: 'Answer verbal check questions to solidify long-term memory.' }
      ]
    };

    res.json(sessionPlan);
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error('[API Error]', error);
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File is too large. Maximum size is ${config.maxFileMb} MB.` });
  }
  const isProd = process.env.NODE_ENV === 'production';
  const message = isProd
    ? 'An unexpected error occurred. Please try again later.'
    : (error.message || 'Something went wrong.');
  res.status(error.status || 500).json({ error: message });
});

const httpServer = createHttpServer(app);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
} else if (process.env.NODE_ENV !== 'test') {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root,
    server: {
      middlewareMode: true,
      port: config.port,
      hmr: {
        server: httpServer,
        port: config.port,
      },
      watch: {
        ignored: [
          '**/data/**',
          '**/uploads/**',
          '**/.env*',
          '**/dist/**',
          '**/server/**',
          '**/.git/**',
          '**/scratch/**',
        ],
      },
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

if (process.env.NODE_ENV !== 'test') {
  await mkdir(config.uploadPath, { recursive: true });
  httpServer.listen(config.port, '127.0.0.1', () => console.log(`Nabta AI → http://127.0.0.1:${config.port} (${ai ? 'Gemini live' : 'demo mode'})`));
}

export { app, httpServer };
