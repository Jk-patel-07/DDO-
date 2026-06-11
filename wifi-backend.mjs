import http from 'node:http';
import { execFile } from 'node:child_process';
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { readdir, readFile, stat, writeFile, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import XLSX from 'xlsx';

const execFileAsync = promisify(execFile);
const HOST = '127.0.0.1';
const PORT = 5000;
const PROJECT_ROOT = process.cwd();
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_JSON_BODY_BYTES = Number(process.env.MAX_JSON_BODY_BYTES || 16 * 1024);
const DEFAULT_ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://127.0.0.1:4174',
  'http://localhost:4174',
  'http://127.0.0.1:4175',
  'http://localhost:4175',
]);
const AUTH_STORAGE = {
  email: '',
  passwordHash: '',
  secret: '',
};
const REGISTERED_USERS_FILE = path.join(PROJECT_ROOT, '.ddo-users.json');
const USERS_EXCEL_FILE = path.join(PROJECT_ROOT, 'users.xlsx');
const USERS_EXCEL_SHEET_NAME = 'Users';
const USERS_EXCEL_HEADERS = [
  'Email ID',
  'First Name',
  'Middle Name',
  'Last Name',
  'Phone Number',
  'More Information',
  'Register Date',
  'Account Status',
];
const GLOBAL_RATE_LIMIT_WINDOW_MS = 60_000;
const GLOBAL_RATE_LIMIT_MAX = 180;
const LOGIN_RATE_LIMIT_WINDOW_MS = 5 * 60_000;
const LOGIN_RATE_LIMIT_MAX = 10;
const rateLimitStore = new Map();

class HttpError extends Error {
  constructor(statusCode, message, publicMessage = message) {
    super(message);
    this.statusCode = statusCode;
    this.publicMessage = publicMessage;
  }
}

const parseEnvFile = (raw) => {
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
};

let cachedProjectEnv;
const readProjectEnv = async () => {
  if (cachedProjectEnv) {
    return cachedProjectEnv;
  }

  try {
    const raw = await readFile(path.join(PROJECT_ROOT, '.env'), 'utf8');
    cachedProjectEnv = parseEnvFile(raw);
  } catch {
    cachedProjectEnv = {};
  }

  return cachedProjectEnv;
};

const toBase64Url = (input) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const fromBase64Url = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64');
};

