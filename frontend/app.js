/** Movie Recommender - Frontend Application */

const API_BASE = "/api";
const REQUEST_TIMEOUT = 60000; // 60 seconds
const PAGE_SIZE = 50;          // Movies per page

// State
let movies = [];
let selectedModel = "deepseek";
let recommendationCount = 5;
let currentPage = 0;
let searchQuery = "";
let ratingFilter = "all"; // "all" | "8-10" | "6-8" | "4-6" | "0-4"
let selectedMovieIds = new Set();
let batchRatingModalActive = false;

// Conversation state (for follow-up chat)
let conversationHistory = [];       // user/assistant messages
let lastRecommendations = [];        // Previous recommendations for context
let isProcessingFollowUp = false;   // Prevent double-send

// DOM Elements
const fileInput = document.getElementById("fileInput");
const uploadArea = document.getElementById("uploadArea");
const selectFileBtn = document.getElementById("selectFileBtn");
const jsonInput = document.getElementById("jsonInput");
const parseBtn = document.getElementById("parseBtn");
const moviesPreview = document.getElementById("moviesPreview");
const movieList = document.getElementById("movieList");
const movieCount = document.getElementById("movieCount");
const generateBtn = document.getElementById("generateBtn");
const resultsSection = document.getElementById("resultsSection");
const resultsGrid = document.getElementById("resultsGrid");
const resultModelBadge = document.getElementById("resultModelBadge");
const sourceInfo = document.getElementById("sourceInfo");
const countValue = document.getElementById("countValue");
const decreaseCount = document.getElementById("decreaseCount");
const increaseCount = document.getElementById("increaseCount");
const showSampleBtn = document.getElementById("showSampleBtn");
const sampleModal = document.getElementById("sampleModal");
const closeModal = document.getElementById("closeModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const loadSampleBtn = document.getElementById("loadSampleBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const exportScreenshotBtn = document.getElementById("exportScreenshotBtn");
const exportGroup = document.getElementById("exportGroup");

// ========== Event Delegation ==========
// Single delegated listeners instead of per-element listeners (avoids 1600+ listeners)

// Remove button delegation
movieList.addEventListener("click", (e) => {
  const removeBtn = e.target.closest(".remove-btn");
  if (!removeBtn) return;

  const id = parseInt(removeBtn.dataset.id);
  movies = movies.filter((m) => m.id !== id);
  const totalFiltered = getFilteredMovies().length;

  // If current page would be empty, go back one page
  if (currentPage > 0 && currentPage >= Math.ceil(totalFiltered / PAGE_SIZE)) {
    currentPage--;
  }
  renderMovies();
  if (movies.length === 0) {
    uploadArea.classList.remove("has-file");
  }
});

// Checkbox delegation — toggle selection
movieList.addEventListener("change", (e) => {
  const checkbox = e.target.closest(".movie-select");
  if (!checkbox) return;
  const id = parseInt(checkbox.dataset.id);
  toggleMovieSelection(id);
});

// Rating edit delegation
movieList.addEventListener("click", (e) => {
  const editable = e.target.closest(".rating-editable");
  if (!editable) return;

  const id = parseInt(editable.dataset.id);
  const movie = movies.find((m) => m.id === id);
  if (!movie) return;

  e.stopPropagation();
  startRatingEdit(editable, movie);
});

// ========== Event Listeners ==========

// Model selection
document.querySelectorAll('input[name="model"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    selectedModel = radio.value;
  });
});

// ========== File Import with Drag-and-Drop ==========

// Drag counter prevents flicker when dragging over child elements
let dragCounter = 0;

selectFileBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});

uploadArea.addEventListener("click", (e) => {
  // Don't trigger if click originated from a nested button
  if (e.target.closest("button")) return;
  fileInput.click();
});

uploadArea.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dragCounter++;
  if (dragCounter === 1) {
    uploadArea.classList.add("drag-over");
    // Show the drag overlay
    showDragOverlay(e);
  }
});

uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();    // Visually show file type validation hint
    const isValid = e.dataTransfer.types.includes("Files");
    uploadArea.classList.toggle("drag-valid", isValid);
});

uploadArea.addEventListener("dragleave", () => {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    uploadArea.classList.remove("drag-over");
    uploadArea.classList.remove("drag-valid");
    hideDragOverlay();
  }
});

uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  dragCounter = 0;
  uploadArea.classList.remove("drag-over");
  uploadArea.classList.remove("drag-valid");
  hideDragOverlay();

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];

    // Show processing animation
    uploadArea.classList.add("processing");
    const processingEl = document.createElement("div");
    processingEl.className = "drop-processing";
    processingEl.innerHTML = `
      <div class="drop-processing-spinner"></div>
      <span>正在读取 ${escapeHtml(file.name)}...</span>
    `;
    uploadArea.appendChild(processingEl);

    // Process after a small delay so user sees the animation
    setTimeout(() => {
      uploadArea.classList.remove("processing");
      const existing = uploadArea.querySelector(".drop-processing");
      if (existing) existing.remove();
      handleFile(file);
    }, 400);
  }
});

// Outside the document — prevent browser default for file drops anywhere
// so users don't accidentally navigate away
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => e.preventDefault());

function showDragOverlay() {
  hideDragOverlay();

  const overlay = document.createElement("div");
  overlay.className = "drag-overlay";

  overlay.innerHTML = `
    <div class="drag-overlay-icon">📥</div>
    <div class="drag-overlay-text">释放鼠标以导入文件</div>
    <div class="drag-overlay-hint">支持 .json 和 .csv 格式文件</div>
    <div class="drag-overlay-badge">JSON <span class="drag-overlay-badge-sep"></span> CSV</div>
  `;

  uploadArea.appendChild(overlay);
}

function hideDragOverlay() {
  const existing = uploadArea.querySelector(".drag-overlay");
  if (existing) existing.remove();
}

fileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) handleFile(e.target.files[0]);
});

// Manual parse
parseBtn.addEventListener("click", parseManualInput);

// Count controls
decreaseCount.addEventListener("click", () => {
  if (recommendationCount > 1) {
    recommendationCount--;
    countValue.textContent = recommendationCount;
  }
});

increaseCount.addEventListener("click", () => {
  if (recommendationCount < 20) {
    recommendationCount++;
    countValue.textContent = recommendationCount;
  }
});

// Generate recommendations
generateBtn.addEventListener("click", generateRecommendations);

// Sample modal
showSampleBtn.addEventListener("click", () => sampleModal.classList.remove("hidden"));
closeModal.addEventListener("click", () => sampleModal.classList.add("hidden"));
closeModalBtn.addEventListener("click", () => sampleModal.classList.add("hidden"));
sampleModal.addEventListener("click", (e) => {
  if (e.target === sampleModal) sampleModal.classList.add("hidden");
});

loadSampleBtn.addEventListener("click", () => {
  const sampleData = [
    { title: "The Shawshank Redemption", rating: 9.3, year: 1994, genre: "Drama" },
    { title: "The Dark Knight", rating: 9.0, year: 2008, genre: "Action / Crime" },
    { title: "Inception", rating: 8.8, year: 2010, genre: "Sci-Fi / Action" },
    { title: "Interstellar", rating: 8.7, year: 2014, genre: "Sci-Fi / Adventure" },
    { title: "Pulp Fiction", rating: 8.9, year: 1994, genre: "Crime / Drama" },
    { title: "Fight Club", rating: 8.8, year: 1999, genre: "Drama / Thriller" },
    { title: "The Matrix", rating: 8.7, year: 1999, genre: "Sci-Fi / Action" },
    { title: "Parasite", rating: 8.5, year: 2019, genre: "Drama / Thriller" },
  ];
  movies = sampleData.map((m, i) => ({ ...m, id: i }));
  currentPage = 0;
  searchQuery = "";
  ratingFilter = "all";
  renderMovies();
  // Auto-save sample data to DB
  setTimeout(() => saveMoviesToDB(), 500);
  sampleModal.classList.add("hidden");
  showToast("已加载示例数据！", "success");
});

// Export buttons
exportJsonBtn.addEventListener("click", exportJSON);
exportScreenshotBtn.addEventListener("click", exportScreenshot);

// Keyboard shortcut: Ctrl+Enter to generate
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !generateBtn.disabled) {
    generateRecommendations();
  }
});

// ========== Functions ==========

function handleFile(file) {
  const name = file.name.toLowerCase();

  if (!name.endsWith(".json") && !name.endsWith(".csv")) {
    showToast("请上传 .json 或 .csv 格式的文件", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      if (name.endsWith(".json")) {
        const data = JSON.parse(e.target.result);
        parseMovies(data);
      } else {
        const text = e.target.result;
        parseCSV(text);
      }
      uploadArea.classList.add("has-file");
      showToast("文件导入成功！共 " + movies.length + " 部电影", "success");
    } catch (err) {
      const fmt = name.endsWith(".csv") ? "CSV" : "JSON";
      showToast(fmt + " 解析失败：" + err.message, "error");
    }
  };
  reader.onerror = () => {
    showToast("文件读取失败", "error");
  };
  reader.readAsText(file);
}

function parseManualInput() {
  const text = jsonInput.value.trim();
  if (!text) {
    showToast("请粘贴 JSON 数据", "error");
    return;
  }

  try {
    const data = JSON.parse(text);
    parseMovies(data);
    showToast("数据解析成功！共 " + movies.length + " 部电影", "success");
  } catch (err) {
    showToast("JSON 解析失败：" + err.message, "error");
  }
}

