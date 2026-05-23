const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const qrcode = require("qrcode");
const { Client, LocalAuth } = require("whatsapp-web.js");

const SESSION_PATH = process.env.WHATSAPP_SESSION_PATH
  ? path.resolve(process.env.WHATSAPP_SESSION_PATH)
  : path.join(__dirname, "..", ".wwebjs_auth");
const CLIENT_ID = process.env.WHATSAPP_CLIENT_ID || "madrasati";
const AUTO_INIT = process.env.WHATSAPP_AUTO_INIT !== "false";
const RECONNECT_DELAY_MS = Number(
  process.env.WHATSAPP_RECONNECT_DELAY_MS || 15000
);
const MAX_RECONNECT_DELAY_MS = Number(
  process.env.WHATSAPP_MAX_RECONNECT_DELAY_MS || 120000
);
const READY_WAIT_TIMEOUT_MS = Number(
  process.env.WHATSAPP_READY_WAIT_TIMEOUT_MS || 20000
);

let client = null;
let initializingPromise = null;
let latestQrText = null;
let latestQrImage = null;
let latestError = null;
let connectionStatus = "idle";
let authenticated = false;
let connectedNumber = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let manualLogout = false;

function isDetachedFrameError(error) {
  const message = error?.message || String(error || "");
  return (
    message.includes("detached Frame") ||
    message.includes("Attempted to use detached Frame")
  );
}

function isProfileLockError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("profile appears to be in use") ||
    message.includes("chromium has locked the profile") ||
    message.includes("failed to launch the browser process")
  );
}

function ensureSessionPath() {
  fs.mkdirSync(SESSION_PATH, { recursive: true });
}

function getSessionSearchTokens() {
  const normalized = SESSION_PATH.replace(/\\/g, "/");
  const authDirName = path.basename(SESSION_PATH);
  const clientDirName = `session-${CLIENT_ID}`;
  return [normalized, authDirName, clientDirName].filter(Boolean);
}

function killChromiumProcessesForSession() {
  if (process.platform === "win32") {
    return;
  }

  const tokens = getSessionSearchTokens();

  for (const token of tokens) {
    try {
      execSync(`pkill -f "${token}"`, { stdio: "ignore" });
    } catch (_) {}
  }

  try {
    execSync(`pkill -f "chrome.*${CLIENT_ID}"`, { stdio: "ignore" });
  } catch (_) {}

  try {
    execSync(`pkill -f "chromium.*${CLIENT_ID}"`, { stdio: "ignore" });
  } catch (_) {}
}

function removeFileIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true, recursive: true });
    }
  } catch (_) {}
}

function getClientSessionDirectory() {
  return path.join(SESSION_PATH, `session-${CLIENT_ID}`);
}

function removeDirectoryIfExists(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (_) {}
}

function clearStaleWhatsAppSession() {
  removeDirectoryIfExists(getClientSessionDirectory());
}

function clearChromiumProfileLocks(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return;
  }

  const walk = (currentDir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (_) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      const isLockFile =
        entry.name === "SingletonLock" ||
        entry.name === "SingletonCookie" ||
        entry.name === "SingletonSocket" ||
        entry.name.startsWith(".org.chromium.Chromium.");

      if (isLockFile) {
        removeFileIfExists(fullPath);
      }
    }
  };

  walk(rootDir);
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function getReconnectDelay() {
  const delay = RECONNECT_DELAY_MS * Math.max(1, reconnectAttempts);
  return Math.min(delay, MAX_RECONNECT_DELAY_MS);
}

function scheduleReconnect(reason = "unknown") {
  if (!AUTO_INIT || manualLogout || initializingPromise || client) {
    return;
  }

  clearReconnectTimer();
  reconnectAttempts += 1;
  const delay = getReconnectDelay();
  connectionStatus = "reconnecting";
  latestError = `Reconnecting after disconnect: ${reason}`;

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await initWhatsAppClient();
    } catch (error) {
      latestError = error.message || String(error);
      scheduleReconnect(latestError);
    }
  }, delay);
}

