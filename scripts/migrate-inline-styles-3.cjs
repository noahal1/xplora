/**
 * Third pass: handle the remaining multi-property and edge-case patterns.
 *
 * Uses very specific regex patterns to match each remaining occurrence.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcDir = path.resolve(__dirname, '../frontend/src');

const tsxFiles = execSync(`find "${srcDir}" -name "*.tsx"`, { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);

const replacements = [
  // ── Single border: border: "1px solid var(--border-subtle)" → className ──
  {
    from: /style=\{border:\s*"1px solid var\(--border-subtle\)"\s*\}/g,
    to: `className="border border-border-subtle"`,
  },
  // ── Single border with color: border: "1px solid var(--border-subtle)", color: "var(--fg-muted)" ──
  {
    from: /style=\{border:\s*"1px solid var\(--border-subtle\)",\s*color:\s*"var\(--fg-muted\)"\s*\}/g,
    to: `className="border border-border-subtle text-muted-foreground"`,
  },
  // ── bg-card + border-default: background: "var(--bg-card)", border: "1px solid var(--border-default)" ──
  {
    from: /style=\{background:\s*"var\(--bg-card\)",\s*border:\s*"1px solid var\(--border-default\)"\s*\}/g,
    to: `className="bg-bg-card border border-border"`,
  },
  // ── bg-card + border-default (> closing bracket) ──
  {
    from: /style=\{background:\s*"var\(--bg-card\)",\s*border:\s*"1px solid var\(--border-default\)"\s*}>/g,
    to: `className="bg-bg-card border border-border">`,
  },
  // ── border-default variant ──
  {
    from: /style=\{background:\s*"var\(--bg-card\)",\s*border:\s*"1px solid var\(--border-default\)"\s*\}>/g,
    to: `className="bg-bg-card border border-border">`,
  },
  // ── bg-input + border-default + fg-secondary ──
  {
    from: /style=\{background:\s*"var\(--bg-input\)",\s*color:\s*"var\(--fg-secondary\)",\s*border:\s*"1px solid var\(--border-default\)"\s*\}/g,
    to: `className="bg-bg-input text-fg-secondary border border-border"`,
  },
  // ── bg-input + border-default ──
  {
    from: /style=\{background:\s*"var\(--bg-input\)",\s*border:\s*"1px solid var\(--border-default\)"\s*\}/g,
    to: `className="bg-bg-input border border-border"`,
  },
  // ── accent-glow + primary-20 ──
  {
    from: /style=\{background:\s*"var\(--accent-glow\)",\s*border:\s*"1px solid var\(--primary-20\)"\s*\}/g,
    to: `className="bg-accent-glow border border-primary-20"`,
  },
  // ── destructive + white text + transparent border ──
  // (with double quotes)
  {
    from: /style=\{background:\s*"var\(--destructive\)",\s*color:\s*"#fff",\s*borderColor:\s*"transparent"\s*\}/g,
    to: `className="bg-destructive text-white border-transparent"`,
  },
  // (with single quotes)
  {
    from: /style=\{background:\s*'var\(--destructive\)',\s*color:\s*'#fff',\s*borderColor:\s*'transparent'\s*\}/g,
    to: `className="bg-destructive text-white border-transparent"`,
  },
  // ── accent-glow + seed-primary + primary-20 ──
  {
    from: /style=\{color:\s*"var\(--seed-primary\)",\s*background:\s*"var\(--accent-glow\)",\s*border:\s*"1px solid var\(--primary-20\)"\s*\}/g,
    to: `className="text-primary bg-accent-glow border border-primary-20"`,
  },
  // ── height: "1px", background: "var(--border-subtle)" ──
  {
    from: /style=\{height:\s*"1px",\s*background:\s*"var\(--border-subtle\)"\s*\}/g,
    to: `className="h-px bg-bg-[var(--border-subtle)]"`,
  },
  // ── seed-primary background + foreground color ──
  {
    from: /style=\{background:\s*"var\(--seed-primary\)",\s*color:\s*"#0f0f0f"\s*\}/g,
    to: `className="bg-primary text-[#0f0f0f]"`,
  },
  // ── bg-input + border-subtle ──
  {
    from: /style=\{background:\s*"var\(--bg-input\)",\s*border:\s*"1px solid var\(--border-subtle\)"\s*\}/g,
    to: `className="bg-bg-input border border-border-subtle"`,
  },
  // ── fg-dim + opacity in multi-prop ──
  {
    from: /style=\{color:\s*"var\(--fg-dim\)",\s*opacity:\s*0\.[0-9]+\s*\}/g,
    to: (match) => {
      // Extract opacity value
      const opacityMatch = match.match(/opacity:\s*([0-9.]+)/);
      const opacity = opacityMatch ? opacityMatch[1] : '0.5';
      // Map opacity to Tailwind opacity classes
      const opacityMap = { '0.5': '50', '0.4': '40', '0.3': '30' };
      const tw = opacityMap[opacity] || Math.round(parseFloat(opacity) * 100);
      return `className="text-fg-dim opacity-${tw}"`;
    },
  },
  // ── seed-radius ──
  {
    from: /style=\{borderRadius:\s*"var\(--seed-radius\)"\s*\}/g,
    to: `style={{ borderRadius: "var(--seed-radius)" }}`,  // keep as is - can't easily be tailwind-ized
  },
];

let changedFiles = 0;

for (const filePath of tsxFiles) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  for (const { from, to } of replacements) {
    if (typeof to === 'string') {
      content = content.replace(from, to);
    } else {
      content = content.replace(from, to);
    }
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    changedFiles++;
    console.log(`  ✓ ${path.relative(srcDir, filePath)}`);
  }
}

console.log(`\nPass 3 done! ${changedFiles} files modified.`);

const remaining = execSync(
  `grep -rn "style=" "${srcDir}" --include="*.tsx" | grep -o "var(--[^)]*)" | sort | uniq -c | sort -rn`,
  { encoding: 'utf8' }
);
console.log('\nRemaining var(--) patterns:');
console.log(remaining || '  (none)');