function parseMovies(data) {
  let items = [];

  if (Array.isArray(data)) {
    items = data;
  } else if (data && typeof data === "object") {
    // Support both "items" (Douban export) and "movies" keys
    items = data.items || data.movies || [];
  }

  if (!Array.isArray(items) || items.length === 0) {
    showToast("未找到电影数据：需要包含 items/movies 数组或直接传入数组", "error");
    return;
  }

  movies = [];
  for (let i = 0; i < items.length; i++) {
    const m = items[i];
    if (!m || (!m.title && !m.name)) continue;

    // Support user_rating (Douban export), rating, and score fields
    let rating = parseFloat(m.user_rating ?? m.rating ?? m.score ?? 0);
    // Handle NaN rating
    rating = isNaN(rating) ? 0 : Math.max(0, Math.min(10, rating));

    movies.push({
      id: i,
      title: m.title || m.name,
      rating: rating,
      year: m.year || null,
      genre: m.genre || null,
    });
  }

  if (movies.length === 0) {
    showToast("未找到有效的电影数据（需要 title 和 rating/user_rating 字段）", "error");
    return;
  }

  // Auto-detect and normalize rating scale (1-5 star -> 0-10)
  normalizeRatingScale();

  currentPage = 0;
  searchQuery = "";
  ratingFilter = "all";
  selectedMovieIds = new Set();
  renderMovies();
}

function parseCSV(text) {
  // Strip BOM (\uFEFF) that Excel often adds to CSV files
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  // Split into lines, trim whitespace, skip empty
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length < 2) {
    throw new Error("CSV 文件至少需要标题行和一行数据");
  }

  // Detect delimiter (comma or semicolon)
  const headerLine = lines[0];
  const delimiter = headerLine.includes(";") ? ";" : ",";

  // Parse header row — handle quoted fields
  const headers = parseCSVLine(headerLine, delimiter).map((h) => h.toLowerCase().replace(/["'\s]/g, ""));

  // Map common column names to our fields
  const columnMap = {
    title: ["title", "name", "movie", "film", "影片名称", "电影名称", "电影名"],
    rating: ["rating", "user_rating", "score", "rate", "评分数", "评分", "豆瓣评分", "我的评分"],
    year: ["year", "date", "年份", "上映年份", "上映日期", "年代"],
    genre: ["genre", "genres", "type", "category", "categories", "类型", "题材", "分类"],
  };

  function findColumn(colName) {
    const aliases = columnMap[colName] || [];
    for (const alias of aliases) {
      const idx = headers.indexOf(alias);
      if (idx !== -1) return idx;
    }
    // Fallback: fuzzy match
    for (let i = 0; i < headers.length; i++) {
      for (const alias of aliases) {
        if (headers[i].includes(alias) || alias.includes(headers[i])) return i;
      }
    }
    return -1;
  }

  const titleIdx = findColumn("title");
  const ratingIdx = findColumn("rating");
  const yearIdx = findColumn("year");
  const genreIdx = findColumn("genre");

  if (titleIdx === -1) {
    throw new Error("CSV 中未找到标题列（需要 title/name/电影名称 等列名）");
  }
  if (ratingIdx === -1) {
    throw new Error("CSV 中未找到评分列（需要 rating/user_rating/评分 等列名）");
  }

  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i], delimiter);
    const title = (fields[titleIdx] || "").trim();
    if (!title) continue;

    let rating = parseFloat((fields[ratingIdx] || "").replace(/[^\d.]/g, ""));
    rating = isNaN(rating) ? 0 : Math.max(0, Math.min(10, rating));

    let year = null;
    if (yearIdx !== -1 && fields[yearIdx]) {
      const raw = fields[yearIdx].trim();
      // Try to extract a 4-digit year
      const yearMatch = raw.match(/(\d{4})/);
      if (yearMatch) year = parseInt(yearMatch[1]);
    }

    let genre = null;
    if (genreIdx !== -1 && fields[genreIdx]) {
      genre = fields[genreIdx].trim();
    }

    items.push({
      id: items.length,
      title: title,
      rating: rating,
      year: year,
      genre: genre,
    });
  }

  if (items.length === 0) {
    throw new Error("CSV 中未找到有效的电影数据");
  }

  movies = items;

  // Auto-detect and normalize rating scale (1-5 star -> 0-10)
  normalizeRatingScale();

  currentPage = 0;
  searchQuery = "";
  ratingFilter = "all";
  selectedMovieIds = new Set();
  renderMovies();
}

/** Parse a single CSV line into fields, handling quoted fields with embedded delimiters/lines */
function parseCSVLine(line, delimiter) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ("")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

function normalizeRatingScale() {
  if (movies.length === 0) return;

  const maxRating = Math.max(...movies.map((m) => m.rating));

  // If max rating is <= 5, assume 1-5 star scale and normalize to 0-10
  if (maxRating <= 5) {
    movies = movies.map((m) => ({
      ...m,
      rating: Math.round(m.rating * 2 * 10) / 10, // round to 1 decimal
    }));
  }
}

function getFilteredMovies() {
  let filtered = movies;

  // Filter by search query
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter((m) => m.title.toLowerCase().includes(q));
  }

  // Filter by rating range
  if (ratingFilter !== "all") {
    const [min, max] = ratingFilter.split("-").map(Number);
    filtered = filtered.filter((m) => m.rating >= min && m.rating <= max);
  }

  return filtered;
}

function renderStars(rating) {
  // Convert 0-10 rating to 0-5 stars, rounded to nearest
  const starCount = Math.round(rating / 2);
  const filled = Math.max(0, Math.min(5, starCount));
  const empty = 5 - filled;

  return (
    '<span class="stars">' +
    '<span class="star-filled">\u2605</span>'.repeat(filled) +
    '<span class="star-empty">\u2605</span>'.repeat(empty) +
    "</span>"
  );
}

// ========== In-Place Rating Editing ==========
// Updates only the clicked DOM element instead of re-rendering all movies

function startRatingEdit(editableEl, movie) {
  const input = document.createElement("input");
  input.type = "number";
  input.className = "rating-edit-input";
  input.value = movie.rating.toFixed(1);
  input.min = 0;
  input.max = 10;
  input.step = 0.5;

  editableEl.textContent = "";
  editableEl.appendChild(input);
  input.focus();
  input.select();

  const save = () => {
    let val = parseFloat(input.value);
    if (isNaN(val)) val = movie.rating;
    val = Math.max(0, Math.min(10, val));
    val = Math.round(val * 10) / 10;

    if (val !== movie.rating) {
      movie.rating = val;
      // In-place DOM update — no full re-render
      updateMovieRatingDOM(movie.id, val);
      showToast("\u5DF2\u66F4\u65B0\u300C" + movie.title + "\u300D\u8BC4\u5206\u4E3A " + val.toFixed(1), "success");
    } else {
      // Restore original display
      editableEl.textContent = movie.rating.toFixed(1);
    }
  };

  input.addEventListener("blur", save);

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      input.blur();
    }
    if (ev.key === "Escape") {
      ev.preventDefault();
      // Restore without saving
      editableEl.textContent = movie.rating.toFixed(1);
    }
  });

  // Prevent click from bubbling and re-triggering the edit
  input.addEventListener("mousedown", (ev) => ev.stopPropagation());
}

function updateMovieRatingDOM(movieId, newRating) {
  const movieTag = document.querySelector(`.movie-tag[data-id="${movieId}"]`);
  if (!movieTag) return;

  const badge = movieTag.querySelector(".rating-badge");
  if (!badge) return;

  // Replace badge content with updated stars + editable number
  badge.innerHTML =
    renderStars(newRating) +
    ' <span class="rating-number rating-editable" data-id="' +
    movieId +
    '" title="点击修改评分">' +
    newRating.toFixed(1) +
    "</span>";
}

// ========== Selection & Batch Editing ==========

function toggleMovieSelection(id) {
  if (selectedMovieIds.has(id)) {
    selectedMovieIds.delete(id);
  } else {
    selectedMovieIds.add(id);
  }
  updateBatchToolbar();
  // Update just this movie tag's visual
  const tag = document.querySelector(`.movie-tag[data-id="${id}"]`);
  if (tag) {
    tag.classList.toggle("selected", selectedMovieIds.has(id));
  }
}

function toggleSelectAll() {
  const filtered = getFilteredMovies();
  const start = currentPage * PAGE_SIZE;
  const pageMovies = filtered.slice(start, start + PAGE_SIZE);

  const allSelected = pageMovies.every((m) => selectedMovieIds.has(m.id));

  if (allSelected) {
    // Deselect all on current page
    pageMovies.forEach((m) => selectedMovieIds.delete(m.id));
  } else {
    // Select all on current page
    pageMovies.forEach((m) => selectedMovieIds.add(m.id));
  }

  // Update visual for current page
  const tags = document.querySelectorAll(".movie-tag");
  tags.forEach((tag) => {
    const id = parseInt(tag.dataset.id);
    if (pageMovies.some((m) => m.id === id)) {
      tag.classList.toggle("selected", selectedMovieIds.has(id));
      const checkbox = tag.querySelector(".movie-select");
      if (checkbox) checkbox.checked = selectedMovieIds.has(id);
    }
  });

  updateBatchToolbar();
}