const hashPassword = (password, salt = randomBytes(16).toString('hex')) => {
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt}$${derived.toString('hex')}`;
};

const verifyPassword = (password, storedHash) => {
  if (!storedHash || !storedHash.startsWith('scrypt$')) {
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

const sanitizeEmail = (value) => String(value || '').trim().toLowerCase();
const sanitizeDisplayText = (value, max = 140) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
const sanitizeOptionalText = (value, max = 240) => sanitizeDisplayText(value, max);

const validateEmail = (value) => {
  const email = sanitizeEmail(value);
  if (!email) {
    throw new HttpError(400, 'Email is required.');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Enter a valid email address.');
  }

  return email;
};

const validatePasswordInput = (value) => {
  const password = String(value || '');
  if (!password) {
    throw new HttpError(400, 'Password is required.');
  }

  if (password.length < 8) {
    throw new HttpError(400, 'Password must be at least 8 characters.');
  }

  return password;
};

const validateStrongPassword = (value) => {
  const password = validatePasswordInput(value);
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new HttpError(400, 'Password must include uppercase, lowercase, number, and special character.');
  }

  return password;
};

const validateRequiredName = (label, value) => {
  const normalized = sanitizeDisplayText(value, 80);
  if (!normalized) {
    throw new HttpError(400, `${label} is required.`);
  }

  if (!/^[A-Za-z][A-Za-z\s'.-]*$/.test(normalized)) {
    throw new HttpError(400, `${label} must contain only letters and simple punctuation.`);
  }

  return normalized;
};

const validateOptionalName = (value) => {
  const normalized = sanitizeDisplayText(value, 80);
  if (!normalized) {
    return '';
  }

  if (!/^[A-Za-z][A-Za-z\s'.-]*$/.test(normalized)) {
    throw new HttpError(400, 'Middle Name must contain only letters and simple punctuation.');
  }

  return normalized;
};

const validatePhoneNumber = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }

  if (!/^\+?[0-9()\-\s]{7,20}$/.test(normalized)) {
    throw new HttpError(400, 'Enter a valid phone number.');
  }

  return normalized;
};

const validateRobotCheck = (value) => {
  if (value !== true) {
    throw new HttpError(400, 'Please verify that you are not a robot.');
  }

  return true;
};

const validatePrompt = (value) => {
  const prompt = sanitizeDisplayText(value, 1000);
  if (!prompt) {
    throw new HttpError(400, 'Prompt is required.');
  }

  return prompt;
};

const validateNetworkName = (value) => {
  const name = sanitizeDisplayText(value, 128);
  if (!name) {
    throw new HttpError(400, 'Network name is required.');
  }
  return name;
};


const getAllowedOrigins = async () => {
  const env = await readProjectEnv();
  const configured = (process.env.CORS_ORIGINS || env.CORS_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return configured.length ? new Set(configured) : DEFAULT_ALLOWED_ORIGINS;
};

const isAllowedLoopbackOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
};

const buildSecurityHeaders = async (origin = '') => {
  const allowedOrigins = await getAllowedOrigins();
  const allowOrigin = !origin || allowedOrigins.has(origin) || isAllowedLoopbackOrigin(origin) ? origin : '';

  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowOrigin || Array.from(allowedOrigins)[0],
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Resource-Policy': 'same-site',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cache-Control': 'no-store',
  };
};

const readRegisteredUsers = async () => {
  try {
    const raw = await readFile(REGISTERED_USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeRegisteredUsers = async (users) => {
  await writeFile(REGISTERED_USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
};

const readExcelRows = async () => {
  try {
    const workbookBuffer = await readFile(USERS_EXCEL_FILE);
    const workbook = XLSX.read(workbookBuffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[USERS_EXCEL_SHEET_NAME] || workbook.Sheets[workbook.SheetNames[0]];

    if (!worksheet) {
      return [];
    }

    return XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
};

const toExcelUserRow = (userData) => ({
  'Email ID': sanitizeEmail(userData.email),
  'First Name': sanitizeOptionalText(userData.firstName, 80),
  'Middle Name': sanitizeOptionalText(userData.middleName, 80),
  'Last Name': sanitizeOptionalText(userData.lastName, 80),
  'Phone Number': sanitizeOptionalText(userData.phoneNumber, 40),
  'More Information': sanitizeOptionalText(userData.moreInformation, 500),
  'Register Date': userData.createdAt || new Date().toISOString(),
  'Account Status': sanitizeOptionalText(userData.accountStatus, 40) || 'Active',
});

const saveUserToExcel = async (userData) => {
  const normalizedEmail = sanitizeEmail(userData.email);
  const existingRows = await readExcelRows();

  if (existingRows.some((row) => sanitizeEmail(row['Email ID']) === normalizedEmail)) {
    throw new HttpError(409, 'Email already registered.');
  }

  const workbook = XLSX.utils.book_new();
  const nextRows = [...existingRows, toExcelUserRow(userData)];
  const worksheet = XLSX.utils.json_to_sheet(nextRows, {
    header: USERS_EXCEL_HEADERS,
  });

  XLSX.utils.book_append_sheet(workbook, worksheet, USERS_EXCEL_SHEET_NAME);

  const workbookBuffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  });

  await writeFile(USERS_EXCEL_FILE, workbookBuffer);
};

const getUserDisplayName = (user) => {
  if (user.displayName) {
    return sanitizeDisplayText(user.displayName, 80);
  }

  return [user.firstName, user.middleName, user.lastName]
    .map((part) => sanitizeOptionalText(part, 80))
    .filter(Boolean)
    .join(' ')
    .trim() || sanitizeDisplayText(String(user.email || '').split('@')[0], 80) || 'User';
};

const toPublicUser = (user) => ({
  email: sanitizeEmail(user.email),
  displayName: getUserDisplayName(user),
  firstName: sanitizeOptionalText(user.firstName, 80),
  middleName: sanitizeOptionalText(user.middleName, 80),
  lastName: sanitizeOptionalText(user.lastName, 80),
  phoneNumber: sanitizeOptionalText(user.phoneNumber, 40),
  moreInformation: sanitizeOptionalText(user.moreInformation, 240),
  provider: user.provider || 'local',
  picture: sanitizeOptionalText(user.picture, 400),
});

const findRegisteredUserByEmail = async (email) => {
  const users = await readRegisteredUsers();
  return users.find((entry) => sanitizeEmail(entry.email) === sanitizeEmail(email)) || null;
};

const buildSecurityStatus = async () => {
  const env = await readProjectEnv();
  const allowedOrigins = await getAllowedOrigins();
  const apiKeyProtected = Boolean(
    process.env.GEMINI_API_KEY
    || env.GEMINI_API_KEY
    || process.env.SPOTIFY_CLIENT_SECRET
    || env.SPOTIFY_CLIENT_SECRET
    || process.env.APP_AUTH_SECRET
    || env.APP_AUTH_SECRET
  );

  return {
    fileUploadProtection: Number.isFinite(MAX_JSON_BODY_BYTES) && MAX_JSON_BODY_BYTES > 0,
    linkProtection: allowedOrigins.size > 0,
    loginProtection: Boolean(AUTH_STORAGE.email && AUTH_STORAGE.passwordHash && AUTH_STORAGE.secret),
    apiKeyProtection: apiKeyProtected,
  };
};

const sendJson = async (response, statusCode, payload, origin = '') => {
  response.writeHead(statusCode, {
    ...(await buildSecurityHeaders(origin)),
  });
  response.end(JSON.stringify(payload));
};

const readBody = (request, maxBytes = MAX_JSON_BODY_BYTES) =>
  new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new HttpError(413, 'Request body is too large.'));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new HttpError(400, 'Invalid JSON body.'));
      }
    });
    request.on('error', reject);
  });

const createJwt = ({ sub, email, displayName, expSeconds = 12 * 60 * 60 }) => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub,
    email,
    displayName,
    iat: now,
    exp: now + expSeconds,
  };
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', AUTH_STORAGE.secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  return `${encodedHeader}.${encodedPayload}.${toBase64Url(signature)}`;
};

const verifyJwt = (token) => {
  if (!token) {
    throw new HttpError(401, 'Authentication required.');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new HttpError(401, 'Invalid authentication token.');
  }

  const expectedSignature = createHmac('sha256', AUTH_STORAGE.secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const actualSignature = fromBase64Url(encodedSignature);

  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
    throw new HttpError(401, 'Invalid authentication token.');
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload).toString('utf8'));
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new HttpError(401, 'Session expired. Please log in again.');
  }

  return payload;
};

const getRequestIp = (request) =>
  request.socket.remoteAddress
  || request.headers['x-forwarded-for']
  || 'local';

const enforceRateLimit = (request, key, maxRequests, windowMs) => {
  const ip = getRequestIp(request);
  const compositeKey = `${ip}:${key}`;
  const now = Date.now();
  const entry = rateLimitStore.get(compositeKey);

  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(compositeKey, {
      count: 1,
      resetAt: now + windowMs,
    });
    return;
  }

  if (entry.count >= maxRequests) {
    throw new HttpError(429, 'Too many requests. Please wait and try again.');
  }

  entry.count += 1;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runNetsh = async (args) => {
  const { stdout } = await execFileAsync('netsh', args, {
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });

  return stdout;
};


const escapeXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const mapAuthType = (value) => {
  const normalized = (value || '').trim().toLowerCase();

  if (normalized.includes('wpa3-personal')) return 'WPA3SAE';
  if (normalized.includes('wpa2-personal')) return 'WPA2PSK';
  if (normalized.includes('wpa-personal')) return 'WPAPSK';
  if (normalized.includes('open')) return 'open';

  throw new Error(`Unsupported Wi-Fi authentication type: ${value || 'unknown'}`);
};

const mapCipherType = (value) => {
  const normalized = (value || '').trim().toLowerCase();

  if (normalized.includes('ccmp') || normalized.includes('gcmp')) return 'AES';
  if (normalized.includes('tkip')) return 'TKIP';
  if (normalized.includes('none')) return 'none';

  return 'AES';
};

const createWifiProfileXml = ({ name, password, authType, cipherType }) => {
  const auth = mapAuthType(authType);
  const encryption = mapCipherType(cipherType);
  const escapedName = escapeXml(name);

  if (auth === 'open') {
    return `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>${escapedName}</name>
  <SSIDConfig>
    <SSID>
      <name>${escapedName}</name>
    </SSID>
  </SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>manual</connectionMode>
  <MSM>
    <security>
      <authEncryption>
        <authentication>open</authentication>
        <encryption>none</encryption>
        <useOneX>false</useOneX>
      </authEncryption>
    </security>
  </MSM>
