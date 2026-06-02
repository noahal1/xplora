/** CSV parsing utilities */

interface RawMovie {
  title: string;
  rating: number;
  year: number | null;
  genre: string | null;
}

/** Parse a CSV line into fields, handling quoted fields */
function parseCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
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

/** Parse CSV text into movie objects */
export function parseCSV(text: string): RawMovie[] {
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  if (lines.length < 2) {
    throw new Error("CSV 文件至少需要标题行和一行数据");
  }

  const headerLine = lines[0];
  const delimiter = headerLine.includes(";") ? ";" : ",";
  const headers = parseCSVLine(headerLine, delimiter).map((h) =>
    h.toLowerCase().replace(/["'\s]/g, "")
  );

  const columnMap: Record<string, string[]> = {
    title: ["title", "name", "movie", "film", "影片名称", "电影名称", "电影名"],
    rating: [
      "rating",
      "user_rating",
      "score",
      "rate",
      "评分数",
      "评分",
      "豆瓣评分",
      "我的评分",
    ],
    year: ["year", "date", "年份", "上映年份", "上映日期", "年代"],
    genre: ["genre", "genres", "type", "category", "categories", "类型", "题材", "分类"],
  };

  function findColumn(colName: string): number {
    const aliases = columnMap[colName] || [];
    for (const alias of aliases) {
      const idx = headers.indexOf(alias);
      if (idx !== -1) return idx;
    }
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

  const items: RawMovie[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i], delimiter);
    const title = (fields[titleIdx] || "").trim();
    if (!title) continue;

    let rating = parseFloat((fields[ratingIdx] || "").replace(/[^\d.]/g, ""));
    rating = isNaN(rating) ? 0 : Math.max(0, Math.min(10, rating));

    let year: number | null = null;
    if (yearIdx !== -1 && fields[yearIdx]) {
      const raw = fields[yearIdx].trim();
      const yearMatch = raw.match(/(\d{4})/);
      if (yearMatch) year = parseInt(yearMatch[1]);
    }

    let genre: string | null = null;
    if (genreIdx !== -1 && fields[genreIdx]) {
      genre = fields[genreIdx].trim();
    }

    items.push({ title, rating, year, genre });
  }

  if (items.length === 0) {
    throw new Error("CSV 中未找到有效的电影数据");
  }

  return items;
}

/** Parse JSON data into movie objects */
export function parseMovieData(data: unknown): RawMovie[] {
  let items: any[] = [];

  if (Array.isArray(data)) {
    items = data;
  } else if (data && typeof data === "object") {
    items = (data as any).items || (data as any).movies || [];
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("未找到电影数据：需要包含 items/movies 数组或直接传入数组");
  }

  const movies: RawMovie[] = [];
  for (let i = 0; i < items.length; i++) {
    const m = items[i];
    if (!m || (!m.title && !m.name)) continue;

    let rating = parseFloat(m.user_rating ?? m.rating ?? m.score ?? 0);
    rating = isNaN(rating) ? 0 : Math.max(0, Math.min(10, rating));

    movies.push({
      title: m.title || m.name,
      rating,
      year: m.year || null,
      genre: m.genre || null,
    });
  }

  if (movies.length === 0) {
    throw new Error("未找到有效的电影数据（需要 title 和 rating/user_rating 字段）");
  }

  return movies;
}
