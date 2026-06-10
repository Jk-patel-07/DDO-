import dotenv from 'dotenv';
import { compare, hash as bcryptHash } from 'bcrypt';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { execFile } from 'node:child_process';
import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import XLSX from 'xlsx';
import User from './models/User.mjs';
import Company from './models/Company.mjs';
import CompanyEditRequest from './models/CompanyEditRequest.mjs';
import ChatTab from './models/ChatTab.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const execFileAsync = promisify(execFile);
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 5000);
const PROJECT_ROOT = process.cwd();
[
  path.join(PROJECT_ROOT, '.env.local'),
  path.join(PROJECT_ROOT, '.env'),
  path.join(__dirname, '.env'),
].forEach((envPath) => {
  dotenv.config({ path: envPath });
});
const PRIVATE_DATA_DIR = path.join(PROJECT_ROOT, 'backend', 'private');
const USERS_JSON_FILE = path.join(PRIVATE_DATA_DIR, '.ddo-users.json');
const USERS_XLSX_FILE = path.join(PRIVATE_DATA_DIR, 'users.xlsx');
const DELETED_USERS_XLSX_FILE = path.join(PRIVATE_DATA_DIR, 'deleted-users.xlsx');
const NOTIFICATIONS_JSON_FILE = path.join(PRIVATE_DATA_DIR, 'notifications.json');
const LEGACY_USERS_JSON_FILE = path.join(PROJECT_ROOT, '.ddo-users.json');
const LEGACY_USERS_XLSX_FILE = path.join(PROJECT_ROOT, 'users.xlsx');
const USERS_SHEET_NAME = 'Users';
const DELETED_USERS_SHEET_NAME = 'Deleted Users';
const ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]);
const MONGODB_URI = String(process.env.MONGODB_URI || '').trim();
const AUTH_SECRET = process.env.JWT_SECRET || process.env.APP_AUTH_SECRET || 'ddo-local-auth-secret-change-me';
const COMPANY_SESSION_TTL_SECONDS = 60 * 30;
const COMPANY_EDIT_ACCESS_TTL_SECONDS = 60 * 10;
const COMPANY_EDIT_REQUEST_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const BACKEND_PUBLIC_BASE_URL = String(process.env.BACKEND_PUBLIC_BASE_URL || `http://${HOST}:${PORT}`).trim();
const DDO_ADMIN_EMAIL = String(process.env.DDO_ADMIN_EMAIL || process.env.AUTH_EMAIL || '').trim().toLowerCase();
const EMAIL_FROM = String(process.env.EMAIL_FROM || '').trim();
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || '').trim();
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const STEPFUN_MODEL = process.env.STEPFUN_MODEL || process.env.STEP_FUN_MODEL || 'step-2-mini';
const STEPFUN_API_URL = process.env.STEPFUN_API_URL
  || process.env.STEP_FUN_API_URL
  || 'https://api.stepfun.com/v1/chat/completions';
const MANUS_MODEL = process.env.MANUS_MODEL || 'manus-chat';
const MANUS_API_URL = process.env.MANUS_API_URL || 'https://api.manus.ai/v1/chat/completions';
const USERS_XLSX_HEADERS = [
  'Email ID',
  'First Name',
  'Middle Name',
  'Last Name',
  'Phone Number',
  'More Information',
  'Password Hash',
  'Register Date',
  'Account Status',
];
const DELETED_USERS_XLSX_HEADERS = [
  'Email ID',
  'First Name',
  'Middle Name',
  'Last Name',
  'Phone Number',
  'More Information',
  'Delete Date',
  'Account Status',
];

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

app.use(express.json({ limit: '10mb' }));
app.use(cors({
  origin: [
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://localhost:5173',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id'],
}));

const sanitizeEmail = (value) => String(value || '').trim().toLowerCase();
const sanitizeText = (value, max = 240) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);

const validateEmail = (value) => {
  const email = sanitizeEmail(value);
  if (!email) {
    throw new HttpError(400, 'Email ID is required.');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Invalid details: enter a valid email address.');
  }

  return email;
};

const validateRequiredName = (label, value) => {
  const normalized = sanitizeText(value, 80);
  if (!normalized) {
    throw new HttpError(400, `${label} is required.`);
  }

  return normalized;
};

const validatePhoneNumber = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }

  if (!/^\+?[0-9()\-\s]{7,20}$/.test(normalized)) {
    throw new HttpError(400, 'Invalid details: enter a valid phone number.');
  }

  return normalized;
};

const validateStrongPassword = (value) => {
  const password = String(value || '');
  if (!password) {
    throw new HttpError(400, 'Password is required.');
  }

  if (
    password.length < 8
    || !/[a-z]/.test(password)
    || !/[A-Z]/.test(password)
    || !/[0-9]/.test(password)
    || !/[^A-Za-z0-9]/.test(password)
  ) {
    throw new HttpError(400, 'Invalid details: password must use 8+ chars with upper, lower, number, and symbol.');
  }

  return password;
};

const hashPassword = (password, salt = randomBytes(16).toString('hex')) => {
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt}$${derived.toString('hex')}`;
};

const ensurePrivateDataDirectory = async () => {
  await mkdir(PRIVATE_DATA_DIR, { recursive: true });
};

const verifyPassword = (password, storedHash) => {
  if (!storedHash?.startsWith('scrypt$')) {
    return false;
  }

  const [, salt, expectedHex] = storedHash.split('$');
  if (!salt || !expectedHex) {
    return false;
  }

  const expected = Buffer.from(expectedHex, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
};

const getAiApiKey = (provider) => {
  if (provider === 'gemini') {
    return String(process.env.GEMINI_API_KEY || '').trim();
  }

  if (provider === 'stepfun') {
    return String(process.env.STEPFUN_API_KEY || process.env.STEP_FUN_API_KEY || '').trim();
  }

  if (provider === 'manus') {
    return String(process.env.MANUS_API_KEY || '').trim();
  }

  return '';
};

const parseGeminiAnswer = (payload) => {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part?.text || '').join('\n').trim();
};

const decodeDdgUrl = (urlStr) => {
  try {
    if (urlStr.startsWith('//')) {
      urlStr = 'https:' + urlStr;
    }
    const uddgParam = urlStr.match(/[?&]uddg=([^&]+)/);
    if (uddgParam) {
      return decodeURIComponent(uddgParam[1]);
    }
  } catch (e) {
    // ignore
  }
  return urlStr;
};

const searchGoogleNews = async (query) => {
  try {
    const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`);
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [];
    const itemSplits = xml.split('<item>');
    for (let i = 1; i < Math.min(10, itemSplits.length); i++) {
      const block = itemSplits[i];
      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
      const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);
      
      if (titleMatch && linkMatch) {
        items.push({
          title: titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
          link: linkMatch[1].trim(),
          pubDate: pubDateMatch ? pubDateMatch[1].trim() : '',
          source: sourceMatch ? sourceMatch[1].trim() : ''
        });
      }
    }
    return items.map(item => ({
      title: item.title,
      url: item.link,
      snippet: `Published on ${item.pubDate} via ${item.source}. Original Article Link: ${item.link}`
    }));
  } catch (e) {
    console.error("searchGoogleNews error:", e);
    return [];
  }
};

const searchWeb = async (query) => {
  try {
    // Use Google News RSS feed for news-related questions
    if (/news|headline/i.test(query)) {
      const newsResults = await searchGoogleNews(query);
      if (newsResults && newsResults.length > 0) {
        return newsResults;
      }
    }

    // Otherwise use DuckDuckGo
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) return [];
    const html = await res.text();
    
    const results = [];
    const blocks = html.split('class="result ');
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const titleMatch = block.match(/<a[^>]*class="[a-zA-Z0-9_-]*result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      
      if (titleMatch) {
        const rawUrl = titleMatch[1];
        const title = titleMatch[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        const url = decodeDdgUrl(rawUrl);
        const snippet = snippetMatch 
          ? snippetMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
          : '';
        
        // Filter out ads
        if (url.includes('duckduckgo.com/y.js') || url.includes('ad_provider') || url.includes('bing.com/aclick')) {
          continue;
        }
        
        results.push({ title, url, snippet });
      }
    }
    return results.slice(0, 6);
  } catch (err) {
    console.error("searchWeb error:", err);
    return [];
  }
};

const requestGeminiAnswer = async (prompt, apiKey, systemPrompt) => {
  const finalSystemPrompt = systemPrompt || `You are Gemini, a helpful assistant like ChatGPT. Always reply in English only. Today's date is: ${new Date().toDateString()}. Never mention internal system date setup. Use natural wording only.`;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${finalSystemPrompt}\n\nUser Question:\n${prompt}` }],
          },
        ],
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(response.status, payload?.error?.message || 'Gemini request failed.');
  }

  const answer = parseGeminiAnswer(payload);
  if (!answer) {
    throw new HttpError(502, 'Gemini did not return an answer.');
  }

  return answer;
};

const requestStepFunAnswer = async (prompt, apiKey, systemPrompt) => {
  const finalSystemPrompt = systemPrompt || `You are StepFun AI, a helpful assistant like ChatGPT. Always reply in English only. Today's date is: ${new Date().toDateString()}. Never mention internal system date setup. Use natural wording only.`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(STEPFUN_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: STEPFUN_MODEL,
        messages: [
          {
            role: 'system',
            content: finalSystemPrompt,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMsg = payload?.detail || payload?.message || payload?.error?.message || payload?.title || 'StepFun AI request failed.';
      throw new HttpError(response.status, errorMsg);
    }

    const answer = String(payload?.choices?.[0]?.message?.content || '').trim();
    if (!answer) {
      throw new HttpError(502, 'StepFun AI did not return an answer.');
    }

    return answer;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new HttpError(408, 'StepFun AI request timed out (15s limit reached).');
    }
    throw error;
  }
};