</WLANProfile>`;
  }

  if (!password) {
    throw new Error('Password is required for secured Wi-Fi networks.');
  }

  return `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>${escapedName}</name>
  <SSIDConfig>
    <SSID>
      <name>${escapedName}</name>
    </SSID>
  </SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>manual</connectionMode>
  <MSM>
    <security>
      <authEncryption>
        <authentication>${auth}</authentication>
        <encryption>${encryption}</encryption>
        <useOneX>false</useOneX>
      </authEncryption>
      <sharedKey>
        <keyType>passPhrase</keyType>
        <protected>false</protected>
        <keyMaterial>${escapeXml(password)}</keyMaterial>
      </sharedKey>
    </security>
  </MSM>
</WLANProfile>`;
};

const parseSignalBars = (percent) => {
  if (percent >= 75) return 4;
  if (percent >= 50) return 3;
  if (percent >= 25) return 2;
  return 1;
};

const parseInterfaceInfo = (output) => {
  const info = {
    interfaceName: 'Wi-Fi',
    online: false,
    connectedSsid: null,
    signalPercent: 0,
  };

  const getValue = (label) => {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = output.match(new RegExp(`^\\s*${escapedLabel}\\s*:\\s*(.+)$`, 'im'));
    return match ? match[1].trim() : '';
  };

  const interfaceName = getValue('Name');
  const state = getValue('State').toLowerCase();
  const ssid = getValue('SSID');
  const signalMatch = output.match(/^\s*Signal\s*:\s*(\d+)%$/im);

  if (interfaceName) {
    info.interfaceName = interfaceName;
  }

  info.online = state === 'connected';
  info.connectedSsid = info.online && ssid ? ssid : null;
  info.signalPercent = signalMatch ? Number(signalMatch[1]) : 0;

  return info;
};

const parseVisibleNetworks = (output) => {
  const lines = output.split(/\r?\n/);
  const networks = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) {
      return;
    }

    networks.push({
      id: current.name,
      name: current.name,
      strength: parseSignalBars(current.signalPercent || 1),
      signalPercent: current.signalPercent || 1,
      secure: current.secure,
      authType: current.authType || (current.secure ? 'WPA2-Personal' : 'Open'),
      cipherType: current.cipherType || (current.secure ? 'CCMP' : 'None'),
      status: 'available',
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const ssidMatch = line.match(/^SSID\s+\d+\s*:\s*(.*)$/i);
    if (ssidMatch) {
      pushCurrent();
      const name = ssidMatch[1].trim() || 'Hidden network';
      current = {
        name,
        signalPercent: 0,
        secure: true,
      };
      continue;
    }

    if (!current) {
      continue;
    }

    const authMatch = line.match(/^Authentication\s*:\s*(.+)$/i);
    if (authMatch) {
      current.authType = authMatch[1].trim();
      current.secure = !/open/i.test(authMatch[1]);
      continue;
    }

    const cipherMatch = line.match(/^Cipher\s*:\s*(.+)$/i);
    if (cipherMatch) {
      current.cipherType = cipherMatch[1].trim();
      continue;
    }

    const signalMatch = line.match(/^Signal\s*:\s*(\d+)%$/i);
    if (signalMatch) {
      current.signalPercent = Math.max(current.signalPercent, Number(signalMatch[1]));
    }
  }

  pushCurrent();

  const deduped = new Map();
  for (const network of networks) {
    const existing = deduped.get(network.name);
    if (!existing || existing.signalPercent < network.signalPercent) {
      deduped.set(network.name, network);
    }
  }

  return Array.from(deduped.values()).sort((left, right) => right.signalPercent - left.signalPercent);
};

const buildWifiSnapshot = async () => {
  const [interfacesOutput, networksOutput] = await Promise.all([
    runNetsh(['wlan', 'show', 'interfaces']),
    runNetsh(['wlan', 'show', 'networks', 'mode=bssid']),
  ]);

  const interfaceInfo = parseInterfaceInfo(interfacesOutput);
  const networks = parseVisibleNetworks(networksOutput);

  if (interfaceInfo.connectedSsid) {
    const connectedIndex = networks.findIndex((network) => network.name === interfaceInfo.connectedSsid);
    const connectedNetwork = {
      id: interfaceInfo.connectedSsid,
      name: interfaceInfo.connectedSsid,
      strength: parseSignalBars(interfaceInfo.signalPercent || 1),
      signalPercent: interfaceInfo.signalPercent || 1,
      secure: true,
      authType: 'WPA2-Personal',
      cipherType: 'CCMP',
      status: 'connected',
    };

    if (connectedIndex >= 0) {
      networks[connectedIndex] = {
        ...networks[connectedIndex],
        ...connectedNetwork,
      };
    } else {
      networks.unshift(connectedNetwork);
    }

    for (const network of networks) {
      if (network.name !== interfaceInfo.connectedSsid) {
        network.status = 'available';
      }
    }
  }

  return {
    interfaceName: interfaceInfo.interfaceName,
    online: interfaceInfo.online,
    connectedSsid: interfaceInfo.connectedSsid,
    networks,
    scannedAt: new Date().toISOString(),
  };
};

const connectToNetwork = async ({ name, interfaceName, password, secure, authType, cipherType }) => {
  const networkName = validateNetworkName(name);
  const safeInterfaceName = sanitizeDisplayText(interfaceName, 64);
  const safePassword = String(password || '');

  if (secure) {
    const profileXml = createWifiProfileXml({ name: networkName, password: safePassword, authType, cipherType });
    const profilePath = path.join(os.tmpdir(), `wifi-profile-${Date.now()}.xml`);

    try {
      await writeFile(profilePath, profileXml, 'utf8');
      await runNetsh(['wlan', 'add', 'profile', `filename=${profilePath}`, 'user=current']);
    } finally {
      await unlink(profilePath).catch(() => {});
    }
  }

  const args = ['wlan', 'connect', `name=${networkName}`, `ssid=${networkName}`];
  if (safeInterfaceName) {
    args.push(`interface=${safeInterfaceName}`);
  }

  await runNetsh(args);
  await sleep(1800);
  return buildWifiSnapshot();
};

const disconnectFromNetwork = async ({ interfaceName }) => {
  const safeInterfaceName = sanitizeDisplayText(interfaceName, 64);
  const args = ['wlan', 'disconnect'];
  if (safeInterfaceName) {
    args.push(`interface=${safeInterfaceName}`);
  }

  await runNetsh(args);
  await sleep(900);
  return buildWifiSnapshot();
};

const openWindowsSettings = async () => {
  await execFileAsync('cmd', ['/c', 'start', '', 'ms-settings:'], {
    windowsHide: true,
  });
  return { ok: true };
};

const openControlPanel = async () => {
  await execFileAsync('cmd', ['/c', 'start', '', 'control'], {
    windowsHide: true,
  });
  return { ok: true };
};

const openTaskManager = async () => {
  await execFileAsync('cmd', ['/c', 'start', '', 'taskmgr'], {
    windowsHide: true,
  });
  return { ok: true };
};

const powerOffComputer = async () => {
  await execFileAsync('shutdown', ['/s', '/t', '0'], {
    windowsHide: true,
  });
  return { ok: true };
};

const sleepComputer = async () => {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)
`;

  await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    windowsHide: true,
  });
  return { ok: true };
};


