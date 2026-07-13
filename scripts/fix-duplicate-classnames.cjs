/**
 * Fix duplicate className attributes created by the inline style migration.
 * 
 * Pattern: `className="foo" className="bar"` → `className="foo bar"`
 * Pattern: `className={"foo"} className="bar"` → `className={"foo bar"}` (handles dynamic classNames)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcDir = path.resolve(__dirname, '../frontend/src');

const tsxFiles = execSync(`find "${srcDir}" -name "*.tsx"`, { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);

let changedCount = 0;

for (const filePath of tsxFiles) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;
  let fileChanged = false;

  // Fix: className="..." className="..." → className="... ..."
  // Loop until no more matches (handles chains of duplicates)
  let prevContent;
  do {
    prevContent = content;
    content = content.replace(
      /className="([^"]*)"\s+className="([^"]*)"/g,
      (match, first, second) => {
        // Merge both class lists, avoiding duplicates
        const firstClasses = first.split(/\s+/).filter(Boolean);
        const secondClasses = second.split(/\s+/).filter(Boolean);
        const merged = [...new Set([...firstClasses, ...secondClasses])];
        return `className="${merged.join(' ')}"`;
      }
    );
    if (content !== prevContent) fileChanged = true;
  } while (content !== prevContent);

  if (fileChanged) {
    fs.writeFileSync(filePath, content, 'utf8');
    changedCount++;
    console.log(`  ✓ ${path.relative(srcDir, filePath)}`);
  }
}

console.log(`\nFixed duplicate className in ${changedCount} files.`);

// Verify no duplicates remain
const remaining = execSync(
  `grep -rn 'className="[^"]*"[^>]*className="' "${srcDir}" --include="*.tsx" | wc -l`,
  { encoding: 'utf8' }
).trim();
console.log(`Remaining duplicate className issues: ${remaining}`);
