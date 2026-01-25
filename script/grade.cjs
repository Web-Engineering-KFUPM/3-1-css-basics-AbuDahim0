#!/usr/bin/env node

/**
 * Lab Autograder — 3-1-css-basics
 *
 * Marking:
 * - 80 marks for TODOs (CSS + HTML link check)
 * - 20 marks for submission timing (deadline-based)
 *   - On/before deadline => 20/20
 *   - After deadline     => 10/20
 *
 * Deadline: 26 Jan 2026 11:59 PM (Asia/Riyadh, UTC+03:00)
 *
 * Notes:
 * - Ignores HTML comments and CSS comments (so examples inside comments do NOT count).
 * - Light checks only: looks for selectors + key properties/values.
 * - Flexible on some equivalents:
 *   - background-color OR background
 *   - white OR #fff OR #ffffff
 *   - font-weight bold OR 700
 *   - font-size accepts px or common rem equivalents (16px/1rem, 14px/0.875rem, 12px/0.75rem, 18px/1.125rem)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ARTIFACTS_DIR = "artifacts";
const FEEDBACK_DIR = path.join(ARTIFACTS_DIR, "feedback");
fs.mkdirSync(FEEDBACK_DIR, { recursive: true });

/* -----------------------------
   Deadline (Asia/Riyadh)
   26 Jan 2026, 11:59 PM
-------------------------------- */
const DEADLINE_RIYADH_ISO = "2026-01-26T23:59:00+03:00";
const DEADLINE_MS = Date.parse(DEADLINE_RIYADH_ISO);

// Submission marks policy
const SUBMISSION_MAX = 20;
const SUBMISSION_LATE = 10;

/* -----------------------------
   TODO marks (out of 80)
   Note: NO new TODO10/11 entries — .simple-form checks are
   merged into TODO7 and TODO8. Marks adjusted to keep total=80.
-------------------------------- */
const tasks = [
  { id: "todo1", name: "TODO 1: HTML links styles.css in <head>", marks: 6 },
  { id: "todo2", name: "TODO 2: Basic Element Selectors (p, span)", marks: 10 },
  { id: "todo3", name: "TODO 3: Class Selectors (.username, .blue-text, .red-text, .highlight)", marks: 18 },
  { id: "todo4", name: "TODO 4: ID Selector (#featured-user)", marks: 5 },
  { id: "todo5", name: "TODO 5: Specificity Battle rules", marks: 8 },
  { id: "todo6", name: "TODO 6: !important override (.important-test)", marks: 6 },
  // increased to 11 to include .simple-form input checks
  { id: "todo7", name: "TODO 7: Descendant Selectors (.chat-container ... + .simple-form input)", marks: 11 },
  // increased to 11 to include .simple-form button:hover checks
  { id: "todo8", name: "TODO 8: Pseudo-classes (:hover rules + .simple-form button:hover)", marks: 11 },
  { id: "todo9", name: "TODO 9: Group Selectors (h4/h5/h6.trending-tag)", marks: 5 },
];

const STEPS_MAX = tasks.reduce((sum, t) => sum + t.marks, 0); // 80
const TOTAL_MAX = STEPS_MAX + SUBMISSION_MAX; // 100

/* -----------------------------
   Helpers
-------------------------------- */
function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function findFileByName(preferredName) {
  const preferred = path.join(process.cwd(), preferredName);
  if (fs.existsSync(preferred)) return preferred;

  const ignoreDirs = new Set(["node_modules", ".git", ARTIFACTS_DIR]);
  const stack = [process.cwd()];

  while (stack.length) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const e of entries) {
      const full = path.join(dir, e.name);

      if (e.isDirectory()) {
        if (!ignoreDirs.has(e.name)) stack.push(full);
      } else if (e.isFile() && e.name.toLowerCase() === preferredName.toLowerCase()) {
        return full;
      }
    }
  }
  return null;
}