const extractGeminiText = (payload) => {
  const firstCandidate = Array.isArray(payload?.candidates) ? payload.candidates[0] : null;
  const parts = Array.isArray(firstCandidate?.content?.parts) ? firstCandidate.content.parts : [];
  return parts.map((part) => part?.text || '').join('\n').trim();
};

const requestGeminiAnswer = async (prompt, apiKey) => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Gemini request failed.');
  }

  const answer = extractGeminiText(payload);
  if (!answer) {
    throw new Error('Gemini returned an empty answer.');
  }

  return answer;
};

const getAiProviderKeys = async () => {
  const env = await readProjectEnv();
  return {
    gemini: process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || '',
  };
};

const initializeAuthStorage = async () => {
  const env = await readProjectEnv();
  const configuredEmail = sanitizeEmail(process.env.AUTH_EMAIL || env.AUTH_EMAIL || 'admin@ddo.local');
  const configuredSecret = process.env.APP_AUTH_SECRET || env.APP_AUTH_SECRET || randomBytes(32).toString('hex');
  const configuredHash = process.env.AUTH_PASSWORD_HASH || env.AUTH_PASSWORD_HASH || '';
  const configuredPlainPassword = process.env.AUTH_PASSWORD || env.AUTH_PASSWORD || '';
  const fallbackPassword = randomBytes(18).toString('base64url');

  AUTH_STORAGE.email = configuredEmail;
  AUTH_STORAGE.secret = configuredSecret;
  AUTH_STORAGE.passwordHash = configuredHash || (configuredPlainPassword ? hashPassword(configuredPlainPassword) : hashPassword(fallbackPassword));

  if (!configuredHash && !configuredPlainPassword) {
    console.warn('AUTH_PASSWORD_HASH/AUTH_PASSWORD not set. Generated a one-time local auth password. Configure auth in .env for predictable login.');
  }
};