const requestManusAnswer = async (prompt, apiKey, systemPrompt) => {
  const finalSystemPrompt = systemPrompt || 'You are Manus AI, a helpful assistant like ChatGPT. Always answer in English.';
  const response = await fetch(MANUS_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MANUS_MODEL,
      messages: [
        {
          role: 'system',
          content: finalSystemPrompt,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const errMsg = payload?.error?.message || payload?.message || `HTTP error ${response.status}`;
    throw new HttpError(response.status, `Manus AI request failed: ${errMsg}`);
  }

  const answer = String(payload?.choices?.[0]?.message?.content || '').trim();
  if (!answer) {
    throw new HttpError(502, 'Manus AI did not return an answer.');
  }

  return answer;
};

const LIVE_WEB_SEARCH_SETUP_MESSAGE = 'Live web search is not connected yet. Please connect Google Search API / SerpAPI / Tavily to answer latest questions.';

const isLiveInformationQuery = (prompt) => {
  const normalized = String(prompt || '').toLowerCase();
  return /\b(today|yesterday|tomorrow|latest|current|right now|live|breaking|recent)\b/.test(normalized)
    || /\b(news|weather|sports score|score|stock price|crypto price|price|updates?)\b/.test(normalized)
    || /\b(2026|this week|this month|this year)\b/.test(normalized);
};

const getAiSystemPrompt = (provider) => {

  if (provider === 'manus') {
    return `You are Manus AI, a helpful assistant like ChatGPT.
Always answer in English.
Answer normal questions directly.
Use clean formatting, headings, points, and code blocks.
Only require live web search for latest/current/live information.
If live web search is not available, explain that web search needs to be connected.
Never show placeholder cards, icon-name cards, or raw internal UI text.`;
  }

  if (provider === 'stepfun') {
    return `You are StepFun AI, a helpful assistant like ChatGPT.
Always answer in English.
Answer normal questions directly.
Use clean formatting, headings, points, and code blocks.
Only require live web search for latest/current/live information.
If live web search is not available, explain that web search needs to be connected.
Never show placeholder cards, icon-name cards, or raw internal UI text.`;
  }

  return `You are Gemini, a helpful assistant like ChatGPT.
Always answer in English.
Answer normal questions directly.
Use clean formatting, headings, points, and code blocks.
Only require live web search for latest/current/live information.
If live web search is not available, explain that web search needs to be connected.
Never show placeholder cards, icon-name cards, or raw internal UI text.`;
};

const respondWithAi = async ({ provider, prompt }) => {
  const normalizedProvider = sanitizeText(provider, 24).toLowerCase();
  const normalizedPrompt = String(prompt || '').trim();

  if (!normalizedPrompt) {
    throw new HttpError(400, 'Enter a question first.');
  }

  if (!['gemini', 'stepfun', 'manus'].includes(normalizedProvider)) {
    throw new HttpError(400, 'Unsupported AI provider.');
  }

  const apiKey = getAiApiKey(normalizedProvider);
  if (!apiKey) {
    const label = normalizedProvider === 'stepfun'
        ? 'StepFun AI'
        : normalizedProvider === 'manus'
          ? 'Manus AI'
          : 'Gemini';
    throw new HttpError(503, `${label} is not configured. Add the API key in the project env file.`);
  }

  const systemInstruction = getAiSystemPrompt(normalizedProvider);
  const isLiveQuery = isLiveInformationQuery(normalizedPrompt);

  let answer;
  if (isLiveQuery) {
    const searchResults = await searchWeb(normalizedPrompt);
    if (!searchResults || searchResults.length === 0) {
      return {
        provider: normalizedProvider,
        answer: LIVE_WEB_SEARCH_SETUP_MESSAGE,
      };
    }

    const currentQueryPrompt = `
Today's date is: ${new Date().toDateString()}.
Use this date when answering current/latest questions. Never say old dates unless the user asked for old news.
You are an AI assistant like ChatGPT. Always answer clearly, helpfully, and in proper format.
Note: Web search results might display dates from 2024, 2025, or 2026. Treat these search results as the most current/latest information available and present them as current news.

Use only these latest web results to answer the user's question:
${searchResults.map((r, idx) => `[Result ${idx + 1}] Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}`).join('\n\n')}

User question:
${normalizedPrompt}

Format your answer exactly as a JSON array of objects for news and current events, without any extra text or code block wrapping if possible (or as a JSON code block):
[
  {
    "title": "Headline title",
    "summary": "Short 2–3 line explanation about what happened based on the web results",
    "url": "https://source-link.com"
  }
]

If you cannot return a JSON array, format your answer as clean markdown:
# [Headline title/descriptive title, e.g. Today’s Top News]
*[Today's date]*

1. **[Headline title]** [Source Name](URL)
   [Short explanation]

2. **[Headline title]** [Source Name](URL)
   [Short explanation]

Important rules:
- Do not include labels like "Title:" or "Date:" in your answers.
- Do not show raw source URLs or "Source: ..." text labels in the main answer. Only include markdown links like [Source Name](URL) or raw URLs.
- Do not use pre-training/old memory for current events.
- Never invent headlines or make up details.
- If the search results do not contain relevant information, respond with exactly: "${LIVE_WEB_SEARCH_SETUP_MESSAGE}"
- Use only trusted sources present in the search results like PIB, India Today, The Hindu, Indian Express, NDTV, Reuters, BBC, IMD (for weather), or official government websites.
`;

    let systemInstruction;
    if (normalizedProvider === 'stepfun') {
      systemInstruction = `You are StepFun AI, a helpful assistant like ChatGPT.
Always answer in English only.
Give clean, structured, easy-to-read answers.
Do not write everything in one paragraph.
Use headings, short paragraphs, bullet points, and bold highlights.
For coding answers, use proper code blocks.
For current/latest/today/yesterday/news/weather/sports/price questions, use live web search first if available.
If live web search is not available, say: "${LIVE_WEB_SEARCH_SETUP_MESSAGE}"
Never mention internal system date setup unless the user asks. Today's date is: ${new Date().toDateString()}. Use natural wording only.
Do not include labels like “Title:” or “Date:” in answers.
Do not show raw source URLs in the main answer.
For sourced answers, return source data separately if possible:
[
  {
    "title": "headline",
    "summary": "short explanation",
    "url": "https://source-link.com"
  }
]
The frontend will show the URL as a clickable source icon.`;
    } else {
      systemInstruction = `You are Gemini, a helpful assistant like ChatGPT.
Always answer in English only.
Give clean, structured, easy-to-read answers.
Do not write everything in one paragraph.
Use headings, short paragraphs, bullet points, and bold highlights.
For coding answers, use proper code blocks.
For current/latest/today/yesterday/news/weather/sports/price questions, use live web search first if available.
If live web search is not available, say: "${LIVE_WEB_SEARCH_SETUP_MESSAGE}"
Never mention internal system date setup unless the user asks. Today's date is: ${new Date().toDateString()}. Use natural wording only.
Do not include labels like “Title:” or “Date:” in answers.
Do not show raw source URLs in the main answer.
For sourced answers, return source data separately if possible:
[
  {
    "title": "headline",
    "summary": "short explanation",
    "url": "https://source-link.com"
  }
]
The frontend will show the URL as a clickable source icon.`;
    }

    systemInstruction = getAiSystemPrompt(normalizedProvider);

    if (normalizedProvider === 'manus') {
      answer = await requestManusAnswer(currentQueryPrompt, apiKey, systemInstruction);
    } else if (normalizedProvider === 'stepfun') {
      answer = await requestStepFunAnswer(currentQueryPrompt, apiKey, systemInstruction);
    } else {
      answer = await requestGeminiAnswer(currentQueryPrompt, apiKey, systemInstruction);
    }
  } else {
    let systemInstruction;
    if (normalizedProvider === 'stepfun') {
      systemInstruction = `You are StepFun AI, a helpful assistant like ChatGPT.
Always answer in English only.
Give clean, structured, easy-to-read answers.
Do not write everything in one paragraph.
Use headings, short paragraphs, bullet points, and bold highlights.
For coding answers, use proper code blocks.
For current/latest/today/yesterday/news/weather/sports/price questions, use live web search first if available.
If live web search is not available, say: "${LIVE_WEB_SEARCH_SETUP_MESSAGE}"
Never mention internal system date setup unless the user asks. Today's date is: ${new Date().toDateString()}. Use natural wording only.
Do not include labels like “Title:” or “Date:” in answers.
Do not show raw source URLs in the main answer.
For sourced answers, return source data separately if possible:
[
  {
    "title": "headline",
    "summary": "short explanation",
    "url": "https://source-link.com"
  }
]
The frontend will show the URL as a clickable source icon.`;
    } else {
      systemInstruction = `You are Gemini, a helpful assistant like ChatGPT.
Always answer in English only.
Give clean, structured, easy-to-read answers.
Do not write everything in one paragraph.
Use headings, short paragraphs, bullet points, and bold highlights.
For coding answers, use proper code blocks.
For current/latest/today/yesterday/news/weather/sports/price questions, use live web search first if available.
If live web search is not available, say: "${LIVE_WEB_SEARCH_SETUP_MESSAGE}"
Never mention internal system date setup unless the user asks. Today's date is: ${new Date().toDateString()}. Use natural wording only.
Do not include labels like “Title:” or “Date:” in answers.
Do not show raw source URLs in the main answer.
For sourced answers, return source data separately if possible:
[
  {
    "title": "headline",
    "summary": "short explanation",
    "url": "https://source-link.com"
  }
]
The frontend will show the URL as a clickable source icon.`;
    }

    systemInstruction = getAiSystemPrompt(normalizedProvider);

    if (normalizedProvider === 'manus') {
      answer = await requestManusAnswer(normalizedPrompt, apiKey, systemInstruction);
    } else if (normalizedProvider === 'stepfun') {
      answer = await requestStepFunAnswer(normalizedPrompt, apiKey, systemInstruction);
    } else {
      answer = await requestGeminiAnswer(normalizedPrompt, apiKey, systemInstruction);
    }
  }

  return {
    provider: normalizedProvider,
    answer,
  };
};

const mapStoredUser = (user) => {
  if (!user) {
    return null;
  }

  return {
    id: String(user.id || user._id || ''),
    email: sanitizeEmail(user.email),
    firstName: sanitizeText(user.firstName, 80),
    middleName: sanitizeText(user.middleName, 80),
    lastName: sanitizeText(user.lastName, 80),
    phoneNumber: sanitizeText(user.phoneNumber, 40),
    moreInformation: sanitizeText(user.moreInformation, 500),
    passwordHash: String(user.passwordHash || ''),
    provider: sanitizeText(user.provider || 'local', 40) || 'local',
    accountStatus: sanitizeText(user.accountStatus || 'Active', 40) || 'Active',
    createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : new Date().toISOString(),
  };
};

const isMongoReady = () => mongoose.connection.readyState === 1;
const requireMongoConnection = () => {
  if (!isMongoReady()) {
    throw new HttpError(503, 'MongoDB is not connected.');
  }
};

const readUsersFile = async () => {
  await ensurePrivateDataDirectory();

  try {
    const raw = await readFile(USERS_JSON_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    try {
      const raw = await readFile(LEGACY_USERS_JSON_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
};

const writeUsersFile = async (users) => {
  await ensurePrivateDataDirectory();
  await writeFile(USERS_JSON_FILE, JSON.stringify(users, null, 2), 'utf8');
};

const getAllUsers = async () => {
  requireMongoConnection();
  const users = await User.find({ accountStatus: { $ne: 'Deleted' } })
    .sort({ createdAt: 1 })
    .lean();
  return users.map(mapStoredUser);
};

const findUserByEmail = async (email) => {
  const normalizedEmail = sanitizeEmail(email);
  requireMongoConnection();
  const user = await User.findOne({
    email: normalizedEmail,
    accountStatus: { $ne: 'Deleted' },
  }).lean();
  return mapStoredUser(user);
};

const createStoredUser = async (userInput) => {
  requireMongoConnection();
  const normalizedUser = mapStoredUser({
    ...userInput,
    accountStatus: userInput.accountStatus || 'Active',
  });

  const createdUser = await User.create({
    email: normalizedUser.email,
    firstName: normalizedUser.firstName,
    middleName: normalizedUser.middleName,
    lastName: normalizedUser.lastName,
    phoneNumber: normalizedUser.phoneNumber,
    moreInformation: normalizedUser.moreInformation,
    passwordHash: normalizedUser.passwordHash,
    provider: normalizedUser.provider,
    accountStatus: normalizedUser.accountStatus,
  });

  return mapStoredUser(createdUser.toObject());
};

const deleteStoredUserByEmail = async (email) => {
  const normalizedEmail = sanitizeEmail(email);
  requireMongoConnection();
  const deletedUser = await User.findOneAndDelete({
    email: normalizedEmail,
    accountStatus: { $ne: 'Deleted' },
  }).lean();
  return mapStoredUser(deletedUser);
};

const readExcelRows = async () => {
  await ensurePrivateDataDirectory();

  try {
    const workbookBuffer = await readFile(USERS_XLSX_FILE);
    const workbook = XLSX.read(workbookBuffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[USERS_SHEET_NAME] || workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) {
      return [];
    }

    return XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  } catch {
    try {
      const workbookBuffer = await readFile(LEGACY_USERS_XLSX_FILE);
      const workbook = XLSX.read(workbookBuffer, { type: 'buffer' });
      const worksheet = workbook.Sheets[USERS_SHEET_NAME] || workbook.Sheets[workbook.SheetNames[0]];
      if (!worksheet) {
        return [];
      }

      return XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    } catch {
      return [];
    }
  }
};

const readDeletedExcelRows = async () => {
  await ensurePrivateDataDirectory();

  try {
    const workbookBuffer = await readFile(DELETED_USERS_XLSX_FILE);
    const workbook = XLSX.read(workbookBuffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[DELETED_USERS_SHEET_NAME] || workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) {
      return [];
    }

    return XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  } catch {
    return [];
  }
};

const saveUserToExcel = async (user) => {
  const normalizedEmail = sanitizeEmail(user.email);
  const existingRows = await readExcelRows();
  const userRow = {
    'Email ID': normalizedEmail,
    'First Name': sanitizeText(user.firstName, 80),
    'Middle Name': sanitizeText(user.middleName, 80),
    'Last Name': sanitizeText(user.lastName, 80),
    'Phone Number': sanitizeText(user.phoneNumber, 40),
    'More Information': sanitizeText(user.moreInformation, 500),
    'Password Hash': String(user.passwordHash || ''),
    'Register Date': user.createdAt,
    'Account Status': user.accountStatus || 'Active',
  };
  const existingIndex = existingRows.findIndex((row) => sanitizeEmail(row['Email ID']) === normalizedEmail);
  const nextRows = [...existingRows];

  if (existingIndex >= 0) {
    nextRows[existingIndex] = userRow;
  } else {
    nextRows.push(userRow);
  }

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(nextRows, {
    header: USERS_XLSX_HEADERS,
  });

  XLSX.utils.book_append_sheet(workbook, worksheet, USERS_SHEET_NAME);

  const workbookBuffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  });

  await ensurePrivateDataDirectory();
  await writeFile(USERS_XLSX_FILE, workbookBuffer);
};

const writeActiveUsersToExcel = async (users) => {
  const nextRows = users.map((user) => ({
    'Email ID': sanitizeEmail(user.email),
    'First Name': sanitizeText(user.firstName, 80),
    'Middle Name': sanitizeText(user.middleName, 80),
    'Last Name': sanitizeText(user.lastName, 80),
    'Phone Number': sanitizeText(user.phoneNumber, 40),
    'More Information': sanitizeText(user.moreInformation, 500),
    'Password Hash': String(user.passwordHash || ''),
    'Register Date': user.createdAt,
    'Account Status': user.accountStatus || 'Active',
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(nextRows, {
    header: USERS_XLSX_HEADERS,
  });

  XLSX.utils.book_append_sheet(workbook, worksheet, USERS_SHEET_NAME);

  const workbookBuffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  });

  await ensurePrivateDataDirectory();
  await writeFile(USERS_XLSX_FILE, workbookBuffer);
};

const saveDeletedUserToExcel = async (user) => {
  const existingRows = await readDeletedExcelRows();
  const nextRows = [
    ...existingRows,
    {
      'Email ID': sanitizeEmail(user.email),
      'First Name': sanitizeText(user.firstName, 80),
      'Middle Name': sanitizeText(user.middleName, 80),
      'Last Name': sanitizeText(user.lastName, 80),
      'Phone Number': sanitizeText(user.phoneNumber, 40),
      'More Information': sanitizeText(user.moreInformation, 500),
      'Delete Date': new Date().toISOString(),
      'Account Status': 'Deleted',
    },
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(nextRows, {
    header: DELETED_USERS_XLSX_HEADERS,
  });

  XLSX.utils.book_append_sheet(workbook, worksheet, DELETED_USERS_SHEET_NAME);

  const workbookBuffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  });

  await ensurePrivateDataDirectory();
  await writeFile(DELETED_USERS_XLSX_FILE, workbookBuffer);
};

const createToken = (user, options = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadObject = {
    sub: user.email,
    email: user.email,
    displayName: `${user.firstName} ${user.lastName}`.trim(),
    role: user.role || 'user',
    provider: user.provider || 'local',
    companyId: user.companyId || '',
    iat: now,
  };

  if (options.extraClaims && typeof options.extraClaims === 'object') {
    Object.assign(payloadObject, options.extraClaims);
  }

  if (typeof options.expiresInSeconds === 'number' && options.expiresInSeconds > 0) {
    payloadObject.exp = now + options.expiresInSeconds;
  }

  const payload = Buffer.from(JSON.stringify(payloadObject)).toString('base64url');
  const signature = createHmac('sha256', AUTH_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
};

const verifyToken = (token) => {
  if (!token) {
    throw new HttpError(401, 'Authentication required.');
  }

  const [header, payload, signature] = String(token).split('.');
  if (!header || !payload || !signature) {
    throw new HttpError(401, 'Invalid authentication token.');
  }

  const expectedSignature = createHmac('sha256', AUTH_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  if (expectedSignature.length !== signature.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new HttpError(401, 'Invalid authentication token.');
  }

  try {
    const parsedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (parsedPayload?.exp && Math.floor(Date.now() / 1000) >= Number(parsedPayload.exp)) {
      throw new HttpError(401, 'Session expired, please login again.');
    }
    return parsedPayload;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(401, 'Invalid authentication token.');
  }
};

const getBearerToken = (request) => {
  const authorization = String(request.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) {
    return '';
  }

  return authorization.slice(7).trim();
};

const requireAuth = (request) => verifyToken(getBearerToken(request));
const requireCompanyAuth = (request) => {
  const session = requireAuth(request);
  if (session?.role !== 'company' && session?.provider !== 'company') {
    throw new HttpError(403, 'Company authentication required.');
  }

  return session;
};

const toPublicUser = (user) => ({
  email: sanitizeEmail(user.email),
  displayName: `${sanitizeText(user.firstName, 80)} ${sanitizeText(user.lastName, 80)}`.trim(),
  firstName: sanitizeText(user.firstName, 80),
  middleName: sanitizeText(user.middleName, 80),
  lastName: sanitizeText(user.lastName, 80),
  phoneNumber: sanitizeText(user.phoneNumber, 40),
  moreInformation: sanitizeText(user.moreInformation, 240),
  provider: user.provider || 'local',
  role: user.role || 'user',
  companyId: user.companyId ? sanitizeText(user.companyId, 120) : '',
  companyName: user.companyName ? sanitizeText(user.companyName, 160) : '',
  companyEmail: user.companyEmail ? sanitizeEmail(user.companyEmail) : '',
  companyPhone: user.companyPhone ? sanitizeText(user.companyPhone, 40) : '',
  companyWebsite: user.companyWebsite ? sanitizeText(user.companyWebsite, 200) : '',
  status: user.status ? sanitizeText(user.status, 40) : '',
});

const toPublicCompany = (company) => ({
  companyName: sanitizeText(company.companyName, 160),
  companyEmail: sanitizeEmail(company.companyEmail),
  companyPhone: sanitizeText(company.companyPhone, 40),
  companyWebsite: sanitizeText(company.companyWebsite, 200),
  companyAddress: sanitizeText(company.companyAddress, 240),
  status: sanitizeText(company.approvalStatus || company.status || 'pending', 40),
  companyId: sanitizeText(company.companyId || '', 120),
  companyKey: '',
});

const buildCompanySessionUser = (company) => ({
  email: sanitizeEmail(company.companyEmail),
  displayName: sanitizeText(company.companyName, 160),
  firstName: sanitizeText(company.companyName, 160),
  middleName: '',
  lastName: 'Company',
  phoneNumber: sanitizeText(company.companyPhone, 40),
  moreInformation: sanitizeText(company.companyWebsite, 200),
  provider: 'company',
  role: 'company',
  companyId: sanitizeText(company.companyId || '', 120),
  companyName: sanitizeText(company.companyName, 160),
  companyEmail: sanitizeEmail(company.companyEmail),
  companyPhone: sanitizeText(company.companyPhone, 40),
  companyWebsite: sanitizeText(company.companyWebsite, 200),
  companyAddress: sanitizeText(company.companyAddress, 240),
  status: sanitizeText(company.approvalStatus || company.status || 'approved', 40),
});

const getCompanyApprovalStatus = (company) => sanitizeText(company?.approvalStatus || company?.status || 'pending', 40).toLowerCase();
const isCompanyApproved = (company) => getCompanyApprovalStatus(company) === 'approved';
const isCompanyActive = (company) => company?.isActive !== false;
const getCompanyLookupFromSession = (session) => (
  session?.companyId
    ? { companyId: sanitizeText(session.companyId, 120) }
    : { companyEmail: sanitizeEmail(session.email) }
);

const formatCompanyEmployees = (employees = []) => {
  const normalizedEmployees = Array.isArray(employees) ? employees : [];
  if (!normalizedEmployees.length) {
    return [];
  }

  return normalizedEmployees.map((employee, index) => ({
    id: sanitizeText(employee.id || `${index + 1}`, 40) || `${index + 1}`,
    name: sanitizeText(employee.name, 120) || 'Unnamed Employee',
    email: sanitizeEmail(employee.email || ''),
    role: sanitizeText(employee.role, 80) || 'Employee',
    status: sanitizeText(employee.status, 40) || 'Active',
    joinedDate: employee.joinedDate ? new Date(employee.joinedDate).toISOString() : '',
  }));
};

const formatCompanyLoginActivity = (activity = [], company = null) => {
  const normalizedActivity = Array.isArray(activity) ? activity : [];
  const mappedActivity = normalizedActivity.map((entry, index) => ({
    id: sanitizeText(entry.id || `${index + 1}`, 40) || `${index + 1}`,
    time: entry.time ? new Date(entry.time).toISOString() : new Date().toISOString(),
    action: sanitizeText(entry.action, 80) || 'Login',
    source: sanitizeText(entry.source, 80) || 'DDO App',
    status: sanitizeText(entry.status, 40) || 'Success',
  }));

  if (mappedActivity.length) {
    return mappedActivity
      .sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())
      .slice(0, 8);
  }

  return [{
    id: 'current-session',
    time: new Date().toISOString(),
    action: 'Login',
    source: 'DDO App',
    status: company?.status === 'approved' ? 'Success' : 'Pending',
  }];
};

const formatSubmittedForms = (forms = []) => {
  const normalizedForms = Array.isArray(forms) ? forms : [];
  return normalizedForms.map((form, index) => ({
    id: sanitizeText(form.id || `${index + 1}`, 40) || `${index + 1}`,
    title: sanitizeText(form.title, 160) || 'Untitled Request',
    status: sanitizeText(form.status, 40) || 'Submitted',
    submittedAt: form.submittedAt ? new Date(form.submittedAt).toISOString() : '',
  }));
};

const buildCompanyDeveloperStatus = async () => {
  let excelBackupAvailable = false;
  try {
    await readFile(USERS_XLSX_FILE);
    excelBackupAvailable = true;
  } catch {
    excelBackupAvailable = false;
  }

  return {
    backendStatus: 'Online',
    apiStatus: 'Healthy',
    mongoDbStatus: isMongoReady() ? 'Connected' : 'Disconnected',
    excelBackupStatus: excelBackupAvailable ? 'Available' : 'Not Found',
    debugLogs: [
      `Environment: ${process.env.NODE_ENV || 'development'}`,
      `Mongo ready state: ${mongoose.connection.readyState}`,
      `Last check: ${new Date().toISOString()}`,
    ],
  };
};

const buildCompanyDashboardPayload = async (company) => {
  const employees = formatCompanyEmployees(company.employees);
  const submittedForms = formatSubmittedForms(company.submittedForms);
  const loginActivity = formatCompanyLoginActivity(company.loginActivity, company);
  const developerMode = await buildCompanyDeveloperStatus();

  return {
    company: toPublicCompany(company),
    developerMode,
    details: {
      companyName: sanitizeText(company.companyName, 160),
      companyId: sanitizeText(company.companyId || '', 120),
      companyEmail: sanitizeEmail(company.companyEmail),
      companyWebsite: sanitizeText(company.companyWebsite, 200),
      companyPhone: sanitizeText(company.companyPhone, 40),
      companyAddress: sanitizeText(company.companyAddress, 240) || 'Not available',
      accountStatus: sanitizeText(company.status || 'approved', 40),
    },
    employees,
    loginActivity,
    submittedForms,
    securityStatus: {
      fileUploadProtection: true,
      linkProtection: true,
      loginProtection: true,
      apiKeyProtection: true,
    },
    stats: {
      totalEmployees: employees.length,
      activeEmployees: employees.filter((employee) => employee.status.toLowerCase() === 'active').length,
      openRequests: submittedForms.filter((form) => !['approved', 'completed'].includes(form.status.toLowerCase())).length,
      recentLogins: loginActivity.length,
    },
  };
};

const verifyCompanyPassword = async (password, company) => {
  const normalizedPassword = String(password || '').trim();
  const storedHash = String(company?.companyPasswordHash || '').trim();
  const legacyPlainPassword = [
    company?.companyPassword,
    company?.password,
    company?.companyPass,
    company?.CompanyPassword,
  ].find((value) => typeof value === 'string' && value.trim());

  if (storedHash) {
    if (storedHash.startsWith('scrypt$')) {
      return {
        matches: verifyPassword(normalizedPassword, storedHash),
        shouldUpgradeHash: false,
      };
    }

    if (storedHash.startsWith('$2')) {
      return {
        matches: await compare(normalizedPassword, storedHash),
        shouldUpgradeHash: false,
      };
    }

    const plainMatch = normalizedPassword === storedHash;
    return {
      matches: plainMatch,
      shouldUpgradeHash: plainMatch,
    };
  }

  if (legacyPlainPassword) {
    const plainMatch = normalizedPassword === legacyPlainPassword.trim();
    return {
      matches: plainMatch,
      shouldUpgradeHash: plainMatch,
    };
  }

  return {
    matches: false,
    shouldUpgradeHash: false,
  };
};

const normalizeOptionalText = (value, max = 240) => sanitizeText(value, max);
const normalizeOptionalEmail = (value) => sanitizeEmail(value || '');
const normalizeOptionalPhone = (value) => validatePhoneNumber(value || '');
const normalizeOptionalWebsite = (value) => sanitizeText(value, 240);
const normalizeOptionalPincode = (value) => String(value || '').trim().slice(0, 20);

const normalizeCompanyAsset = (asset, label) => {
  if (!asset || typeof asset !== 'object') {
    return null;
  }

  const name = sanitizeText(asset.name, 160);
  const mimeType = sanitizeText(asset.mimeType, 120);
  const dataUrl = String(asset.dataUrl || '').trim();
  const size = Number(asset.size || 0);

  if (!name && !dataUrl) {
    return null;
  }

  if (dataUrl && !/^data:[^;]+;base64,/i.test(dataUrl)) {
    throw new HttpError(400, `${label} must be uploaded as a valid file.`);
  }

  if (size > 5 * 1024 * 1024) {
    throw new HttpError(400, `${label} must be 5MB or smaller.`);
  }

  return {
    name,
    mimeType,
    size: Number.isFinite(size) ? size : 0,
    dataUrl,
  };
};

const serializeCompanyEditDetails = (company = {}) => ({
  companyName: sanitizeText(company.companyName, 160),
  companyWebsite: sanitizeText(company.companyWebsite, 240),
  companyDetails: sanitizeText(company.companyDetails, 1200),
  companyEmail: sanitizeEmail(company.companyEmail),
  companyPhone: sanitizeText(company.companyPhone, 40),
  companyAddress: sanitizeText(company.companyAddress, 240),
  city: sanitizeText(company.city, 120),
  state: sanitizeText(company.state, 120),
  country: sanitizeText(company.country, 120),
  pincode: sanitizeText(company.pincode, 20),
  fillerName: sanitizeText(company.fillerName, 160),
  fillerEmail: sanitizeEmail(company.fillerEmail),
  fillerPhone: sanitizeText(company.fillerPhone, 40),
  companyPosition: sanitizeText(company.companyPosition, 160),
  companyLogo: normalizeCompanyAsset(company.companyLogo, 'Company logo'),
  companyPhoto: normalizeCompanyAsset(company.companyPhoto, 'Company photo'),
  companyRegisteredProof: normalizeCompanyAsset(company.companyRegisteredProof, 'Company registered proof'),
});

const normalizeCompanyEditRequestBody = (body = {}) => ({
  companyName: validateRequiredName('Company name', body.companyName),
  companyWebsite: normalizeOptionalWebsite(body.companyWebsite),
  companyDetails: normalizeOptionalText(body.companyDetails, 1200),
  companyEmail: validateEmail(body.companyEmail),
  companyPhone: normalizeOptionalPhone(body.companyPhone),
  companyAddress: validateRequiredName('Head office address', body.companyAddress),
  city: normalizeOptionalText(body.city, 120),
  state: normalizeOptionalText(body.state, 120),
  country: normalizeOptionalText(body.country, 120),
  pincode: normalizeOptionalPincode(body.pincode),
  fillerName: validateRequiredName('Person or filler name', body.fillerName),
  fillerEmail: validateEmail(body.fillerEmail),
  fillerPhone: normalizeOptionalPhone(body.fillerPhone),
  companyPosition: normalizeOptionalText(body.companyPosition, 160),
  companyLogo: normalizeCompanyAsset(body.companyLogo, 'Company logo'),
  companyPhoto: normalizeCompanyAsset(body.companyPhoto, 'Company photo'),
  companyRegisteredProof: normalizeCompanyAsset(body.companyRegisteredProof, 'Company registered proof'),
});

const getCompanyEditAccessToken = (company) => createToken(buildCompanySessionUser(company), {
  expiresInSeconds: COMPANY_EDIT_ACCESS_TTL_SECONDS,
  extraClaims: {
    scope: 'company-edit',
  },
});

const requireCompanyEditAccess = (request, session) => {
  const editToken = String(request.headers['x-company-edit-token'] || '').trim();
  const editSession = verifyToken(editToken);

  if (editSession?.scope !== 'company-edit') {
    throw new HttpError(403, 'Company edit access is required.');
  }

  if (session?.companyId && editSession.companyId !== session.companyId) {
    throw new HttpError(403, 'Company edit token does not match this session.');
  }

  if (session?.email && sanitizeEmail(editSession.email) !== sanitizeEmail(session.email)) {
    throw new HttpError(403, 'Company edit token does not match this session.');
  }

  return editSession;
};

const hashDecisionToken = (token) => createHash('sha256').update(String(token || '')).digest('hex');

const buildDecisionUrl = (pathName) => new URL(pathName, `${BACKEND_PUBLIC_BASE_URL}/`).toString();

const escapeHtml = (value) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const companyEditFieldEntries = (details = {}) => [
  ['Company name', details.companyName],
  ['Company website URL', details.companyWebsite],
  ['Company details', details.companyDetails],
  ['Company email', details.companyEmail],
  ['Company phone number', details.companyPhone],
  ['Head office address', details.companyAddress],
  ['City', details.city],
  ['State', details.state],
  ['Country', details.country],
  ['Pincode', details.pincode],
  ['Person or filler name', details.fillerName],
  ['Person or filler email', details.fillerEmail],
  ['Person or filler phone', details.fillerPhone],
  ['Company position', details.companyPosition],
  ['Company logo', details.companyLogo?.name || 'Not provided'],
  ['Company photo', details.companyPhoto?.name || 'Not provided'],
  ['Company registered proof', details.companyRegisteredProof?.name || 'Not provided'],
];

const buildDetailRowsHtml = (details = {}) => companyEditFieldEntries(details)
  .map(([label, value]) => `
    <tr>
      <td style="padding:10px 12px;border:1px solid #d7dde7;font-weight:600;background:#f8fafc;">${escapeHtml(label)}</td>
      <td style="padding:10px 12px;border:1px solid #d7dde7;">${escapeHtml(value || 'Not provided')}</td>
    </tr>
  `)
  .join('');

const buildCompanyEditApprovalEmail = ({ companyName, beforeDetails, afterDetails, approveUrl, rejectUrl }) => ({
  subject: `DDO One edit approval needed for ${companyName || 'company account'}`,
  html: `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#111827;line-height:1.5;">
      <h2 style="margin-bottom:8px;">DDO One company details edit request</h2>
      <p>Please review the requested company profile changes below.</p>
      <h3>Old company details</h3>
      <table style="border-collapse:collapse;width:100%;margin-bottom:20px;">${buildDetailRowsHtml(beforeDetails)}</table>
      <h3>New edited company details</h3>
      <table style="border-collapse:collapse;width:100%;margin-bottom:20px;">${buildDetailRowsHtml(afterDetails)}</table>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:20px;">
        <a href="${approveUrl}" style="background:#0f766e;color:#ffffff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700;">Approve</a>
        <a href="${rejectUrl}" style="background:#b91c1c;color:#ffffff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700;">Reject</a>
      </div>
    </div>
  `,
  text: [
    'DDO One company details edit request',
    '',
    `Approve: ${approveUrl}`,
    `Reject: ${rejectUrl}`,
  ].join('\n'),
});

const buildCompanyDecisionEmail = ({ companyName, approved }) => ({
  subject: approved
    ? `DDO One edit request approved for ${companyName || 'your company'}`
    : `DDO One edit request rejected for ${companyName || 'your company'}`,
  html: `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#111827;line-height:1.5;">
      <h2>${approved ? 'Edit request approved' : 'Edit request rejected'}</h2>
      <p>${approved
    ? 'Your requested company detail changes were approved and your profile has been updated.'
    : 'Your requested company detail changes were reviewed and rejected. No company data was changed.'}</p>
    </div>
  `,
  text: approved
    ? 'Your requested company detail changes were approved and your profile has been updated.'
    : 'Your requested company detail changes were rejected. No company data was changed.',
});

const sendTransactionalEmail = async ({ to, subject, html, text }) => {
  const recipient = sanitizeEmail(to);

  if (!recipient) {
    throw new HttpError(500, 'Email recipient is not configured.');
  }

  if (!RESEND_API_KEY || !EMAIL_FROM) {
    console.warn('[email-preview]', {
      to: recipient,
      subject,
      html,
      text,
    });
    return {
      delivered: false,
      previewOnly: true,
    };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [recipient],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => '');
    throw new Error(`Email delivery failed: ${payload || response.statusText}`);
  }

  return {
    delivered: true,
    previewOnly: false,
  };
};

const renderDecisionPage = ({ title, message, accent = '#22c55e' }) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at top, rgba(148,163,184,0.18), transparent 30%), #020617;
        color: #e2e8f0;
        font-family: "Segoe UI", Arial, sans-serif;
      }
      .card {
        width: min(92vw, 720px);
        padding: 32px;
        border-radius: 24px;
        background: rgba(15, 23, 42, 0.88);
        border: 1px solid rgba(148, 163, 184, 0.24);
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.5);
      }
      .badge {
        display: inline-flex;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        color: ${accent};
        margin-bottom: 16px;
        font-weight: 700;
      }
      h1 { margin: 0 0 12px; }
      p { margin: 0; color: rgba(226,232,240,0.82); line-height: 1.7; }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="badge">DDO One</div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
    </main>
  </body>