function batchEditRatings() {
  if (selectedMovieIds.size === 0) return;
  if (batchRatingModalActive) return;
  batchRatingModalActive = true;

  // Create modal overlay
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay batch-rating-modal";

  overlay.innerHTML = `
    <div class="modal batch-rating-modal-content">
      <div class="modal-header">
        <h3>⚡ 批量修改评分</h3>
        <button class="modal-close" id="batchCloseBtn">&times;</button>
      </div>
      <div class="modal-body">
        <p>将 <strong>${selectedMovieIds.size}</strong> 部已选电影的评分全部修改为：</p>
        <div class="batch-rating-slider-group">
          <div class="batch-rating-slider-header">
            <input type="range" class="batch-rating-slider" id="batchRatingSlider"
                   min="0" max="10" step="0.5" value="7.0">
            <span class="batch-rating-value" id="batchRatingValue">7.0</span>
          </div>
          <div class="batch-rating-slider-labels">
            <span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span>
          </div>
        </div>
        <div class="batch-rating-preview">
          <span class="stars-preview" id="starsPreview"></span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="batchApplyBtn">✅ 应用</button>
        <button class="btn btn-outline" id="batchCancelBtn">取消</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const slider = overlay.querySelector("#batchRatingSlider");
  const valueDisplay = overlay.querySelector("#batchRatingValue");
  const starsPreview = overlay.querySelector("#starsPreview");
  const applyBtn = overlay.querySelector("#batchApplyBtn");
  const cancelBtn = overlay.querySelector("#batchCancelBtn");
  const closeBtn = overlay.querySelector("#batchCloseBtn");

  // Live preview of stars on slider drag
  function updateStarsPreview() {
    let val = parseFloat(slider.value);
    if (isNaN(val)) val = 0;
    val = Math.round(val * 10) / 10;
    valueDisplay.textContent = val.toFixed(1);
    starsPreview.innerHTML = renderStars(val) + ` <span style="color:var(--accent-amber);font-size:14px;font-weight:700">${val.toFixed(1)}</span>`;
  }
  slider.addEventListener("input", updateStarsPreview);
  updateStarsPreview();

  function applyBatchRating() {
    let val = parseFloat(slider.value);
    if (isNaN(val)) val = 7.0;
    val = Math.max(0, Math.min(10, val));
    val = Math.round(val * 10) / 10;

    const selectedIds = [...selectedMovieIds];
    let changedCount = 0;

    selectedIds.forEach((id) => {
      const movie = movies.find((m) => m.id === id);
      if (!movie) return;
      if (Math.abs(movie.rating - val) > 0.01) {
        movie.rating = val;
        updateMovieRatingDOM(id, val);
        changedCount++;
      }
    });

    closeModal();
    showToast("已更新 " + changedCount + " 部电影的评分", "success");
  }

  function closeModal() {
    overlay.remove();
    batchRatingModalActive = false;
  }

  applyBtn.addEventListener("click", applyBatchRating);
  cancelBtn.addEventListener("click", closeModal);
  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  // Escape to close
  slider.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
    }
  });

  setTimeout(() => slider.focus(), 100);
}

function ensureBatchToolbar() {
  let toolbar = document.querySelector(".batch-toolbar");
  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.className = "batch-toolbar hidden";

    toolbar.innerHTML = `
      <label class="select-all-label" title="全选/取消全选当前页">
        <input type="checkbox" class="select-all-checkbox" id="selectAllCheckbox">
        <span class="checkbox-custom"></span>
      </label>
      <span class="batch-count" id="batchCount">已选 0 部</span>
      <div class="batch-actions">
        <button class="btn btn-secondary btn-xs" id="batchEditBtn" title="批量修改选中电影的评分">
          ⚡ 修改评分
        </button>
        <button class="btn btn-outline btn-xs" id="batchClearBtn">
          取消选择
        </button>
      </div>
    `;

    // Insert after search bar
    const searchBar = document.querySelector(".movie-search-bar");
    if (searchBar && searchBar.nextSibling) {
      moviesPreview.insertBefore(toolbar, searchBar.nextSibling);
    } else {
      moviesPreview.appendChild(toolbar);
    }

    // Wire up toolbar buttons
    toolbar.querySelector("#selectAllCheckbox").addEventListener("change", toggleSelectAll);
    toolbar.querySelector("#batchEditBtn").addEventListener("click", batchEditRatings);
    toolbar.querySelector("#batchClearBtn").addEventListener("click", () => {
      selectedMovieIds.clear();
      // Uncheck all and remove selected class
      document.querySelectorAll(".movie-tag").forEach((tag) => {
        tag.classList.remove("selected");
        const cb = tag.querySelector(".movie-select");
        if (cb) cb.checked = false;
      });
      updateBatchToolbar();
    });
  }

  updateBatchToolbar();
}

function updateBatchToolbar() {
  const toolbar = document.querySelector(".batch-toolbar");
  if (!toolbar) return;

  const count = selectedMovieIds.size;
  toolbar.classList.toggle("hidden", count === 0);

  const countEl = toolbar.querySelector("#batchCount");
  if (countEl) countEl.textContent = "已选 " + count + " 部";

  // Sync select-all checkbox
  const filtered = getFilteredMovies();
  const start = currentPage * PAGE_SIZE;
  const pageMovies = filtered.slice(start, start + PAGE_SIZE);
  const allSelected = pageMovies.length > 0 && pageMovies.every((m) => selectedMovieIds.has(m.id));
  const selectAllCb = toolbar.querySelector("#selectAllCheckbox");
  if (selectAllCb) {
    selectAllCb.checked = allSelected;
    selectAllCb.indeterminate = count > 0 && !allSelected;
  }

  // Enable/disable batch edit button
  const editBtn = toolbar.querySelector("#batchEditBtn");
  if (editBtn) editBtn.disabled = count === 0;
}

// ========== Rendering ==========

function renderMovies() {
  // Clear any existing pagination and search input
  const existingPagination = document.querySelector(".pagination");
  if (existingPagination) existingPagination.remove();

  // Clear selection for removed movies
  selectedMovieIds = new Set([...selectedMovieIds].filter((id) => movies.some((m) => m.id === id)));

  if (movies.length === 0) {
    moviesPreview.classList.remove("active");
    generateBtn.disabled = true;
    movieList.innerHTML = "";
    return;
  }

  // Filter by search
  const filtered = getFilteredMovies();
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  // Clamp current page
  if (currentPage >= totalPages) currentPage = Math.max(0, totalPages - 1);
  if (currentPage < 0) currentPage = 0;

  const start = currentPage * PAGE_SIZE;
  const pageMovies = filtered.slice(start, start + PAGE_SIZE);

  // Build count text
  let countText = movies.length + " \u90E8";
  if (filtered.length !== movies.length) {
    countText += " (\u5339\u914D " + filtered.length + ")";
  }

  // Show range if paginated
  const showRange = filtered.length > PAGE_SIZE;
  if (showRange) {
    countText +=
      " \u00B7 \u7B2C" +
      (currentPage + 1) +
      "/" +
      totalPages +
      "\u9875";
  }

  // Show no-results message if search has no match
  if (pageMovies.length === 0 && searchQuery) {
    movieList.innerHTML = '<div class="no-results">\u6CA1\u6709\u627E\u5230\u5339\u914D "' + escapeHtml(searchQuery) + '" \u7684\u7535\u5F71</div>';
  } else {
    const isAllSelected = pageMovies.every((m) => selectedMovieIds.has(m.id));
    movieList.innerHTML = pageMovies
    .map(
      (m) => {
        const selected = selectedMovieIds.has(m.id);
        return `
        <div class="movie-tag${selected ? " selected" : ""}" data-id="${m.id}">
          <label class="movie-checkbox-label" title="选择/取消选择">
            <input type="checkbox" class="movie-select" data-id="${m.id}"${selected ? " checked" : ""}>
            <span class="checkbox-custom"></span>
          </label>
          <div class="movie-tag-info">
            <span class="movie-tag-title" title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</span>
            <span class="rating-badge">
              ${renderStars(m.rating)}
              <span class="rating-number rating-editable" data-id="${m.id}" title="点击修改评分">${m.rating.toFixed(1)}</span>
            </span>
          </div>
          <button class="remove-btn" data-id="${m.id}" title="移除">&times;</button>
        </div>
      `;}
    )
    .join("");
  }

  movieCount.textContent = countText;
  moviesPreview.classList.add("active");
  generateBtn.disabled = false;

  // Add/update search bar
  ensureSearchBar();

  // Add/update rating filter
  ensureRatingFilter();

  // Add/update batch action toolbar
  ensureBatchToolbar();

  // Add pagination controls if needed
  if (totalPages > 1) {
    renderPagination(totalPages);
  }
}

function ensureSearchBar() {
  let searchBar = document.querySelector(".movie-search-bar");
  if (!searchBar) {
    searchBar = document.createElement("div");
    searchBar.className = "movie-search-bar";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "movie-search-input";
    input.placeholder = "搜索电影名称...";

    input.addEventListener("input", (e) => {
      searchQuery = e.target.value.trim();
      currentPage = 0;
      renderMovies();
    });

    // Clear button
    const clearBtn = document.createElement("button");
    clearBtn.className = "movie-search-clear hidden";
    clearBtn.textContent = "\u00D7";
    clearBtn.addEventListener("click", () => {
      input.value = "";
      searchQuery = "";
      currentPage = 0;
      renderMovies();
    });

    searchBar.appendChild(input);
    searchBar.appendChild(clearBtn);

    // Insert after preview-header
    const previewHeader = document.querySelector(".preview-header");
    if (previewHeader && previewHeader.nextSibling) {
      moviesPreview.insertBefore(searchBar, previewHeader.nextSibling);
    } else {
      moviesPreview.appendChild(searchBar);
    }

    // Show/hide clear button
    input.addEventListener("input", () => {
      clearBtn.classList.toggle("hidden", !input.value);
    });
  }

  // Sync search input value on re-render (e.g., after import)
  const input = searchBar.querySelector(".movie-search-input");
  if (input && input.value !== searchQuery) {
    input.value = searchQuery;
  }
  const clearBtn = searchBar.querySelector(".movie-search-clear");
  if (clearBtn) {
    clearBtn.classList.toggle("hidden", !searchQuery);
  }
}

// ========== Rating Filter ==========

function ensureRatingFilter() {
  let filterBar = document.querySelector(".rating-filter-bar");
  if (!filterBar) {
    filterBar = document.createElement("div");
    filterBar.className = "rating-filter-bar";

    const options = [
      { value: "all", label: "全部" },
      { value: "8-10", label: "⭐ 8-10 分" },
      { value: "6-8", label: "⭐ 6-8 分" },
      { value: "4-6", label: "⭐ 4-6 分" },
      { value: "0-4", label: "⭐ 0-4 分" },
    ];

    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "rating-filter-btn" + (opt.value === ratingFilter ? " active" : "");
      btn.dataset.value = opt.value;
      btn.textContent = opt.label;

      btn.addEventListener("click", () => {
        if (ratingFilter === opt.value) return;
        ratingFilter = opt.value;
        currentPage = 0;
        renderMovies();
      });

      filterBar.appendChild(btn);
    });

    // Insert after search bar
    const searchBar = document.querySelector(".movie-search-bar");
    if (searchBar && searchBar.nextSibling) {
      moviesPreview.insertBefore(filterBar, searchBar.nextSibling);
    } else {
      moviesPreview.appendChild(filterBar);
    }
  }

  // Sync active button state on re-render
  const btns = filterBar.querySelectorAll(".rating-filter-btn");
  btns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === ratingFilter);
  });
}

// ========== Pagination ==========

function renderPagination(totalPages) {
  const container = document.createElement("div");
  container.className = "pagination";

  // Previous button
  const prevBtn = document.createElement("button");
  prevBtn.className = "page-btn";
  prevBtn.textContent = "\u276E"; // ❮
  prevBtn.disabled = currentPage === 0;
  prevBtn.addEventListener("click", () => {
    if (currentPage > 0) {
      currentPage--;
      renderMovies();
    }
  });
  container.appendChild(prevBtn);

  // Page number window
  const maxVisible = 7;
  let pageStart = Math.max(0, currentPage - Math.floor(maxVisible / 2));
  let pageEnd = Math.min(totalPages, pageStart + maxVisible);

  if (pageEnd - pageStart < maxVisible) {
    pageStart = Math.max(0, pageEnd - maxVisible);
  }

  // First page + ellipsis
  if (pageStart > 0) {
    container.appendChild(createPageBtn(0));
    if (pageStart > 1) {
      const dots = document.createElement("span");
      dots.className = "page-dots";
      dots.textContent = "\u2026"; // …
      container.appendChild(dots);
    }
  }

  // Page numbers in range
  for (let i = pageStart; i < pageEnd; i++) {
    container.appendChild(createPageBtn(i));
  }

  // Last page + ellipsis
  if (pageEnd < totalPages) {
    if (pageEnd < totalPages - 1) {
      const dots = document.createElement("span");
      dots.className = "page-dots";
      dots.textContent = "\u2026"; // …
      container.appendChild(dots);
    }
    container.appendChild(createPageBtn(totalPages - 1));
  }

  // Next button
  const nextBtn = document.createElement("button");
  nextBtn.className = "page-btn";
  nextBtn.textContent = "\u276F"; // ❯
  nextBtn.disabled = currentPage === totalPages - 1;
  nextBtn.addEventListener("click", () => {
    if (currentPage < totalPages - 1) {
      currentPage++;
      renderMovies();
    }
  });
  container.appendChild(nextBtn);

  // Page info
  const info = document.createElement("span");
  info.className = "page-info";
  info.textContent =
    (currentPage * PAGE_SIZE + 1) +
    "-" +
    Math.min((currentPage + 1) * PAGE_SIZE, getFilteredMovies().length);
  container.appendChild(info);

  movieList.after(container);
}

function createPageBtn(pageIndex) {
  const btn = document.createElement("button");
  btn.className = "page-btn" + (pageIndex === currentPage ? " active" : "");
  btn.textContent = pageIndex + 1;
  btn.addEventListener("click", () => {
    currentPage = pageIndex;
    renderMovies();
    // Scroll movie list into view
    movieList.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  return btn;
}

// ========== Conversation / Follow-up Chat ==========

function sendFollowUp() {
  const input = document.querySelector(".followup-input");
  if (!input) return;
  const text = input.value.trim();
  if (!text || isProcessingFollowUp) return;

  input.value = "";
  isProcessingFollowUp = true;

  // Add user message to chat
  addChatMessage("user", text);
  conversationHistory.push({ role: "user", content: text });

  // Show typing indicator
  const typingEl = document.createElement("div");
  typingEl.className = "chat-message assistant typing";
  typingEl.innerHTML =
    '<div class="chat-avatar">🤖</div><div class="chat-bubble"><span class="typing-dots">思考中<span>.</span><span>.</span><span>.</span></span></div>';
  document.querySelector(".chat-messages").appendChild(typingEl);
  const chatArea = document.querySelector(".chat-area");
  if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  (async () => {
    try {
      const response = await fetch(API_BASE + "/recommend/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movies: movies.map((m) => ({
            title: m.title,
            rating: m.rating,
            year: m.year,
            genre: m.genre,
          })),
          previous_recommendations: lastRecommendations,
          conversation: conversationHistory.slice(0, -1), // exclude current question
          question: text,
          model: selectedModel,
          count: Math.min(3, recommendationCount),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: "服务器错误" }));
        throw new Error(err.detail || "请求失败");
      }

      // Remove typing indicator
      typingEl.remove();

      // Add a placeholder assistant message for streaming
      const msgEl = document.createElement("div");
      msgEl.className = "chat-message assistant";
      msgEl.innerHTML =
        '<div class="chat-avatar">🤖</div><div class="chat-bubble"></div>';
      document.querySelector(".chat-messages").appendChild(msgEl);
      const bubble = msgEl.querySelector(".chat-bubble");

      let accumulatedText = "";
      let finalResult = null;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const eventBlock of events) {
          const lines = eventBlock.split("\n");
          let eventType = "message";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              eventData = line.slice(6).trim();
            }
          }

          if (!eventData) continue;

          try {
            const data = JSON.parse(eventData);

            switch (eventType) {
              case "chunk":
                accumulatedText += data.text || "";
                // Show text progressively as it arrives
                bubble.textContent = accumulatedText;
                // Auto-scroll chat
                const chatArea = document.querySelector(".chat-area");
                if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
                break;

              case "result":
                finalResult = data;
                break;

              case "error":
                throw new Error(data.message);
            }
          } catch (e) {
            // Skip
          }
        }
      }

      // Final result handling
      if (finalResult) {
        if (finalResult.type === "recommendations") {
          // Display message + create recommendation cards
          bubble.textContent = finalResult.message || "";

          // Add new cards for each recommendation
          if (finalResult.recommendations) {
            finalResult.recommendations.forEach((rec) => {
              const cardRec = {
                title: rec.title,
                year: rec.year,
                genre: rec.genre,
                reason: rec.reason,
                confidence: rec.confidence || 0.7,
              };
              appendRecommendation(cardRec);
              lastRecommendations.push({
                title: rec.title,
                year: rec.year,
                genre: rec.genre,
                reason: rec.reason,
                confidence: rec.confidence || 0.7,
              });
            });
          }

          // Store assistant message in conversation
          conversationHistory.push({
            role: "assistant",
            content: finalResult.message || "",
          });
        } else {
          // Plain text response
          bubble.textContent = finalResult.message || "";
          conversationHistory.push({
            role: "assistant",
            content: finalResult.message || "",
          });
        }
      } else if (accumulatedText.trim()) {
        // Fallback: use raw accumulated text
        bubble.textContent = accumulatedText.trim();
        conversationHistory.push({
          role: "assistant",
          content: accumulatedText.trim(),
        });
      } else {
        bubble.textContent = "抱歉，我没有理解你的问题，请换个方式试试。";
        conversationHistory.push({
          role: "assistant",
          content: "抱歉，我没有理解你的问题，请换个方式试试。",
        });
      }
    } catch (err) {
      if (err.name === "AbortError") {
        showToast("请求超时，请稍后重试", "error");
      } else {
        showToast("出错了：" + err.message, "error");
      }
      // Remove typing indicator if still there
      if (typingEl.parentNode) typingEl.remove();
    } finally {
      clearTimeout(timeoutId);
      isProcessingFollowUp = false;
      // Scroll chat to bottom
      const chatArea = document.querySelector(".chat-area");
      if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
    }
  })();
}

function addChatMessage(role, content) {
  const container = document.querySelector(".chat-messages");
  if (!container) return;

  const el = document.createElement("div");
  el.className = "chat-message " + role;
  el.innerHTML =
    '<div class="chat-avatar">' +
    (role === "user" ? "👤" : "🤖") +
    '</div><div class="chat-bubble">' +
    escapeHtml(content) +
    "</div>";
  container.appendChild(el);

  // Scroll to bottom
  const chatArea = document.querySelector(".chat-area");
  if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
}

// ========== Recommendations ==========

async function generateRecommendations() {
  if (movies.length < 2) {
    showToast("请至少导入 2 部电影以获得更好的推荐", "error");
    return;
  }

  // Show loading state
  generateBtn.disabled = true;
  const btnText = generateBtn.querySelector(".btn-text");
  const btnLoading = generateBtn.querySelector(".btn-loading");
  btnText.classList.add("hidden");
  btnLoading.classList.remove("hidden");

  // Hide export buttons while regenerating
  exportGroup.classList.add("hidden");

  // Hide & reset previous results
  resultsSection.classList.add("hidden");
  resultsGrid.innerHTML = `<div class="stream-placeholder">
    <div class="stream-pulse"></div>
    <p class="stream-waiting">AI 正在分析你的观影记录...</p>
  </div>`;
  resultsSection.classList.remove("hidden");

  const modelNames = {
    deepseek: "DeepSeek",
    openai: "OpenAI (GPT-4o)",
  };
  resultModelBadge.textContent = modelNames[selectedModel] || selectedModel;

  let totalRecommendations = 0;
  let streamError = null;

  // AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const payload = {
      movies: movies.map((m) => ({
        title: m.title,
        rating: m.rating,
        year: m.year,
        genre: m.genre,
      })),
      model: selectedModel,
      count: recommendationCount,
    };

    const response = await fetch(API_BASE + "/recommend/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: "服务器错误" }));
      throw new Error(err.detail || "请求失败");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const events = buffer.split("\n\n");
      buffer = events.pop() || ""; // Keep incomplete last chunk

      for (const eventBlock of events) {
        const lines = eventBlock.split("\n");
        let eventType = "message";
        let eventData = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            eventData = line.slice(6).trim();
          }
        }

        if (!eventData) continue;

        try {
          const data = JSON.parse(eventData);

          switch (eventType) {
            case "start":
              sourceInfo.textContent =
                "基于 " + data.source_count + " 部已看过的电影，AI 正在为你分析...";
              break;

            case "recommendation":
              appendRecommendation(data);
              totalRecommendations++;
              break;

            case "done":
              sourceInfo.textContent =
                "基于 " + data.source_count + " 部已看过的电影，为你推荐以下 " + totalRecommendations + " 部电影";
              // Remove placeholder if still visible
              const placeholder = resultsGrid.querySelector(".stream-placeholder");
              if (placeholder) placeholder.remove();
              updateEmptyState();
              // Show export buttons
              exportGroup.classList.remove("hidden");

              // Initialize conversation state
              lastRecommendations = [];
              document.querySelectorAll(".rec-card").forEach((card) => {
                const titleEl = card.querySelector(".rec-title");
                const yearEl = card.querySelector(".rec-year");
                const genreEl = card.querySelector(".rec-genre");
                const reasonEl = card.querySelector(".rec-reason");
                const confEl = card.querySelector(".rec-confidence");
                if (titleEl) {
                  lastRecommendations.push({
                    title: titleEl.textContent,
                    year: yearEl ? parseInt(yearEl.textContent) || null : null,
                    genre: genreEl ? genreEl.textContent : null,
                    reason: reasonEl ? reasonEl.textContent : "",
                    confidence: confEl
                      ? parseInt(confEl.textContent) / 100
                      : 0.5,
                  });
                }
              });
              // Reset conversation
              conversationHistory = [];
              // Create chat area below results
              ensureChatArea();
              break;

            case "error":
              streamError = data.message;
              reader.cancel();
              break;
          }
        } catch (e) {
          // Skip invalid JSON events
        }
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      streamError = "请求超时，AI 模型响应时间过长，请稍后重试";
    } else {
      streamError = err.message;
    }
  } finally {
    clearTimeout(timeoutId);
    generateBtn.disabled = false;
    btnText.classList.remove("hidden");
    btnLoading.classList.add("hidden");

    if (streamError) {
      showToast("出错了：" + streamError, "error");
      // Remove placeholder on error too
      const placeholder = resultsGrid.querySelector(".stream-placeholder");
      if (placeholder) placeholder.remove();
      updateEmptyState();
    }
  }
}

function appendRecommendation(rec) {
  // Remove placeholder if first recommendation
  const placeholder = resultsGrid.querySelector(".stream-placeholder");
  if (placeholder) placeholder.remove();

  const card = document.createElement("div");
  card.className = "rec-card stream-new";

  card.innerHTML = `
    <div class="rec-header">
      <span class="rec-title">${escapeHtml(rec.title)}</span>
      <div class="rec-meta">
        ${rec.year ? `<span class="rec-year">${rec.year}</span>` : ""}
        ${rec.genre ? `<span class="rec-genre">${escapeHtml(rec.genre)}</span>` : ""}
        <span class="rec-confidence">${(rec.confidence * 100).toFixed(0)}% 匹配</span>
      </div>
    </div>
    <div class="rec-reason">${escapeHtml(rec.reason)}</div>
  `;

  resultsGrid.appendChild(card);
  resultsGrid.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function updateEmptyState() {
  const hasCards = resultsGrid.querySelectorAll(".rec-card").length > 0;
  const hasPlaceholder = resultsGrid.querySelector(".stream-placeholder") !== null;

  if (!hasCards && !hasPlaceholder) {
    resultsGrid.innerHTML = `<div class="stream-placeholder">
      <p style="color: var(--text-muted); margin-top: 8px;">暂无推荐结果</p>
    </div>`;
  }
}

// ========== Chat Area ==========

function ensureChatArea() {
  let chatArea = document.querySelector(".chat-area");
  if (chatArea) {
    // Already exists — just clear old messages and show
    chatArea.classList.remove("hidden");
    const messages = chatArea.querySelector(".chat-messages");
    if (messages) messages.innerHTML = "";
    return;
  }

  // Create chat area below the results section
  const resultsCard = document.querySelector(".results-section");
  if (!resultsCard) return;

  chatArea = document.createElement("div");
  chatArea.className = "chat-area";

  chatArea.innerHTML = `
    <div class="chat-header">
      <span>💬 继续追问 AI</span>
      <span class="chat-header-hint">可以问「再推荐几部类似的」「为什么推荐这部」等</span>
    </div>
    <div class="chat-messages"></div>
    <div class="chat-input-area">
      <input type="text" class="followup-input" placeholder="输入你的问题，按 Enter 发送..." />
      <button class="btn btn-primary btn-sm followup-send" title="发送">发送</button>
    </div>
  `;

  resultsCard.after(chatArea);

  // Send button handler
  chatArea.querySelector(".followup-send").addEventListener("click", sendFollowUp);

  // Enter key handler
  chatArea.querySelector(".followup-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendFollowUp();
    }
  });

  // Auto-focus the input
  setTimeout(() => {
    chatArea.querySelector(".followup-input").focus();
  }, 300);
}


// ========== Database History Panel ==========

const historyToggle = document.getElementById("historyToggle");
const historySidebar = document.getElementById("historySidebar");
const historyBackdrop = document.getElementById("historyBackdrop");
const historyClose = document.getElementById("historyClose");
const historyContent = document.getElementById("historyContent");

historyToggle.addEventListener("click", () => {
  historySidebar.classList.remove("hidden");
  historyBackdrop.classList.remove("hidden");
  loadHistoryTab("movies");
});

historyClose.addEventListener("click", closeHistory);
historyBackdrop.addEventListener("click", closeHistory);

// Tab switching
historySidebar.addEventListener("click", (e) => {
  const tab = e.target.closest(".history-tab");
  if (!tab) return;
  historySidebar.querySelectorAll(".history-tab").forEach((t) => t.classList.remove("active"));
  tab.classList.add("active");
  loadHistoryTab(tab.dataset.tab);
});

// Keyboard: Escape to close
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !historySidebar.classList.contains("hidden")) {
    closeHistory();
  }
});

function closeHistory() {
  historySidebar.classList.add("hidden");
  historyBackdrop.classList.add("hidden");
}

async function loadHistoryTab(tab) {
  historyContent.innerHTML = `<div class="history-loading"><div class="stream-pulse"></div></div>`;

  if (tab === "movies") {
    await loadSavedMovies();
  } else {
    await loadSavedSessions();
  }
}

async function loadSavedMovies() {
  try {
    const res = await fetch(API_BASE + "/movies");
    if (!res.ok) throw new Error("请求失败");
    const data = await res.json();

    if (data.movies.length === 0) {
      historyContent.innerHTML = `<div class="history-empty">
        <p>📭 还没有保存的电影数据</p>
        <p class="history-empty-hint">导入电影并生成推荐后，电影将自动保存</p>
      </div>`;
      return;
    }

    historyContent.innerHTML = `
      <div class="history-stats">共 ${data.total} 部已保存的电影</div>
      <div class="history-list" id="historyMovieList"></div>
    `;

    const list = document.getElementById("historyMovieList");
    data.movies.forEach((m) => {
      const item = document.createElement("div");
      item.className = "history-item";
      item.innerHTML = `
        <div class="history-item-info">
          <span class="history-item-title">${escapeHtml(m.title)}</span>
          <span class="history-item-meta">
            <span class="star-filled">\u2605</span> ${m.rating.toFixed(1)}
            ${m.year ? `\u00B7 ${m.year}` : ""}
            ${m.genre ? `\u00B7 ${escapeHtml(m.genre)}` : ""}
          </span>
        </div>
        <button class="history-item-del" data-type="movie" data-id="${m.id}" title="删除">&times;</button>
      `;
      list.appendChild(item);
    });

    // Wire delete buttons
    list.querySelectorAll(".history-item-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        if (!confirm("确定删除这部电影？")) return;
        try {
          const res = await fetch(API_BASE + "/movies/" + id, { method: "DELETE" });
          if (!res.ok) throw new Error("删除失败");
          showToast("已删除", "success");
          loadSavedMovies();
        } catch (err) {
          showToast("删除失败：" + err.message, "error");
        }
      });
    });
  } catch (err) {
    historyContent.innerHTML = `<div class="history-empty"><p>\u2764\uFE0F 加载失败：${escapeHtml(err.message)}</p></div>`;
  }
}

async function loadSavedSessions() {
  try {
    const res = await fetch(API_BASE + "/sessions");
    if (!res.ok) throw new Error("请求失败");
    const data = await res.json();

    if (data.sessions.length === 0) {
      historyContent.innerHTML = `<div class="history-empty">
        <p>📭 还没有推荐记录</p>
        <p class="history-empty-hint">生成推荐后，结果将自动保存在这里</p>
      </div>`;
      return;
    }

    historyContent.innerHTML = `<div class="history-stats">共 ${data.total} 次推荐记录</div><div class="history-list" id="historySessionList"></div>`;

    const list = document.getElementById("historySessionList");
    data.sessions.forEach((s) => {
      const date = new Date(s.created_at);
      const dateStr =
        date.getFullYear() +
        "-" +
        String(date.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(date.getDate()).padStart(2, "0") +
        " " +
        String(date.getHours()).padStart(2, "0") +
        ":" +
        String(date.getMinutes()).padStart(2, "0");

      const item = document.createElement("div");
      item.className = "history-item";
      item.innerHTML = `
        <div class="history-item-info">
          <span class="history-item-title">${s.model === "deepseek" ? "🧠" : "🤖"} ${s.model === "deepseek" ? "DeepSeek" : "OpenAI"} \u00B7 ${s.recommendation_count} 部推荐</span>
          <span class="history-item-meta">${dateStr} \u00B7 基于 ${s.source_count} 部电影</span>
        </div>
        <button class="history-item-del" data-type="session" data-id="${s.id}" title="删除">&times;</button>
      `;
      list.appendChild(item);

      // Click to view details
      item.addEventListener("click", async (e) => {
        if (e.target.closest(".history-item-del")) return;
        await viewSessionDetail(s.id);
      });
    });

    // Wire delete buttons
    list.querySelectorAll(".history-item-del").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (!confirm("确定删除这条推荐记录？")) return;
        try {
          const res = await fetch(API_BASE + "/sessions/" + id, { method: "DELETE" });
          if (!res.ok) throw new Error("删除失败");
          showToast("已删除", "success");
          loadSavedSessions();
        } catch (err) {
          showToast("删除失败：" + err.message, "error");
        }
      });
    });
  } catch (err) {
    historyContent.innerHTML = `<div class="history-empty"><p>\u2764\uFE0F 加载失败：${escapeHtml(err.message)}</p></div>`;
  }
}

async function viewSessionDetail(sessionId) {
  try {
    const res = await fetch(API_BASE + "/sessions/" + sessionId);
    if (!res.ok) throw new Error("请求失败");
    const session = await res.json();

    const date = new Date(session.created_at);
    const dateStr =
      date.getFullYear() +
      "-" +
      String(date.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(date.getDate()).padStart(2, "0") +
      " " +
      String(date.getHours()).padStart(2, "0") +
      ":" +
      String(date.getMinutes()).padStart(2, "0");

    let html = `<div class="history-detail-header">
      <button class="history-back-btn" id="sessionBackBtn">\u2190 返回</button>
      <span>${dateStr}</span>
    </div>`;

    html += `<div class="history-detail-meta">
      ${session.model === "deepseek" ? "🧠" : "🤖"} ${session.model === "deepseek" ? "DeepSeek" : "OpenAI"}
      \u00B7 共 ${session.recommendations.length} 部推荐
      \u00B7 基于 ${session.source_count} 部电影
    </div>`;

    html += `<div class="history-list">`;
    session.recommendations.forEach((r) => {
      html += `
        <div class="history-rec-item">
          <div class="history-rec-header">
            <span class="history-rec-title">${escapeHtml(r.title)}</span>
            <span class="rec-confidence">${(r.confidence * 100).toFixed(0)}% 匹配</span>
          </div>
          ${r.year ? `<span class="rec-year">${r.year}</span>` : ""}
          ${r.genre ? `<span class="rec-genre">${escapeHtml(r.genre)}</span>` : ""}
          <div class="history-rec-reason">${escapeHtml(r.reason)}</div>
        </div>
      `;
    });
    html += `</div>`;

    historyContent.innerHTML = html;

    document.getElementById("sessionBackBtn").addEventListener("click", () => loadHistoryTab("sessions"));
  } catch (err) {
    showToast("加载详情失败：" + err.message, "error");
  }
}

// ========== Auto-save imported movies to DB ==========

let _lastSave = 0; // prevent duplicate saves within 2 seconds

async function saveMoviesToDB() {
  if (movies.length === 0) return;

  const now = Date.now();
  if (now - _lastSave < 2000) return;
  _lastSave = now;

  try {
    await fetch(API_BASE + "/movies/replace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        movies: movies.map((m) => ({
          title: m.title,
          rating: m.rating,
          year: m.year,
          genre: m.genre,
        })),
      }),
    });
  } catch (err) {
    // Silent fail — auto-save is best-effort
    console.warn("Auto-save failed:", err);
  }
}

// Auto-save after import — save movies when they are first imported/changed
// We inline saveMoviesToDB calls into parseMovies and parseCSV
const _origParseMovies = parseMovies;
parseMovies = function(data) {
  _origParseMovies(data);
  setTimeout(() => saveMoviesToDB(), 500);
};

const _origParseCSV = parseCSV;
parseCSV = function(text) {
  _origParseCSV(text);
  setTimeout(() => saveMoviesToDB(), 500);
};


function showToast(message, type = "info") {
  // Remove existing toasts
  document.querySelectorAll(".toast").forEach((t) => t.remove());

  const toast = document.createElement("div");
  toast.className = "toast toast-" + type;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ========== Export Functions ==========

function exportJSON() {
  const cards = resultsGrid.querySelectorAll(".rec-card:not(.stream-placeholder)");
  if (cards.length === 0) {
    showToast("没有可导出的推荐结果", "error");
    return;
  }

  const recommendations = [];
  cards.forEach((card) => {
    const titleEl = card.querySelector(".rec-title");
    const yearEl = card.querySelector(".rec-year");
    const genreEl = card.querySelector(".rec-genre");
    const confidenceEl = card.querySelector(".rec-confidence");
    const reasonEl = card.querySelector(".rec-reason");

    recommendations.push({
      title: titleEl ? titleEl.textContent : "",
      year: yearEl ? parseInt(yearEl.textContent) || null : null,
      genre: genreEl ? genreEl.textContent : null,
      confidence: confidenceEl ? parseFloat(confidenceEl.textContent) || 0 : 0,
      reason: reasonEl ? reasonEl.textContent : "",
    });
  });

  const exportData = {
    export_time: new Date().toISOString(),
    model: resultModelBadge ? resultModelBadge.textContent : "unknown",
    source_info: sourceInfo ? sourceInfo.textContent : "",
    total_recommendations: recommendations.length,
    recommendations: recommendations,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "recommendations_" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast("JSON 已导出！共 " + recommendations.length + " 条推荐", "success");
}

async function exportScreenshot() {
  const exportBtn = document.getElementById("exportScreenshotBtn");
  if (exportBtn.disabled) return;

  // Find the capture target — results grid and source info
  const captureTarget = resultsSection;
  if (!captureTarget) {
    showToast("没有可导出的推荐结果", "error");
    return;
  }

  // Check if html2canvas is loaded
  if (typeof html2canvas === "undefined") {
    showToast("截图库加载中，请稍后再试", "error");
    return;
  }

  exportBtn.disabled = true;
  exportBtn.textContent = "⏳ 生成中...";

  try {
    // Temporarily expand chat area if it was scrolled
    const chatArea = document.querySelector(".chat-area");
    let chatOverflowRestore = null;
    if (chatArea) {
      chatOverflowRestore = chatArea.style.maxHeight;
      chatArea.style.maxHeight = "none";
    }

    const canvas = await html2canvas(captureTarget, {
      backgroundColor: "#0a0a0f",
      scale: 2, // Retina quality
      useCORS: true,
      logging: false,
      onclone: (doc) => {
        // Ensure all elements are visible
        const clonedSection = doc.getElementById("resultsSection");
        if (clonedSection) clonedSection.classList.remove("hidden");
      },
    });

    // Restore chat area overflow
    if (chatArea && chatOverflowRestore !== null) {
      chatArea.style.maxHeight = chatOverflowRestore;
    }

    // Download PNG
    const link = document.createElement("a");
    link.download = "recommendations_" + new Date().toISOString().slice(0, 10) + ".png";
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("截图已导出！", "success");
  } catch (err) {
    showToast("截图生成失败：" + err.message, "error");
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = "🖼️ 截图";
    }
}

// ========== Movie Management Page ==========

const MANAGE_PAGE_SIZE = 50;

// Management state
let manageMovies = [];
let managePage = 0;
let manageSearch = "";
let manageSort = { field: "created_at", dir: "desc" };
let manageSelected = new Set();
let manageTotal = 0;
let editingCell = null; // { rowId, field }

// Cache DOM references
const manageSection = document.querySelector(".manage-section");
const manageTotalEl = document.getElementById("manageTotal");
const manageSearchInput = document.getElementById("manageSearchInput");
const manageSearchClear = document.getElementById("manageSearchClear");
const manageLoading = document.getElementById("manageLoading");
const manageEmpty = document.getElementById("manageEmpty");
const manageError = document.getElementById("manageError");
const manageErrorText = document.getElementById("manageErrorText");
const manageTableWrapper = document.getElementById("manageTableWrapper");
const manageTableBody = document.getElementById("manageTableBody");
const manageSelectAll = document.getElementById("manageSelectAll");
const managePagination = document.getElementById("managePagination");
const managePageNumbers = document.getElementById("managePageNumbers");
const managePageInfo = document.getElementById("managePageInfo");
const managePrevPage = document.getElementById("managePrevPage");
const manageNextPage = document.getElementById("manageNextPage");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const selectedCount = document.getElementById("selectedCount");
const deleteAllBtn = document.getElementById("deleteAllBtn");
const refreshManageBtn = document.getElementById("refreshManageBtn");

// ========== Tab Switching ==========

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    document.getElementById("tab-" + tab).classList.add("active");

    // Load manage tab data when switching to it
    if (tab === "manage") {
      loadManageMovies();
    }
  });
});

// ========== Load Movies ==========

function showManageState(showLoading, showEmpty, showError, showTable) {
  manageLoading.classList.toggle("hidden", !showLoading);
  manageEmpty.classList.toggle("hidden", !showEmpty);
  manageError.classList.toggle("hidden", !showError);
  manageTableWrapper.classList.toggle("hidden", !showTable);
  managePagination.classList.toggle("hidden", !showTable);
}

async function loadManageMovies() {
  showManageState(true, false, false, false);

  try {
    const params = new URLSearchParams();
    if (manageSearch) params.set("search", manageSearch);
    params.set("page", managePage.toString());
    params.set("page_size", MANAGE_PAGE_SIZE.toString());

    const res = await fetch(API_BASE + "/movies?" + params.toString());
    if (!res.ok) throw new Error("请求失败");
    const data = await res.json();

    manageMovies = data.movies;
    manageTotal = data.total;

    if (manageMovies.length === 0 && !manageSearch) {
      showManageState(false, true, false, false);
      manageTotalEl.textContent = "共 0 部";
      return;
    }

    if (manageMovies.length === 0 && manageSearch) {
      showManageState(false, true, false, false);
      manageEmpty.querySelector(".manage-empty-text").textContent = "没有找到匹配 \"" + manageSearch + "\" 的电影";
      manageEmpty.querySelector(".manage-empty-hint").textContent = "试试其他搜索词";
      manageTotalEl.textContent = "共 0 部";
      return;
    }

    // Reset empty state hint
    manageEmpty.querySelector(".manage-empty-text").textContent = "还没有导入电影";
    manageEmpty.querySelector(".manage-empty-hint").textContent = "切换到「电影推荐」页面导入你的观影数据";

    showManageState(false, false, false, true);
    manageTotalEl.textContent = "共 " + manageTotal + " 部";

    renderManageTable();
    renderManagePagination();
  } catch (err) {
    showManageState(false, false, true, false);
    manageErrorText.textContent = "加载失败：" + err.message;
    manageTotalEl.textContent = "共 0 部";
  }
}

// ========== Render Table ==========

function renderStarsSmall(rating) {
  const starCount = Math.round(rating / 2);
  const filled = Math.max(0, Math.min(5, starCount));
  const empty = 5 - filled;
  return (
    '<span class="rating-stars">' +
    '<span class="star-filled">\u2605</span>'.repeat(filled) +
    '<span class="star-empty">\u2605</span>'.repeat(empty) +
    "</span>"
  );
}

function renderManageTable() {
  // Sort movies
  const sorted = sortManageMovies();

  manageTableBody.innerHTML = sorted
    .map((m) => {
      const selected = manageSelected.has(m.id);
      return `
      <tr class="${selected ? "selected" : ""}" data-id="${m.id}">
        <td>
          <label class="row-checkbox-label">
            <input type="checkbox" class="row-checkbox" data-id="${m.id}"${selected ? " checked" : ""}>
            <span class="checkbox-custom"></span>
          </label>
        </td>
        <td class="td-title" data-field="title" data-id="${m.id}" title="点击编辑">
          ${escapeHtml(m.title)}
        </td>
        <td class="td-rating" data-field="rating" data-id="${m.id}" title="点击编辑">
          ${renderStarsSmall(m.rating)}
          <span class="rating-value">${m.rating.toFixed(1)}</span>
        </td>
        <td class="td-year" data-field="year" data-id="${m.id}" title="点击编辑">
          ${m.year || "-"}
        </td>
        <td data-field="genre" data-id="${m.id}">
          ${m.genre ? `<span class="td-genre" title="点击编辑">${escapeHtml(m.genre)}</span>` : '<span class="td-genre" style="opacity:0.4" title="点击编辑">-</span>'}
        </td>
        <td class="td-actions">
          <div class="edit-actions-group">
            <button class="edit-btn" data-id="${m.id}" title="编辑">\u270F️</button>
            <button class="delete-btn" data-id="${m.id}" title="删除">\uD83D\uDDD1️</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  // Wire row checkbox change events
  manageTableBody.querySelectorAll(".row-checkbox").forEach((cb) => {
    cb.addEventListener("change", () => {
      const id = parseInt(cb.dataset.id);
      if (cb.checked) {
        manageSelected.add(id);
      } else {
        manageSelected.delete(id);
      }
      updateManageSelectionUI();
      // Update row class
      const tr = cb.closest("tr");
      if (tr) tr.classList.toggle("selected", cb.checked);
    });
  });

  // Wire delete buttons
  manageTableBody.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = parseInt(btn.dataset.id);
      await deleteSingleMovie(id);
    });
  });

  // Wire edit buttons
  manageTableBody.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.id);
      startManageInlineEdit(id, "title");
    });
  });

  // Wire inline edit on cell click (closest td with data-field)
  manageTableBody.querySelectorAll("td[data-field]").forEach((td) => {
    td.addEventListener("click", (e) => {
      // Don't trigger if clicking a button or input inside the cell
      if (e.target.closest("button") || e.target.closest("input")) return;
      const id = parseInt(td.dataset.id);
      const field = td.dataset.field;
      startManageInlineEdit(id, field);
    });
  });

  // Sync select-all checkbox
  syncManageSelectAll();
}

