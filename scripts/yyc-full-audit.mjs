import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const CURRENT_PRODUCTION_JS_VERSION = "20261008-02";
const CURRENT_PRODUCTION_CSS_VERSION = "20261006-01";
const ignored = new Set([".git", "node_modules"]);

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full));
    else out.push(path.relative(ROOT, full).replaceAll(path.sep, "/"));
  }
  return out;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function normalizeTarget(from, ref) {
  const raw = String(ref || "").split("?")[0].split("#")[0];
  if (!raw || /^(https?:|data:|mailto:|tel:|javascript:)/i.test(raw) || raw.startsWith("#")) return null;
  const joined = raw.startsWith("/") ? raw.slice(1) : path.join(path.dirname(from), raw);
  const parts = [];
  for (const part of joined.replaceAll("\\\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

const files = walk(ROOT);
const fileSet = new Set(files);
const issues = [];
const warnings = [];

function localTargetExists(target) {
  if (fileSet.has(target)) return true;
  const directoryIndex = target.replace(/\/+$/, "") + "/index.html";
  return fileSet.has(directoryIndex);
}

const jsFiles = files.filter(f => /\.(?:js|mjs|cjs)$/i.test(f));
for (const file of jsFiles) {
  const r = spawnSync(process.execPath, ["--check", file], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) issues.push("JS syntax: " + file + "\\n" + (r.stderr || r.stdout || "").trim());
}

for (const file of files.filter(f => /\.css$/i.test(f))) {
  const raw = read(file);
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "");
  let depth = 0;
  for (const ch of stripped) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth < 0) break;
  }
  if (depth !== 0) issues.push("CSS brace mismatch: " + file);
}