const getBearerToken = (request) => {
  const authorization = String(request.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) {
    return '';
  }
  return authorization.slice(7).trim();
};

const requireAuth = (request) => verifyJwt(getBearerToken(request));

const createSessionForUser = (user, rememberMe = false) => {
  const publicUser = toPublicUser(user);
  const token = createJwt({
    sub: publicUser.email,
    email: publicUser.email,
    displayName: publicUser.displayName,
    expSeconds: rememberMe ? 7 * 24 * 60 * 60 : 12 * 60 * 60,
  });

  return {
    token,
    user: publicUser,
  };
};

const registerUser = async ({
  email,
  firstName,
  middleName,
  lastName,
  moreInformation,
  phoneNumber,
  password,
  confirmPassword,
  robotVerified,
}) => {
  const normalizedEmail = validateEmail(email);
  const normalizedFirstName = validateRequiredName('First Name', firstName);
  const normalizedMiddleName = validateOptionalName(middleName);
  const normalizedLastName = validateRequiredName('Last Name', lastName);
  const normalizedMoreInformation = sanitizeOptionalText(moreInformation, 500);
  const normalizedPhoneNumber = validatePhoneNumber(phoneNumber);
  const normalizedPassword = validateStrongPassword(password);
  const normalizedConfirmPassword = String(confirmPassword || '');
  validateRobotCheck(robotVerified);

  if (normalizedPassword !== normalizedConfirmPassword) {
    throw new HttpError(400, 'Password and confirm password must match.');
  }

  if (normalizedEmail === AUTH_STORAGE.email) {
    throw new HttpError(409, 'Email already registered.');
  }

  const users = await readRegisteredUsers();
  if (users.some((user) => sanitizeEmail(user.email) === normalizedEmail)) {
    throw new HttpError(409, 'Email already registered.');
  }

  const createdAt = new Date().toISOString();
  const user = {
    id: randomBytes(12).toString('hex'),
    email: normalizedEmail,
    firstName: normalizedFirstName,
    middleName: normalizedMiddleName,
    lastName: normalizedLastName,
    moreInformation: normalizedMoreInformation,
    phoneNumber: normalizedPhoneNumber,
    provider: 'local',
    passwordHash: hashPassword(normalizedPassword),
    createdAt,
    updatedAt: createdAt,
    accountStatus: 'Active',
  };

  await saveUserToExcel(user);
  users.push(user);
  await writeRegisteredUsers(users);

  return {
    ok: true,
    message: 'Registration successful.',
    user: toPublicUser(user),
  };
};

