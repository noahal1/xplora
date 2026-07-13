/**
 * Second pass: handle complex multi-property inline styles and
 * elements with existing className + inline style combinations.
 *
 * For elements with both className and an inline style that can
 * be converted to a Tailwind class, we merge them.
 *
 * For multi-property style blocks (e.g. background + border + color),
 * we either keep them if complex, or split into individual classNames
 * if simple enough.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcDir = path.resolve(__dirname, '../frontend/src');

// Find all .tsx files
const tsxFiles = execSync(`find "${srcDir}" -name "*.tsx"`, { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);

let changedFiles = 0;

for (const filePath of tsxFiles) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // ── Pattern: className="..." style={{ background: "var(--bg-card)" }} ──
  // → className="... bg-bg-card"
  content = content.replace(
    /className="([^"]*)"\s+style=\{background:\s*"var\(--bg-card\)"\s*\}/g,
    (match, cls) => {
      if (cls.includes('bg-bg-card')) return match; // already done
      return `className="${cls} bg-bg-card"`;
    }
  );

  // className="..." style={{ color: "var(--fg-muted)" }}
  content = content.replace(
    /className="([^"]*)"\s+style=\{color:\s*"var\(--fg-muted\)"\s*\}/g,
    (match, cls) => {
      if (cls.includes('text-muted-foreground')) return match;
      return `className="${cls} text-muted-foreground"`;
    }
  );

  // className="..." style={{ color: "var(--fg-dim)" }}
  content = content.replace(
    /className="([^"]*)"\s+style=\{color:\s*"var\(--fg-dim\)"\s*\}/g,
    (match, cls) => {
      if (cls.includes('text-fg-dim')) return match;
      return `className="${cls} text-fg-dim"`;
    }
  );

  // className="..." style={{ color: "var(--fg-secondary)" }}
  content = content.replace(
    /className="([^"]*)"\s+style=\{color:\s*"var\(--fg-secondary\)"\s*\}/g,
    (match, cls) => {
      if (cls.includes('text-fg-secondary')) return match;
      return `className="${cls} text-fg-secondary"`;
    }
  );

  // className="..." style={{ color: "var(--seed-primary)" }}
  content = content.replace(
    /className="([^"]*)"\s+style=\{color:\s*"var\(--seed-primary\)"\s*\}/g,
    (match, cls) => {
      if (cls.includes('text-primary')) return match;
      return `className="${cls} text-primary"`;
    }
  );

  // className="..." style={{ background: "var(--bg-input)" }}
  content = content.replace(
    /className="([^"]*)"\s+style=\{background:\s*"var\(--bg-input\)"\s*\}/g,
    (match, cls) => {
      if (cls.includes('bg-bg-input')) return match;
      return `className="${cls} bg-bg-input"`;
    }
  );

  // className="..." style={{ background: "var(--accent-glow)" }}
  content = content.replace(
    /className="([^"]*)"\s+style=\{background:\s*"var\(--accent-glow\)"\s*\}/g,
    (match, cls) => {
      if (cls.includes('bg-accent-glow')) return match;
      return `className="${cls} bg-accent-glow"`;
    }
  );

  // ── Handle multi-line style blocks with var(--border-subtle) ──
  // These are harder. Let's handle specific multi-property blocks.

  // Multi-property: style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--seed-radius)", ... }}
  // → convert border to a className, keep borderRadius
  content = content.replace(
    /style=\{border:\s*"1px solid var\(--border-subtle\)",\s*([^}]+)\}/g,
    (match, rest) => {
      return `className="border border-border-subtle" style={{ ${rest} }`;
    }
  );

  // style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", ... }}
  content = content.replace(
    /style=\{background:\s*"var\(--bg-card\)",\s*border:\s*"1px solid var\(--border-subtle\)",\s*color:\s*"var\(--fg-muted\)"\s*\}/g,
    (match) => {
      return `className="bg-bg-card border border-border-subtle text-muted-foreground"`;
    }
  );

  // style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}
  content = content.replace(
    /style=\{background:\s*"var\(--bg-card\)",\s*border:\s*"1px solid var\(--border-default\)"\s*\}/g,
    `className="bg-bg-card border border-border"`
  );

  // style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
  content = content.replace(
    /style=\{background:\s*"var\(--bg-card\)",\s*border:\s*"1px solid var\(--border-subtle\)"\s*\}/g,
    `className="bg-bg-card border border-border-subtle"`
  );

  // style={{ borderTop: "1px solid var(--border-subtle)" }} when there's already a className
  content = content.replace(
    /className="([^"]*)"\s+style=\{borderTop:\s*"1px solid var\(--border-subtle\)"\s*\}/g,
    (match, cls) => {
      if (cls.includes('border-t')) return match;
      return `className="${cls} border-t border-border-subtle"`;
    }
  );

  // style={{ borderBottom: "1px solid var(--border-subtle)" }} when there's a className
  content = content.replace(
    /className="([^"]*)"\s+style=\{borderBottom:\s*"1px solid var\(--border-subtle\)"\s*\}/g,
    (match, cls) => {
      if (cls.includes('border-b')) return match;
      return `className="${cls} border-b border-border-subtle"`;
    }
  );

  // style={{ border: "1px solid var(--border-subtle)" }} when there's a className
  content = content.replace(
    /className="([^"]*)"\s+style=\{border:\s*"1px solid var\(--border-subtle\)"\s*\}/g,
    (match, cls) => {
      if (cls.includes('border-border-subtle')) return match;
      return `className="${cls} border border-border-subtle"`;
    }
  );

  // style={{ border: "1px solid var(--border-subtle)" }} when there's a dynamic className
  // Keep these as-is since they can't be easily merged
  
  // Write back
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    changedFiles++;
    console.log(`  ✓ ${path.relative(srcDir, filePath)}`);
  }
}

console.log(`\nPass 2 done! ${changedFiles} files modified.`);

// Remaining count
const remaining = execSync(
  `grep -rn "style=" "${srcDir}" --include="*.tsx" | grep -o "var(--[^)]*)" | sort | uniq -c | sort -rn`,
  { encoding: 'utf8' }
);
console.log('\nRemaining var(--) patterns:');
console.log(remaining || '  (none)');