// ========== Sorting ==========

function sortManageMovies() {
  const sorted = [...manageMovies];
  const field = manageSort.field;
  const dir = manageSort.dir;

  sorted.sort((a, b) => {
    let valA = a[field];
    let valB = b[field];

    if (valA == null) valA = field === "rating" ? -1 : "";
    if (valB == null) valB = field === "rating" ? -1 : "";

    if (typeof valA === "string") {
      valA = valA.toLowerCase();
      valB = (valB || "").toString().toLowerCase();
    }

    if (valA < valB) return dir === "asc" ? -1 : 1;
    if (valA > valB) return dir === "asc" ? 1 : -1;
    return 0;
  });

  return sorted;
}

// Sort buttons
document.querySelectorAll(".sort-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const field = btn.dataset.sort;
    let dir = btn.dataset.dir;

    if (manageSort.field === field) {
      // Toggle direction
      dir = manageSort.dir === "asc" ? "desc" : "asc";
      btn.dataset.dir = dir;
    } else {
      // Reset previous active
      document.querySelectorAll(".sort-btn").forEach((b) => {
        b.classList.remove("active");
        const arrow = b.querySelector(".sort-arrow");
        if (arrow) arrow.textContent = "";
      });
      btn.classList.add("active");
    }

    manageSort = { field, dir };
    const arrow = btn.querySelector(".sort-arrow");
    if (arrow) arrow.textContent = dir === "asc" ? "\u2191" : "\u2193";

    renderManageTable();
  });
});

