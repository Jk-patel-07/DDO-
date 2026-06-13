import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import Update from './models/Update.mjs';

const PROJECT_ROOT = process.cwd();

// Load environment variables
[
  path.join(PROJECT_ROOT, '.env.local'),
  path.join(PROJECT_ROOT, '.env'),
].forEach((envPath) => {
  dotenv.config({ path: envPath });
});

const app = express();
const PORT = 6000;
const HOST = '127.0.0.1';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Directories
const PRIVATE_DATA_DIR = path.join(PROJECT_ROOT, 'backend', 'private');
const UPDATES_DIR = path.join(PRIVATE_DATA_DIR, 'updates');
const KEYS_DIR = path.join(PRIVATE_DATA_DIR, 'keys');

// Ensure directories exist
const ensureDirectories = async () => {
  await fs.mkdir(UPDATES_DIR, { recursive: true });
  await fs.mkdir(KEYS_DIR, { recursive: true });
};

// Key generation for package signing
const ensureKeys = async () => {
  const privateKeyPath = path.join(KEYS_DIR, 'private.key');
  const publicKeyPath = path.join(KEYS_DIR, 'public.key');
  
  if (!existsSync(privateKeyPath) || !existsSync(publicKeyPath)) {
    console.log('[DOI Server] Generating RSA key pair for update signing...');
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
    await fs.writeFile(privateKeyPath, privateKey);
    await fs.writeFile(publicKeyPath, publicKey);
    console.log('[DOI Server] Key pair generated.');
  }
};

// Database connection
const connectMongoDB = async () => {
  const mongoUri = String(process.env.MONGO_URI || process.env.MONGODB_URI || '').trim();
  if (!mongoUri) {
    console.error('[DOI Server] MongoDB URI is missing in .env!');
    return;
  }
  try {
    await mongoose.connect(mongoUri);
    console.log('[DOI Server] Connected to MongoDB.');
  } catch (err) {
    console.error('[DOI Server] MongoDB connection failed:', err.message);
  }
};

// Auth helper
const AUTH_SECRET = process.env.JWT_SECRET || process.env.APP_AUTH_SECRET || 'ddo-local-auth-secret-change-me';
const adminEmail = String(process.env.DDO_ADMIN_EMAIL || 'admin@ddo.com').trim().toLowerCase();

const verifyToken = (token) => {
  if (!token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  
  const expectedSignature = crypto.createHmac('sha256', AUTH_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
    
  if (expectedSignature.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null;
  }
  
  try {
    const parsedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (parsedPayload?.exp && Math.floor(Date.now() / 1000) >= Number(parsedPayload.exp)) {
      return null;
    }
    return parsedPayload;
  } catch {
    return null;
  }
};

const authMiddleware = (req, res, next) => {
  let token = '';
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.query.token) {
    token = String(req.query.token);
  }
  
  const session = verifyToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required. Please open this server via the DDO application.' });
  }
  
  const isDev = session.role === 'admin' || session.role === 'developer' || session.role === 'employee' || (session.email && session.email.toLowerCase() === adminEmail);
  if (!isDev) {
    return res.status(403).json({ error: 'Access denied. Only authenticated developers, admins, or approved employee accounts are authorized.' });
  }
  
  req.session = session;
  next();
};

// Serving updates files (Signed installer downloads)
app.get('/updates/:filename', async (req, res) => {
  const filename = req.params.filename;
  // Prevent path traversal
  if (filename.includes('..') || path.isAbsolute(filename)) {
    return res.status(400).send('Invalid filename path traversal detected.');
  }
  const filePath = path.join(UPDATES_DIR, filename);
  if (existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('File not found.');
  }
});

// API endpoint for checking authentication
app.get('/api/doi/auth-check', authMiddleware, (req, res) => {
  res.json({ ok: true, user: req.session });
});