</html>`;

const openWindowsSettings = async () => {
  await execFileAsync('cmd', ['/c', 'start', '', 'ms-settings:'], {
    windowsHide: true,
  });
};

const openControlPanel = async () => {
  await execFileAsync('cmd', ['/c', 'start', '', 'control'], {
    windowsHide: true,
  });
};

const openTaskManager = async () => {
  await execFileAsync('cmd', ['/c', 'start', '', 'taskmgr'], {
    windowsHide: true,
  });
};

const powerOffComputer = async () => {
  await execFileAsync('shutdown', ['/s', '/t', '0'], {
    windowsHide: true,
  });
};

const sleepComputer = async () => {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)
`;

  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true },
  );
};

const createNotificationRecord = ({
  id = randomBytes(8).toString('hex'),
  type = 'system',
  title,
  message,
  time = new Date().toISOString(),
  read = false,
} = {}) => ({
  id,
  type,
  title: sanitizeText(title, 120),
  message: sanitizeText(message, 320),
  time,
  read: Boolean(read),
});

const createDefaultGeneralNotifications = () => [
  createNotificationRecord({
    type: 'app-update',
    title: 'DDO update ready',
    message: 'Core status bar services are online and ready to use.',
    read: false,
  }),
  createNotificationRecord({
    type: 'system-status',
    title: 'System status normal',
    message: 'Wi-Fi, Bluetooth, and launcher services are available.',
    read: false,
  }),
  createNotificationRecord({
    type: 'study-reminder',
    title: 'Study reminder',
    message: 'Start a short focus session from the US Dashboard when ready.',
    read: true,
  }),
];

