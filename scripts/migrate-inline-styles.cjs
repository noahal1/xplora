/**
 * Batch migration script: replaces inline style={{ var(--...) }} patterns
 * with Tailwind v4 @theme utility classes in all .tsx files.
 *
 * Usage: node scripts/migrate-inline-styles.cjs
 *
 * Mapping table:
 *   var(--fg-muted)        → text-muted-foreground   (already mapped via @theme)
 *   var(--fg-dim)           → text-fg-dim            (NEWLY mapped)
 *   var(--fg-secondary)     → text-fg-secondary      (NEWLY mapped)
 *   var(--seed-primary)     → text-primary           (already mapped)
 *   var(--seed-fg)          → text-foreground        (already mapped)
 *   var(--destructive)      → text-destructive       (already mapped)
 *   var(--bg-card)          → bg-bg-card             (NEWLY mapped)
 *   var(--bg-input)         → bg-bg-input            (NEWLY mapped)
 *   var(--accent-glow)      → bg-accent-glow         (NEWLY mapped)
 *   var(--border-subtle)    → border-border-subtle   (NEWLY mapped)
 *   var(--primary-20)       → border-primary-20      (NEWLY mapped)
 *   var(--seed-radius)      → rounded-[var(--seed-radius)] (keep as CSS var)
 *   borderTop: 1px solid var(--border-subtle)  → border-t border-border-subtle
 *   borderBottom: 1px solid var(--border-subtle) → border-b border-border-subtle
 *   border: 1px solid var(--border-subtle)     → border border-border-subtle
 *   border: 1px solid var(--border-default)     → use existing border classes
 *   borderTop: 1px solid color-mix(...)         → keep (complex expression)
 *   background: "var(--accent-glow)"            → bg-accent-glow
 *   color: "var(--seed-primary)"                → text-primary
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcDir = path.resolve(__dirname, '../frontend/src');

// Collect all .tsx files
const tsxFiles = execSync(`find "${srcDir}" -name "*.tsx"`, { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);

console.log(`Found ${tsxFiles.length} .tsx files`);

// ---- Pattern replacements ----
// Simple patterns: replace entire inline style block with a className addition.
// Complex patterns merge both style and className.

const replacements = [
  // ── Color: fg-muted → text-muted-foreground ───────────────────
  {
    search: /style=\{(\s*\{?\s*)?color:\s*"var\(--fg-muted\)"\s*\}?\s*\}/g,
    replace: 'className="text-muted-foreground"',
    test: /style=\{[\s]*color:\s*"var\(--fg-muted\)"[\s]*\}/,
  },
  // ── Color: seed-primary → text-primary ────────────────────────
  {
    search: /style=\{(\s*\{?\s*)?color:\s*"var\(--seed-primary\)"\s*\}?\s*\}/g,
    replace: 'className="text-primary"',
  },
  // ── Color: fg-dim → text-fg-dim ───────────────────────────────
  {
    search: /style=\{(\s*\{?\s*)?color:\s*"var\(--fg-dim\)"\s*\}?\s*\}/g,
    replace: 'className="text-fg-dim"',
  },
  // ── Color: fg-secondary → text-fg-secondary ───────────────────
  {
    search: /style=\{(\s*\{?\s*)?color:\s*"var\(--fg-secondary\)"\s*\}?\s*\}/g,
    replace: 'className="text-fg-secondary"',
  },
  // ── Color: seed-fg → text-foreground ──────────────────────────
  {
    search: /style=\{(\s*\{?\s*)?color:\s*"var\(--seed-fg\)"\s*\}?\s*\}/g,
    replace: 'className="text-foreground"',
  },
  // ── Color: destructive → text-destructive ─────────────────────
  {
    search: /style=\{(\s*\{?\s*)?color:\s*"var\(--destructive\)"\s*\}?\s*\}/g,
    replace: 'className="text-destructive"',
  },
  // ── Background: bg-card → bg-bg-card ──────────────────────────
  {
    search: /style=\{(\s*\{?\s*)?background:\s*"var\(--bg-card\)"\s*\}?\s*\}/g,
    replace: 'className="bg-bg-card"',
  },
  // ── Background: bg-input → bg-bg-input ────────────────────────
  {
    search: /style=\{(\s*\{?\s*)?background:\s*"var\(--bg-input\)"\s*\}?\s*\}/g,
    replace: 'className="bg-bg-input"',
  },
  // ── Background: accent-glow → bg-accent-glow ──────────────────
  {
    search: /style=\{(\s*\{?\s*)?background:\s*"var\(--accent-glow\)"\s*\}?\s*\}/g,
    replace: 'className="bg-accent-glow"',
  },
];

// For border patterns we need to handle the className merge
const borderReplacements = [
  {
    search: /style=\{(\s*\{?\s*)?borderTop:\s*"1px solid var\(--border-subtle\)"\s*\}?\s*\}/g,
    // These need to be merged into existing className
    replacementLine: true,
  },
  {
    search: /style=\{(\s*\{?\s*)?borderBottom:\s*"1px solid var\(--border-subtle\)"\s*\}?\s*\}/g,
    replacementLine: true,
  },
  {
    search: /style=\{(\s*\{?\s*)?border:\s*"1px solid var\(--border-subtle\)"\s*\}?\s*\}/g,
    replacementLine: true,
  },
];

// Process each file
let totalChanges = 0;
let changedFiles = 0;

for (const filePath of tsxFiles) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;
  let fileChanged = false;

  // Simple single-property style blocks
  for (const r of replacements) {
    if (r.search.test(content)) {
      content = content.replace(r.search, r.replace);
    }
  }

  // Border patterns: need to be smarter about merging className
  // borderTop + single className
  content = content.replace(
    /style=\{[\s]*borderTop:\s*"1px solid var\(--border-subtle\)"[\s]*\}/g,
    (match) => {
      fileChanged = true;
      // Find the nearest className="" and merge or add
      return 'className="border-t border-border-subtle"';
    }
  );

  content = content.replace(
    /style=\{[\s]*borderBottom:\s*"1px solid var\(--border-subtle\)"[\s]*\}/g,
    (match) => {
      fileChanged = true;
      return 'className="border-b border-border-subtle"';
    }
  );

  content = content.replace(
    /style=\{[\s]*border:\s*"1px solid var\(--border-subtle\)"[\s]*\}/g,
    (match) => {
      fileChanged = true;
      return 'className="border border-border-subtle"';
    }
  );

  // Write back if changed
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    const diff = content.length - original.length;
    totalChanges += Math.abs(diff);
    changedFiles++;
    console.log(`  ✓ ${path.relative(srcDir, filePath)}`);
  }
}

console.log(`\nDone! ${changedFiles} files modified.`);

// Now check for any remaining inline var(--) patterns
const remaining = execSync(
  `grep -rn "style=" "${srcDir}" --include="*.tsx" | grep -o "var(--[^)]*)" | sort | uniq -c | sort -rn`,
  { encoding: 'utf8' }
);
console.log('\nRemaining var(--) patterns in inline styles:');
console.log(remaining || '  (none)');
