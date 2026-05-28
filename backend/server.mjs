import cors from 'cors';
import express from 'express';
import { execFile } from 'node:child_process';
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import XLSX from 'xlsx';

const app = express();
const execFileAsync = promisify(execFile);
const HOST = '127.0.0.1';
const PORT = 5000;
const PROJECT_ROOT = process.cwd();
const PRIVATE_DATA_DIR = path.join(PROJECT_ROOT, 'backend', 'private');
const USERS_JSON_FILE = path.join(PRIVATE_DATA_DIR, '.ddo-users.json');
const USERS_XLSX_FILE = path.join(PRIVATE_DATA_DIR, 'users.xlsx');
const DELETED_USERS_XLSX_FILE = path.join(PRIVATE_DATA_DIR, 'deleted-users.xlsx');
const LEGACY_USERS_JSON_FILE = path.join(PROJECT_ROOT, '.ddo-users.json');
const LEGACY_USERS_XLSX_FILE = path.join(PROJECT_ROOT, 'users.xlsx');
const USERS_SHEET_NAME = 'Users';
const DELETED_USERS_SHEET_NAME = 'Deleted Users';
const ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:3000',
  'http://localhost:3000',
]);
const AUTH_SECRET = process.env.APP_AUTH_SECRET || 'ddo-local-auth-secret-change-me';
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

app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin: ['http://127.0.0.1:3000', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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

const readUsers = async () => {
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

const writeUsers = async (users) => {
  await ensurePrivateDataDirectory();
  await writeFile(USERS_JSON_FILE, JSON.stringify(users, null, 2), 'utf8');
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

  if (existingRows.some((row) => sanitizeEmail(row['Email ID']) === normalizedEmail)) {
    throw new HttpError(409, 'Email already registered.');
  }

  const nextRows = [
    ...existingRows,
    {
      'Email ID': normalizedEmail,
      'First Name': sanitizeText(user.firstName, 80),
      'Middle Name': sanitizeText(user.middleName, 80),
      'Last Name': sanitizeText(user.lastName, 80),
      'Phone Number': sanitizeText(user.phoneNumber, 40),
      'More Information': sanitizeText(user.moreInformation, 500),
      'Password Hash': String(user.passwordHash || ''),
      'Register Date': user.createdAt,
      'Account Status': user.accountStatus,
    },
  ];

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

const createToken = (user) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: user.email,
    email: user.email,
    displayName: `${user.firstName} ${user.lastName}`.trim(),
    iat: Math.floor(Date.now() / 1000),
  })).toString('base64url');
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
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
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

const toPublicUser = (user) => ({
  email: sanitizeEmail(user.email),
  displayName: `${sanitizeText(user.firstName, 80)} ${sanitizeText(user.lastName, 80)}`.trim(),
  firstName: sanitizeText(user.firstName, 80),
  middleName: sanitizeText(user.middleName, 80),
  lastName: sanitizeText(user.lastName, 80),
  phoneNumber: sanitizeText(user.phoneNumber, 40),
  moreInformation: sanitizeText(user.moreInformation, 240),
  provider: user.provider || 'local',
});

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

app.get('/', (_request, response) => {
  response.json({
    ok: true,
    message: 'DDO backend is running',
    routes: {
      security: '/api/security/status',
      bluetoothStatus: '/api/bluetooth/status',
      bluetoothDevices: '/api/bluetooth/devices',
      wifi: '/api/wifi/status',
      register: 'POST /api/auth/register',
      login: 'POST /api/auth/login',
      settings: 'POST /api/system/settings',
      controlPanel: 'POST /api/system/control-panel',
      taskManager: 'POST /api/system/task-manager',
      powerOff: 'POST /api/system/power-off',
      sleep: 'POST /api/system/sleep',
    },
  });
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

    const users = await readUsers();
    if (users.some((user) => sanitizeEmail(user.email) === normalizedEmail)) {
      throw new HttpError(409, 'Email already registered.');
    }

    const createdAt = new Date().toISOString();
    const user = {
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
    };

    await saveUserToExcel(user);
    users.push(user);
    await writeUsers(users);

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
    const { email, password } = request.body || {};
    const normalizedEmail = validateEmail(email);
    const normalizedPassword = String(password || '');

    if (!normalizedPassword) {
      throw new HttpError(400, 'Invalid details: password is required.');
    }

    const users = await readUsers();
    const user = users.find((entry) => sanitizeEmail(entry.email) === normalizedEmail);

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

app.get('/api/auth/session', async (request, response, next) => {
  try {
    const session = requireAuth(request);
    const users = await readUsers();
    const user = users.find((entry) => sanitizeEmail(entry.email) === sanitizeEmail(session.email));

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
    const session = requireAuth(request);
    const email = validateEmail(request.body?.email || '');
    const password = String(request.body?.password || '');

    if (!password) {
      throw new HttpError(400, 'Password is required.');
    }

    if (sanitizeEmail(session.email) !== email) {
      throw new HttpError(403, 'Authenticated user does not match the requested account.');
    }

    const users = await readUsers();
    const userIndex = users.findIndex((entry) => sanitizeEmail(entry.email) === sanitizeEmail(session.email));

    if (userIndex === -1) {
      throw new HttpError(404, 'Account not found.');
    }

    const user = users[userIndex];
    if (!verifyPassword(password, user.passwordHash)) {
      throw new HttpError(401, 'Incorrect password. Account not deleted.');
    }

    const remainingUsers = users.filter((_, index) => index !== userIndex);
    await writeUsers(remainingUsers);
    await writeActiveUsersToExcel(remainingUsers);
    await saveDeletedUserToExcel(user);

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

app.listen(PORT, HOST, () => {
  console.log(`DDO backend listening at http://${HOST}:${PORT}`);
});