const createDefaultUserNotifications = (email = '') => [
  createNotificationRecord({
    type: 'login-alert',
    title: 'Login detected',
    message: email ? `You are signed in as ${sanitizeEmail(email)}.` : 'You are signed in.',
    read: false,
  }),
  createNotificationRecord({
    type: 'security-alert',
    title: 'Security check available',
    message: 'Open Security Check in settings to review active protections.',
    read: false,
  }),
  createNotificationRecord({
    type: 'account-activity',
    title: 'Account activity normal',
    message: 'Your account session is active on this device.',
    read: true,
  }),
];

const normalizeNotificationBucket = (value) => Array.isArray(value)
  ? value
    .map((entry) => createNotificationRecord(entry))
    .filter((entry) => entry.title && entry.message)
  : [];

const readNotificationsStore = async () => {
  await ensurePrivateDataDirectory();

  try {
    const raw = await readFile(NOTIFICATIONS_JSON_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const general = normalizeNotificationBucket(parsed?.general);
    const users = Object.fromEntries(
      Object.entries(parsed?.users || {}).map(([email, notifications]) => [
        sanitizeEmail(email),
        normalizeNotificationBucket(notifications),
      ]),
    );

    return { general, users };
  } catch {
    return {
      general: createDefaultGeneralNotifications(),
      users: {},
    };
  }
};

const writeNotificationsStore = async (store) => {
  await ensurePrivateDataDirectory();
  await writeFile(
    NOTIFICATIONS_JSON_FILE,
    JSON.stringify({
      general: normalizeNotificationBucket(store.general),
      users: Object.fromEntries(
        Object.entries(store.users || {}).map(([email, notifications]) => [
          sanitizeEmail(email),
          normalizeNotificationBucket(notifications),
        ]),
      ),
    }, null, 2),
    'utf8',
  );
};

const getOptionalSession = (request) => {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return null;
    }
    return verifyToken(token);
  } catch {
    return null;
  }
};