// Column header sorting
manageTableWrapper.addEventListener("click", (e) => {
  const th = e.target.closest("th.sortable");
  if (!th) return;

  const field = th.dataset.sort;
  if (!field) return;

  let dir = "asc";
  if (manageSort.field === field) {
    dir = manageSort.dir === "asc" ? "desc" : "asc";
  }

  manageSort = { field, dir };

  // Update sort button visuals
  document.querySelectorAll(".sort-btn").forEach((b) => {
    b.classList.remove("active");
    const arrow = b.querySelector(".sort-arrow");
    if (arrow) arrow.textContent = "";
  });
  const matchingBtn = document.querySelector(`.sort-btn[data-sort="${field}"]`);
  if (matchingBtn) {
    matchingBtn.classList.add("active");
    const arrow = matchingBtn.querySelector(".sort-arrow");
    if (arrow) arrow.textContent = dir === "asc" ? "\u2191" : "\u2193";
    matchingBtn.dataset.dir = dir;
  }

  renderManageTable();
});

// ========== Inline Editing ==========

function startManageInlineEdit(movieId, field) {
  if (editingCell) {
    cancelManageEdit();
  }

  const movie = manageMovies.find((m) => m.id === movieId);
  if (!movie) return;

  // Find the cell
  const td = manageTableBody.querySelector(`td[data-id="${movieId}"][data-field="${field}"]`);
  if (!td) return;

  // Mark editing
  editingCell = { rowId: movieId, field };

  // Update edit button to show active state
  const editBtn = manageTableBody.querySelector(`.edit-btn[data-id="${movieId}"]`);
  if (editBtn) editBtn.classList.add("edit-active");

  let inputType = "text";
  let inputClass = "inline-edit-input";
  let currentValue = "";

  switch (field) {
    case "title":
      currentValue = movie.title;
      break;
    case "rating":
      inputType = "number";
      inputClass += " rating-input";
      currentValue = movie.rating.toFixed(1);
      break;
    case "year":
      inputType = "number";
      inputClass += " year-input";
      currentValue = movie.year != null ? movie.year.toString() : "";
      break;
    case "genre":
      currentValue = movie.genre || "";
      inputClass += " genre-input";
      break;
  }

  td.innerHTML = `<input type="${inputType}" class="${inputClass}" value="${escapeHtml(currentValue)}" />
    <span class="edit-actions">
      <button class="edit-save-btn" title="保存">\u2714️</button>
      <button class="edit-cancel-btn" title="取消">\u274C</button>
    </span>`;

  const input = td.querySelector("input");
  input.focus();
  if (inputType === "text") {
    input.select();
  }

  // Save function
  const saveEdit = async () => {
    const val = input.value.trim();
    let newValue;

    switch (field) {
      case "title":
        if (!val) { cancelManageEdit(); return; }
        newValue = val;
        break;
      case "rating":
        newValue = parseFloat(val);
        if (isNaN(newValue) || newValue < 0 || newValue > 10) { cancelManageEdit(); return; }
        newValue = Math.round(newValue * 10) / 10;
        break;
      case "year":
        newValue = val ? parseInt(val) : null;
        if (val && (isNaN(newValue) || newValue < 1888 || newValue > 2030)) { cancelManageEdit(); return; }
        break;
      case "genre":
        newValue = val || null;
        break;
    }

    // Check if value actually changed
    if (newValue === movie[field] || (newValue == null && movie[field] == null)) {
      cancelManageEdit();
      return;
    }

    try {
      const res = await fetch(API_BASE + "/movies/" + movieId, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: field === "title" ? newValue : movie.title,
          rating: field === "rating" ? newValue : movie.rating,
          year: field === "year" ? newValue : movie.year,
          genre: field === "genre" ? newValue : movie.genre,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "保存失败");
      }

      // Update local state
      movie[field] = newValue;
      showToast("已更新", "success");

      // Cancel edit mode and re-render row
      cancelManageEdit();
      renderManageTable();
      manageTotalEl.textContent = "共 " + manageTotal + " 部";
    } catch (err) {
      showToast("保存失败：" + err.message, "error");
      cancelManageEdit();
    }
  };

  // Wire save/cancel buttons
  td.querySelector(".edit-save-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    saveEdit();
  });
  td.querySelector(".edit-cancel-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    cancelManageEdit();
  });

  // Keyboard events
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancelManageEdit();
    }
  });

  // Prevent click from bubbling
  input.addEventListener("mousedown", (e) => e.stopPropagation());
}

