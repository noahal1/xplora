/**
 * Xplora 快添 — Background Service Worker
 *
 * Handles:
 * - Right-click context menu on text selection
 * - API calls to Xplora backend (search + add to wishlist)
 * - Communication with content scripts
 */

// ── Helpers ─────────────────────────────────────────────────────────

async function getConfig() {
  const { serverUrl, apiToken } = await chrome.storage.sync.get([
    "serverUrl",
    "apiToken",
  ]);
  return { serverUrl: serverUrl || "", apiToken: apiToken || "" };
}

async function apiRequest(method, path, body, params) {
  const { serverUrl, apiToken } = await getConfig();
  if (!serverUrl || !apiToken) throw new Error("请先在扩展设置中配置服务器地址和 Token");

  const base = serverUrl.replace(/\/+$/, "");
  let url = `${base}${path}`;
  if (params) {
    url += "?" + new URLSearchParams(params).toString();
  }

  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (res.status === 401) throw new Error("Token 已过期，请在设置中更新");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
  return res.json();
}

function apiGet(path, params) { return apiRequest("GET", path, undefined, params); }
function apiPost(path, body) { return apiRequest("POST", path, body); }

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
  });
}

// ── Context Menu ────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "search-xplora",
    title: "搜索并添加到 Xplora 想看列表",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "search-xplora") return;
  const query = (info.selectionText || "").trim();
  if (!query) return;

  try {
    notify("Xplora", `正在搜索「${query}」...`);

    // Search via Xplora API
    const data = await apiGet("/api/media/search", { q: query, source: "tmdb" });
    const results = data.results || [];

    if (results.length === 0) {
      notify("Xplora", `未找到「${query}」的相关结果`);
      return;
    }

    // Pick the best match (first result)
    const best = results[0];
    const title = best.title || query;
    const year = best.year || null;

    // Add to wishlist
    await apiPost("/api/wishlist", {
      title,
      year,
      genre: (best.genre || []).join(", "),
    });

    notify("Xplora ✅", `已添加「${title}」到想看列表`);
  } catch (err) {
    notify("Xplora ❌", err.message);
  }
});

// ── Message Handler (from content scripts) ──────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "addToWishlist") {
    const { title, year, genre } = request;
    apiPost("/api/wishlist", { title, year, genre: genre || "" })
      .then(() => {
        sendResponse({ success: true, title });
        notify("Xplora ✅", `已添加「${title}」到想看列表`);
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
        notify("Xplora ❌", err.message);
      });
    return true; // keep channel open for async response
  }

  if (request.action === "addAsWatched") {
    const { title, year, genre } = request;
    apiPost("/api/media", { title, year, genre: genre || "" })
      .then(() => {
        sendResponse({ success: true, title });
        notify("Xplora ✅", `已添加「${title}」到已看列表`);
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
        notify("Xplora ❌", err.message);
      });
    return true;
  }

  if (request.action === "searchAndAdd") {
    const { query } = request;
    apiGet("/api/media/search", { q: query, source: "tmdb" })
      .then(async (data) => {
        const results = data.results || [];
        if (results.length === 0) throw new Error(`未找到「${query}」`);
        const best = results[0];
        await apiPost("/api/wishlist", {
          title: best.title,
          year: best.year || null,
          genre: (best.genre || []).join(", "),
        });
        sendResponse({ success: true, title: best.title });
        notify("Xplora ✅", `已添加「${best.title}」到想看列表`);
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
        notify("Xplora ❌", err.message);
      });
    return true;
  }
});