const BLUETOOTH_MOCK_DEVICES = [
  {
    id: 'buds-pro',
    name: 'DDO Buds Pro',
    type: 'Audio',
    signal: 'Strong',
  },
  {
    id: 'mx-keyboard',
    name: 'MX Keyboard Mini',
    type: 'Keyboard',
    signal: 'Medium',
  },
  {
    id: 'arc-mouse',
    name: 'Arc Mouse',
    type: 'Mouse',
    signal: 'Medium',
  },
];

const bluetoothState = {
  supported: true,
  enabled: true,
  connectedDeviceId: '',
  devices: BLUETOOTH_MOCK_DEVICES.map((device) => ({ ...device })),
  scannedAt: new Date().toISOString(),
};

const buildBluetoothSnapshot = () => {
  const connectedDevice = bluetoothState.devices.find((device) => device.id === bluetoothState.connectedDeviceId) || null;
  const devices = bluetoothState.enabled
    ? bluetoothState.devices.map((device) => ({
      ...device,
      status: device.id === bluetoothState.connectedDeviceId ? 'connected' : 'available',
    }))
    : [];

  return {
    ok: true,
    supported: bluetoothState.supported,
    enabled: bluetoothState.enabled,
    connectedDevice: connectedDevice
      ? {
        id: connectedDevice.id,
        name: connectedDevice.name,
        type: connectedDevice.type,
        signal: connectedDevice.signal,
      }
      : null,
    devices,
    scannedAt: bluetoothState.scannedAt,
    mode: 'mock',
  };
};

app.get('/api/security/status', (_request, response) => {
  response.json({
    fileUploadProtection: true,
    linkProtection: true,
    loginProtection: true,
    apiKeyProtection: true,
  });
});

app.post('/api/ai/respond', async (request, response, next) => {
  try {
    const result = await respondWithAi(request.body || {});
    response.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/gemini/chat', async (req, res, next) => {
  try {
    const { prompt } = req.body || {};
    const normalizedPrompt = String(prompt || '').trim();
    if (!normalizedPrompt) {
      return res.status(400).json({ error: 'Enter a question first.' });
    }

    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(503).json({
        error: 'Gemini API key is not configured. Add the API key in backend/.env.'
      });
    }

    try {
      const systemInstruction = req.body.systemInstruction || getAiSystemPrompt('gemini');
      const isLiveQuery = isLiveInformationQuery(normalizedPrompt);
      let answer;

      if (isLiveQuery) {
        const searchResults = await searchWeb(normalizedPrompt);
        if (!searchResults || searchResults.length === 0) {
          answer = 'I need live web search to answer this accurately.';
        } else {
          const currentQueryPrompt = `Here is current live search information:\n${JSON.stringify(searchResults)}\n\nAnswer the user query: ${normalizedPrompt}`;
          answer = await requestGeminiAnswer(currentQueryPrompt, apiKey, systemInstruction);
        }
      } else {
        answer = await requestGeminiAnswer(normalizedPrompt, apiKey, systemInstruction);
      }

      res.json({
        ok: true,
        provider: 'gemini',
        answer,
      });
    } catch (apiError) {
      console.error('Gemini API call failed:', apiError);
      res.status(502).json({
        error: 'Gemini is not responding right now. Please try again.'
      });
    }
  } catch (error) {
    next(error);
  }
});

app.post('/api/stepfun/chat', async (req, res, next) => {
  try {
    const { prompt } = req.body || {};
    const normalizedPrompt = String(prompt || '').trim();
    if (!normalizedPrompt) {
      return res.status(400).json({ error: 'Enter a question first.' });
    }

    const apiKey = String(process.env.STEPFUN_API_KEY || process.env.STEP_FUN_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(503).json({
        error: 'StepFun AI API key is not configured. Add the API key in backend/.env.'
      });
    }

    try {
      const systemInstruction = req.body.systemInstruction || getAiSystemPrompt('stepfun');
      const isLiveQuery = isLiveInformationQuery(normalizedPrompt);
      let answer;

      if (isLiveQuery) {
        const searchResults = await searchWeb(normalizedPrompt);
        if (!searchResults || searchResults.length === 0) {
          answer = 'I need live web search to answer this accurately.';
        } else {
          const currentQueryPrompt = `Here is current live search information:\n${JSON.stringify(searchResults)}\n\nAnswer the user query: ${normalizedPrompt}`;
          answer = await requestStepFunAnswer(currentQueryPrompt, apiKey, systemInstruction);
        }
      } else {
        answer = await requestStepFunAnswer(normalizedPrompt, apiKey, systemInstruction);
      }

      res.json({
        ok: true,
        provider: 'stepfun',
        answer,
      });
    } catch (apiError) {
      console.error('StepFun API call failed:', apiError);
      const status = apiError.statusCode || 502;
      let userFriendlyMsg = 'StepFun AI is not responding right now. Please try again.';
      
      if (status === 403) {
        userFriendlyMsg = 'unauthorized';
      } else if (status === 401) {
        userFriendlyMsg = 'invalid key';
      } else if (status === 404) {
        userFriendlyMsg = 'invalid model';
      } else if (status === 408) {
        userFriendlyMsg = 'timeout';
      } else if (apiError.message) {
        userFriendlyMsg = apiError.message;
      }
      
      res.status(status).json({
        error: userFriendlyMsg
      });
    }
  } catch (error) {
    next(error);
  }
});

