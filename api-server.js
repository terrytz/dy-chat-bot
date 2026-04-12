// api-server.js — HTTP API server injected into the Electron preload context.
// Exposes the 抖音聊天 IM SDK over HTTP on 127.0.0.1:3456.
// This file is copied into the app.asar by inject.sh and loaded via preload.js.

const http = require("http");
const { ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = 3456;
const HOST = "127.0.0.1";

// ---------------------------------------------------------------------------
// Image cache directory
// ---------------------------------------------------------------------------
const IMAGE_DIR = path.join(
  os.homedir(),
  "Library/Application Support/抖音聊天/image"
);

// ---------------------------------------------------------------------------
// New-message buffer (ring buffer, capped at 2000 entries)
// ---------------------------------------------------------------------------
const MAX_BUFFER = 2000;
let msgBuffer = [];

function bufferMessage(msg) {
  msgBuffer.push({ data: msg, receivedAt: Date.now() });
  if (msgBuffer.length > MAX_BUFFER) {
    msgBuffer = msgBuffer.slice(-MAX_BUFFER);
  }
}

// ---------------------------------------------------------------------------
// IPC listeners — buffer incoming messages for the poll endpoint
// ---------------------------------------------------------------------------
function setupListeners() {
  ipcRenderer.on("onNewMessage", (_event, args) => {
    try {
      const payload = Array.isArray(args) ? args[0] : args;
      if (!payload) return;
      const messages = Array.isArray(payload) ? payload : [payload];
      for (const m of messages) bufferMessage(m);
    } catch {
      // ignore parse errors
    }
  });

  ipcRenderer.on("onUpsertMessage", (_event, args) => {
    try {
      const payload = Array.isArray(args) ? args[0] : args;
      if (!payload) return;
      const messages = Array.isArray(payload) ? payload : [payload];
      for (const m of messages) {
        // Only buffer messages we haven't already seen
        const id = m.serverId || m.clientMsgId || m.clientId;
        if (id && !msgBuffer.some((b) => {
          const bid = b.data.serverId || b.data.clientMsgId || b.data.clientId;
          return bid === id;
        })) {
          bufferMessage(m);
        }
      }
    } catch {
      // ignore
    }
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseUrl(url) {
  const idx = url.indexOf("?");
  const pathname = idx >= 0 ? url.slice(0, idx) : url;
  const params = new URLSearchParams(idx >= 0 ? url.slice(idx + 1) : "");
  return { pathname, params };
}

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function parseContent(msg) {
  if (!msg) return msg;
  const out = { ...msg };
  if (typeof out.content === "string") {
    try {
      out.parsedContent = JSON.parse(out.content);
    } catch {
      out.parsedContent = {};
    }
  } else {
    out.parsedContent = out.content || {};
  }
  return out;
}

/** Find an image file in the cache directory by md5 prefix. */
function findImageFile(md5) {
  if (!md5 || !fs.existsSync(IMAGE_DIR)) return null;
  // Prefer large, then any match
  const variants = ["_large", "_thumb", ""];
  const exts = [".heic", ".webp", ".jpg", ".jpeg", ".png"];
  for (const v of variants) {
    for (const ext of exts) {
      const candidate = path.join(IMAGE_DIR, `${md5}${v}${ext}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  // Fallback: scan directory for any file starting with md5
  try {
    const files = fs.readdirSync(IMAGE_DIR);
    const match = files.find((f) => f.startsWith(md5));
    if (match) return path.join(IMAGE_DIR, match);
  } catch {
    // ignore
  }
  return null;
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".gif": "image/gif",
  };
  return map[ext] || "application/octet-stream";
}

function imageFormatFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".heic") return "heic";
  if (ext === ".webp") return "webp";
  if (ext === ".png") return "png";
  return "jpeg";
}

// ---------------------------------------------------------------------------
// Read POST body
// ---------------------------------------------------------------------------
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------
async function handleRequest(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  const { pathname, params } = parseUrl(req.url);

  try {
    // ---- Health ----
    if (pathname === "/health") {
      return json(res, { ok: true, version: "2.0.0", injected: true });
    }

    // ---- Current user ----
    if (pathname === "/api/user") {
      const data = await ipcRenderer.invoke("getLocalUser");
      return json(res, { ok: true, data });
    }

    // ---- Conversations ----
    if (pathname === "/api/conversations") {
      const data = await ipcRenderer.invoke("getUserAllConversationList");
      // data is an array of conversation objects
      return json(res, { ok: true, data });
    }

    // ---- Contacts ----
    if (pathname === "/api/contacts") {
      const data = await ipcRenderer.invoke("getContactFirends");
      return json(res, { ok: true, data });
    }

    // ---- Messages ----
    if (pathname === "/api/messages") {
      const convId = params.get("convId");
      if (!convId) return json(res, { ok: false, error: "convId required" }, 400);
      const limit = parseInt(params.get("limit") || "20", 10);
      const cursor = params.get("cursor") || null;

      const result = await ipcRenderer.invoke("getMessages", {
        conversationId: convId,
        cursor,
        older: true,
        pageSize: limit,
        includeCurrent: false,
      });

      const messages = (result?.messages || []).map(parseContent);
      return json(res, {
        ok: true,
        data: { messages, hasPre: !!result?.hasPre },
      });
    }

    // ---- Poll new messages ----
    if (pathname === "/api/new-messages") {
      const since = parseInt(params.get("since") || "0", 10);
      const filtered = msgBuffer.filter((m) => m.receivedAt > since);
      return json(res, {
        ok: true,
        data: filtered.map((m) => ({ data: parseContent(m.data) })),
        ts: Date.now(),
      });
    }

    // ---- Conversation detail ----
    if (pathname === "/api/conv") {
      const convId = params.get("convId");
      if (!convId) return json(res, { ok: false, error: "convId required" }, 400);

      const results = await Promise.allSettled([
        ipcRenderer.invoke("fetchOrUpdateConversation", convId),
        ipcRenderer.invoke("getConversationMembers", convId, true),
      ]);
      const conv = results[0].status === "fulfilled" ? results[0].value : null;
      const members = results[1].status === "fulfilled" ? results[1].value : [];
      return json(res, { ok: true, data: { conversation: conv, members } });
    }

    // ---- Image ----
    if (pathname === "/api/image") {
      const md5 = params.get("md5");
      if (!md5) return json(res, { ok: false, error: "md5 required" }, 400);

      // 1. Try getImageLocalPath IPC
      let localPath = null;
      try {
        const variant = params.get("variant") || "large";
        localPath = await ipcRenderer.invoke("getImageLocalPath", md5, variant);
        if (localPath && !fs.existsSync(localPath)) localPath = null;
      } catch {
        localPath = null;
      }

      // 2. Search the image cache directory
      if (!localPath) {
        localPath = findImageFile(md5);
      }

      if (localPath && fs.existsSync(localPath)) {
        const imageData = fs.readFileSync(localPath);
        const format = imageFormatFor(localPath);
        res.writeHead(200, {
          "Content-Type": contentTypeFor(localPath),
          "Content-Length": imageData.length,
          "X-Image-Format": format,
          "Access-Control-Allow-Origin": "*",
        });
        return res.end(imageData);
      }

      return json(res, { ok: false, error: "Image not found in local cache" }, 404);
    }

    // ---- Send message ----
    if (pathname === "/api/send" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const { convId, text } = body;
      if (!convId || !text) {
        return json(res, { ok: false, error: "convId and text required" }, 400);
      }

      const msgObj = {
        type: 7, // TEXT
        conversationId: convId,
        conversationShortId: convId,
        content: JSON.stringify({ text }),
      };

      // Create local message first (optimistic), then send
      let clientMsgId = null;
      try {
        const localResult = await ipcRenderer.invoke(
          "createLocalMessage",
          msgObj,
          [],
          null,
          {},
          {}
        );
        clientMsgId = localResult?.clientMsgId;
        if (clientMsgId) msgObj.clientId = clientMsgId;
      } catch {
        // createLocalMessage is optional; sendMessage may still work
      }

      const sendResult = await ipcRenderer.invoke(
        "sendMessage",
        msgObj,
        false, // resend
        [],    // mentionUsers
        undefined, // reference
        undefined, // ext
        undefined  // monitorInfo
      );

      return json(res, { ok: true, data: sendResult });
    }

    // ---- Search ----
    if (pathname === "/api/search") {
      const query = params.get("query") || params.get("q");
      if (!query) return json(res, { ok: false, error: "query required" }, 400);
      const result = await ipcRenderer.invoke("combinedSearch", query, {});
      return json(res, { ok: true, data: result });
    }

    // ---- WebSocket status ----
    if (pathname === "/api/ws-status") {
      const data = await ipcRenderer.invoke("getWsStatus");
      return json(res, { ok: true, data });
    }

    // ---- Raw IPC passthrough (for debugging) ----
    if (pathname.startsWith("/api/raw/")) {
      const method = pathname.slice("/api/raw/".length);
      if (!method) return json(res, { ok: false, error: "method required" }, 400);

      let args = [];
      if (req.method === "POST") {
        try {
          args = JSON.parse(await readBody(req));
          if (!Array.isArray(args)) args = [args];
        } catch {
          args = [];
        }
      }

      const result = await ipcRenderer.invoke(method, ...args);
      return json(res, { ok: true, data: result });
    }

    // ---- 404 ----
    json(res, { ok: false, error: `Not found: ${pathname}` }, 404);
  } catch (err) {
    console.error("[dy-api] Error handling", pathname, err);
    json(res, { ok: false, error: String(err?.message || err) }, 500);
  }
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------
let serverInstance = null;

function startServer(attempt = 0) {
  const server = http.createServer(handleRequest);
  serverInstance = server;

  server.listen(PORT, HOST, () => {
    console.log(`[dy-api] HTTP API server running on http://${HOST}:${PORT}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      if (attempt < 5) {
        console.warn(
          `[dy-api] Port ${PORT} in use, retrying in ${(attempt + 1) * 2}s...`
        );
        setTimeout(() => startServer(attempt + 1), (attempt + 1) * 2000);
      } else {
        console.error("[dy-api] Port still in use after 5 attempts, giving up.");
      }
    } else {
      console.error("[dy-api] Server error:", err);
    }
  });
}

// ---------------------------------------------------------------------------
// SDK initialization — ensure the native IM SDK is ready
// ---------------------------------------------------------------------------
let sdkReady = false;

async function ensureSdk() {
  if (sdkReady) return;
  try {
    // Trigger SDK init (idempotent — safe if already initialized)
    await ipcRenderer.invoke("initsdk");
    sdkReady = true;
  } catch {
    // SDK may already be initialized; test with a lightweight call
    try {
      await ipcRenderer.invoke("getWsStatus");
      sdkReady = true;
    } catch {
      // Still not ready
    }
  }
}

// Listen for data-init-finish from main process (signals SDK is ready)
ipcRenderer.on("onDataInitFinish", () => {
  sdkReady = true;
  console.log("[dy-api] SDK data init finished — API fully operational");
});

// Periodically try to initialize until ready
function pollSdkReady() {
  if (sdkReady) return;
  ensureSdk().finally(() => {
    if (!sdkReady) setTimeout(pollSdkReady, 3000);
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
setupListeners();
startServer();

// Delay SDK init slightly to let the main process finish loading
setTimeout(pollSdkReady, 2000);