function cancelManageEdit() {
  if (!editingCell) return;

  const { rowId, field } = editingCell;
  editingCell = null;

  // Remove edit-active class from edit button
  const editBtn = manageTableBody.querySelector(`.edit-btn[data-id="${rowId}"]`);
  if (editBtn) editBtn.classList.remove("edit-active");

  // Re-render the table to restore normal cell display
  renderManageTable();
}

// ========== Delete ==========

async function deleteSingleMovie(movieId) {
  if (!confirm("确定删除这部电影？")) return;

  try {
    const res = await fetch(API_BASE + "/movies/" + movieId, { method: "DELETE" });
    if (!res.ok) throw new Error("删除失败");

    showToast("已删除", "success");
    manageSelected.delete(movieId);
    updateManageSelectionUI();

    // If current page becomes empty, go back one page
    if (manageMovies.length <= 1 && managePage > 0) {
      managePage--;
    }
    await loadManageMovies();
  } catch (err) {
    showToast("删除失败：" + err.message, "error");
  }
}

async function deleteSelectedMovies() {
  if (manageSelected.size === 0) return;
  if (!confirm("确定删除选中的 " + manageSelected.size + " 部电影？")) return;

  const ids = [...manageSelected];
  let successCount = 0;
  let failCount = 0;

  for (const id of ids) {
    try {
      const res = await fetch(API_BASE + "/movies/" + id, { method: "DELETE" });
      if (res.ok) {
        successCount++;
      } else {
        failCount++;
      }
    } catch {
      failCount++;
    }
  }

  manageSelected.clear();
  updateManageSelectionUI();

  if (failCount === 0) {
    showToast("已删除 " + successCount + " 部电影", "success");
  } else {
    showToast("已删除 " + successCount + " 部，" + failCount + " 部删除失败", "error");
  }

  // If current page becomes empty, go back
  if (manageMovies.length <= ids.length && managePage > 0) {
    managePage--;
  }

  await loadManageMovies();
}

