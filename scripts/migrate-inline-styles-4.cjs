/**
 * Fourth and final pass: handle remaining multi-property patterns with
 * exact string matching (not regex) to avoid escape issues.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcDir = path.resolve(__dirname, '../frontend/src');

// Map of file (relative to srcDir) → array of { from, to }
const exactReplacements = {
  // ── AboutModal.tsx ──
  'components/AboutModal.tsx': [
    // style={{ height: "1px", background: "var(--border-subtle)" }}
    { from: `style={{ height: "1px", background: "var(--border-subtle)" }}`, to: `className="h-px" style={{ background: "var(--border-subtle)" }}` },
  ],

  // ── HistorySidebar.tsx ──
  'components/HistorySidebar.tsx': [
    { from: `style={{ background: "var(--destructive)", color: "#fff", borderColor: "transparent" }}`, to: `className="bg-destructive text-white" style={{ borderColor: "transparent" }}` },
  ],

  // ── ManageTab/ManageMobileCard.tsx ──
  'components/ManageTab/ManageMobileCard.tsx': [
    { from: `style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}`, to: `className="bg-bg-card border border-border"` },
    { from: `style={{ border: "1px solid var(--border-subtle)" }}`, to: `className="border border-border-subtle"` },
  ],

  // ── ManageTab/ManageTableRow.tsx ──
  'components/ManageTab/ManageTableRow.tsx': [
    { from: `style={{ border: "1px solid var(--border-subtle)" }}`, to: `className="border border-border-subtle"` },
  ],

  // ── ManageTab/RematchModal.tsx ──
  'components/ManageTab/RematchModal.tsx': [
    { from: `style={{ border: "1px solid var(--border-subtle)" }}`, to: `className="border border-border-subtle"` },
  ],

  // ── ManageTab/TVSeriesManageRow.tsx ──
  'components/ManageTab/TVSeriesManageRow.tsx': [
    { from: `style={{ background: "var(--bg-input)", border: "1px solid var(--border-subtle)" }}`, to: `className="bg-bg-input border border-border-subtle"` },
  ],

  // ── ManageTab/GenreEditModal.tsx ──
  'components/ManageTab/GenreEditModal.tsx': [
    { from: `style={{ border: "1px solid var(--border-subtle)" }}`, to: `className="border border-border-subtle"` },
  ],

  // ── SearchSourceSelector.tsx ──
  'components/SearchSourceSelector.tsx': [
    { from: `style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)" }}`, to: `className="bg-bg-input border border-border"` },
  ],

  // ── shared/SearchResultCard.tsx ──
  'components/shared/SearchResultCard.tsx': [
    { from: `style={{ border: "1px solid var(--border-subtle)" }}`, to: `className="border border-border-subtle"` },
  ],

  // ── TabNav.tsx ──
  'components/TabNav.tsx': [
    { from: `style={{ borderBottom: "1px solid var(--border-subtle)" }}`, to: `className="border-b border-border-subtle"` },
    { from: `style={{ background: "var(--seed-bg)", borderTop: "1px solid var(--border-default)"`, to: `className="bg-background border-t border-border" style={{` },
  ],

  // ── tabs/history/SessionDetail.tsx ──
  'components/tabs/history/SessionDetail.tsx': [
    { from: `style={{ borderBottom: "1px solid var(--border-subtle)" }}`, to: `className="border-b border-border-subtle"` },
  ],

  // ── tabs/history/SessionList.tsx ──
  'components/tabs/history/SessionList.tsx': [
    { from: `style={{ background: "var(--accent-glow)", border: "1px solid var(--primary-20)" }}`, to: `className="bg-accent-glow border border-primary-20"` },
    { from: `style={{ background: "var(--destructive)", color: "#fff", borderColor: "transparent" }}`, to: `className="bg-destructive text-white" style={{ borderColor: "transparent" }}` },
  ],

  // ── tabs/recommend/ChatPanel.tsx ──
  'components/tabs/recommend/ChatPanel.tsx': [
    { from: `style={{ borderBottom: "1px solid var(--border-subtle)" }}`, to: `className="border-b border-border-subtle"` },
    { from: `style={{ borderTop: "1px solid var(--border-subtle)" }}`, to: `className="border-t border-border-subtle"` },
  ],

  // ── tabs/top_rated/TopRatedMobileCard.tsx ──
  'components/tabs/top_rated/TopRatedMobileCard.tsx': [
    { from: `style={{ border: "1px solid var(--border-subtle)" }}`, to: `className="border border-border-subtle"` },
  ],

  // ── tabs/watched/MovieGridCard.tsx ──
  'components/tabs/watched/MovieGridCard.tsx': [
    { from: `style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}`, to: `className="bg-bg-card border border-border"` },
  ],

  // ── tabs/watched/MovieListItem.tsx ──
  'components/tabs/watched/MovieListItem.tsx': [
    { from: `style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}`, to: `className="bg-bg-card border border-border"` },
    { from: `style={{ border: "1px solid var(--border-subtle)" }}`, to: `className="border border-border-subtle"` },
  ],

  // ── tabs/watched/TVSeriesGroupCard.tsx ──
  'components/tabs/watched/TVSeriesGroupCard.tsx': [
    { from: `style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}`, to: `className="bg-bg-card border border-border"` },
  ],

  // ── tabs/watched/TVSeriesGroupItem.tsx ──
  'components/tabs/watched/TVSeriesGroupItem.tsx': [
    { from: `style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}`, to: `className="bg-bg-card border border-border"` },
    { from: `style={{ border: "1px solid var(--border-subtle)" }}`, to: `className="border border-border-subtle"` },
  ],

  // ── tabs/watched/WatchedMobileCard.tsx ──
  'components/tabs/watched/WatchedMobileCard.tsx': [
    { from: `style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}`, to: `className="bg-bg-card border border-border"` },
    { from: `style={{ border: "1px solid var(--border-subtle)" }}`, to: `className="border border-border-subtle"` },
  ],

  // ── tabs/wishlist/WishlistMobileCard.tsx ──
  'components/tabs/wishlist/WishlistMobileCard.tsx': [
    { from: `style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}`, to: `className="bg-bg-card border border-border"` },
    { from: `style={{ border: "1px solid var(--border-subtle)" }}`, to: `className="border border-border-subtle"` },
  ],

  // ── pages/AdminDiagnosticsPage.tsx ──
  'pages/AdminDiagnosticsPage.tsx': [
    { from: `style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}`, to: `className="bg-bg-card border border-border"` },
    { from: `style={{ border: "1px solid var(--border-subtle)" }}`, to: `className="border border-border-subtle"` },
  ],

  // ── pages/AdminPanel.tsx ──
  'pages/AdminPanel.tsx': [
    { from: `style={{ background: 'var(--destructive)', color: '#fff', borderColor: 'transparent' }}`, to: `className="bg-destructive text-white" style={{ borderColor: "transparent" }}` },
  ],

  // ── pages/AdminUsersPage.tsx ──
  'pages/AdminUsersPage.tsx': [
    { from: `style={{ background: 'var(--destructive)', color: '#fff', borderColor: 'transparent' }}`, to: `className="bg-destructive text-white" style={{ borderColor: "transparent" }}` },
  ],
};

let changedCount = 0;
let changedFiles = 0;

for (const [relPath, replacements] of Object.entries(exactReplacements)) {
  const fullPath = path.join(srcDir, relPath);
  if (!fs.existsSync(fullPath)) {
    console.log(`  ✗ ${relPath} not found`);
    continue;
  }
  let content = fs.readFileSync(fullPath, 'utf8');
  let original = content;
  
  for (const { from, to } of replacements) {
    // Count occurrences
    const occurrences = content.split(from).length - 1;
    if (occurrences > 0) {
      content = content.split(from).join(to);
    }
  }

  if (content !== original) {
    fs.writeFileSync(fullPath, content, 'utf8');
    changedFiles++;
    console.log(`  ✓ ${relPath}`);
  }
}

console.log(`\nDone! ${changedFiles} files modified.`);

// Remaining count
const remaining = execSync(
  `grep -rn "style=" "${srcDir}" --include="*.tsx" | grep -o "var(--[^)]*)" | sort | uniq -c | sort -rn`,
  { encoding: 'utf8' }
);
console.log('\nRemaining var(--) patterns:');
console.log(remaining || '  (none)');
