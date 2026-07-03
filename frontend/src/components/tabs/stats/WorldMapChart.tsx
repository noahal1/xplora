/* ── World map choropleth — movie/TV origin countries ──────────
   Uses d3-geo + topojson-client directly (no React wrapper lib)
   to avoid React 19 compatibility issues.

   Responsive: desktop shows SVG map, mobile shows compact bar list. */

import React, { useMemo, useState, useEffect, useCallback } from "react";

/* ── Country name → ISO 3166-1 alpha-2 mapping ────────────────
   Comprehensive mapping from TMDB/TVmaze country names to ISO codes. */
const COUNTRY_TO_ISO: Record<string, string> = {
  "United States": "US", "United States of America": "US", "USA": "US",
  "America": "US", "美国": "US",
  "Canada": "CA", "加拿大": "CA",
  "United Kingdom": "GB", "UK": "GB", "Great Britain": "GB", "England": "GB",
  "英国": "GB",
  "China": "CN", "中国": "CN",
  "Japan": "JP", "日本": "JP",
  "South Korea": "KR", "Korea": "KR", "韩国": "KR",
  "France": "FR", "法国": "FR",
  "Germany": "DE", "德国": "DE",
  "India": "IN", "印度": "IN",
  "Australia": "AU", "澳大利亚": "AU",
  "Brazil": "BR", "巴西": "BR",
  "Italy": "IT", "意大利": "IT",
  "Spain": "ES", "西班牙": "ES",
  "Russia": "RU", "俄罗斯": "RU",
  "Sweden": "SE", "瑞典": "SE",
  "Denmark": "DK", "丹麦": "DK",
  "Norway": "NO", "挪威": "NO",
  "Netherlands": "NL", "荷兰": "NL",
  "Belgium": "BE", "比利时": "BE",
  "Switzerland": "CH", "瑞士": "CH",
  "Austria": "AT", "奥地利": "AT",
  "Poland": "PL", "波兰": "PL",
  "Turkey": "TR", "土耳其": "TR",
  "Mexico": "MX", "墨西哥": "MX",
  "Argentina": "AR", "阿根廷": "AR",
  "Colombia": "CO", "哥伦比亚": "CO",
  "Chile": "CL", "智利": "CL",
  "Thailand": "TH", "泰国": "TH",
  "Taiwan": "TW", "Taiwan, Province of China": "TW", "台湾": "TW",
  "Hong Kong": "HK", "香港": "HK",
  "Singapore": "SG", "新加坡": "SG",
  "New Zealand": "NZ", "新西兰": "NZ",
  "South Africa": "ZA", "南非": "ZA",
  "Israel": "IL", "以色列": "IL",
  "Ireland": "IE", "爱尔兰": "IE",
  "Portugal": "PT", "葡萄牙": "PT",
  "Greece": "GR", "希腊": "GR",
  "Czech Republic": "CZ", "Czechia": "CZ", "捷克": "CZ",
  "Hungary": "HU", "匈牙利": "HU",
  "Romania": "RO", "罗马尼亚": "RO",
  "Ukraine": "UA", "乌克兰": "UA",
  "Finland": "FI", "芬兰": "FI",
  "Iceland": "IS", "冰岛": "IS",
  "Philippines": "PH", "菲律宾": "PH",
  "Indonesia": "ID", "印度尼西亚": "ID",
  "Malaysia": "MY", "马来西亚": "MY",
  "Vietnam": "VN", "越南": "VN",
  "Egypt": "EG", "埃及": "EG",
  "Nigeria": "NG", "尼日利亚": "NG",
  "Kenya": "KE", "肯尼亚": "KE",
  "Morocco": "MA", "摩洛哥": "MA",
  "Iran": "IR", "Iran, Islamic Republic of": "IR", "伊朗": "IR",
  "Saudi Arabia": "SA", "沙特阿拉伯": "SA",
  "United Arab Emirates": "AE", "UAE": "AE", "阿联酋": "AE",
  "Pakistan": "PK", "巴基斯坦": "PK",
  "Bangladesh": "BD", "孟加拉国": "BD",
  "Peru": "PE", "秘鲁": "PE",
  "Venezuela": "VE", "委内瑞拉": "VE",
  "Cuba": "CU", "古巴": "CU",
  "Croatia": "HR", "克罗地亚": "HR",
  "Serbia": "RS", "塞尔维亚": "RS",
  "Bulgaria": "BG", "保加利亚": "BG",
  "Slovakia": "SK", "斯洛伐克": "SK",
  "Slovenia": "SI", "斯洛文尼亚": "SI",
  "Lithuania": "LT", "立陶宛": "LT",
  "Latvia": "LV", "拉脱维亚": "LV",
  "Estonia": "EE", "爱沙尼亚": "EE",
  "Luxembourg": "LU", "卢森堡": "LU",
  "Georgia": "GE", "格鲁吉亚": "GE",
  "Lebanon": "LB", "黎巴嫩": "LB",
  "Jordan": "JO", "约旦": "JO",
  "Qatar": "QA", "卡塔尔": "QA",
  "Puerto Rico": "PR", "波多黎各": "PR",
  "Costa Rica": "CR", "哥斯达黎加": "CR",
  "Panama": "PA", "巴拿马": "PA",
  "Uruguay": "UY", "乌拉圭": "UY",
  "Myanmar": "MM", "缅甸": "MM",
  "Cambodia": "KH", "柬埔寨": "KH",
  "Nepal": "NP", "尼泊尔": "NP",
  "Sri Lanka": "LK", "斯里兰卡": "LK",
  "Mongolia": "MN", "蒙古": "MN",
  "Kazakhstan": "KZ", "哈萨克斯坦": "KZ",
  "Algeria": "DZ", "阿尔及利亚": "DZ",
  "Tunisia": "TN", "突尼斯": "TN",
  "Ethiopia": "ET", "埃塞俄比亚": "ET",
  "Ghana": "GH", "加纳": "GH",
  "Tanzania": "TZ", "坦桑尼亚": "TZ",
  "West Germany": "DE", "Soviet Union": "RU",
  "Czechoslovakia": "CZ", "Yugoslavia": "RS", "East Germany": "DE",
};

