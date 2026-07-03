/**
 * Xplora 快添 — Content Script
 *
 * Detects TMDB, IMDb, and Douban movie/TV pages and injects an
 * "添加到 Xplora" button with "想看" / "已看" options.
 */

(function () {
  "use strict";

  const HOST = location.hostname;

  // ── Page detection ──────────────────────────────────────────────────

  function detectPage() {
    // TMDB movie: themoviedb.org/movie/12345-title
    const tmdbMatch = location.pathname.match(
      /^\/(movie|tv)\/(\d+)/i
    );
    if (HOST.includes("themoviedb.org") && tmdbMatch) {
      return {
        type: "tmdb",
        mediaType: tmdbMatch[1].toLowerCase(), // "movie" | "tv"
        id: tmdbMatch[2],
      };
    }

    // IMDb: imdb.com/title/tt1234567
    const imdbMatch = location.pathname.match(/\/title\/(tt\d+)/i);
    if (HOST.includes("imdb.com") && imdbMatch) {
      return { type: "imdb", id: imdbMatch[1] };
    }

    // Douban: movie.douban.com/subject/12345678
    const doubanMatch = location.pathname.match(/\/subject\/(\d+)/);
    if (HOST.includes("douban.com") && doubanMatch) {
      return { type: "douban", id: doubanMatch[1] };
    }

    return null;
  }

  // ── Extract title & year ────────────────────────────────────────────
  // Strategy: structured meta tags > page-specific selectors > generic fallback

  function fromMeta() {
    // Open Graph / Twitter Card meta tags — most reliable cross-site
    const ogTitle =
      document.querySelector('meta[property="og:title"]')?.content ||
      document.querySelector('meta[name="twitter:title"]')?.content ||
      "";
    const ogDesc =
      document.querySelector('meta[property="og:description"]')?.content ||
      "";
    // Try to extract year from og:description (common pattern: "2024 · Drama · 2h 30m")
    const yearMatch = ogDesc.match(/(\d{4})\s*[·\-–—]/);
    // Clean common suffixes like " - IMDb", " - TMDB", " | 豆瓣电影"
    const cleaned = ogTitle.trim().replace(/\s*[-–—|]\s*(IMDb|TMDB|豆瓣).*$/i, "").trim();
    return { title: cleaned, year: yearMatch ? parseInt(yearMatch[1], 10) : null };
  }

  function fromLdJson() {
    // JSON-LD structured data — used by TMDB, IMDb, many others
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data.name) {
          const year =
            data.datePublished
              ? new Date(data.datePublished).getFullYear()
              : null;
          return { title: data.name.trim(), year };
        }
      } catch { /* skip invalid JSON */ }
    }
    return null;
  }

  function extractInfo(page) {
    // 1st priority: structured meta tags
    const meta = fromMeta();
    if (meta.title && meta.title.length > 1) {
      // Clean up: remove year in parentheses from title
      const cleaned = meta.title.replace(/\(\d{4}\)/g, "").trim();
      return { title: cleaned, year: meta.year };
    }

    // 2nd priority: JSON-LD
    const ld = fromLdJson();
    if (ld) return ld;

    // 3rd priority: site-specific selectors
    if (page.type === "tmdb") {
      const titleEl =
        document.querySelector(
          'h2 a[href^="/movie"], h2 a[href^="/tv"]'
        ) ||
        document.querySelector("h1") ||
        document.querySelector('[data-testid="title"]');
      const title = titleEl?.textContent?.trim() || "";

      const yearEl = document.querySelector(
        'span[data-testid="year"], .header_year, h2 span'
      );
      const yearText = yearEl?.textContent?.trim() || "";
      const year = parseInt(yearText, 10) || null;

      return { title: title.replace(/\((\d{4})\)/g, "").trim(), year };
    }

    if (page.type === "imdb") {
      const titleEl =
        document.querySelector('h1[data-testid="hero__pageTitle"]') ||
        document.querySelector("h1");
      const title = titleEl?.textContent?.trim() || "";

      const yearEl = document.querySelector(
        '[data-testid="hero-title-block__metadata"] .ipc-inline-list__item:first-child a'
      );
      const year = yearEl
        ? parseInt(yearEl.textContent.trim(), 10)
        : null;

      return { title: title.replace(/\((\d{4})\)/g, "").trim(), year };
    }

    if (page.type === "douban") {
      const titleEl =
        document.querySelector('h1[property="v:itemreviewed"]') ||
        document.querySelector("#content h1");
      const title = titleEl?.textContent?.trim() || "";

      const yearEl = document.querySelector(
        'span[property="v:initialReleaseDate"]'
      );
      const year = yearEl
        ? new Date(yearEl.getAttribute("content") || yearEl.textContent).getFullYear()
        : null;

      return { title: title.replace(/\s*\(.*\)\s*$/, "").trim(), year };
    }

    return { title: "", year: null };
  }

  // ── Inject button UI ────────────────────────────────────────────────

  function injectButton(page, info) {
    if (!info.title) return;

    // Don't inject if button already exists
    if (document.querySelector(".xplora-btn")) return;

    const container = document.createElement("div");
    container.className = "xplora-btn-container";

    // Find where to inject based on site
    let target;

    if (page.type === "tmdb") {
      target =
        document.querySelector(".header_poster")?.parentNode ||
        document.querySelector(".title_ott_wrapper") ||
        document.querySelector(".header_info") ||
        document.querySelector('[data-testid="title-info-section"]');
    } else if (page.type === "imdb") {
      target =
        document.querySelector(
          '[data-testid="hero-title-block__series-relation"]'
        ) ||
        document.querySelector(".sc-afeae2e2-0 > div:last-child") ||
        document.querySelector('[data-testid="hero-title-block"]');
    } else if (page.type === "douban") {
      target =
        document.querySelector("#info")?.parentNode ||
        document.querySelector(".subjectwrap") ||
        document.querySelector("#content .grid-16-8 .article");
    }

    if (!target) return;

    container.innerHTML = `
      <button class="xplora-btn xplora-wishlist" data-action="wishlist">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
        想看
      </button>
      <button class="xplora-btn xplora-watched" data-action="watched">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        已看
      </button>
    `;

    // ── Insertion ─────────────────────────────────────────────────────
    // Try to insert in a visually appropriate place on each site
    container.style.cssText = `
      display: flex;
      gap: 8px;
      margin: 12px 0;
      flex-wrap: wrap;
    `;

    if (page.type === "tmdb") {
      target.appendChild(container);
    } else if (page.type === "imdb") {
      target.appendChild(container);
    } else if (page.type === "douban") {
      target.appendChild(container);
    }

    // ── Event handlers ────────────────────────────────────────────────
    container.addEventListener("click", async (e) => {
      const btn = e.target.closest(".xplora-btn");
      if (!btn) return;

      const action = btn.dataset.action;
      btn.disabled = true;
      btn.textContent = "添加中...";

      try {
        const result = await chrome.runtime.sendMessage({
          action: action === "watched" ? "addAsWatched" : "addToWishlist",
          title: info.title,
          year: info.year,
          genre: "",
        });

        if (result.success) {
          btn.textContent = "✅ 已添加";
          btn.classList.add("xplora-added");
        } else {
          btn.textContent = "❌ 失败";
          setTimeout(() => {
            btn.textContent = action === "watched" ? "已看" : "想看";
            btn.disabled = false;
          }, 2000);
        }
      } catch (err) {
        btn.textContent = "❌ 失败";
        setTimeout(() => {
          btn.textContent = action === "watched" ? "已看" : "想看";
          btn.disabled = false;
        }, 2000);
      }
    });
  }

  // ── Init ────────────────────────────────────────────────────────────

  const page = detectPage();
  if (!page) return;

  // Wait for page content to load (with max retries to avoid infinite loops)
  let retryCount = 0;
  const MAX_RETRIES = 10;
  const tryInject = () => {
    const info = extractInfo(page);
    if (info.title) {
      injectButton(page, info);
    } else if (retryCount < MAX_RETRIES) {
      retryCount++;
      setTimeout(tryInject, 1000);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryInject);
  } else {
    // For SPAs that update content dynamically (TMDB), observe DOM changes
    tryInject();
    const observer = new MutationObserver(() => {
      if (!document.querySelector(".xplora-btn")) tryInject();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Clean up observer after 10s
    setTimeout(() => observer.disconnect(), 10000);
  }
})();
