import http from 'node:http';
import { execFile } from 'node:child_process';
import { readdir, readFile, stat, writeFile, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HOST = '127.0.0.1';
const PORT = 3031;
const PROJECT_ROOT = process.cwd();
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

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

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  response.end(JSON.stringify(payload));
};

const readBody = (request) =>
  new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
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
        reject(new Error('Invalid JSON body.'));
      }
    });
    request.on('error', reject);
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const START_MENU_DIRECTORIES = [
  path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
];

const runNetsh = async (args) => {
  const { stdout } = await execFileAsync('netsh', args, {
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });

  return stdout;
};

const sanitizeAppName = (name) =>
  name
    .replace(/\.lnk$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const collectShortcutFiles = async (directory, results = []) => {
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await collectShortcutFiles(fullPath, results);
      continue;
    }

    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.lnk')) {
      continue;
    }

    try {
      const fileStats = await stat(fullPath);
      results.push({
        id: fullPath,
        name: sanitizeAppName(entry.name),
        shortcutPath: fullPath,
        iconLabel: sanitizeAppName(entry.name).slice(0, 2).toUpperCase(),
        modifiedAt: fileStats.mtimeMs,
      });
    } catch {
      // Ignore unreadable shortcuts and continue scanning.
    }
  }

  return results;
};

const resolveShortcutVisual = async (shortcutPath) => {
  const escapedShortcutPath = String(shortcutPath).replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'Stop'
$shortcutPath = '${escapedShortcutPath}'
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$targetPath = $shortcut.TargetPath
$iconLocation = $shortcut.IconLocation
$iconPath = $null
if ($iconLocation) {
  $iconPath = ($iconLocation -split ',')[0].Trim('"')
}
if ((-not $iconPath) -or (-not (Test-Path $iconPath))) {
  $iconPath = $targetPath
}
$iconData = $null
if ($iconPath -and (Test-Path $iconPath)) {
  Add-Type -AssemblyName System.Drawing
  $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($iconPath)
  if ($icon) {
    $bitmap = $icon.ToBitmap()
    $stream = New-Object System.IO.MemoryStream
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $iconData = [Convert]::ToBase64String($stream.ToArray())
    $bitmap.Dispose()
    $icon.Dispose()
    $stream.Dispose()
  }
}
[PSCustomObject]@{
  targetPath = $targetPath
  iconData = $iconData
} | ConvertTo-Json -Compress
`;

  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 4,
    },
  );

  return JSON.parse((stdout || '{}').trim() || '{}');
};

const buildInstalledAppsSnapshot = async () => {
  const shortcuts = [];
  for (const directory of START_MENU_DIRECTORIES) {
    await collectShortcutFiles(directory, shortcuts);
  }

  const uniqueApps = new Map();
  for (const app of shortcuts) {
    const key = app.name.toLowerCase();
    const existing = uniqueApps.get(key);

    if (!existing || existing.modifiedAt < app.modifiedAt) {
      uniqueApps.set(key, app);
    }
  }

  return Array.from(uniqueApps.values())
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(({ modifiedAt, ...app }) => app);
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
  if (!name) {
    throw new Error('Network name is required.');
  }

  if (secure) {
    const profileXml = createWifiProfileXml({ name, password, authType, cipherType });
    const profilePath = path.join(os.tmpdir(), `wifi-profile-${Date.now()}.xml`);

    try {
      await writeFile(profilePath, profileXml, 'utf8');
      await runNetsh(['wlan', 'add', 'profile', `filename=${profilePath}`, 'user=current']);
    } finally {
      await unlink(profilePath).catch(() => {});
    }
  }

  const args = ['wlan', 'connect', `name=${name}`, `ssid=${name}`];
  if (interfaceName) {
    args.push(`interface=${interfaceName}`);
  }

  await runNetsh(args);
  await sleep(1800);
  return buildWifiSnapshot();
};

const disconnectFromNetwork = async ({ interfaceName }) => {
  const args = ['wlan', 'disconnect'];
  if (interfaceName) {
    args.push(`interface=${interfaceName}`);
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

const openInstalledApp = async ({ shortcutPath, appPath }) => {
  const launchPath = appPath || shortcutPath;

  if (!launchPath) {
    throw new Error('App not found or path is invalid.');
  }

  try {
    await stat(launchPath);
  } catch {
    throw new Error('App not found or path is invalid.');
  }

  await execFileAsync('cmd', ['/c', 'start', '', launchPath], {
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

const respondWithAi = async ({ provider, prompt }) => {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const trimmedPrompt = String(prompt || '').trim();

  if (!trimmedPrompt) {
    throw new Error('Prompt is required.');
  }

  const keys = await getAiProviderKeys();

  if (normalizedProvider === 'gemini') {
    if (!keys.gemini) {
      throw new Error('Add GEMINI_API_KEY to your local environment to use Gemini inside the app.');
    }

    const answer = await requestGeminiAnswer(trimmedPrompt, keys.gemini);
    return { provider: 'gemini', answer };
  }

  throw new Error(`Unsupported AI provider: ${provider || 'unknown'}`);
};

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  try {
    if (request.url === '/api/wifi/status' && request.method === 'GET') {
      sendJson(response, 200, await buildWifiSnapshot());
      return;
    }

    if (request.url === '/api/wifi/connect' && request.method === 'POST') {
      const body = await readBody(request);
      sendJson(response, 200, await connectToNetwork(body));
      return;
    }

    if (request.url === '/api/wifi/disconnect' && request.method === 'POST') {
      const body = await readBody(request);
      sendJson(response, 200, await disconnectFromNetwork(body));
      return;
    }

    if (request.url === '/api/system/settings' && request.method === 'POST') {
      sendJson(response, 200, await openWindowsSettings());
      return;
    }

    if (request.url === '/api/system/control-panel' && request.method === 'POST') {
      sendJson(response, 200, await openControlPanel());
      return;
    }

    if (request.url === '/api/system/task-manager' && request.method === 'POST') {
      sendJson(response, 200, await openTaskManager());
      return;
    }

    if (request.url === '/api/system/power-off' && request.method === 'POST') {
      sendJson(response, 200, await powerOffComputer());
      return;
    }

    if (request.url === '/api/system/sleep' && request.method === 'POST') {
      sendJson(response, 200, await sleepComputer());
      return;
    }

    if (request.url === '/api/system/apps' && request.method === 'GET') {
      sendJson(response, 200, { apps: await buildInstalledAppsSnapshot() });
      return;
    }

    if (request.url === '/api/system/apps/open' && request.method === 'POST') {
      const body = await readBody(request);
      sendJson(response, 200, await openInstalledApp(body));
      return;
    }

    if (request.url === '/api/system/apps/icon' && request.method === 'POST') {
      const body = await readBody(request);
      const visual = await resolveShortcutVisual(body.shortcutPath);
      sendJson(response, 200, {
        targetPath: visual.targetPath || '',
        iconDataUrl: visual.iconData ? `data:image/png;base64,${visual.iconData}` : '',
      });
      return;
    }

    if (request.url === '/api/ai/respond' && request.method === 'POST') {
      const body = await readBody(request);
      sendJson(response, 200, await respondWithAi(body));
      return;
    }

    sendJson(response, 404, { error: 'Not found.' });
  } catch (error) {
    sendJson(response, 500, {
      error: error.message || 'Wi-Fi request failed.',
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Wi-Fi backend listening at http://${HOST}:${PORT}`);
});