async function deleteAllMovies() {
  if (manageTotal === 0) return;
  if (!confirm("确定清空全部 " + manageTotal + " 部电影？此操作不可撤销！")) return;
  if (!confirm("再次确认：将删除所有已保存的电影数据？")) return;

  try {
    const res = await fetch(API_BASE + "/movies", { method: "DELETE" });
    if (!res.ok) throw new Error("清空失败");

    showToast("已清空全部 " + manageTotal + " 部电影", "success");
    manageSelected.clear();
    managePage = 0;
    updateManageSelectionUI();
    await loadManageMovies();
  } catch (err) {
    showToast("清空失败：" + err.message, "error");
  }
}

// ========== Selection UI ==========

function updateManageSelectionUI() {
  const count = manageSelected.size;
  deleteSelectedBtn.disabled = count === 0;
  selectedCount.textContent = count;
  syncManageSelectAll();
}

function syncManageSelectAll() {
  if (!manageSelectAll) return;
  const checkboxes = manageTableBody.querySelectorAll(".row-checkbox");
  const checked = manageTableBody.querySelectorAll(".row-checkbox:checked");
  if (checkboxes.length === 0) {
    manageSelectAll.checked = false;
    manageSelectAll.indeterminate = false;
    return;
  }
  manageSelectAll.checked = checkboxes.length === checked.length;
  manageSelectAll.indeterminate = checked.length > 0 && checked.length < checkboxes.length;
}