/* ── Build ISO → Chinese name reverse map ────────────────────
   Extracted automatically from COUNTRY_TO_ISO to display Chinese
   country names instead of English on the chart. */
function buildIsoToChinese(): Record<string, string> {
  const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f]/;
  const map: Record<string, string> = {};
  for (const [name, iso] of Object.entries(COUNTRY_TO_ISO)) {
    if (CJK_RE.test(name) && !map[iso]) {
      map[iso] = name;
    }
  }
  return map;
}

const ISO_TO_CHINESE = buildIsoToChinese();

function getDisplayName(iso: string, fallback: string): string {
  return ISO_TO_CHINESE[iso] || fallback;
}

/* ── TopoJSON URL (110m resolution, lightweight) ────────────── */
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

/* ── Color scale helpers ────────────────────────────────────── */
const COLOR_STOPS = [
  { threshold: 0, color: "var(--bg-input)" },
  { threshold: 1, color: "color-mix(in srgb, var(--chart-1) 15%, var(--bg-input))" },
  { threshold: 3, color: "color-mix(in srgb, var(--chart-1) 30%, var(--bg-input))" },
  { threshold: 6, color: "color-mix(in srgb, var(--chart-1) 50%, transparent)" },
  { threshold: 12, color: "color-mix(in srgb, var(--chart-1) 70%, transparent)" },
  { threshold: 25, color: "var(--chart-1)" },
];

function getColor(count: number): string {
  let color = COLOR_STOPS[0].color;
  for (const stop of COLOR_STOPS) {
    if (count >= stop.threshold) color = stop.color;
  }
  return color;
}

/* ── ISO 3166-1 numeric (3-digit) → alpha-2 ────────────────
   world-atlas countries-110m.json uses 3-digit numeric ISO codes
   as feature IDs (e.g. "004" for Afghanistan, "840" for US). */