const loginWithGoogle = async ({ email, name, picture, rememberMe }) => {
  const normalizedEmail = validateEmail(email);
  const normalizedName = sanitizeDisplayText(name, 120);
  const normalizedPicture = sanitizeOptionalText(picture, 400);

  const users = await readRegisteredUsers();
  const existingIndex = users.findIndex((entry) => sanitizeEmail(entry.email) === normalizedEmail);
  const nameParts = normalizedName.split(' ').filter(Boolean);
  const nextUser = existingIndex >= 0
    ? {
        ...users[existingIndex],
        provider: 'google',
        picture: normalizedPicture || users[existingIndex].picture || '',
        updatedAt: new Date().toISOString(),
      }
    : {
        id: randomBytes(12).toString('hex'),
        email: normalizedEmail,
        firstName: nameParts[0] || 'Google',
        middleName: nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '',
        lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'User',
        moreInformation: '',
        phoneNumber: '',
        provider: 'google',
        picture: normalizedPicture,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

  if (existingIndex >= 0) {
    users[existingIndex] = nextUser;
  } else {
    users.push(nextUser);
  }

  await writeRegisteredUsers(users);

  return createSessionForUser(nextUser, rememberMe);
};

const loginUser = async ({ email, password, rememberMe }) => {
  const normalizedEmail = validateEmail(email);
  const normalizedPassword = validatePasswordInput(password);

  if (normalizedEmail === AUTH_STORAGE.email && verifyPassword(normalizedPassword, AUTH_STORAGE.passwordHash)) {
    return createSessionForUser({
      email: normalizedEmail,
      displayName: sanitizeDisplayText(normalizedEmail.split('@')[0], 50) || 'User',
      provider: 'local',
    }, rememberMe);
  }

  const registeredUser = await findRegisteredUserByEmail(normalizedEmail);
  if (!registeredUser || !registeredUser.passwordHash || !verifyPassword(normalizedPassword, registeredUser.passwordHash)) {
    throw new HttpError(401, 'Invalid email or password.');
  }

  return createSessionForUser(registeredUser, rememberMe);
};

const respondWithAi = async ({ provider, prompt }) => {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const trimmedPrompt = validatePrompt(prompt);

  const keys = await getAiProviderKeys();

  if (normalizedProvider === 'gemini') {
    if (!keys.gemini) {
      throw new HttpError(503, 'Gemini is not configured for this app.');
    }

    const answer = await requestGeminiAnswer(trimmedPrompt, keys.gemini);
    return { provider: 'gemini', answer };
  }

  throw new HttpError(400, `Unsupported AI provider: ${provider || 'unknown'}`);
};

const server = http.createServer(async (request, response) => {
  const origin = String(request.headers.origin || '');
  const requestUrl = new URL(request.url || '/', `http://${HOST}:${PORT}`);

  try {
    enforceRateLimit(request, 'global', GLOBAL_RATE_LIMIT_MAX, GLOBAL_RATE_LIMIT_WINDOW_MS);

    if (request.method === 'OPTIONS') {
      await sendJson(response, 204, {}, origin);
      return;
    }

    if (requestUrl.pathname === '/api/auth/login' && request.method === 'POST') {
      enforceRateLimit(request, 'auth-login', LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS);
      const body = await readBody(request);
      const session = await loginUser(body);
      await sendJson(response, 200, session, origin);
      return;
    }

    if (requestUrl.pathname === '/api/auth/register' && request.method === 'POST') {
      enforceRateLimit(request, 'auth-register', LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS);
      const body = await readBody(request);
      const payload = await registerUser(body);
      await sendJson(response, 201, payload, origin);
      return;
    }

    if (requestUrl.pathname === '/api/auth/google' && request.method === 'POST') {
      enforceRateLimit(request, 'auth-google', LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS);
      const body = await readBody(request);
      const session = await loginWithGoogle(body);
      await sendJson(response, 200, session, origin);
      return;
    }

    if (requestUrl.pathname === '/api/auth/logout' && request.method === 'POST') {
      await sendJson(response, 200, { ok: true }, origin);
      return;
    }

    if (requestUrl.pathname === '/api/auth/session' && request.method === 'GET') {
      const session = requireAuth(request);
      const registeredUser = await findRegisteredUserByEmail(session.email);
      const publicUser = registeredUser
        ? toPublicUser(registeredUser)
        : {
            email: session.email,
            displayName: session.displayName,
            firstName: '',
            middleName: '',
            lastName: '',
            phoneNumber: '',
            moreInformation: '',
            provider: 'local',
            picture: '',
          };
      await sendJson(response, 200, {
        user: publicUser,
      }, origin);
      return;
    }

    if (requestUrl.pathname === '/api/security/status' && request.method === 'GET') {
      await sendJson(response, 200, await buildSecurityStatus(), origin);
      return;
    }

    if (requestUrl.pathname === '/api/wifi/status' && request.method === 'GET') {
      await sendJson(response, 200, await buildWifiSnapshot(), origin);
      return;
    }

    if (requestUrl.pathname === '/api/wifi/connect' && request.method === 'POST') {
      requireAuth(request);
      const body = await readBody(request);
      await sendJson(response, 200, await connectToNetwork(body), origin);
      return;
    }

    if (requestUrl.pathname === '/api/wifi/disconnect' && request.method === 'POST') {
      requireAuth(request);
      const body = await readBody(request);
      await sendJson(response, 200, await disconnectFromNetwork(body), origin);
      return;
    }

    if (requestUrl.pathname === '/api/system/settings' && request.method === 'POST') {
      requireAuth(request);
      await sendJson(response, 200, await openWindowsSettings(), origin);
      return;
    }

    if (requestUrl.pathname === '/api/system/control-panel' && request.method === 'POST') {
      requireAuth(request);
      await sendJson(response, 200, await openControlPanel(), origin);
      return;
    }

    if (requestUrl.pathname === '/api/system/task-manager' && request.method === 'POST') {
      requireAuth(request);
      await sendJson(response, 200, await openTaskManager(), origin);
      return;
    }

    if (requestUrl.pathname === '/api/system/power-off' && request.method === 'POST') {
      requireAuth(request);
      await sendJson(response, 200, await powerOffComputer(), origin);
      return;
    }

    if (requestUrl.pathname === '/api/system/sleep' && request.method === 'POST') {
      requireAuth(request);
      await sendJson(response, 200, await sleepComputer(), origin);
      return;
    }


    if (requestUrl.pathname === '/api/ai/respond' && request.method === 'POST') {
      requireAuth(request);
      const body = await readBody(request);
      await sendJson(response, 200, await respondWithAi(body), origin);
      return;
    }

    await sendJson(response, 404, { error: 'Not found.' }, origin);
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    const publicMessage = error instanceof HttpError
      ? error.publicMessage
      : 'Request failed. Please try again.';
    await sendJson(response, statusCode, { error: publicMessage }, origin);
  }
});

await initializeAuthStorage();

server.listen(PORT, HOST, () => {
  console.log(`Secure local backend listening at http://${HOST}:${PORT}`);
});