function findAnyHtmlFile() {
  const preferred = path.join(process.cwd(), "index.html");
  if (fs.existsSync(preferred)) return preferred;

  const ignoreDirs = new Set(["node_modules", ".git", ARTIFACTS_DIR]);
  const stack = [process.cwd()];

  while (stack.length) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const e of entries) {
      const full = path.join(dir, e.name);

      if (e.isDirectory()) {
        if (!ignoreDirs.has(e.name)) stack.push(full);
      } else if (e.isFile() && e.name.toLowerCase().endsWith(".html")) {
        return full;
      }
    }
  }
  return null;
}

function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function mdEscape(s) {
  return String(s).replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function splitMarks(stepMarks, missingCount, totalChecks) {
  if (missingCount <= 0) return stepMarks;
  const perItem = stepMarks / totalChecks;
  const deducted = perItem * missingCount;
  return Math.max(0, round2(stepMarks - deducted));
}

/* -----------------------------
   Flexible CSS parsing (top-level)
--------------------------------
   Parses: selector { body }
   Not a full CSS parser, but works well for beginner CSS and lets us:
   - find ALL rules for a selector (order-independent)
   - allow repeated selectors/properties
-------------------------------- */
function parseTopLevelRules(css) {
  const rules = [];
  const re = /([^{}]+)\{([\s\S]*?)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const selectorText = (m[1] || "").trim();
    const body = (m[2] || "").trim();
    if (!selectorText) continue;

    // Support grouped selectors: "a, b, c"
    const selectors = selectorText
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    rules.push({ selectorText, selectors, body });
  }
  return rules;
}

function hasDecl(body, propRegex, valueRegex) {
  if (!body) return false;
  const re = new RegExp(`${propRegex.source}\\s*:\\s*${valueRegex.source}\\s*;?`, "i");
  return re.test(body);
}

function hasAnyDecl(body, options) {
  return options.some(o => hasDecl(body, o.prop, o.value));
}

function bodiesForExactSelector(rules, exactSelector) {
  const target = exactSelector.trim().toLowerCase();
  return rules
    .filter(r => r.selectors.some(s => s.trim().toLowerCase() === target))
    .map(r => r.body);
}

function bodiesForSelectorPattern(rules, selectorRegex) {
  return rules
    .filter(r => selectorRegex.test(r.selectorText))
    .map(r => r.body);
}

function anyRuleExistsForExactSelector(rules, exactSelector) {
  return bodiesForExactSelector(rules, exactSelector).length > 0;
}

function normalizeHead(html) {
  const m = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  return m ? m[1] : "";
}

function hasStylesheetLinkInHead(headHtml) {
  // flexible attribute order, allows ./styles.css or styles.css
  // require rel=stylesheet and href contains styles.css
  const linkTagRe = /<link\b[^>]*>/gi;
  const tags = headHtml.match(linkTagRe) || [];
  for (const tag of tags) {
    const relOk = /\brel\s*=\s*["']stylesheet["']/i.test(tag);
    const hrefOk = /\bhref\s*=\s*["'](\.\/)?styles\.css["']/i.test(tag);
    if (relOk && hrefOk) return true;
  }
  return false;
}

/* -----------------------------
   Determine submission time
-------------------------------- */
let lastCommitISO = null;
let lastCommitMS = null;

try {
  lastCommitISO = execSync("git log -1 --format=%cI", { encoding: "utf8" }).trim();
  lastCommitMS = Date.parse(lastCommitISO);
} catch {
  lastCommitISO = new Date().toISOString();
  lastCommitMS = Date.now();
}

/* -----------------------------
   Submission marks
-------------------------------- */
const isLate = Number.isFinite(lastCommitMS) ? lastCommitMS > DEADLINE_MS : true;
const submissionScore = isLate ? SUBMISSION_LATE : SUBMISSION_MAX;

/* -----------------------------
   Load student files
-------------------------------- */
const htmlFile = findAnyHtmlFile();
const cssFile = findFileByName("styles.css");

const htmlRaw = htmlFile ? safeRead(htmlFile) : null;
const cssRaw = cssFile ? safeRead(cssFile) : null;

const html = htmlRaw ? stripHtmlComments(htmlRaw) : null;
const css = cssRaw ? stripCssComments(cssRaw) : null;

const results = []; // { id, name, max, score, checklist[], deductions[] }

/* -----------------------------
   If files missing, grade accordingly
-------------------------------- */
function addResult(task, required, missing) {
  const score = splitMarks(task.marks, missing.length, required.length);
  results.push({
    id: task.id,
    name: task.name,
    max: task.marks,
    score,
    checklist: required.map(r => `${r.ok ? "✅" : "❌"} ${r.label}`),
    deductions: missing.length ? missing.map(m => `Missing: ${m.label}`) : [],
  });
}

function failTask(task, reason) {
  results.push({
    id: task.id,
    name: task.name,
    max: task.marks,
    score: 0,
    checklist: [],
    deductions: [reason],
  });
}

if (!html) {
  // Still grade CSS-based TODOs if CSS exists, but TODO1 will fail.
  failTask(
    tasks[0],
    htmlFile ? `Could not read HTML file at: ${htmlFile}` : "No .html file found (expected index.html or any .html file)."
  );
}

if (!css) {
  // If CSS missing, all CSS TODOs become zero.
  for (const t of tasks) {
    if (t.id === "todo1") continue;
    failTask(t, cssFile ? `Could not read CSS file at: ${cssFile}` : "No styles.css file found.");
  }
}

/* -----------------------------
   Grade TODOs (only if file present)
-------------------------------- */
if (html) {
  // TODO1: HTML link in <head>
  const head = normalizeHead(html);
  const required = [
    { label: 'Has <head> section', ok: head && head.length > 0 },
    { label: 'Has <link rel="stylesheet" href="styles.css"> (or "./styles.css") inside <head>', ok: hasStylesheetLinkInHead(head) },
  ];
  const missing = required.filter(r => !r.ok);
  addResult(tasks[0], required, missing);
}

if (css) {
  const rules = parseTopLevelRules(css);

  /* TODO2: p + span (flexible: can be across multiple rules) */
  {
    const pBodies = bodiesForExactSelector(rules, "p");
    const spanBodies = bodiesForExactSelector(rules, "span");

    const pRuleExists = pBodies.length > 0;
    const spanRuleExists = spanBodies.length > 0;

    const pColorOk = pBodies.some(b => hasDecl(b, /\bcolor\b/i, /#333\b/i));
    const pFontOk = pBodies.some(b => hasAnyDecl(b, [
      { prop: /\bfont-size\b/i, value: /\b16px\b/i },
      { prop: /\bfont-size\b/i, value: /\b1rem\b/i },
    ]));

    const spanColorOk = spanBodies.some(b => hasDecl(b, /\bcolor\b/i, /#888\b/i));
    const spanFontOk = spanBodies.some(b => hasAnyDecl(b, [
      { prop: /\bfont-size\b/i, value: /\b14px\b/i },
      { prop: /\bfont-size\b/i, value: /\b0\.875rem\b/i },
    ]));

    const required = [
      { label: "Has a p { ... } rule", ok: pRuleExists },
      { label: "p has color: #333", ok: pRuleExists && pColorOk },
      { label: "p has font-size: 16px (or 1rem)", ok: pRuleExists && pFontOk },

      { label: "Has a span { ... } rule", ok: spanRuleExists },
      { label: "span has color: #888", ok: spanRuleExists && spanColorOk },
      { label: "span has font-size: 14px (or 0.875rem)", ok: spanRuleExists && spanFontOk },
    ];

    const missing = required.filter(r => !r.ok);
    addResult(tasks[1], required, missing);
  }

  /* TODO3: class selectors (already flexible by selector match, but still check any rule) */
  {
    const usernameBodies = bodiesForExactSelector(rules, ".username");
    const blueBodies = bodiesForExactSelector(rules, ".blue-text");
    const redBodies = bodiesForExactSelector(rules, ".red-text");
    const highlightBodies = bodiesForExactSelector(rules, ".highlight");

    const required = [
      { label: "Has .username { ... } rule", ok: usernameBodies.length > 0 },
      { label: ".username has color: #1877f2", ok: usernameBodies.some(b => hasDecl(b, /\bcolor\b/i, /#1877f2\b/i)) },
      {
        label: ".username has font-weight: bold (or 700)",
        ok: usernameBodies.some(b => hasAnyDecl(b, [
          { prop: /\bfont-weight\b/i, value: /\bbold\b/i },
          { prop: /\bfont-weight\b/i, value: /\b700\b/i },
        ])),
      },

      { label: "Has .blue-text { ... } rule", ok: blueBodies.length > 0 },
      { label: ".blue-text has color: #4267B2", ok: blueBodies.some(b => hasDecl(b, /\bcolor\b/i, /#4267b2\b/i)) },

      { label: "Has .red-text { ... } rule", ok: redBodies.length > 0 },
      { label: ".red-text has color: #e74c3c", ok: redBodies.some(b => hasDecl(b, /\bcolor\b/i, /#e74c3c\b/i)) },

      { label: "Has .highlight { ... } rule", ok: highlightBodies.length > 0 },
      {
        label: ".highlight has background-color/background: #f0f2f5",
        ok: highlightBodies.some(b => hasAnyDecl(b, [
          { prop: /\bbackground-color\b/i, value: /#f0f2f5\b/i },
          { prop: /\bbackground\b/i, value: /#f0f2f5\b/i },
        ])),
      },
      { label: ".highlight has padding: 15px", ok: highlightBodies.some(b => hasDecl(b, /\bpadding\b/i, /\b15px\b/i)) },
    ];

    const missing = required.filter(r => !r.ok);
    addResult(tasks[2], required, missing);
  }

  /* TODO4: #featured-user */
  {
    const bodies = bodiesForExactSelector(rules, "#featured-user");
    const required = [
      { label: "Has #featured-user { ... } rule", ok: bodies.length > 0 },
      { label: "#featured-user has color: #42b883", ok: bodies.some(b => hasDecl(b, /\bcolor\b/i, /#42b883\b/i)) },
      {
        label: "#featured-user has font-size: 18px (or 1.125rem)",
        ok: bodies.some(b => hasAnyDecl(b, [
          { prop: /\bfont-size\b/i, value: /\b18px\b/i },
          { prop: /\bfont-size\b/i, value: /\b1\.125rem\b/i },
        ])),
      },
    ];
    const missing = required.filter(r => !r.ok);
    addResult(tasks[3], required, missing);
  }

  /* TODO5: Specificity battle (fully flexible; can appear anywhere; repeated ok) */
  {
    const pBodies = bodiesForExactSelector(rules, "p");               // EXACT p
    const winnerBodies = bodiesForExactSelector(rules, ".winner");    // EXACT .winner
    const specBodies = bodiesForExactSelector(rules, "#specificity-test");
    const pWinnerBodies = bodiesForExactSelector(rules, "p.winner");  // EXACT p.winner

    const required = [
      { label: "Has p { ... } rule (for specificity test)", ok: pBodies.length > 0 },
      { label: "Has .winner { ... } rule", ok: winnerBodies.length > 0 },
      { label: "Has #specificity-test { ... } rule", ok: specBodies.length > 0 },
      { label: "Has p.winner { ... } rule", ok: pWinnerBodies.length > 0 },

      { label: "p sets color: #333", ok: pBodies.some(b => hasDecl(b, /\bcolor\b/i, /#333\b/i)) },
      { label: ".winner sets color: #ff6b6b", ok: winnerBodies.some(b => hasDecl(b, /\bcolor\b/i, /#ff6b6b\b/i)) },
      { label: "#specificity-test sets color: #4ecdc4", ok: specBodies.some(b => hasDecl(b, /\bcolor\b/i, /#4ecdc4\b/i)) },
      { label: "p.winner sets color: #95a5a6", ok: pWinnerBodies.some(b => hasDecl(b, /\bcolor\b/i, /#95a5a6\b/i)) },
    ];

    const missing = required.filter(r => !r.ok);
    addResult(tasks[4], required, missing);
  }

  /* TODO6: .important-test with !important */
  {
    const bodies = bodiesForExactSelector(rules, ".important-test");
    const required = [
      { label: "Has .important-test { ... } rule", ok: bodies.length > 0 },
      {
        label: ".important-test sets color: #e67e22 with !important",
        ok: bodies.some(b => /color\s*:\s*#e67e22\s*!important\s*;?/i.test(b)),
      },
    ];
    const missing = required.filter(r => !r.ok);
    addResult(tasks[5], required, missing);
  }

  /* TODO7: descendant selectors (.chat-container ...) + .simple-form input checks */
  {
    const msgBodies = bodiesForSelectorPattern(rules, /\.chat-container\s+\.message\b/i);
    const timeBodies = bodiesForSelectorPattern(rules, /\.chat-container\s+\.message-time\b/i);

    // .simple-form input descendant rules (accept pattern anywhere like ".simple-form input", ".foo .simple-form input", etc.)
    const simpleInputBodies = bodiesForSelectorPattern(rules, /\.simple-form\s+input\b/i);

    const required = [
      { label: "Has .chat-container .message { ... } rule", ok: msgBodies.length > 0 },
      { label: ".chat-container .message sets color: #2c3e50", ok: msgBodies.some(b => hasDecl(b, /\bcolor\b/i, /#2c3e50\b/i)) },

      { label: "Has .chat-container .message-time { ... } rule", ok: timeBodies.length > 0 },
      { label: ".chat-container .message-time sets color: #7f8c8d", ok: timeBodies.some(b => hasDecl(b, /\bcolor\b/i, /#7f8c8d\b/i)) },
      {
        label: ".chat-container .message-time sets font-size: 12px (or 0.75rem)",
        ok: timeBodies.some(b => hasAnyDecl(b, [
          { prop: /\bfont-size\b/i, value: /\b12px\b/i },
          { prop: /\bfont-size\b/i, value: /\b0\.75rem\b/i },
        ])),
      },

      // simple-form input checks added here
      { label: "Has .simple-form input { ... } rule", ok: simpleInputBodies.length > 0 },
      {
        label: ".simple-form input sets border: 1px solid #ccc",
        ok: simpleInputBodies.some(b => hasDecl(b, /\bborder\b/i, /1px\s+solid\s+#ccc\b/i)),
      },
      {
        label: ".simple-form input sets background-color/background: #ffffff (or #fff)",
        ok: simpleInputBodies.some(b => hasAnyDecl(b, [
          { prop: /\bbackground-color\b/i, value: /#ffffff\b/i },
          { prop: /\bbackground\b/i, value: /#ffffff\b/i },
          { prop: /\bbackground-color\b/i, value: /#fff\b/i },
          { prop: /\bbackground\b/i, value: /#fff\b/i },
        ])),
      },
      {
        label: ".simple-form input sets color: #333",
        ok: simpleInputBodies.some(b => hasDecl(b, /\bcolor\b/i, /#333\b/i)),
      },
    ];

    const missing = required.filter(r => !r.ok);
    addResult(tasks[6], required, missing);
  }

  /* TODO8: pseudo-classes (.send-button:hover, .chat-link:hover) + .simple-form button:hover */
  {
    const sendHoverBodies = bodiesForSelectorPattern(rules, /\.send-button\s*:\s*hover\b/i);
    const chatLinkHoverBodies = bodiesForSelectorPattern(rules, /\.chat-link\s*:\s*hover\b/i);

    // .simple-form button:hover pattern (accept ".simple-form button:hover" possibly grouped or with other selectors)
    const simpleButtonHoverBodies = bodiesForSelectorPattern(rules, /\.simple-form\s+button\s*:\s*hover\b/i);

    const required = [
      { label: "Has .send-button:hover { ... } rule", ok: sendHoverBodies.length > 0 },
      {
        label: ".send-button:hover sets background-color/background: #3b5998",
        ok: sendHoverBodies.some(b => hasAnyDecl(b, [
          { prop: /\bbackground-color\b/i, value: /#3b5998\b/i },
          { prop: /\bbackground\b/i, value: /#3b5998\b/i },
        ])),
      },
      {
        label: ".send-button:hover sets color: white (white/#fff/#ffffff)",
        ok: sendHoverBodies.some(b => hasAnyDecl(b, [
          { prop: /\bcolor\b/i, value: /\bwhite\b/i },
          { prop: /\bcolor\b/i, value: /#fff\b/i },
          { prop: /\bcolor\b/i, value: /#ffffff\b/i },
        ])),
      },

      { label: "Has .chat-link:hover { ... } rule", ok: chatLinkHoverBodies.length > 0 },
      { label: ".chat-link:hover sets color: #1877f2", ok: chatLinkHoverBodies.some(b => hasDecl(b, /\bcolor\b/i, /#1877f2\b/i)) },
      { label: ".chat-link:hover sets text-decoration: none", ok: chatLinkHoverBodies.some(b => hasDecl(b, /\btext-decoration\b/i, /\bnone\b/i)) },

      // .simple-form button:hover checks added here
      { label: "Has .simple-form button:hover { ... } rule", ok: simpleButtonHoverBodies.length > 0 },
      {
        label: ".simple-form button:hover sets background-color: #145dbf",
        ok: simpleButtonHoverBodies.some(b => hasAnyDecl(b, [
          { prop: /\bbackground-color\b/i, value: /#145dbf\b/i },
          { prop: /\bbackground\b/i, value: /#145dbf\b/i },
        ])),
      },
    ];

    const missing = required.filter(r => !r.ok);
    addResult(tasks[7], required, missing);
  }

  /* TODO9: group selectors for trending tags (accept grouped OR separate) */
  {
    const groupBodies =
      bodiesForSelectorPattern(rules, /h4\.trending-tag\s*,\s*h5\.trending-tag\s*,\s*h6\.trending-tag/i)
      .concat(bodiesForExactSelector(rules, "h4.trending-tag"))
      .concat(bodiesForExactSelector(rules, "h5.trending-tag"))
      .concat(bodiesForExactSelector(rules, "h6.trending-tag"));

    const anyBody = groupBodies.length > 0;

    const colorOk = groupBodies.some(b => hasDecl(b, /\bcolor\b/i, /#8b9dc3\b/i));
    const fontOk = groupBodies.some(b => /font-family\s*:\s*[^;]*\barial\b/i.test(b));

    const required = [
      { label: "Has rule(s) for trending tags (grouped or separate) using h4/h5/h6.trending-tag", ok: anyBody },
      { label: "Trending tags set color: #8b9dc3", ok: anyBody && colorOk },
      { label: "Trending tags set font-family to Arial", ok: anyBody && fontOk },
    ];

    const missing = required.filter(r => !r.ok);
    addResult(tasks[8], required, missing);
  }
}

/* -----------------------------
   Final scoring
-------------------------------- */
const stepsScore = results.reduce((sum, r) => sum + r.score, 0);
const totalScore = round2(stepsScore + submissionScore);

/* -----------------------------
   Build summary + feedback
-------------------------------- */
const submissionLine = `- **Lab:** 3-1-css-basics
- **Deadline (Riyadh / UTC+03:00):** ${DEADLINE_RIYADH_ISO}
- **Last commit time (from git log):** ${lastCommitISO}
- **Submission marks:** **${submissionScore}/${SUBMISSION_MAX}** ${isLate ? "(Late submission)" : "(On time)"}
`;

let summary = `# 3-1-css-basics — Autograding Summary

## Submission

${submissionLine}

## Files Checked

- HTML: ${htmlFile ? `✅ ${htmlFile}` : "❌ No HTML file found"}
- CSS: ${cssFile ? `✅ ${cssFile}` : "❌ No styles.css file found"}

## Marks Breakdown

| Component | Marks |
|---|---:|
`;

for (const r of results) summary += `| ${r.name} | ${r.score}/${r.max} |\n`;
summary += `| Submission (timing) | ${submissionScore}/${SUBMISSION_MAX} |\n`;

summary += `
## Total Marks

**${totalScore} / ${TOTAL_MAX}**

## Detailed Checks (What you did / missed)
`;

for (const r of results) {
  const done = (r.checklist || []).filter(x => x.startsWith("✅"));
  const missed = (r.checklist || []).filter(x => x.startsWith("❌"));

  summary += `
<details>
  <summary><strong>${mdEscape(r.name)}</strong> — ${r.score}/${r.max}</summary>

  <br/>

  <strong>✅ Found</strong>
  ${done.length ? "\n" + done.map(x => `- ${mdEscape(x)}`).join("\n") : "\n- (Nothing detected)"}

  <br/><br/>

  <strong>❌ Missing</strong>
  ${missed.length ? "\n" + missed.map(x => `- ${mdEscape(x)}`).join("\n") : "\n- (Nothing missing)"}

  <br/><br/>

  <strong>❗ Deductions / Notes</strong>
  ${
    r.deductions && r.deductions.length
      ? "\n" + r.deductions.map(d => `- ${mdEscape(d)}`).join("\n")
      : "\n- No deductions."
  }

</details>
`;
}

summary += `
> Full feedback is also available in: \`artifacts/feedback/README.md\`
`;

let feedback = `# 3-1-css-basics — Feedback

## Submission

${submissionLine}

## Files Checked

- HTML: ${htmlFile ? `✅ ${htmlFile}` : "❌ No HTML file found"}
- CSS: ${cssFile ? `✅ ${cssFile}` : "❌ No styles.css file found"}

---

## TODO-by-TODO Feedback
`;

for (const r of results) {
  feedback += `
### ${r.name} — **${r.score}/${r.max}**

**Checklist**
${r.checklist.length ? r.checklist.map(x => `- ${x}`).join("\n") : "- (No checks available)"}

**Deductions / Notes**
${
  r.deductions.length
    ? r.deductions.map(d => `- ❗ ${d}`).join("\n")
    : "- ✅ No deductions. Good job!"
}
`;
}

feedback += `
---

## How marks were deducted (rules)

- HTML comments are ignored (so examples in comments do NOT count).
- CSS comments are ignored (so examples in comments do NOT count).
- Checks are intentionally light: they look for key selectors and key properties.
- CSS rules can be in ANY order, and repeated selectors/properties are allowed.
- Accepted equivalents:
  - \`background\` or \`background-color\`
  - \`white\` or \`#fff\` or \`#ffffff\`
  - \`font-weight: bold\` or \`font-weight: 700\`
  - font-size rem equivalents: 16px/1rem, 14px/0.875rem, 12px/0.75rem, 18px/1.125rem
- Missing required items reduce marks proportionally within that TODO.
`;

/* -----------------------------
   Write outputs
-------------------------------- */
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);

const csv = `student,score,max_score
all_students,${totalScore},${TOTAL_MAX}
`;

fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
fs.writeFileSync(path.join(ARTIFACTS_DIR, "grade.csv"), csv);
fs.writeFileSync(path.join(FEEDBACK_DIR, "README.md"), feedback);

console.log(
  `✔ Lab graded: ${totalScore}/${TOTAL_MAX} (Submission: ${submissionScore}/${SUBMISSION_MAX}, TODOs: ${stepsScore}/${STEPS_MAX}).`
);