const NUMERIC_TO_ISO2: Record<string, string> = {
  "004": "AF", "008": "AL", "012": "DZ", "020": "AD", "024": "AO",
  "028": "AG", "031": "AZ", "032": "AR", "036": "AU", "040": "AT",
  "044": "BS", "048": "BH", "050": "BD", "051": "AM", "052": "BB",
  "056": "BE", "064": "BT", "068": "BO", "070": "BA", "072": "BW",
  "076": "BR", "084": "BZ", "090": "SB", "096": "BN", "100": "BG",
  "104": "MM", "108": "BI", "112": "BY", "116": "KH", "120": "CM",
  "124": "CA", "132": "CV", "144": "LK", "148": "TD", "152": "CL",
  "156": "CN", "158": "TW", "162": "CX", "166": "CC", "170": "CO",
  "174": "KM", "175": "YT", "178": "CG", "180": "CD", "184": "CK",
  "188": "CR", "191": "HR", "192": "CU", "196": "CY", "203": "CZ",
  "204": "BJ", "208": "DK", "212": "DM", "214": "DO", "218": "EC",
  "222": "SV", "226": "GQ", "231": "ET", "232": "ER", "233": "EE",
  "242": "FJ", "246": "FI", "248": "AX", "250": "FR", "258": "PF",
  "262": "DJ", "266": "GA", "268": "GE", "270": "GM", "276": "DE",
  "288": "GH", "292": "GI", "296": "KI", "300": "GR", "304": "GL",
  "308": "GD", "312": "GP", "316": "GU", "320": "GT", "324": "GN",
  "328": "GY", "332": "HT", "334": "HM", "336": "VA", "340": "HN",
  "344": "HK", "348": "HU", "352": "IS", "356": "IN", "360": "ID",
  "364": "IR", "368": "IQ", "372": "IE", "376": "IL", "380": "IT",
  "384": "CI", "388": "JM", "392": "JP", "398": "KZ", "400": "JO",
  "404": "KE", "408": "KP", "410": "KR", "414": "KW", "417": "KG",
  "418": "LA", "422": "LB", "426": "LS", "428": "LV", "430": "LR",
  "434": "LY", "438": "LI", "440": "LT", "442": "LU", "446": "MO",
  "450": "MG", "454": "MW", "458": "MY", "462": "MV", "466": "ML",
  "470": "MT", "474": "MQ", "478": "MR", "480": "MU", "484": "MX",
  "492": "MC", "496": "MN", "498": "MD", "500": "MS", "504": "MA",
  "508": "MZ", "512": "OM", "516": "NA", "520": "NR", "524": "NP",
  "528": "NL", "540": "NC", "548": "VU", "554": "NZ", "558": "NI",
  "562": "NE", "566": "NG", "578": "NO", "580": "MP", "583": "FM",
  "584": "MH", "585": "PW", "586": "PK", "591": "PA", "598": "PG",
  "600": "PY", "604": "PE", "608": "PH", "616": "PL", "620": "PT",
  "624": "GW", "626": "TL", "630": "PR", "634": "QA", "638": "RE",
  "642": "RO", "643": "RU", "646": "RW", "652": "BL", "654": "SH",
  "659": "KN", "660": "AI", "662": "LC", "663": "MF", "666": "PM",
  "670": "VC", "674": "SM", "678": "ST", "682": "SA", "686": "SN",
  "688": "RS", "690": "SC", "694": "SL", "702": "SG", "703": "SK",
  "704": "VN", "705": "SI", "706": "SO", "710": "ZA", "716": "ZW",
  "724": "ES", "728": "SS", "729": "SD", "732": "EH", "740": "SR",
  "748": "SZ", "752": "SE", "756": "CH", "760": "SY", "762": "TJ",
  "764": "TH", "768": "TG", "772": "TK", "776": "TO", "780": "TT",
  "784": "AE", "788": "TN", "792": "TR", "795": "TM", "796": "TC",
  "798": "TV", "800": "UG", "804": "UA", "807": "MK", "818": "EG",
  "826": "GB", "831": "GG", "832": "JE", "833": "IM", "834": "TZ",
  "840": "US", "854": "BF", "858": "UY", "860": "UZ", "862": "VE",
  "882": "WS", "887": "YE", "894": "ZM",
};