for (const file of files.filter(f => /\.html?$/i.test(f))) {
  const html = read(file);
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map(m => m[1]);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) issues.push("Duplicate id in " + file + ": #" + id);
    seen.add(id);
  }

  const refs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map(m => m[1]);
  for (const ref of refs) {
    const target = normalizeTarget(file, ref);
    if (target && !localTargetExists(target)) {
      issues.push("Missing local reference: " + file + " -> " + ref + " (resolved " + target + ")");
    }
  }

  const prodJs = [...html.matchAll(/<script[^>]+src=["']([^"']*yyc-production\.js\?v=([^"']+))["']/gi)];
  const prodCss = [...html.matchAll(/<link[^>]+href=["']([^"']*yyc-production\.css\?v=([^"']+))["']/gi)];
  for (const m of prodJs) {
    if (m[2] !== CURRENT_PRODUCTION_JS_VERSION) {
      issues.push("Stale YYC production JS version in " + file + ": " + m[2] + " (expected " + CURRENT_PRODUCTION_JS_VERSION + ")");
    }
  }
  for (const m of prodCss) {
    if (m[2] !== CURRENT_PRODUCTION_CSS_VERSION) {
      issues.push("Stale YYC production CSS version in " + file + ": " + m[2] + " (expected " + CURRENT_PRODUCTION_CSS_VERSION + ")");
    }
  }

}

/* CSS local asset references are part of the runtime surface too. */
for (const file of files.filter(f => /\.css$/i.test(f))) {
  const css = read(file);
  for (const m of css.matchAll(/url\(\s*["']?([^"'\)]+)["']?\s*\)/gi)) {
    const raw = String(m[1] || "").split("?")[0].split("#")[0];
    if (!raw || /^(https?:|data:|blob:|javascript:|%23)/i.test(raw)) continue;
    const target = normalizeTarget(file, raw);
    if (target && !localTargetExists(target)) {
      issues.push("Missing CSS local reference: " + file + " -> " + raw + " (resolved " + target + ")");
    }
  }
}

const sourceText = files.filter(f => f !== "scripts/yyc-full-audit.mjs" && /\.(?:html?|js|css)$/i.test(f)).map(read).join("\n");
if (/(?<!\$)\$\((["'])[^"']+\1\)\.forEach/g.test(sourceText)) {
  issues.push("Single-element $().forEach() runtime pattern found.");
}

const index = read("index.html");
const app = read("app.js");
const yyc90 = read("yyc90.js");
const production = read("yyc-production.js");
const responsiveCss = read("assets/yyc-responsive.css");

/* Dynamic manifest injection must point to a real file. */
if (yyc90.includes("manifest.webmanifest") && !fileSet.has("manifest.webmanifest")) {
  issues.push("Missing dynamic PWA manifest: manifest.webmanifest");
}

/* YYC90 render functions are internal to yyc90.js and must have definitions. */
const yyc90RenderDefs = new Set([...yyc90.matchAll(/function\s+(render[A-Za-z0-9_$]*90[A-Za-z0-9_$]*)\s*\(/g)].map(m => m[1]));
const yyc90RenderCalls = new Set([...yyc90.matchAll(/\b(render[A-Za-z0-9_$]*90[A-Za-z0-9_$]*)\s*\(/g)].map(m => m[1]));
for (const fn of yyc90RenderCalls) {
  if (!yyc90RenderDefs.has(fn)) issues.push("YYC90 render function missing definition: " + fn);
}



if(/\$Array\.prototype/.test(app)) {
  issues.push("app.js contains the invalid $Array.prototype runtime reference.");
}
if(!responsiveCss.includes("never hide public content")) {
  warnings.push("Responsive reveal block should preserve content visibility while motion is optional.");
}


const coreButtons = [
  "memberLoginBtn","leaderLoginBtn","adminOpenBtn","menuBtn",
  "memberLoginMobile","leaderLoginMobile","adminOpenMobile",
  "submitUpdateBtn","submitGalleryBtn","memberRegisterBtn","footerAdminBtn"
];
for (const id of coreButtons) {
  const exists = index.includes('id="' + id + '"');
  const handled =
    app.includes("#" + id) ||
    app.includes("'" + id + "'") ||
    app.includes('"' + id + '"') ||
    (id === "menuBtn" && app.includes("menuBtn.addEventListener")) ||
    yyc90.includes(id) ||
    production.includes(id);
  if (!exists) issues.push("Core button missing: #" + id);
  else if (!handled) issues.push("Core button has no detected JS wiring: #" + id);
}

const adminActions = [
  "data-view","data-download-member","data-edit-member","data-reset-member","data-review-member",
  "data-approve","data-mark-duplicate","data-deny","data-remove",
  "data-card-leader","data-download-leader","data-edit-leader","data-reset-leader","data-del-leader",
  "data-edit-update","data-del-update","data-edit-gallery","data-del-gallery",
  "data-edit-swag","data-del-swag","data-am","data-dm","data-au","data-du","data-ag","data-dg",
  "data-edit-event","data-del-event"
];
const adminSource = app;
for (const attr of adminActions) {
  const count = (adminSource.match(new RegExp(attr.replace(/[.*+?^$()|[\]\\]/g, "\\$&"), "g")) || []).length;
  if (count < 2) issues.push("Admin control wiring looks incomplete for [" + attr + "] (found " + count + " references)");
}

const adminTabs = ["overview","members","leaders","updates","gallery","swags","approvals","events","notifications","activity","reports","storage","settings"];
for (const tab of adminTabs) {
  if (!adminSource.includes("'" + tab + "'") || !adminSource.includes("tab==='" + tab + "'")) {
    issues.push("Admin tab wiring incomplete: " + tab);
  }
}

const customTabs = ["volunteers","achievements","history","attendance","attendance_pct","attendance_reports","finance","messages","analytics","backup","sitepro"];
for (const tab of customTabs) {
  if (!yyc90.includes("'" + tab + "'") || !yyc90.includes("tab==='" + tab + "'")) {
    issues.push("YYC90 custom admin tab wiring incomplete: " + tab);
  }
}

if (/document\.addEventListener\(["']input["'][\s\S]{0,2200}localStorage\.setItem\([\s\S]{0,500}(?:document\.querySelectorAll|qa)\(["']input,textarea,select["']/.test(production)) {
  issues.push("Admin draft autosave still scans the whole document on each keystroke.");
}

if (/setInterval\([^,]+,\s*100\)/.test(read("access.js"))) {
  warnings.push("access.js has a legacy 100ms polling fallback; index.html does not load access.js.");
}

const large = files
  .map(f => ({ f, n: fs.statSync(path.join(ROOT, f)).size }))
  .filter(x => x.n > 180000)
  .sort((a,b) => b.n-a.n);
if (large.length) {
  warnings.push("Large source files: " + large.map(x => x.f + " (" + Math.round(x.n/1024) + " KB)").join(", "));
}


/* Navigation regression guard: a section anchor has exactly one source of active
   state, and the exclusive styling must be the final stylesheet in the page. */
const desktopNavMatch = index.match(/<nav\b[^>]*class=["'][^"']*\bdesktop-nav\b[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i);
if (!desktopNavMatch) {
  issues.push("Desktop primary navigation is missing.");
} else {
  const navMarkup = desktopNavMatch[1];
  const navTargets = [...navMarkup.matchAll(/<a\b[^>]*class=["'][^"']*\bnav-link\b[^"']*["'][^>]*>/gi)]
    .map(m => {
      const href = (m[0].match(/\bhref=["']#([^"']+)["']/i) || [])[1];
      return href || "";
    });
  if (!navTargets.length) issues.push("Desktop navigation has no section links.");
  const targetCounts = new Map();
  for (const target of navTargets) {
    targetCounts.set(target, (targetCounts.get(target) || 0) + 1);
    if (!target) {
      issues.push("Desktop navigation contains a nav-link without a local section target.");
      continue;
    }
    if (!index.includes('id="' + target + '"') && !index.includes("id='" + target + "'")) {
      issues.push("Desktop navigation target is missing: #" + target);
    }
  }
  for (const [target, count] of targetCounts) {
    if (count > 1) issues.push("Duplicate desktop navigation target: #" + target);
  }
}
const navActiveCssPath = "assets/yyc-nav-active-state.css";
if (!fileSet.has(navActiveCssPath)) {
  issues.push("Exclusive navigation stylesheet is missing.");
} else {
  const navCss = read(navActiveCssPath);
  if (!navCss.includes(".desktop-nav > a.nav-link:not(.active)") ||
      !navCss.includes(".desktop-nav > a.nav-link.active") ||
      !navCss.includes("content: none !important") ||
      !navCss.includes(".yyc-nav-highlight")) {
    issues.push("Exclusive navigation stylesheet is missing one or more single-active-state safeguards.");
  }
  if (!navCss.includes(".desktop-nav > a.nav-link.active::before") ||
      !navCss.includes("transition:") ||
      !navCss.includes("@media (prefers-reduced-motion: reduce)")) {
    issues.push("Smooth active-tab box animation or reduced-motion support is missing.");
  }
}
const stylesheetLinks = [...index.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)];
const finalStylesheetTag = stylesheetLinks.length ? stylesheetLinks[stylesheetLinks.length - 1][0] : "";
if (!finalStylesheetTag.includes(navActiveCssPath)) {
  issues.push("Exclusive navigation stylesheet must be the final linked stylesheet in index.html.");
}
if ((app.match(/function\s+setYYCNavActive\s*\(/g) || []).length !== 1) {
  issues.push("Navigation should have exactly one setYYCNavActive controller.");
}
const navigationSourceStart = app.indexOf("function bindNavigation()");
const navigationSourceEnd = app.indexOf("function submitUpdate()", navigationSourceStart);
const navigationSource = navigationSourceStart >= 0 && navigationSourceEnd > navigationSourceStart
  ? app.slice(navigationSourceStart, navigationSourceEnd)
  : "";
const navigationScrollHandler = navigationSource.match(/window\.addEventListener\(['"]scroll['"],function\(\)\{([\s\S]*?)\},\{passive:true\}\);/);
if (!navigationScrollHandler || !navigationScrollHandler[1].includes("updateYYCActiveSection()")) {
  issues.push("Navigation scroll handler must refresh the active tab as the visible section changes.");
}
const userScrollHandler = navigationSource.match(/function noteUserScrollIntent\(\)\{([\s\S]*?)\n  \}/);
if (!userScrollHandler || !userScrollHandler[1].includes("window.__yycNavLockUntil=0")) {
  issues.push("Manual scrolling must cancel the navigation active-tab lock.");
}
if (!navigationSource.includes("releaseLockWhenSettled()") ||
    !navigationSource.includes("window.__yycNavTargetId=''")) {
  issues.push("Navigation lock must release when the destination settles or the visitor interrupts scrolling.");
}
if (!/a\.classList\.toggle\(['"]active['"],\s*selected\)/.test(app) ||
    !app.includes("a.removeAttribute('aria-current')")) {
  issues.push("Navigation controller must synchronize the single active class and aria-current state.");
}
if (/function\s+syncYYCNavHighlight\s*\(/.test(app) ||
    /id=["']yycNavHighlight["']/.test(index)) {
  issues.push("Legacy moving navigation highlight was reintroduced.");
}
const currentBuild = "20261012-38-build15-hash-navigation";
if (!index.includes('name="yyc-build" content="' + currentBuild + '"') ||
    !index.includes('styles.css?v=' + currentBuild) ||
    !index.includes('app.js?v=' + currentBuild) ||
    !index.includes('yyc-nav-active-state.css?v=' + currentBuild) ||
    !app.includes("var YYC_APP_BUILD='" + currentBuild + "'")) {
  issues.push("Navigation fix cache-busting/build identifiers are inconsistent.");
}


/* Build 15 reliability checks: monitor the Reel section, validate backup truthfully,
   and keep a real browser navigation regression test in the default CI path. */
const productionMonitor = read("scripts/production-monitor.mjs");
const backupWorkflow = read(".github/workflows/yyc-offsite-backup.yml");
const backupValidator = read("scripts/validate-backup.mjs");
const browserRegression = read("scripts/yyc-browser-regression.mjs");
const browserWorkflow = read(".github/workflows/yyc-browser-regression.yml");

if (!productionMonitor.includes("'reel'") ||
    !productionMonitor.includes("checkHtml(path,html,expectedMarker)")) {
  issues.push("Production monitor must execute the homepage section checks and include #reel.");
}
if (!backupWorkflow.includes("YYC backup status: FAILED") ||
    !backupWorkflow.includes("exit 1") ||
    !backupWorkflow.includes("node scripts/validate-backup.mjs yyc-backup.json") ||
    !backupWorkflow.includes("cmp -s yyc-backup.json yyc-backup-verify.json") ||
    !backupWorkflow.includes("if-no-files-found: error")) {
  issues.push("Encrypted backup workflow must report missing configuration, validate its snapshot, and verify the encrypted artifact.");
}
if (!backupValidator.includes("snapshot.ok !== true") ||
    !backupValidator.includes("JSON.parse")) {
  issues.push("Backup snapshot validator is missing JSON or RPC success validation.");
}
if (!browserRegression.includes("playwright") ||
    !browserRegression.includes("DESKTOP NAV PASS") ||
    !browserRegression.includes("DEEP LINK PASS") ||
    !browserRegression.includes("LOGIN PANEL CLOSE PASS") ||
    !browserRegression.includes("MOBILE NAV PASS") ||
    !browserWorkflow.includes("node scripts/yyc-browser-regression.mjs")) {
  issues.push("Real Chromium desktop/mobile navigation regression coverage is missing from CI.");
}
if (!/fonts\.googleapis\.com\/css2\?[^"']*display=swap/.test(index)) {
  warnings.push("Google Fonts stylesheet should use display=swap to reduce invisible-text time.");
}
if (!read("assets/yyc-reels.js").includes("Large videos use more project storage")) {
  warnings.push("Reel uploader should remind administrators about storage usage and project upload limits.");
}

console.log("YYC FULL SITE AUDIT");
console.log("Files scanned:", files.length);
console.log("JavaScript files checked:", jsFiles.length);
console.log("Issues:", issues.length);
if (issues.length) console.error(issues.join("\n---\n"));
console.log("Warnings:", warnings.length);
if (warnings.length) console.warn(warnings.join("\n"));
if (issues.length) process.exit(1);
console.log("PASS: repository static, reference, button-wiring and performance-pattern audit completed.");
