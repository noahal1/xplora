/**
 * Xplora 快添 — Popup Script
 *
 * Manages server URL & API token configuration.
 */

const $ = (sel) => document.querySelector(sel);

// ── Load saved config ───────────────────────────────────────────────

chrome.storage.sync.get(["serverUrl", "apiToken"], (result) => {
  if (result.serverUrl) $("#serverUrl").value = result.serverUrl;
  if (result.apiToken) $("#apiToken").value = result.apiToken;
});

// ── Save config ──────────────────────────────────────────────────────

$("#saveBtn").addEventListener("click", async () => {
  const serverUrl = $("#serverUrl").value.trim().replace(/\/+$/, "");
  const apiToken = $("#apiToken").value.trim();
  const status = $("#status");

  if (!serverUrl) {
    showStatus("请输入服务器地址", "error");
    return;
  }
  if (!apiToken) {
    showStatus("请输入 API Token", "error");
    return;
  }

  await chrome.storage.sync.set({ serverUrl, apiToken });
  showStatus("✅ 已保存", "success");
});

function showStatus(msg, type) {
  const el = $("#status");
  el.textContent = msg;
  el.className = `status ${type}`;
  if (type === "success") {
    setTimeout(() => (el.textContent = ""), 3000);
  }
}

// ── Test connection ──────────────────────────────────────────────────

$("#testBtn").addEventListener("click", async (e) => {
  e.preventDefault();
  const serverUrl = $("#serverUrl").value.trim().replace(/\/+$/, "");
  const apiToken = $("#apiToken").value.trim();
  const status = $("#status");

  if (!serverUrl || !apiToken) {
    showStatus("请先填写服务器地址和 Token", "error");
    return;
  }

  $("#testBtn").textContent = "测试中...";

  try {
    const res = await fetch(`${serverUrl}/api/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Also verify token by fetching user info
    const meRes = await fetch(`${serverUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (!meRes.ok) throw new Error("Token 无效或已过期");

    const me = await meRes.json();
    showStatus(
      `✅ 连接成功 — ${data.database} · 用户: ${me.username}`,
      "success"
    );
  } catch (err) {
    showStatus(`❌ ${err.message}`, "error");
  } finally {
    $("#testBtn").textContent = "测试连接";
  }
});