// Select all checkbox
if (manageSelectAll) {
  manageSelectAll.addEventListener("change", () => {
    const checkboxes = manageTableBody.querySelectorAll(".row-checkbox");
    checkboxes.forEach((cb) => {
      cb.checked = manageSelectAll.checked;
      const id = parseInt(cb.dataset.id);
      if (manageSelectAll.checked) {
        manageSelected.add(id);
        cb.closest("tr").classList.add("selected");
      } else {
        manageSelected.delete(id);
        cb.closest("tr").classList.remove("selected");
      }
    });
    updateManageSelectionUI();
  });
}

// ========== Search ==========

let manageSearchTimeout = null;

if (manageSearchInput) {
  manageSearchInput.addEventListener("input", () => {
    clearTimeout(manageSearchTimeout);
    manageSearchTimeout = setTimeout(() => {
      manageSearch = manageSearchInput.value.trim();
      managePage = 0;
      manageSelected.clear();
      updateManageSelectionUI();
      loadManageMovies();
      manageSearchClear.classList.toggle("hidden", !manageSearch);
    }, 300);
  });

  manageSearchClear.addEventListener("click", () => {
    manageSearchInput.value = "";
    manageSearch = "";
    managePage = 0;
    manageSelected.clear();
    updateManageSelectionUI();
    loadManageMovies();
    manageSearchClear.classList.add("hidden");
    manageSearchInput.focus();
  });
}

// ========== Delete Selected / Delete All Buttons ==========

if (deleteSelectedBtn) {
  deleteSelectedBtn.addEventListener("click", deleteSelectedMovies);
}

if (deleteAllBtn) {
  deleteAllBtn.addEventListener("click", deleteAllMovies);
}

if (refreshManageBtn) {
  refreshManageBtn.addEventListener("click", () => {
    manageSelected.clear();
    updateManageSelectionUI();
    loadManageMovies();
  });
}

// ========== Pagination ==========

function renderManagePagination() {
  const totalPages = Math.ceil(manageTotal / MANAGE_PAGE_SIZE);

  if (totalPages <= 1) {
    managePagination.classList.add("hidden");
    return;
  }
  managePagination.classList.remove("hidden");

  managePrevPage.disabled = managePage === 0;
  manageNextPage.disabled = managePage >= totalPages - 1;

  // Page numbers
  const maxVisible = 7;
  let pageStart = Math.max(0, managePage - Math.floor(maxVisible / 2));
  let pageEnd = Math.min(totalPages, pageStart + maxVisible);

  if (pageEnd - pageStart < maxVisible) {
    pageStart = Math.max(0, pageEnd - maxVisible);
  }

  let html = "";

  if (pageStart > 0) {
    html += `<button class="page-btn page-num" data-page="0">1</button>`;
    if (pageStart > 1) {
      html += `<span class="page-dots">\u2026</span>`;
    }
  }

  for (let i = pageStart; i < pageEnd; i++) {
    html += `<button class="page-btn page-num${i === managePage ? " active" : ""}" data-page="${i}">${i + 1}</button>`;
  }

  if (pageEnd < totalPages) {
    if (pageEnd < totalPages - 1) {
      html += `<span class="page-dots">\u2026</span>`;
    }
    html += `<button class="page-btn page-num" data-page="${totalPages - 1}">${totalPages}</button>`;
  }

  managePageNumbers.innerHTML = html;

  // Wire page number buttons
  managePageNumbers.querySelectorAll(".page-num").forEach((btn) => {
    btn.addEventListener("click", () => {
      managePage = parseInt(btn.dataset.page);
      manageSelected.clear();
      updateManageSelectionUI();
      loadManageMovies();
    });
  });

  // Page info
  const start = managePage * MANAGE_PAGE_SIZE + 1;
  const end = Math.min((managePage + 1) * MANAGE_PAGE_SIZE, manageTotal);
  managePageInfo.textContent = start + "-" + end + " / 共 " + manageTotal;
}

managePrevPage.addEventListener("click", () => {
  if (managePage > 0) {
    managePage--;
    manageSelected.clear();
    updateManageSelectionUI();
    loadManageMovies();
  }
});

manageNextPage.addEventListener("click", () => {
  const totalPages = Math.ceil(manageTotal / MANAGE_PAGE_SIZE);
  if (managePage < totalPages - 1) {
    managePage++;
    manageSelected.clear();
    updateManageSelectionUI();
    loadManageMovies();
  }
});