app.get('/api/stepfun/test', async (req, res) => {
  try {
    const apiKey = String(process.env.STEPFUN_API_KEY || process.env.STEP_FUN_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(503).json({ status: 'error', error: 'StepFun API key loaded: No (Key is missing)' });
    }
    
    const systemInstruction = getAiSystemPrompt('stepfun');
    const answer = await requestStepFunAnswer('test', apiKey, systemInstruction);
    
    res.json({
      status: 'ok',
      message: 'StepFun API responded successfully.',
      answer
    });
  } catch (error) {
    console.error('StepFun test route failed:', error);
    const status = error.statusCode || 502;
    let errorMsg = error.message || 'StepFun AI request failed.';
    
    if (status === 403) {
      errorMsg = 'unauthorized';
    } else if (status === 401) {
      errorMsg = 'invalid key';
    } else if (status === 404) {
      errorMsg = 'invalid model';
    } else if (status === 408) {
      errorMsg = 'timeout';
    }
    
    res.status(status).json({
      status: 'error',
      error: errorMsg
    });
  }
});

app.post('/api/manus/chat', async (req, res, next) => {
  try {
    const { prompt } = req.body || {};
    const normalizedPrompt = String(prompt || '').trim();
    if (!normalizedPrompt) {
      return res.status(400).json({ error: 'Enter a question first.' });
    }

    const apiKey = String(process.env.MANUS_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(503).json({
        error: 'Manus AI API key is not added. Please add MANUS_API_KEY in .env file.'
      });
    }

    try {
      const systemInstruction = req.body.systemInstruction || getAiSystemPrompt('manus');
      const isLiveQuery = isLiveInformationQuery(normalizedPrompt);
      let answer;

      if (isLiveQuery) {
        const searchResults = await searchWeb(normalizedPrompt);
        if (!searchResults || searchResults.length === 0) {
          answer = 'Live web search is not connected yet. Please connect Google Search API / SerpAPI / Tavily to answer latest questions.';
        } else {
          const currentQueryPrompt = `Here is current live search information:\n${JSON.stringify(searchResults)}\n\nAnswer the user query: ${normalizedPrompt}`;
          answer = await requestManusAnswer(currentQueryPrompt, apiKey, systemInstruction);
        }
      } else {
        answer = await requestManusAnswer(normalizedPrompt, apiKey, systemInstruction);
      }

      res.json({
        ok: true,
        provider: 'manus',
        answer,
      });
    } catch (apiError) {
      console.error('Manus API call failed:', apiError);
      res.status(502).json({
        error: 'Manus AI is not responding right now. Please try again.'
      });
    }
  } catch (error) {
    next(error);
  }
});

const getOrGenerateUserId = (req) => {
  const session = getOptionalSession(req);
  if (session?.email) {
    return { userId: session.email, generated: false };
  }
  const deviceId = req.headers['x-device-id'] || req.query.deviceId || req.body?.deviceId;
  if (deviceId && deviceId !== 'null' && deviceId !== 'undefined') {
    return { userId: String(deviceId).trim(), generated: false };
  }
  return { userId: `device_${randomBytes(12).toString('hex')}`, generated: true };
};