function normalizeWhatsAppPhone(phone = "") {
  let value = String(phone).trim();

  if (!value) {
    throw new Error("Phone number is required");
  }

  value = value.replace(/[^\d+]/g, "");

  if (value.startsWith("+")) value = value.slice(1);
  if (value.startsWith("00")) value = value.slice(2);
  if (value.startsWith("0")) value = `964${value.slice(1)}`;

  if (!/^\d{8,15}$/.test(value)) {
    throw new Error("Phone number format is invalid");
  }

  return value;
}

function getStatus() {
  return {
    status: connectionStatus,
    authenticated,
    hasQr: Boolean(latestQrImage),
    connectedNumber,
    lastError: latestError,
  };
}

function waitForClientReady(timeoutMs = READY_WAIT_TIMEOUT_MS) {
  if (client && connectionStatus === "ready") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const timer = setInterval(() => {
      if (client && connectionStatus === "ready") {
        clearInterval(timer);
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        reject(
          new Error(
            "WhatsApp client is not ready yet. Wait a few seconds and try again."
          )
        );
      }
    }, 500);
  });
}

async function buildQrImage(qrText) {
  latestQrText = qrText;
  latestQrImage = await qrcode.toDataURL(qrText);
}

function bindClientEvents(instance) {
  instance.on("qr", async (qrText) => {
    clearReconnectTimer();
    connectionStatus = "qr_ready";
    latestError = null;
    connectedNumber = null;
    authenticated = false;

    try {
      await buildQrImage(qrText);
    } catch (error) {
      latestError = `QR generation failed: ${error.message}`;
    }
  });

  instance.on("authenticated", () => {
    clearReconnectTimer();
    reconnectAttempts = 0;
    authenticated = true;
    latestError = null;
    connectionStatus = "authenticated";
  });

  instance.on("ready", () => {
    clearReconnectTimer();
    reconnectAttempts = 0;
    connectionStatus = "ready";
    latestQrText = null;
    latestQrImage = null;
    latestError = null;

    try {
      const wid = instance.info?.wid?._serialized || "";
      connectedNumber = wid.replace("@c.us", "") || null;
    } catch (_) {
      connectedNumber = null;
    }
  });

  instance.on("auth_failure", (message) => {
    clearReconnectTimer();
    authenticated = false;
    connectionStatus = "auth_failure";
    latestError = message || "Authentication failed";
  });

  instance.on("disconnected", (reason) => {
    authenticated = false;
    connectionStatus = "disconnected";
    latestError = reason || "Client disconnected";
    latestQrText = null;
    latestQrImage = null;
    connectedNumber = null;
    client = null;
    initializingPromise = null;

    if (!manualLogout) {
      scheduleReconnect(reason || "Client disconnected");
    }
  });
}

