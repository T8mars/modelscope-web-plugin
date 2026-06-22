const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const BACKEND_HOST = '127.0.0.1';
const BACKEND_PORT = Number(process.env.T8_BACKEND_PORT || 5000);
const BASE_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
const STARTUP_TIMEOUT_MS = 60000;
const POLL_INTERVAL_MS = 700;

let mainWindow = null;
let backendProcess = null;
let ownsBackendProcess = false;
let quitting = false;

function userDataPath(...parts) {
  return path.join(app.getPath('userData'), ...parts);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function backendExecutablePath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', 't8-backend.exe');
  }
  return null;
}

function backendCommand() {
  const packagedExe = backendExecutablePath();
  if (packagedExe) {
    return { command: packagedExe, args: [] };
  }
  return {
    command: process.env.PYTHON || 'python',
    args: ['web_app.py'],
  };
}

function requestJson(pathname, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE_URL}${pathname}`, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('request timeout'));
    });
    req.on('error', reject);
  });
}

async function hasCurrentBackend() {
  try {
    const health = await requestJson('/health');
    const settings = await requestJson('/api/runtime_settings');
    return Boolean(health.success && settings.success);
  } catch (error) {
    return false;
  }
}

function startBackendProcess() {
  const uploadDir = ensureDir(userDataPath('uploads'));
  const logDir = ensureDir(userDataPath('logs'));
  const commandInfo = backendCommand();

  if (app.isPackaged && !fs.existsSync(commandInfo.command)) {
    throw new Error(`后端程序不存在：${commandInfo.command}`);
  }

  const out = fs.openSync(path.join(logDir, 'backend.out.log'), 'a');
  const err = fs.openSync(path.join(logDir, 'backend.err.log'), 'a');
  const env = {
    ...process.env,
    T8_BACKEND_PORT: String(BACKEND_PORT),
    T8_UPLOAD_FOLDER: uploadDir,
    PYTHONUNBUFFERED: '1',
  };

  backendProcess = spawn(commandInfo.command, commandInfo.args, {
    cwd: app.isPackaged ? path.dirname(commandInfo.command) : app.getAppPath(),
    env,
    windowsHide: true,
    stdio: ['ignore', out, err],
  });
  ownsBackendProcess = true;

  backendProcess.on('exit', (code, signal) => {
    if (!quitting && mainWindow) {
      dialog.showErrorBox('T8 后端已停止', `本地后端进程退出：code=${code} signal=${signal || ''}`);
    }
  });
}

async function waitForBackend() {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    try {
      if (await hasCurrentBackend()) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`本地后端启动超时${lastError ? `：${lastError.message}` : ''}`);
}

async function ensureBackend() {
  if (await hasCurrentBackend()) {
    ownsBackendProcess = false;
    return;
  }
  startBackendProcess();
  await waitForBackend();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 700,
    title: 'T8 ModelScope Web Plugin',
    backgroundColor: '#f5f7fb',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(BASE_URL);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function stopBackend() {
  quitting = true;
  if (backendProcess && ownsBackendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
  backendProcess = null;
}

async function boot() {
  try {
    await ensureBackend();
    createWindow();
  } catch (error) {
    dialog.showErrorBox('T8 启动失败', error.message || String(error));
    app.quit();
  }
}

app.whenReady().then(boot);

app.on('before-quit', stopBackend);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (!mainWindow) {
    createWindow();
  }
});