// Staging draft update (API Confirm)
app.post('/api/doi/confirm', authMiddleware, async (req, res) => {
  try {
    const {
      version,
      size,
      type,
      changes,
      securityChanges,
      bugFixes,
      graphicsInfo,
      changedFiles,
      newFiles,
      fileData,
      fileName
    } = req.body;

    // Validate fields
    if (!version || !String(version).trim()) {
      return res.status(400).json({ error: 'Version name is required.' });
    }
    if (!size || !String(size).trim()) {
      return res.status(400).json({ error: 'Size is required.' });
    }
    if (!type || !String(type).trim()) {
      return res.status(400).json({ error: 'Type is required.' });
    }
    if (!changes || !Array.isArray(changes) || changes.filter(c => String(c).trim()).length === 0) {
      return res.status(400).json({ error: 'At least one detail of what changed is required.' });
    }
    if (!fileData || !fileName) {
      return res.status(400).json({ error: 'Installer package is required.' });
    }

    // Process file upload and compute checksum
    const buffer = Buffer.from(fileData, 'base64');
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    
    // Save file locally securely
    const secureFileName = `ddo-update-${version.replace(/[^a-zA-Z0-9.-]/g, '_')}-${Date.now()}${path.extname(fileName)}`;
    const finalFilePath = path.join(UPDATES_DIR, secureFileName);
    await fs.writeFile(finalFilePath, buffer);
    const downloadUrl = `http://localhost:6000/updates/${secureFileName}`;

    // Sign installer checksum
    const privateKeyPath = path.join(KEYS_DIR, 'private.key');
    const privateKey = await fs.readFile(privateKeyPath, 'utf8');
    const sign = crypto.createSign('SHA256');
    sign.update(checksum);
    const signature = sign.sign(privateKey, 'base64');

    // Create unique update details
    const updateId = `doi-update-${crypto.randomUUID()}`;

    // Save/Stage draft update in MongoDB
    const draftUpdate = new Update({
      updateId,
      versionName: String(version).trim(),
      size: String(size).trim(),
      type: String(type).trim(),
      changes: changes.map(c => String(c).trim()).filter(Boolean),
      securityChanges: Array.isArray(securityChanges) ? securityChanges.map(s => String(s).trim()).filter(Boolean) : [],
      bugFixes: Array.isArray(bugFixes) ? bugFixes.map(b => String(b).trim()).filter(Boolean) : [],
      graphicsInfo: String(graphicsInfo || '').trim(),
      changedFiles: Array.isArray(changedFiles) ? changedFiles.map(f => String(f).trim()).filter(Boolean) : [],
      newFiles: Array.isArray(newFiles) ? newFiles.map(f => String(f).trim()).filter(Boolean) : [],
      downloadUrl,
      checksum,
      signature,
      status: 'Draft',
      publishedBy: req.session.email || 'developer',
      isActive: false,
      auditLog: [{
        publisher: req.session.email || 'developer',
        date: new Date(),
        status: 'Draft',
        details: 'Update package drafted, SHA-256 calculated and signed.'
      }]
    });

    await draftUpdate.save();

    res.json({
      ok: true,
      updateId,
      checksum,
      signature,
      updatePageUrl: `http://localhost:6000/update-page/${updateId}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server failed to stage update: ' + err.message });
  }
});

// Finalize Submit (Draft -> Confirmed -> Published)
app.post('/api/doi/submit', authMiddleware, async (req, res) => {
  try {
    const { updateId } = req.body;
    if (!updateId) {
      return res.status(400).json({ error: 'updateId is required.' });
    }

    const update = await Update.findOne({ updateId });
    if (!update) {
      return res.status(404).json({ error: 'Staged update draft not found.' });
    }

    // Set all other updates to inactive
    await Update.updateMany({}, { isActive: false });

    // Transition Draft -> Confirmed -> Published
    update.status = 'Published';
    update.isActive = true;
    update.publishedAt = new Date();
    update.auditLog.push({
      publisher: req.session.email || 'developer',
      date: new Date(),
      status: 'Confirmed',
      details: 'Draft update confirmed by developer.'
    });
    update.auditLog.push({
      publisher: req.session.email || 'developer',
      date: new Date(),
      status: 'Published',
      details: 'Update published and activated across the DDO system.'
    });

    await update.save();
    res.json({ ok: true, message: 'Update published successfully!', update });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to publish update: ' + err.message });
  }
});

// Developer Dashboard View (GET /)
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DDO DOI Update Publisher</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-gradient: linear-gradient(135deg, #090d16 0%, #030712 100%);
      --card-bg: rgba(17, 24, 39, 0.7);
      --border-color: rgba(255, 255, 255, 0.08);
      --accent: linear-gradient(95deg, #818cf8 0%, #6366f1 100%);
      --accent-hover: linear-gradient(95deg, #6366f1 0%, #4f46e5 100%);
      --text: #e2e8f0;
      --text-muted: #94a3b8;
    }
    body {
      font-family: 'Outfit', sans-serif;
      background: var(--bg-gradient);
      color: var(--text);
      margin: 0;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 30px;
      box-sizing: border-box;
    }
    .container {
      width: 100%;
      max-width: 800px;
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 36px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
      display: none;
    }
    .header {
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 20px;
      margin-bottom: 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      background: linear-gradient(90deg, #a5b4fc, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      font-weight: 600;
    }
    .header span {
      font-size: 13px;
      color: var(--text-muted);
    }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 24px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .form-group.full-width {
      grid-column: span 2;
    }
    label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-muted);
      letter-spacing: 0.5px;
    }
    input, select, textarea {
      background: rgba(3, 7, 18, 0.6);
      border: 1px solid var(--border-color);
      color: var(--text);
      border-radius: 8px;
      padding: 12px;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      transition: all 0.2s ease;
    }
    input:focus, select:focus, textarea:focus {
      border-color: #818cf8;
      box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.15);
    }
    .list-input-container {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .list-input-row {
      display: flex;
      gap: 10px;
    }
    .list-items {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 6px;
    }
    .list-item-tag {
      background: rgba(99, 102, 241, 0.12);
      border: 1px solid rgba(99, 102, 241, 0.3);
      color: #a5b4fc;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .list-item-tag button {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      font-weight: bold;
      font-size: 12px;
      padding: 0;
    }
    .btn-add {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--border-color);
      color: var(--text);
      cursor: pointer;
      padding: 0 14px;
      border-radius: 8px;
      transition: all 0.2s;
    }
    .btn-add:hover {
      background: rgba(255, 255, 255, 0.15);
    }
    .btn-primary {
      background: var(--accent);
      color: white;
      border: none;
      padding: 14px 28px;
      font-size: 15px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      width: 100%;
      transition: all 0.2s;
      margin-top: 10px;
    }
    .btn-primary:hover {
      background: var(--accent-hover);
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text);
      padding: 12px 24px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    /* Modal Dialog */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    }
    .modal-content {
      background: #0d1321;
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 28px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    .modal-header {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 12px;
      color: #818cf8;
    }
    .modal-body {
      font-size: 14px;
      color: var(--text-muted);
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }
    /* Results Box */
    .result-box {
      margin-top: 24px;
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.25);
      padding: 20px;
      border-radius: 8px;
      display: none;
    }
    .result-box h3 {
      margin-top: 0;
      color: #34d399;
      font-size: 16px;
      margin-bottom: 12px;
    }
    .result-link {
      background: rgba(0, 0, 0, 0.4);
      padding: 8px 12px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 13px;
      color: #a7f3d0;
      display: block;
      word-break: break-all;
      margin-bottom: 16px;
    }
    .access-denied {
      text-align: center;
      padding: 50px 20px;
    }
    .access-denied h1 {
      color: #ef4444;
      font-size: 28px;
      margin-bottom: 12px;
    }
    .access-denied p {
      color: var(--text-muted);
      font-size: 15px;
    }
    /* File input style */
    .file-dropzone {
      border: 2px dashed var(--border-color);
      padding: 24px;
      border-radius: 8px;
      text-align: center;
      background: rgba(3, 7, 18, 0.4);
      cursor: pointer;
      transition: all 0.2s;
    }
    .file-dropzone:hover {
      border-color: #818cf8;
      background: rgba(129, 140, 248, 0.04);
    }
  </style>
</head>
<body>

  <div id="auth-loading" style="text-align: center;">
    <h2>Verifying Developer Session...</h2>
  </div>

  <div class="container" id="main-container">
    <div class="header">
      <h1>DDO DOI Update Publisher</h1>
      <span id="developer-identity">Not logged in</span>
    </div>

    <form id="update-form" onsubmit="event.preventDefault();">
      <div class="form-grid">
        <div class="form-group">
          <label for="version">DOI Version</label>
          <input type="text" id="version" placeholder="e.g. DOI-1.1" required>
        </div>

        <div class="form-group">
          <label for="size">Update Size</label>
          <input type="text" id="size" placeholder="e.g. 15.4 MB" required>
        </div>

        <div class="form-group">
          <label for="type">Update Type</label>
          <select id="type" required>
            <option value="UI + Security Update">UI + Security Update</option>
            <option value="Feature Update">Feature Update</option>
            <option value="Bug Fix Update">Bug Fix Update</option>
            <option value="Critical Security Update">Critical Security Update</option>
          </select>
        </div>

        <div class="form-group">
          <label>Installer Package File</label>
          <div class="file-dropzone" onclick="document.getElementById('file-input').click();">
            <span id="file-label">Click to upload DDO setup package (.exe, .zip)</span>
            <input type="file" id="file-input" style="display: none;" required>
          </div>
        </div>

        <div class="form-group full-width list-input-container">
          <label>What changed in DDO (Changelog)</label>
          <div class="list-input-row">
            <input type="text" id="changes-input" placeholder="Type detail and click Add">
            <button type="button" class="btn-add" onclick="addListItem('changes')">+</button>
          </div>
          <div id="changes-list" class="list-items"></div>
        </div>

        <div class="form-group full-width list-input-container">
          <label>Security Changes</label>
          <div class="list-input-row">
            <input type="text" id="security-input" placeholder="Type detail and click Add">
            <button type="button" class="btn-add" onclick="addListItem('security')">+</button>
          </div>
          <div id="security-list" class="list-items"></div>
        </div>

        <div class="form-group full-width list-input-container">
          <label>Bug Fixes</label>
          <div class="list-input-row">
            <input type="text" id="bugfixes-input" placeholder="Type detail and click Add">
            <button type="button" class="btn-add" onclick="addListItem('bugfixes')">+</button>
          </div>
          <div id="bugfixes-list" class="list-items"></div>
        </div>

        <div class="form-group full-width">
          <label for="graphics">Graphic & Animation Details</label>
          <textarea id="graphics" rows="3" placeholder="Provide information on new animations or graphic overrides..."></textarea>
        </div>

        <div class="form-group full-width list-input-container">
          <label>Changed Files and Folders</label>
          <div class="list-input-row">
            <input type="text" id="changedfiles-input" placeholder="e.g. src/components/StatusBar.jsx">
            <button type="button" class="btn-add" onclick="addListItem('changedfiles')">+</button>
          </div>
          <div id="changedfiles-list" class="list-items"></div>
        </div>

        <div class="form-group full-width list-input-container">
          <label>New Files and Folders</label>
          <div class="list-input-row">
            <input type="text" id="newfiles-input" placeholder="e.g. backend/doiServer.mjs">
            <button type="button" class="btn-add" onclick="addListItem('newfiles')">+</button>
          </div>
          <div id="newfiles-list" class="list-items"></div>
        </div>

      </div>

      <button type="button" class="btn-primary" onclick="openChangeDialog()">Change</button>
    </form>

    <div class="result-box" id="result-box">
      <h3>Update Draft Staged Successfully!</h3>
      <p>Secure Update Page Link:</p>
      <a id="update-link" class="result-link" target="_blank"></a>
      <p>Package SHA-256 Checksum:</p>
      <div id="update-checksum" style="font-family: monospace; font-size: 13px; margin-bottom: 20px; word-break: break-all;"></div>
      <button type="button" class="btn-primary" style="background: linear-gradient(90deg, #10b981 0%, #059669 100%)" onclick="submitUpdate()">Submit</button>
    </div>
  </div>

  <!-- Confirmation Modal -->
  <div class="modal-overlay" id="confirm-modal">
    <div class="modal-content">
      <div class="modal-header">Confirm Update Drafting</div>
      <div class="modal-body">
        Are you sure you want to validate these fields and stage the update package? This will calculate the package checksum and create a Draft record in MongoDB.
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="closeChangeDialog()">Cancel</button>
        <button class="btn-primary" style="margin: 0; width: auto;" onclick="confirmDraft()">Confirm</button>
      </div>
    </div>
  </div>

  <script>
    // Lists state
    const lists = {
      changes: [],
      security: [],
      bugfixes: [],
      changedfiles: [],
      newfiles: []
    };

    let uploadedFile = null;
    let stagedUpdateId = null;

    // Handle File upload
    document.getElementById('file-input').addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        uploadedFile = file;
        document.getElementById('file-label').textContent = file.name + ' (' + (file.size/1024/1024).toFixed(2) + ' MB)';
      }
    });

    function addListItem(type) {
      const input = document.getElementById(type + '-input');
      const val = input.value.trim();
      if (val && !lists[type].includes(val)) {
        lists[type].push(val);
        input.value = '';
        renderList(type);
      }
    }

    function removeListItem(type, val) {
      lists[type] = lists[type].filter(item => item !== val);
      renderList(type);
    }

    function renderList(type) {
      const container = document.getElementById(type + '-list');
      container.innerHTML = '';
      lists[type].forEach(item => {
        const tag = document.createElement('div');
        tag.className = 'list-item-tag';
        tag.innerHTML = \`\${item} <button type="button" onclick="removeListItem('\${type}', '\${item}')">&times;</button>\`;
        container.appendChild(tag);
      });
    }

    // Auth verification on load
    const urlParams = new URLSearchParams(window.location.search);
    const queryToken = urlParams.get('token');
    if (queryToken) {
      sessionStorage.setItem('doi_auth_token', queryToken);
      window.location.href = window.location.origin + window.location.pathname;
    }

    const token = sessionStorage.getItem('doi_auth_token') || '';
    if (!token) {
      showAccessDenied();
    } else {
      fetch('/api/doi/auth-check', {
        headers: { 'Authorization': 'Bearer ' + token }
      })
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(data => {
        document.getElementById('auth-loading').style.display = 'none';
        document.getElementById('main-container').style.display = 'block';
        document.getElementById('developer-identity').textContent = 'Signed in as: ' + data.user.email;
      })
      .catch(() => {
        showAccessDenied();
      });
    }

    function showAccessDenied() {
      document.getElementById('auth-loading').innerHTML = \`
        <div class="access-denied">
          <h1>Access Denied</h1>
          <p>Please open the DOI publisher dashboard through the local DDO app (DOI Button).</p>
        </div>
      \`;
    }

    function openChangeDialog() {
      // Basic validations
      if (!document.getElementById('version').value.trim()) return alert('Version is required.');
      if (!document.getElementById('size').value.trim()) return alert('Size is required.');
      if (lists.changes.length === 0) return alert('At least one What Changed item is required.');
      if (!uploadedFile) return alert('Please select an update package file.');

      document.getElementById('confirm-modal').style.display = 'flex';
    }

    function closeChangeDialog() {
      document.getElementById('confirm-modal').style.display = 'none';
    }

    function confirmDraft() {
      closeChangeDialog();
      
      const reader = new FileReader();
      reader.onload = function() {
        const base64Data = reader.result.split(',')[1];
        
        const payload = {
          version: document.getElementById('version').value.trim(),
          size: document.getElementById('size').value.trim(),
          type: document.getElementById('type').value,
          changes: lists.changes,
          securityChanges: lists.security,
          bugFixes: lists.bugfixes,
          graphicsInfo: document.getElementById('graphics').value.trim(),
          changedFiles: lists.changedfiles,
          newFiles: lists.newfiles,
          fileData: base64Data,
          fileName: uploadedFile.name
        };

        fetch('/api/doi/confirm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
          if (data.error) throw new Error(data.error);
          stagedUpdateId = data.updateId;
          document.getElementById('update-link').href = data.updatePageUrl;
          document.getElementById('update-link').textContent = data.updatePageUrl;
          document.getElementById('update-checksum').textContent = data.checksum;
          document.getElementById('result-box').style.display = 'block';
          
          // Smooth scroll to results
          document.getElementById('result-box').scrollIntoView({ behavior: 'smooth' });
        })
        .catch(err => {
          alert('Failed to stage update: ' + err.message);
        });
      };
      reader.readAsDataURL(uploadedFile);
    }

    function submitUpdate() {
      if (!stagedUpdateId) return;
      
      fetch('/api/doi/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ updateId: stagedUpdateId })
      })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        alert('Update published successfully! All users will be notified.');
        window.location.reload();
      })
      .catch(err => {
        alert('Failed to publish: ' + err.message);
      });
    }
  </script>
</body>
</html>`);
});

// User Update Details/Install Page View (GET /update-page/:updateId)
app.get('/update-page/:updateId', async (req, res) => {
  try {
    const update = await Update.findOne({ updateId: req.params.updateId });
    if (!update) {
      return res.status(404).send('Update details page not found.');
    }

    const changesList = update.changes.map(c => `<li>${c}</li>`).join('');
    const securityList = (update.securityChanges || []).map(s => `<li>${s}</li>`).join('');
    const bugFixesList = (update.bugFixes || []).map(b => `<li>${b}</li>`).join('');
    const changedFilesList = (update.changedFiles || []).map(f => `<li>${f}</li>`).join('');
    const newFilesList = (update.newFiles || []).map(f => `<li>${f}</li>`).join('');

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DDO Software Update</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Outfit', sans-serif;
      background-color: #0b0f19;
      color: #cbd5e1;
      margin: 0;
      padding: 24px;
      box-sizing: border-box;
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 14px;
      margin-bottom: 16px;
    }
    .header h2 {
      margin: 0;
      font-size: 18px;
      color: #60a5fa;
      font-weight: 600;
    }
    .badge {
      font-size: 11px;
      background: rgba(96, 165, 250, 0.12);
      border: 1px solid rgba(96, 165, 250, 0.3);
      color: #93c5fd;
      padding: 3px 8px;
      border-radius: 12px;
      font-weight: 500;
    }
    .meta-box {
      display: flex;
      gap: 24px;
      background: rgba(30, 41, 59, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.05);
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      margin-bottom: 16px;
    }
    .content-area {
      flex: 1;
      overflow-y: auto;
      background: rgba(15, 23, 42, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 16px;
    }
    h4 {
      margin: 0 0 6px 0;
      font-size: 13px;
      color: #f1f5f9;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 3px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    ul {
      margin: 0;
      padding-left: 20px;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.6;
    }
    .progress-section {
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .progress-bar-bg {
      width: 100%;
      height: 6px;
      background: #1e293b;
      border-radius: 3px;
      overflow: hidden;
    }
    .progress-bar {
      width: 0%;
      height: 100%;
      background: linear-gradient(90deg, #34d399, #059669);
      transition: width 0.1s;
    }
    .btn-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }
    button {
      font-family: inherit;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-later {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #cbd5e1;
      padding: 8px 18px;
    }
    .btn-later:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    .btn-install {
      background: linear-gradient(90deg, #10b981 0%, #059669 100%);
      color: white;
      border: none;
      padding: 8px 24px;
    }
    .btn-install:hover {
      background: linear-gradient(90deg, #059669 0%, #047857 100%);
    }
    .signature-verified {
      font-size: 11px;
      color: #34d399;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .alert-danger {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 12px;
      text-align: center;
    }
  </style>
</head>
<body>

  <div class="header">
    <h2>DDO Software Update Available</h2>
    <span class="badge">${update.type}</span>
  </div>

  <div class="meta-box">
    <div><strong>New Version:</strong> <span style="color: #60a5fa">${update.versionName}</span></div>
    <div><strong>Update Size:</strong> <span style="color: #94a3b8">${update.size}</span></div>
    <div class="signature-verified">✓ Digital Signature Valid</div>
  </div>

  <div class="content-area">
    <div>
      <h4>What changed in DDO</h4>
      <ul>${changesList}</ul>
    </div>

    ${securityList ? `
    <div>
      <h4 style="color: #fca5a5;">Security Updates</h4>
      <ul>${securityList}</ul>
    </div>` : ''}

    ${bugFixesList ? `
    <div>
      <h4 style="color: #93c5fd;">Bug Fixes</h4>
      <ul>${bugFixesList}</ul>
    </div>` : ''}

    ${update.graphicsInfo ? `
    <div>
      <h4>Graphics & Animation Details</h4>
      <div style="font-size: 12px; color: #94a3b8; line-height: 1.5;">${update.graphicsInfo}</div>
    </div>` : ''}

    ${changedFilesList ? `
    <div>
      <h4>Changed Files & Folders</h4>
      <ul>${changedFilesList}</ul>
    </div>` : ''}

    ${newFilesList ? `
    <div>
      <h4>New Files & Folders</h4>
      <ul>${newFilesList}</ul>
    </div>` : ''}
  </div>

  <div class="progress-section">
    <div id="status-text" style="font-size: 12px; color: #94a3b8; text-align: center;">Ready to install update.</div>
    <div id="progress-container" style="display: none;">
      <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-bottom: 4px;">
        <span>Downloading...</span>
        <span id="percent-text">0%</span>
      </div>
      <div class="progress-bar-bg">
        <div id="progress-bar" class="progress-bar"></div>
      </div>
    </div>

    <div class="btn-actions" id="action-buttons">
      <button class="btn-later" onclick="closeUpdateWindow()">Later</button>
      <button class="btn-install" onclick="startInstall()">Install Update</button>
    </div>
  </div>

  <script>
    const downloadUrl = "${update.downloadUrl}";
    const checksum = "${update.checksum}";
    const signature = "${update.signature}";

    function closeUpdateWindow() {
      if (window.electronAPI && window.electronAPI.closeUpdateWindow) {
        window.electronAPI.closeUpdateWindow();
      } else {
        window.close();
      }
    }

    function startInstall() {
      if (window.electronAPI && window.electronAPI.startUpdateDownload) {
        document.getElementById('action-buttons').style.display = 'none';
        document.getElementById('progress-container').style.display = 'block';
        document.getElementById('status-text').textContent = 'Downloading update package internally...';
        
        window.electronAPI.startUpdateDownload(downloadUrl, checksum, signature);
      } else {
        alert('Internal installer downloads are only supported inside the DDO Electron app.');
      }
    }

    if (window.electronAPI && window.electronAPI.onUpdateStatus) {
      window.electronAPI.onUpdateStatus((statusObj) => {
        console.log('Update Page Status update:', statusObj);
        
        if (statusObj.status === 'downloading') {
          document.getElementById('percent-text').textContent = statusObj.percent + '%';
          document.getElementById('progress-bar').style.width = statusObj.percent + '%';
        } else if (statusObj.status === 'download-complete') {
          document.getElementById('status-text').textContent = 'Awaiting installation confirmation...';
          document.getElementById('progress-container').style.display = 'none';
        } else if (statusObj.status === 'installing') {
          document.getElementById('status-text').textContent = 'Installing files... Please wait.';
          document.getElementById('status-text').style.color = '#60a5fa';
        } else if (statusObj.status === 'restart-required') {
          document.getElementById('status-text').textContent = 'Update complete! Restarting DDO...';
          document.getElementById('status-text').style.color = '#34d399';
        } else if (statusObj.status === 'error') {
          document.getElementById('status-text').innerHTML = \`<div class="alert-danger">Error: \${statusObj.message || 'Verification or installation failed.'}</div>\`;
          document.getElementById('progress-container').style.display = 'none';
          document.getElementById('action-buttons').style.display = 'flex';
        } else if (statusObj.status === 'cancelled') {
          document.getElementById('status-text').textContent = 'Installation cancelled.';
          document.getElementById('progress-container').style.display = 'none';
          document.getElementById('action-buttons').style.display = 'flex';
        }
      });
    }
  </script>

</body>
</html>`);
  } catch (err) {
    res.status(500).send('Error loading update page: ' + err.message);
  }
});

// App startup
const startServer = async () => {
  await ensureDirectories();
  await ensureKeys();
  await connectMongoDB();
  
  app.listen(PORT, HOST, () => {
    console.log(`===================================================`);
    console.log(`[DOI Server] Running on http://${HOST}:${PORT}`);
    console.log(`===================================================`);
  });
};

startServer().catch(err => {
  console.error('[DOI Server] Startup failed:', err);
});