function buildClient() {
  return new Client({
    authStrategy: new LocalAuth({
      clientId: CLIENT_ID,
      dataPath: SESSION_PATH,
    }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });
}

async function initWhatsAppClient() {
  if (client) {
    return getStatus();
  }

  if (initializingPromise) {
    await initializingPromise;
    return getStatus();
  }

  connectionStatus = "initializing";
  latestError = null;
  manualLogout = false;
  clearReconnectTimer();
  ensureSessionPath();
  killChromiumProcessesForSession();
  clearChromiumProfileLocks(SESSION_PATH);

  client = buildClient();
  bindClientEvents(client);

  initializingPromise = client
    .initialize()
    .catch((error) => {
      if (isProfileLockError(error)) {
        killChromiumProcessesForSession();
        clearChromiumProfileLocks(SESSION_PATH);
        clearStaleWhatsAppSession();
      }
      latestError = error.message;
      connectionStatus = "failed";
      client = null;
      scheduleReconnect(error.message);
      throw error;
    })
    .finally(() => {
      initializingPromise = null;
    });

  try {
    await initializingPromise;
  } catch (error) {
    if (!isProfileLockError(error)) {
      throw error;
    }

    killChromiumProcessesForSession();
    clearChromiumProfileLocks(SESSION_PATH);
    clearStaleWhatsAppSession();
    connectionStatus = "initializing";
    latestError =
      "Retrying after clearing Chromium locks and stale WhatsApp session";

    client = buildClient();
    bindClientEvents(client);

    initializingPromise = client
      .initialize()
      .catch((retryError) => {
        latestError = retryError.message;
        connectionStatus = "failed";
        client = null;
        scheduleReconnect(retryError.message);
        throw retryError;
      })
      .finally(() => {
        initializingPromise = null;
      });

    await initializingPromise;
  }

  return getStatus();
}

async function ensureClientReady() {
  if (!client && AUTO_INIT && !initializingPromise) {
    try {
      await initWhatsAppClient();
    } catch (_) {}
  }

  if (client && connectionStatus === "ready") {
    return;
  }

  await waitForClientReady();

  if (!client || connectionStatus !== "ready") {
    throw new Error(
      "WhatsApp client is not ready yet. Wait a few seconds and try again."
    );
  }
}

async function ensureWhatsAppReady() {
  try {
    await ensureClientReady();
    return getStatus();
  } catch (error) {
    if (connectionStatus === "qr_ready") {
      throw new Error(
        "WhatsApp is not connected yet. Please scan the QR code from admin settings first."
      );
    }

    if (connectionStatus === "auth_failure") {
      throw new Error(
        "WhatsApp authentication failed. Please reconnect WhatsApp from admin settings."
      );
    }

    throw error;
  }
}

async function getQrCode() {
  return {
    status: connectionStatus,
    qrText: latestQrText,
    qrImage: latestQrImage,
  };
}

async function logoutWhatsApp() {
  manualLogout = true;
  clearReconnectTimer();

  if (!client) {
    connectionStatus = "idle";
    authenticated = false;
    latestQrText = null;
    latestQrImage = null;
    connectedNumber = null;
    clearStaleWhatsAppSession();
    return { success: true, status: connectionStatus };
  }

  try {
    await client.logout();
  } catch (_) {}

  try {
    await client.destroy();
  } catch (_) {}

  client = null;
  initializingPromise = null;
  latestQrText = null;
  latestQrImage = null;
  latestError = null;
  connectionStatus = "idle";
  authenticated = false;
  connectedNumber = null;
  clearStaleWhatsAppSession();

  return { success: true, status: connectionStatus };
}

async function resetClientSession() {
  manualLogout = false;
  clearReconnectTimer();

  if (client) {
    try {
      await client.destroy();
    } catch (_) {}
  }

  client = null;
  initializingPromise = null;
  latestQrText = null;
  latestQrImage = null;
  latestError = null;
  authenticated = false;
  connectedNumber = null;
  connectionStatus = "idle";
}

function startWhatsAppAutoInit() {
  if (!AUTO_INIT) {
    return;
  }

  scheduleReconnect("server_boot");
}

async function resolveChatId(phone) {
  await ensureClientReady();

  const normalizedPhone = normalizeWhatsAppPhone(phone);
  const numberId = await client.getNumberId(normalizedPhone);

  if (!numberId?._serialized) {
    throw new Error("This number does not appear to have WhatsApp");
  }

  return {
    phone: normalizedPhone,
    chatId: numberId._serialized,
  };
}

async function sendWhatsAppText(phone, message) {
  if (!message || !String(message).trim()) {
    throw new Error("Message is required");
  }

  const trySend = async () => {
    const { phone: normalizedPhone, chatId } = await resolveChatId(phone);
    const sentMessage = await client.sendMessage(chatId, String(message).trim());

    return {
      to: normalizedPhone,
      messageId: sentMessage?.id?._serialized || null,
      timestamp: sentMessage?.timestamp || null,
      status: "sent",
    };
  };

  try {
    return await trySend();
  } catch (error) {
    if (!isDetachedFrameError(error)) {
      throw error;
    }

    latestError = `Recovering WhatsApp session after detached frame: ${error.message}`;
    await resetClientSession();
    await initWhatsAppClient();
    await ensureClientReady();
    return trySend();
  }
}

module.exports = {
  ensureWhatsAppReady,
  getQrCode,
  getStatus,
  initWhatsAppClient,
  logoutWhatsApp,
  normalizeWhatsAppPhone,
  sendWhatsAppText,
  startWhatsAppAutoInit,
};