/* ── Types ──────────────────────────────────────────────────── */
interface CountryEntry {
  code: string;
  count: number;
  names: string[];
}

interface FeatureRecord {
  key: string;          // unique key (id + index)
  path: string;         // SVG path data from projection
  iso2: string | null;  // alpha-2 code
}

interface Props {
  data: { country: string; count: number }[];
}

/* ═══════════════════════════════════════════════════════════════
   Desktop map tooltip position — uses mouse coordinates
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export function WorldMapChart({ data }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [geoFeatures, setGeoFeatures] = useState<FeatureRecord[]>([]);
  const [tooltip, setTooltip] = useState<{
    country: string;
    count: number;
    x: number;
    y: number;
  } | null>(null);

  /* ── Fetch TopoJSON and compute SVG paths via d3 ────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(GEO_URL);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const topology = await resp.json();
        if (cancelled) return;

        const [{ geoMercator, geoPath }, { feature }] = await Promise.all([
          import("d3-geo"),
          import("topojson-client"),
        ]);

        const countries = feature(topology, topology.objects.countries);
        const features = countries.features;

        // Exclude Antarctica (ISO "010") from rendering
        const renderFeatures = features.filter((f: any) => String(f.id ?? "") !== "010");

        // Manual Mercator projection — balanced between hemispheres,
        // tighter than full-world but keeps Southern Hemisphere visible.
        const width = 800;
        const height = 330;
        const projection = geoMercator()
          .center([0, 12])
          .scale(150)
          .translate([width / 2, height / 2]);

        const pathGen = geoPath().projection(projection);
        const records: FeatureRecord[] = renderFeatures.map((f: any, idx: number) => {
          const pathData = pathGen(f) || "";
          const numericId = String(f.id ?? "");
          return {
            key: numericId || `feat-${idx}`,
            path: pathData,
            iso2: NUMERIC_TO_ISO2[numericId] || null,
          };
        });

        if (!cancelled) {
          setGeoFeatures(records);
          setLoaded(true);
        }
      } catch (err) {
        console.warn("[WorldMap] Failed to load map data:", err);
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── Build country → count map ──────────────────────────── */
  const countryMap = useMemo(() => {
    const map = new Map<string, CountryEntry>();
    for (const d of data) {
      const iso = COUNTRY_TO_ISO[d.country];
      if (!iso) continue;
      const existing = map.get(iso);
      if (existing) {
        existing.count += d.count;
      } else {
        map.set(iso, { code: iso, count: d.count, names: [d.country] });
      }
    }
    return map;
  }, [data]);

  const totalCountries = countryMap.size;
  const totalItems = data.reduce((s, d) => s + d.count, 0);
  const hasData = totalCountries > 0;

  /* ── Tooltip handler (desktop only) ───────────────────────
       Uses getBoundingClientRect to convert viewport coordinates
       to container-relative coordinates for absolute positioning. */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGElement>, entry: CountryEntry | undefined, count: number) => {
      if (!entry) return;
      const svg = (e.target as SVGElement).closest("svg");
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      setTooltip({
        country: getDisplayName(entry.code, entry.names[0]),
        count,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    []
  );

  /* ── Build sorted country list (MUST be before early returns!) ── */
  const sortedCountries = useMemo(
    () => Array.from(countryMap.entries()).sort((a, b) => b[1].count - a[1].count),
    [countryMap]
  );
  const maxBar = sortedCountries.length > 0 ? sortedCountries[0][1].count : 1;

  /* ── Loading state ──────────────────────────────────────── */
  if (!loaded) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-stream-spin" />
        <p className="text-xs" style={{ color: "var(--fg-dim)" }}>加载世界地图数据...</p>
      </div>
    );
  }

  /* ── Empty state ────────────────────────────────────────── */
  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <svg className="w-10 h-10 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
          style={{ color: "var(--fg-dim)" }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>暂无产地数据</p>
        <p className="text-xs" style={{ color: "var(--fg-dim)" }}>执行「批量刮削」后可获取国家/地区信息</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Legend & summary */}
      <div className="flex items-center justify-between mb-4 text-xs" style={{ color: "var(--fg-dim)" }}>
        <span>
          <span className="font-semibold tabular-nums" style={{ color: "var(--fg-muted)" }}>{totalCountries}</span>
          {" "}个国家/地区 ·{" "}
          <span className="font-semibold tabular-nums" style={{ color: "var(--fg-muted)" }}>{totalItems}</span>
          {" "}部作品
        </span>
        <div className="flex items-center gap-2">
          <span>少</span>
          <div className="flex items-center gap-[2px]">
            {COLOR_STOPS.slice(1).map((stop, i) => (
              <div key={i} className="w-3 h-2.5 rounded-[2px]" style={{ background: getColor(stop.threshold) }} />
            ))}
          </div>
          <span>多</span>
        </div>
      </div>

      {/* ── Desktop: Map + tooltip + top 10 ──────────────── */}
      <div className="hidden sm:block relative">
        <div className="w-full overflow-hidden rounded-xl" style={{
          background: "var(--bg-input)",
          border: "1px solid var(--border-subtle)",
        }}>
          <svg viewBox="0 0 800 350" className="w-full h-auto max-h-[350px]" style={{ display: "block" }}>
            {geoFeatures.map((f) => {
              const iso = f.iso2;
              const entry = iso ? countryMap.get(iso) : undefined;
              const count = entry?.count ?? 0;
              const fill = getColor(count);
              const stroke = count > 0
                ? "color-mix(in srgb, var(--chart-1) 40%, var(--border-default))"
                : "var(--border-subtle)";

              return (
                <path
                  key={f.key}
                  d={f.path}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={0.5}
                  className="transition-[fill,stroke] duration-300 ease-out"
                  onMouseEnter={(e) => handleMouseMove(e, entry, count)}
                  onMouseMove={(e) => handleMouseMove(e, entry, count)}
                  onMouseLeave={() => setTooltip(null)}
                  style={{ cursor: count > 0 ? "pointer" : "default", outline: "none" }}
                />
              );
            })}
          </svg>
        </div>

        {tooltip && (
          <div className="pointer-events-none z-50 px-2.5 py-1.5 rounded-lg text-xs font-medium shadow-lg" style={{
            position: "absolute",
            left: Math.max(4, Math.min(tooltip.x + 10, 790)),
            top: Math.max(0, tooltip.y - 34),
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            color: "var(--seed-fg)",
            transform: "translateY(0)",
          }}>
            <span>{tooltip.country}</span>
            <span className="ml-1.5 font-semibold tabular-nums" style={{ color: "var(--seed-primary)" }}>
              {tooltip.count}
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
          {sortedCountries.slice(0, 10).map(([iso, entry]) => (
            <span key={iso} className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--fg-dim)" }}>
              <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: getColor(entry.count) }} />
              <span>{getDisplayName(iso, entry.names[0])}</span>
              <span className="tabular-nums font-medium" style={{ color: "var(--fg-muted)" }}>{entry.count}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Mobile: Compact bar list ──────────────────────── */}
      <div className="block sm:hidden">
        <MobileCountryList sortedCountries={sortedCountries} maxBar={maxBar} getColor={getColor} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Mobile: compact horizontal bar list (no SVG map)
   ═══════════════════════════════════════════════════════════════ */
function MobileCountryList({ sortedCountries, maxBar, getColor }: {
  sortedCountries: [string, CountryEntry][];
  maxBar: number;
  getColor: (count: number) => string;
}) {
  return (
    <div className="space-y-[3px]">
      {sortedCountries.map(([iso, entry]) => {
        const pct = Math.max((entry.count / maxBar) * 100, 2);
        return (
          <div key={iso} className="flex items-center gap-2 py-1.5">
            <span className="text-xs font-medium truncate shrink-0" style={{ width: "5.5rem", color: "var(--fg-secondary)" }}>
              {getDisplayName(iso, entry.names[0])}
            </span>
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-input)" }}>
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${getColor(entry.count)}, color-mix(in srgb, ${getColor(entry.count)} 30%, transparent))`,
                }}
              />
            </div>
            <span className="text-xs font-semibold tabular-nums shrink-0 text-right" style={{ width: "2.5rem", color: "var(--fg-muted)" }}>
              {entry.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