app.get('/api/chats', async (req, res, next) => {
  try {
    requireMongoConnection();
    const { userId, generated } = getOrGenerateUserId(req);
    const chats = await ChatTab.find({ userId }).sort({ updatedAt: -1 }).lean();
    res.json({
      ok: true,
      chats,
      userId,
      generated
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/chats', async (req, res, next) => {
  try {
    requireMongoConnection();
    const { userId, generated } = getOrGenerateUserId(req);
    const { title = 'New Chat', provider = 'stepfun', messages = [] } = req.body || {};
    
    const newChat = new ChatTab({
      userId,
      title: sanitizeText(title, 100),
      provider: sanitizeText(provider, 24),
      messages: Array.isArray(messages) ? messages : []
    });
    await newChat.save();
    
    res.status(201).json({
      ok: true,
      chat: newChat,
      userId,
      generated
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/chats/:chatId', async (req, res, next) => {
  try {
    requireMongoConnection();
    const { chatId } = req.params;
    const { userId } = getOrGenerateUserId(req);
    
    const chat = await ChatTab.findOne({ _id: chatId, userId }).lean();
    if (!chat) {
      throw new HttpError(404, 'Chat not found.');
    }
    
    res.json({
      ok: true,
      chat
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/chats/:chatId/messages', async (req, res, next) => {
  try {
    requireMongoConnection();
    const { chatId } = req.params;
    const { messageText } = req.body || {};
    const { userId } = getOrGenerateUserId(req);
    
    if (!messageText || !String(messageText).trim()) {
      throw new HttpError(400, 'Message text is required.');
    }
    
    const chat = await ChatTab.findOne({ _id: chatId, userId });
    if (!chat) {
      throw new HttpError(404, 'Chat not found.');
    }
    
    const userMsg = {
      role: 'user',
      content: String(messageText).trim(),
      provider: chat.provider,
      createdAt: new Date()
    };
    chat.messages.push(userMsg);
    await chat.save();
    
    const aiResult = await respondWithAi({
      provider: chat.provider,
      prompt: String(messageText).trim()
    });
    
    const aiResponseText = aiResult.answer || '';
    
    const aiMsg = {
      role: 'assistant',
      content: aiResponseText,
      provider: chat.provider,
      createdAt: new Date()
    };
    chat.messages.push(aiMsg);
    
    const userMessages = chat.messages.filter(m => m.role === 'user');
    if (userMessages.length === 1 && chat.title === 'New Chat') {
      const firstMsgText = userMessages[0].content;
      chat.title = firstMsgText.slice(0, 20);
    }
    
    await chat.save();
    
    res.json({
      ok: true,
      chat,
      userMessage: userMsg,
      aiMessage: aiMsg
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/chats/:chatId', async (req, res, next) => {
  try {
    requireMongoConnection();
    const { chatId } = req.params;
    const { title, provider, messages } = req.body || {};
    const { userId } = getOrGenerateUserId(req);
    
    const updateFields = {};
    if (title !== undefined) {
      if (!String(title).trim()) {
        throw new HttpError(400, 'Title cannot be empty.');
      }
      updateFields.title = sanitizeText(title.trim(), 100);
    }
    if (provider !== undefined) {
      updateFields.provider = sanitizeText(provider, 24);
    }
    if (messages !== undefined) {
      updateFields.messages = Array.isArray(messages) ? messages : [];
    }
    
    if (Object.keys(updateFields).length === 0) {
      throw new HttpError(400, 'No fields to update.');
    }
    
    const chat = await ChatTab.findOneAndUpdate(
      { _id: chatId, userId },
      { $set: updateFields },
      { new: true }
    );
    
    if (!chat) {
      throw new HttpError(404, 'Chat not found.');
    }
    
    res.json({
      ok: true,
      chat
    });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/chats/:chatId', async (req, res, next) => {
  try {
    requireMongoConnection();
    const { chatId } = req.params;
    const { userId } = getOrGenerateUserId(req);
    
    const chat = await ChatTab.findOneAndDelete({ _id: chatId, userId });
    if (!chat) {
      throw new HttpError(404, 'Chat not found.');
    }
    
    res.json({
      ok: true,
      message: 'Chat tab deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
});

app.get('/', (_request, response) => {
  response.json({
    ok: true,
    message: 'DDO backend is running',
    routes: {
      aiRespond: 'POST /api/ai/respond',
      notifications: '/api/notifications',
      security: '/api/security/status',
      bluetoothStatus: '/api/bluetooth/status',
      bluetoothDevices: '/api/bluetooth/devices',
      wifi: '/api/wifi/status',
      register: 'POST /api/auth/register',
      login: 'POST /api/auth/login',
      companyLogin: 'POST /api/company/login',
      companyDashboard: 'GET /api/company/dashboard',
      companyDetails: 'GET /api/company/details',
      companyEmployees: 'GET /api/company/employees',
      companyDevStatus: 'GET /api/company/dev-status',
      settings: 'POST /api/system/settings',
      controlPanel: 'POST /api/system/control-panel',
      taskManager: 'POST /api/system/task-manager',
      powerOff: 'POST /api/system/power-off',
      sleep: 'POST /api/system/sleep',
    },
  });
});

app.get('/api/notifications', async (request, response, next) => {
  try {
    const session = getOptionalSession(request);
    const store = await readNotificationsStore();

    if (session?.email) {
      const email = sanitizeEmail(session.email);
      const existingUserNotifications = normalizeNotificationBucket(store.users[email]);
      const userNotifications = existingUserNotifications.length
        ? existingUserNotifications
        : createDefaultUserNotifications(email);

      if (!existingUserNotifications.length) {
        store.users[email] = userNotifications;
        await writeNotificationsStore(store);
      }

      response.json({
        ok: true,
        notifications: userNotifications,
      });
      return;
    }

    const generalNotifications = store.general.length
      ? store.general
      : createDefaultGeneralNotifications();

    if (!store.general.length) {
      store.general = generalNotifications;
      await writeNotificationsStore(store);
    }

    response.json({
      ok: true,
      notifications: generalNotifications,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/notifications/mark-read', async (request, response, next) => {
  try {
    const session = getOptionalSession(request);
    const email = session?.email ? sanitizeEmail(session.email) : '';
    const store = await readNotificationsStore();
    const targetBucket = email
      ? normalizeNotificationBucket(store.users[email]).length
        ? [...store.users[email]]
        : createDefaultUserNotifications(email)
      : (store.general.length ? [...store.general] : createDefaultGeneralNotifications());

    const rawIds = Array.isArray(request.body?.ids)
      ? request.body.ids
      : [request.body?.id].filter(Boolean);
    const ids = rawIds.map((value) => sanitizeText(value, 80)).filter(Boolean);

    const nextBucket = targetBucket.map((notification) => (
      !ids.length || ids.includes(notification.id)
        ? { ...notification, read: true }
        : notification
    ));

    if (email) {
      store.users[email] = nextBucket;
    } else {
      store.general = nextBucket;
    }

    await writeNotificationsStore(store);

    response.json({
      ok: true,
      notifications: nextBucket,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/notifications/clear', async (request, response, next) => {
  try {
    const session = getOptionalSession(request);
    const email = session?.email ? sanitizeEmail(session.email) : '';
    const store = await readNotificationsStore();

    if (email) {
      store.users[email] = [];
    } else {
      store.general = [];
    }

    await writeNotificationsStore(store);

    response.json({
      ok: true,
      notifications: [],
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/bluetooth/status', (_request, response) => {
  response.json(buildBluetoothSnapshot());
});

app.get('/api/bluetooth/devices', (_request, response) => {
  bluetoothState.scannedAt = new Date().toISOString();
  response.json(buildBluetoothSnapshot());
});

app.post('/api/bluetooth/toggle', (request, response, next) => {
  try {
    const requestedEnabled = request.body?.enabled;
    bluetoothState.enabled = typeof requestedEnabled === 'boolean'
      ? requestedEnabled
      : !bluetoothState.enabled;

    if (!bluetoothState.enabled) {
      bluetoothState.connectedDeviceId = '';
    }

    bluetoothState.scannedAt = new Date().toISOString();
    response.json(buildBluetoothSnapshot());
  } catch (error) {
    next(error);
  }
});

app.post('/api/bluetooth/connect', (request, response, next) => {
  try {
    if (!bluetoothState.enabled) {
      throw new HttpError(400, 'Bluetooth is turned off.');
    }

    const deviceId = sanitizeText(request.body?.deviceId || '', 80);
    if (!deviceId) {
      throw new HttpError(400, 'Bluetooth device is required.');
    }

    const targetDevice = bluetoothState.devices.find((device) => device.id === deviceId);
    if (!targetDevice) {
      throw new HttpError(404, 'Bluetooth device not found.');
    }

    bluetoothState.connectedDeviceId = targetDevice.id;
    bluetoothState.scannedAt = new Date().toISOString();
    response.json(buildBluetoothSnapshot());
  } catch (error) {
    next(error);
  }
});

app.post('/api/bluetooth/disconnect', (request, response, next) => {
  try {
    const deviceId = sanitizeText(request.body?.deviceId || '', 80);

    if (deviceId && bluetoothState.connectedDeviceId && bluetoothState.connectedDeviceId !== deviceId) {
      throw new HttpError(400, 'That Bluetooth device is not currently connected.');
    }

    bluetoothState.connectedDeviceId = '';
    bluetoothState.scannedAt = new Date().toISOString();
    response.json(buildBluetoothSnapshot());
  } catch (error) {
    next(error);
  }
});

app.get('/api/wifi/status', (_request, response) => {
  response.json({
    interfaceName: 'Wi-Fi',
    online: false,
    connectedSsid: null,
    networks: [],
    scannedAt: new Date().toISOString(),
  });
});

app.post('/api/auth/register', async (request, response, next) => {
  try {
    requireMongoConnection();
    const {
      email,
      firstName,
      middleName = '',
      lastName,
      moreInformation = '',
      phoneNumber = '',
      password,
      confirmPassword,
    } = request.body || {};

    const normalizedEmail = validateEmail(email);
    const normalizedFirstName = validateRequiredName('First Name', firstName);
    const normalizedLastName = validateRequiredName('Last Name', lastName);
    const normalizedPassword = validateStrongPassword(password);

    if (normalizedPassword !== String(confirmPassword || '')) {
      throw new HttpError(400, 'Invalid details: password and confirm password must match.');
    }

    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser) {
      throw new HttpError(409, 'Email already registered.');
    }

    const createdAt = new Date().toISOString();
    const user = await createStoredUser({
      id: randomBytes(12).toString('hex'),
      email: normalizedEmail,
      firstName: normalizedFirstName,
      middleName: sanitizeText(middleName, 80),
      lastName: normalizedLastName,
      phoneNumber: validatePhoneNumber(phoneNumber),
      moreInformation: sanitizeText(moreInformation, 500),
      passwordHash: hashPassword(normalizedPassword),
      provider: 'local',
      createdAt,
      updatedAt: createdAt,
      accountStatus: 'Active',
    });

    await saveUserToExcel(user);

    response.status(201).json({
      ok: true,
      message: 'Registration successful.',
      user: {
        email: sanitizeEmail(user.email),
        firstName: sanitizeText(user.firstName, 80),
        lastName: sanitizeText(user.lastName, 80),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', async (request, response, next) => {
  try {
    requireMongoConnection();
    const { email, password } = request.body || {};
    const normalizedEmail = validateEmail(email);
    const normalizedPassword = String(password || '');

    if (!normalizedPassword) {
      throw new HttpError(400, 'Invalid details: password is required.');
    }

    const userDocument = await User.findOne({
      email: normalizedEmail,
      accountStatus: { $ne: 'Deleted' },
    }).lean();
    const user = mapStoredUser(userDocument);

    if (!user || !verifyPassword(normalizedPassword, user.passwordHash)) {
      throw new HttpError(401, 'Invalid details: email or password is incorrect.');
    }

    response.json({
      token: createToken(user),
      user: toPublicUser(user),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/company/login', async (request, response, next) => {
  try {
    requireMongoConnection();
    console.log('LOGIN BODY:', request.body);

    const companyId = String(request.body?.companyId || '').trim();
    const companyKey = String(request.body?.companyKey || '').trim();
    const companyPassword = String(request.body?.companyPassword || '').trim();

    console.log('[company-login] request received', {
      companyId,
      companyKeyLength: companyKey.length,
      hasPassword: Boolean(companyPassword),
    });

    if (!companyId || !companyKey || !companyPassword) {
      throw new HttpError(400, 'Wrong company ID/key/password');
    }

    console.log('Entered ID:', companyId);
    console.log('Entered Key:', companyKey);

    let company = await Company.findOne({
      companyId: companyId.trim(),
      companyKey: companyKey.trim(),
    }).lean();

    if (!company) {
      company = await Company.findOne({
        $or: [
          { companyId: companyId.trim(), key: companyKey.trim() },
          { companyID: companyId.trim(), companyKey: companyKey.trim() },
          { companyID: companyId.trim(), key: companyKey.trim() },
        ],
      }).lean();
      if (company) {
        console.warn('[company-login] matched legacy company field names in MongoDB');
      }
    }

    if (!company) {
      console.log('[company-login] company not found');
      return response.status(401).json({ message: 'Company ID or Key not found' });
    }

    console.log('Found Company:', {
      companyId: company.companyId || company.companyID || '',
      companyKey: company.companyKey || company.key || '',
      hasPasswordHash: Boolean(company.companyPasswordHash),
      hasLegacyPassword: Boolean(
        company.companyPassword || company.password || company.companyPass || company.CompanyPassword,
      ),
    });

    console.log('[company-login] company found', {
      companyEmail: company.companyEmail,
      approvalStatus: getCompanyApprovalStatus(company),
      isActive: isCompanyActive(company),
      hasPasswordHash: Boolean(company.companyPasswordHash),
    });

    if (!isCompanyApproved(company)) {
      console.log('[company-login] company not approved');
      throw new HttpError(403, 'Company not approved');
    }

    if (!isCompanyActive(company)) {
      console.log('[company-login] company inactive');
      throw new HttpError(403, 'Company not approved');
    }

    const passwordCheck = await verifyCompanyPassword(companyPassword, company);
    console.log('[company-login] password match', passwordCheck.matches);
    console.log('Password Match:', passwordCheck.matches);
    if (!passwordCheck.matches) {
      return response.status(401).json({ message: 'Company password wrong' });
    }

    const loginEntry = {
      time: new Date(),
      action: 'Login',
      source: 'DDO App',
      status: 'Success',
    };

    const update = {
      $push: {
        loginActivity: {
          $each: [loginEntry],
          $position: 0,
          $slice: 8,
        },
      },
    };

    if (passwordCheck.shouldUpgradeHash) {
      update.$set = {
        companyPasswordHash: await bcryptHash(companyPassword, 10),
      };
      update.$unset = {
        companyPassword: '',
      };
    }

    await Company.updateOne({ _id: company._id }, update);

    const companyUser = buildCompanySessionUser(company);
    console.log('[company-login] jwt token created');
    response.json({
      success: true,
      message: 'Company login successful',
      token: createToken(companyUser, { expiresInSeconds: COMPANY_SESSION_TTL_SECONDS }),
      user: companyUser,
      company: toPublicCompany(company),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/cfm/company/edit/verify-password', async (request, response, next) => {
  try {
    requireMongoConnection();
    const session = requireCompanyAuth(request);
    const companyLookup = getCompanyLookupFromSession(session);
    const company = await Company.findOne(companyLookup).lean();

    if (!company) {
      throw new HttpError(404, 'Company account not found.');
    }

    if (!isCompanyApproved(company) || !isCompanyActive(company)) {
      throw new HttpError(403, 'Company not approved');
    }

    const password = String(request.body?.password || '');
    if (!password) {
      throw new HttpError(400, 'Password is required.');
    }

    const passwordCheck = await verifyCompanyPassword(password, company);
    if (!passwordCheck.matches) {
      throw new HttpError(401, 'Incorrect company password.');
    }

    response.json({
      ok: true,
      message: 'Password verified successfully.',
      editAccessToken: getCompanyEditAccessToken(company),
      redirectPath: '/cfm/company-details-edit',
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/cfm/company/edit/current', async (request, response, next) => {
  try {
    requireMongoConnection();
    const session = requireCompanyAuth(request);
    requireCompanyEditAccess(request, session);
    const companyLookup = getCompanyLookupFromSession(session);
    const company = await Company.findOne(companyLookup).lean();

    if (!company) {
      throw new HttpError(404, 'Company account not found.');
    }

    if (!isCompanyApproved(company) || !isCompanyActive(company)) {
      throw new HttpError(403, 'Company not approved');
    }

    response.json({
      ok: true,
      company: serializeCompanyEditDetails(company),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/cfm/company/edit/request', async (request, response, next) => {
  try {
    requireMongoConnection();
    const session = requireCompanyAuth(request);
    requireCompanyEditAccess(request, session);
    const companyLookup = getCompanyLookupFromSession(session);
    const company = await Company.findOne(companyLookup).lean();

    if (!company) {
      throw new HttpError(404, 'Company account not found.');
    }

    if (!isCompanyApproved(company) || !isCompanyActive(company)) {
      throw new HttpError(403, 'Company not approved');
    }

    const beforeDetails = serializeCompanyEditDetails(company);
    const afterDetails = normalizeCompanyEditRequestBody(request.body);

    if (JSON.stringify(beforeDetails) === JSON.stringify(afterDetails)) {
      throw new HttpError(400, 'Please change at least one field before submitting an edit request.');
    }

    const decisionToken = randomBytes(32).toString('hex');
    const decisionTokenHash = hashDecisionToken(decisionToken);
    const approveUrl = buildDecisionUrl(`/api/cfm/company/edit/approve/${decisionToken}`);
    const rejectUrl = buildDecisionUrl(`/api/cfm/company/edit/reject/${decisionToken}`);

    const editRequest = await CompanyEditRequest.create({
      companyObjectId: company._id,
      companyId: sanitizeText(company.companyId || '', 120),
      companyEmail: sanitizeEmail(company.companyEmail),
      adminEmail: DDO_ADMIN_EMAIL,
      status: 'pending',
      decisionTokenHash,
      beforeDetails,
      afterDetails,
      requestedAt: new Date(),
    });

    await Company.updateOne(
      { _id: company._id },
      {
        $push: {
          submittedForms: {
            title: 'Company Details Edit Request',
            status: 'Pending Approval',
            submittedAt: new Date(),
          },
        },
      },
    );

    let emailState = {
      delivered: false,
      previewOnly: true,
    };

    const emailPayload = buildCompanyEditApprovalEmail({
      companyName: beforeDetails.companyName,
      beforeDetails,
      afterDetails,
      approveUrl,
      rejectUrl,
    });

    try {
      emailState = await sendTransactionalEmail({
        to: DDO_ADMIN_EMAIL,
        ...emailPayload,
      });
    } catch (error) {
      console.error('[company-edit-request] email delivery failed:', error instanceof Error ? error.message : String(error));
    }

    response.status(201).json({
      ok: true,
      message: emailState.delivered
        ? 'Edit request submitted for admin approval.'
        : 'Edit request created. Email delivery is not configured, so approval links were logged on the server.',
      requestId: String(editRequest._id),
      approvalPreview: emailState.delivered
        ? null
        : {
          approveUrl,
          rejectUrl,
        },
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/cfm/company/edit/approve/:token', async (request, response, next) => {
  try {
    requireMongoConnection();
    const tokenHash = hashDecisionToken(request.params.token || '');
    const editRequest = await CompanyEditRequest.findOne({ decisionTokenHash: tokenHash });

    if (!editRequest) {
      response.status(404).send(renderDecisionPage({
        title: 'Approval link invalid',
        message: 'This company edit approval link is invalid or no longer exists.',
        accent: '#ef4444',
      }));
      return;
    }

    if (editRequest.status !== 'pending') {
      response.status(200).send(renderDecisionPage({
        title: 'Request already processed',
        message: `This company edit request was already ${editRequest.status}.`,
        accent: editRequest.status === 'approved' ? '#22c55e' : '#f97316',
      }));
      return;
    }

    if (Date.now() - new Date(editRequest.requestedAt).getTime() > COMPANY_EDIT_REQUEST_TTL_MS) {
      editRequest.status = 'expired';
      editRequest.decidedAt = new Date();
      await editRequest.save();
      response.status(410).send(renderDecisionPage({
        title: 'Approval link expired',
        message: 'This company edit approval link has expired. Please ask the company to submit a new request.',
        accent: '#f97316',
      }));
      return;
    }

    const company = await Company.findById(editRequest.companyObjectId);
    if (!company) {
      throw new HttpError(404, 'Company account not found.');
    }

    Object.assign(company, editRequest.afterDetails.toObject ? editRequest.afterDetails.toObject() : editRequest.afterDetails);
    await company.save();

    editRequest.status = 'approved';
    editRequest.decidedAt = new Date();
    editRequest.decisionBy = DDO_ADMIN_EMAIL;
    await editRequest.save();

    try {
      await sendTransactionalEmail({
        to: editRequest.companyEmail,
        ...buildCompanyDecisionEmail({
          companyName: editRequest.afterDetails.companyName,
          approved: true,
        }),
      });
    } catch (error) {
      console.error('[company-edit-approve] company email failed:', error instanceof Error ? error.message : String(error));
    }

    response.status(200).send(renderDecisionPage({
      title: 'Company edit approved',
      message: 'The requested company detail changes were approved and MongoDB has been updated successfully.',
      accent: '#22c55e',
    }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/cfm/company/edit/reject/:token', async (request, response, next) => {
  try {
    requireMongoConnection();
    const tokenHash = hashDecisionToken(request.params.token || '');
    const editRequest = await CompanyEditRequest.findOne({ decisionTokenHash: tokenHash });

    if (!editRequest) {
      response.status(404).send(renderDecisionPage({
        title: 'Reject link invalid',
        message: 'This company edit rejection link is invalid or no longer exists.',
        accent: '#ef4444',
      }));
      return;
    }

    if (editRequest.status !== 'pending') {
      response.status(200).send(renderDecisionPage({
        title: 'Request already processed',
        message: `This company edit request was already ${editRequest.status}.`,
        accent: editRequest.status === 'approved' ? '#22c55e' : '#f97316',
      }));
      return;
    }

    editRequest.status = 'rejected';
    editRequest.decidedAt = new Date();
    editRequest.decisionBy = DDO_ADMIN_EMAIL;
    await editRequest.save();

    try {
      await sendTransactionalEmail({
        to: editRequest.companyEmail,
        ...buildCompanyDecisionEmail({
          companyName: editRequest.afterDetails.companyName,
          approved: false,
        }),
      });
    } catch (error) {
      console.error('[company-edit-reject] company email failed:', error instanceof Error ? error.message : String(error));
    }

    response.status(200).send(renderDecisionPage({
      title: 'Company edit rejected',
      message: 'The request was rejected. No company data was changed in MongoDB.',
      accent: '#f97316',
    }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/company/dashboard', async (request, response, next) => {
  try {
    requireMongoConnection();
    const session = requireCompanyAuth(request);
    const companyLookup = getCompanyLookupFromSession(session);
    const company = await Company.findOne(companyLookup).lean();

    if (!company) {
      console.log('[company-dashboard] access denied - company not found', companyLookup);
      throw new HttpError(404, 'Company account not found.');
    }

    if (!isCompanyApproved(company) || !isCompanyActive(company)) {
      console.log('[company-dashboard] access denied - approval inactive', {
        approvalStatus: getCompanyApprovalStatus(company),
        isActive: isCompanyActive(company),
      });
      throw new HttpError(403, 'Company not approved');
    }

    console.log('[company-dashboard] access allowed', { companyId: company.companyId });

    response.json({
      ok: true,
      ...(await buildCompanyDashboardPayload(company)),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/company/details', async (request, response, next) => {
  try {
    requireMongoConnection();
    const session = requireCompanyAuth(request);
    const companyLookup = getCompanyLookupFromSession(session);
    const company = await Company.findOne(companyLookup).lean();

    if (!company) {
      throw new HttpError(404, 'Company account not found.');
    }

    if (!isCompanyApproved(company) || !isCompanyActive(company)) {
      throw new HttpError(403, 'Company not approved');
    }

    const payload = await buildCompanyDashboardPayload(company);
    response.json({
      ok: true,
      company: payload.details,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/company/employees', async (request, response, next) => {
  try {
    requireMongoConnection();
    const session = requireCompanyAuth(request);
    const companyLookup = getCompanyLookupFromSession(session);
    const company = await Company.findOne(companyLookup).lean();

    if (!company) {
      throw new HttpError(404, 'Company account not found.');
    }

    if (!isCompanyApproved(company) || !isCompanyActive(company)) {
      throw new HttpError(403, 'Company not approved');
    }

    response.json({
      ok: true,
      employees: formatCompanyEmployees(company.employees),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/company/dev-status', async (request, response, next) => {
  try {
    requireCompanyAuth(request);
    response.json({
      ok: true,
      developerMode: await buildCompanyDeveloperStatus(),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/session', async (request, response, next) => {
  try {
    requireMongoConnection();
    const session = requireAuth(request);

    if (session?.role === 'company' || session?.provider === 'company') {
      const companyLookup = getCompanyLookupFromSession(session);
      const company = await Company.findOne(companyLookup).lean();
      if (!company) {
        console.log('[company-session] access denied - company not found', companyLookup);
        throw new HttpError(404, 'Company account not found.');
      }
      if (!isCompanyApproved(company) || !isCompanyActive(company)) {
        console.log('[company-session] access denied - approval inactive', {
          approvalStatus: getCompanyApprovalStatus(company),
          isActive: isCompanyActive(company),
        });
        throw new HttpError(403, 'Company not approved');
      }
      console.log('[company-session] dashboard access allowed', { companyId: company.companyId });
      const companyUser = buildCompanySessionUser(company);
      response.json({
        ok: true,
        user: companyUser,
        company: toPublicCompany(company),
      });
      return;
    }

    const user = await findUserByEmail(session.email);

    if (!user) {
      throw new HttpError(404, 'Account not found.');
    }

    response.json({
      ok: true,
      user: toPublicUser(user),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', (_request, response) => {
  response.json({ ok: true });
});

app.post('/api/auth/delete-account', async (request, response, next) => {
  try {
    requireMongoConnection();
    const session = requireAuth(request);
    const email = validateEmail(request.body?.email || '');
    const password = String(request.body?.password || '');

    if (!password) {
      throw new HttpError(400, 'Password is required.');
    }

    if (sanitizeEmail(session.email) !== email) {
      throw new HttpError(403, 'Authenticated user does not match the requested account.');
    }

    const user = await findUserByEmail(session.email);

    if (!user) {
      throw new HttpError(404, 'Account not found.');
    }

    if (!verifyPassword(password, user.passwordHash)) {
      throw new HttpError(401, 'Incorrect password. Account not deleted.');
    }

    const deletedUser = await deleteStoredUserByEmail(session.email);
    if (!deletedUser) {
      throw new HttpError(404, 'Account not found.');
    }

    await writeActiveUsersToExcel(await getAllUsers());
    await saveDeletedUserToExcel(deletedUser);

    response.json({
      ok: true,
      message: 'Account deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/system/settings', async (request, response, next) => {
  try {
    requireAuth(request);
    await openWindowsSettings();
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/system/control-panel', async (request, response, next) => {
  try {
    requireAuth(request);
    await openControlPanel();
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/system/task-manager', async (request, response, next) => {
  try {
    requireAuth(request);
    await openTaskManager();
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/system/power-off', async (request, response, next) => {
  try {
    requireAuth(request);
    await powerOffComputer();
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/system/sleep', async (request, response, next) => {
  try {
    requireAuth(request);
    await sleepComputer();
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  if (error?.message === 'Origin not allowed by CORS.') {
    response.status(403).json({ error: 'CORS blocked this request.' });
    return;
  }

  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : 'Backend request failed.';
  response.status(statusCode).json({ error: message });
});

const connectMongoDB = async () => {
  if (!MONGODB_URI) {
    console.warn('MongoDB URI not configured. Using local file storage fallback.');
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection failed:', error instanceof Error ? error.message : String(error));
    console.warn('Backend will continue in degraded mode without MongoDB.');
  }
};

const checkStepFunApiKeyOnStartup = () => {
  const apiKey = String(process.env.STEPFUN_API_KEY || process.env.STEP_FUN_API_KEY || '').trim();
  if (apiKey) {
    console.log('StepFun API key loaded: Yes');
  } else {
    console.log('StepFun API key loaded: No');
  }
};

const startServer = async () => {
  const server = app.listen(PORT, HOST, () => {
    console.log(`DDO backend listening at http://${HOST}:${PORT}`);
  });
  server.on('error', (error) => {
    console.error('DDO backend failed to start:', error instanceof Error ? error.message : String(error));
  });
  void connectMongoDB();
  checkStepFunApiKeyOnStartup();
};

await startServer();
