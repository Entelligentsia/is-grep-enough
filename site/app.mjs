// nav-3way dashboard — initial UX spike.
// Proves the three pillars: static GitHub Pages channel, dynamically generated
// feed (site/data/*.json from build.mjs), and the chosen interactive graphics
// (Observable Plot). Deliberately thin — refined iteratively.

import * as Plot from "https://esm.sh/@observablehq/plot@0.6";
import { marked } from "https://esm.sh/marked@12";

const $ = (s, r = document) => r.querySelector(s);
const el = (t, props = {}, kids = []) => {
  const n = Object.assign(document.createElement(t), props);
  for (const k of [].concat(kids)) n.append(k);
  return n;
};
// read a CSS custom property off :root so charts track the active theme (light/
// dark) instead of baking a hardcoded hue that glares in the other mode (T3.2).
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
// a11y (T3.6): make a non-button element behave as a keyboard-operable control —
// role+tabindex so it's focusable, Enter/Space to activate like a real button.
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const scrollToEl = (sel) => $(sel)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" });
function clickable(node, fn, label) {
  node.setAttribute("role", "button");
  node.setAttribute("tabindex", "0");
  if (label) node.setAttribute("aria-label", label);
  node.addEventListener("click", fn);
  node.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(e); } });
  return node;
}

const ARM_COLOR = { baseline: "#0072B2", grove: "#E69F00", lsp: "#009E73" };
const ARMS = ["baseline", "grove", "lsp"];

const METRICS = {
  context: { label: "Context (total tokens: input + cache)", get: (c) => c.metrics?.context, fmt: (v) => v?.toLocaleString() },
  turns: { label: "Turns", get: (c) => c.metrics?.turns, fmt: (v) => v },
  wall: { label: "Wall clock (s)", get: (c) => c.metrics?.run_wall_s, fmt: (v) => v != null ? v + "s" : "—" },
  cache: { label: "Cache tokens (read+create)", get: (c) => c.cost ? (c.cost.cache_read + c.cost.cache_create) : null, fmt: (v) => v?.toLocaleString() },
  cost: { label: "Cost (billed USD)", get: (c) => c.cost?.usd, fmt: (v) => v != null ? "$" + v.toFixed(3) : "—" },
};

// metric families rendered as small-multiple rows (§5.3), in this order
const METRIC_FAMILIES = ["context", "turns", "wall", "cache", "cost"];

const state = { rung: "", repo: "", cell: null, showJudged: false, showIncomplete: true,
  arms: { baseline: true, grove: true, lsp: true }, fcA: "", fcB: "" };
const cellById = (id) => DATA.cells.find((c) => c.id === id);
const visibleArms = () => ARMS.filter((a) => state.arms[a]);
// a cell counts as incomplete/DNF if it never reached harvested OR a harvested
// run carries the dnf flag (had no clean result / errored) — §5.3 toggle target.
const isIncomplete = (c) => !c || c.status !== "harvested" || (c.flags ?? []).includes("dnf");
let DATA;
let REPO = {}; // id → {id, lang, sha, gh} for cite-link construction

initTheme();
init();

// Theme: auto (follow OS) · light · dark. Dark is a truly neutral warm grey, not
// black (§9). Persisted in localStorage; "auto" leaves the attribute off so the
// prefers-color-scheme media query drives it. Charts re-read CSS vars on render,
// so a theme change must re-render to recolor frames/halos (T3.2).
function initTheme() {
  const saved = (() => { try { return localStorage.getItem("theme"); } catch { return null; } })();
  applyTheme(saved || "auto");
}
function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
  try { localStorage.setItem("theme", mode); } catch { /* private mode */ }
  const sw = $("#theme-switch");
  if (sw) for (const b of sw.querySelectorAll("button"))
    b.setAttribute("aria-pressed", b.dataset.themeSet === mode);
}

async function init() {
  const [meta, experiment, cells, judge] = await Promise.all(
    ["meta", "experiment", "cells", "judge"].map((f) => fetch(`data/${f}.json`).then((r) => r.json()))
  );
  DATA = { meta, experiment, cells, judge: Object.fromEntries(judge.map((j) => [j.id, j])) };
  REPO = Object.fromEntries(experiment.repos.map((r) => [r.id, r]));

  $("#purpose").textContent = experiment.purpose ?? "";
  $("#provenance").textContent =
    `generated ${meta.generated_at} · ${meta.git_sha} · model ${meta.model} · ` +
    `${meta.coverage.harvested}/${meta.coverage.total} cells harvested · ${Object.keys(DATA.judge).length} judged`;
  $("#finding-text").textContent =
    "The same exploration task, given to an agent with three rungs of navigation power: plain text search (baseline), fast-light structural (grove/tree-sitter), and authoritative semantic (lsp/LSP) — across a task-complexity ladder. The question is where on that ladder the extra power stops paying for itself. Where rungs are fully run and judged, answer quality is a near-tie; the arms separate on cost and route, not correctness. Everything below links to the raw run that produced it — check it.";
  $("#caveats").innerHTML = "<b>Caveats:</b> " + meta.caveats.join(" ");
  renderTldr();

  // filters
  fillSelect($("#f-rung"), experiment.rungs);
  fillSelect($("#f-repo"), experiment.repos.map((r) => r.id));
  $("#f-rung").onchange = (e) => { state.rung = e.target.value; state.cell = null; render(); };
  $("#f-repo").onchange = (e) => { state.repo = e.target.value; state.cell = null; render(); };

  // arm-visibility toggle — global across coverage grid, metrics, and detail (§4)
  for (const a of ARMS) {
    const cb = el("input", { type: "checkbox", checked: true });
    cb.dataset.arm = a;
    cb.onchange = () => { state.arms[a] = cb.checked; render(); };
    $("#f-arms").append(el("label", { className: "armchk" },
      [cb, el("span", { className: `swatch ${a}` }), document.createTextNode(a)]));
  }

  $("#t-judged").onchange = (e) => { state.showJudged = e.target.checked; renderCoverage(); syncURL(); };
  $("#t-incomplete").onchange = (e) => { state.showIncomplete = e.target.checked; render(); };

  // free compare (§8, T2.3): pick any two harvested cells with a readable trail.
  const fcCells = DATA.cells.filter((c) => c.status === "harvested" && c.evidence?.readable)
    .map((c) => c.id).sort();
  fillSelect($("#fc-a"), fcCells); fillSelect($("#fc-b"), fcCells);
  $("#fc-a").onchange = (e) => { state.fcA = e.target.value; renderFreeCompare(); syncURL(); };
  $("#fc-b").onchange = (e) => { state.fcB = e.target.value; renderFreeCompare(); syncURL(); };
  // theme switch — re-render so charts re-read the active theme's CSS vars (T3.2)
  for (const b of $("#theme-switch").querySelectorAll("button"))
    b.onclick = () => { applyTheme(b.dataset.themeSet); render(); };

  $("#tx-close").onclick = () => closeTranscript();
  $("#tx-overlay").onclick = (e) => { if (e.target.id === "tx-overlay") closeTranscript(); };
  // a11y (T3.6): Esc closes the transcript modal and focus returns to its opener
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#tx-overlay").classList.contains("open")) closeTranscript();
  });

  // URL-encoded filter state (§4, T1.6): any view is a shareable link. Read the
  // URL first, reflect it into the controls, then keep the URL in sync on change
  // and respond to back/forward.
  applyURL(); syncControls();
  window.addEventListener("popstate", () => { applyURL(); syncControls(); render(); });
  renderMethodology();
  render();
}

// TL;DR headline numbers — recomputed from the feed, never hand-typed, so the
// summary can never drift from the evidence below it. Quality is the mean blind
// score per arm over judged cells; cost is the mean context-tokens per arm (total
// input+cache across all models/turns, overall and at the hardest rung L5).
// Spans left as "—" if their inputs are absent.
function renderTldr() {
  const judged = Object.values(DATA.judge);
  if (!judged.length) return;
  const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const ctxK = (n) => n == null ? "—"
    : n >= 1_000_000 ? (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M"
    : Math.round(n / 1000) + "k";
  const cellCtx = (rung, arm, repo) =>
    DATA.cells.find((c) => c.rung === rung && c.arm === arm && c.repo === repo)?.metrics?.context;
  const set = (id, v) => { const n = $("#" + id); if (n) n.textContent = v; };

  const grAll = [], cmAll = [], ctx = {}, l5 = {};
  for (const a of ARMS) { ctx[a] = []; l5[a] = []; }
  for (const j of judged) for (const a of ARMS) {
    const s = j.scores?.[a];
    if (s) { grAll.push(s.grounding); cmAll.push(s.completeness); }
    const c = cellCtx(j.rung, a, j.repo);
    if (c != null) { ctx[a].push(c); if (j.rung === "L5") l5[a].push(c); }
  }
  const mctx = Object.fromEntries(ARMS.map((a) => [a, mean(ctx[a])]));
  set("tl-grnd", mean(grAll)?.toFixed(2) ?? "—");
  set("tl-cmpl", mean(cmAll)?.toFixed(2) ?? "—");
  set("tl-ctx-grove", ctxK(mctx.grove));
  set("tl-ctx-lsp", ctxK(mctx.lsp));
  set("tl-ctx-base", ctxK(mctx.baseline));
  const l5b = mean(l5.baseline), l5g = mean(l5.grove);
  set("tl-l5-base", ctxK(l5b));
  set("tl-l5-grove", ctxK(l5g));
  set("tl-l5-x", (l5b && l5g) ? (l5b / l5g).toFixed(1).replace(/\.0$/, "") + "×" : "—");
}

// Methodology & provenance (§10): pricing table for the billed model + a
// data-sources panel listing the exact feed files behind the view. The dollar
// figures elsewhere are billed total_cost_usd; this list price is reference only.
const MODEL_ID = { sonnet: "claude-sonnet-4-6" };
// public list price per million tokens for the model the runs billed against.
const PRICING = {
  "claude-sonnet-4-6": [
    ["Input (fresh)", "$3.00"],
    ["Output", "$15.00"],
    ["Cache write — 5 min (1.25× input)", "$3.75"],
    ["Cache write — 1 hour (2× input)", "$6.00"],
    ["Cache read (0.1× input)", "$0.30"],
  ],
};
function renderMethodology() {
  const model = DATA.meta.model;
  const id = MODEL_ID[model] ?? model;
  $("#meth-model").textContent = id;

  // cite-link verification summary (T3.5) — aggregate over every harvested cell's
  // build-time cite resolution against pinned source. Truthbound: located = what
  // the mechanical checker could pin down; ambiguous/unlocatable are its limits.
  const ccs = DATA.cells.map((c) => c.cite_check).filter(Boolean);
  if (ccs.length) {
    const sum = (k) => ccs.reduce((a, c) => a + (c[k] || 0), 0);
    const located = sum("located"), resolved = sum("resolved"), oor = sum("out_of_range");
    const pct = located ? Math.round((resolved / located) * 100) : 0;
    $("#meth-cites").innerHTML =
      `<b>${resolved} of ${located}</b> locatable cites resolve in-range at their pinned SHA ` +
      `(${pct}%${oor ? `, ${oor} out-of-range` : ", none out-of-range"}), across ${ccs.length} harvested cells ` +
      `(${sum("checked")} unique <code>file:line</code> cites checked). ` +
      `<span class="caveat">${sum("ambiguous")} ambiguous (bare filename, &gt;1 match) and ${sum("unlocatable")} unlocatable ` +
      `are limits of the mechanical checker — counted apart, never as failures.</span>`;
  } else {
    $("#meth-cites").textContent = "No pinned source available to verify against.";
  }

  // pricing table — reference list price, clearly not the source of the figures
  const rows = PRICING[id];
  const ph = $("#meth-pricing");
  if (rows) {
    const tbl = el("table", { className: "meth-price" });
    tbl.append(el("tr", {}, [el("th", { textContent: "token class" }), el("th", { textContent: "USD / 1M tokens" })]));
    for (const [k, v] of rows)
      tbl.append(el("tr", {}, [el("td", { textContent: k }), el("td", { className: "mono", textContent: v })]));
    ph.replaceChildren(tbl,
      el("p", { className: "caveat", textContent: `Reference list price for ${id} (\`--model ${model}\`). The figures on this page are billed totals, not derived from this table.` }));
  } else {
    ph.replaceChildren(el("p", { className: "caveat", textContent: `No reference price on file for model "${model}"; figures shown are billed totals.` }));
  }

  // data-sources panel — the exact files the feed is synthesized from
  const cov = DATA.meta.coverage;
  const judged = Object.keys(DATA.judge).length;
  const sources = [
    ["experiment/state.json", `the cell ledger — ${cov.total} cells; written only via statectl (read-only here)`],
    ["data/cells.json", `${DATA.cells.length} cells: status, metrics, cost split, tools, engagement`],
    ["data/judge.json", `${judged} blind judge records: grounding + completeness + verdict prose`],
    ["data/experiment.json", "rungs, repos (pinned SHAs + owner/repo), purpose"],
    ["data/series/<cell>.json", "per-turn context-growth curves (build-derived from raw stream-json)"],
    ["data/transcripts/<cell>.md", `${cov.harvested} readable trails`],
    ["data/raw/<cell>.jsonl", "raw stream-json per harvested run (the byte-precise source)"],
    ["experiment/prompts/<repo>/<rung>.reference.md", "reference keys — judge-only, walled off (never in this feed)"],
  ];
  const list = el("dl", { className: "meth-sources" });
  for (const [f, d] of sources) {
    list.append(el("dt", {}, el("code", { textContent: f })));
    list.append(el("dd", { textContent: d }));
  }
  $("#meth-sources").replaceChildren(list);

  // reproduce-it box (§10.8) — the exact commands that rebuild THIS feed. The SHA
  // is the build's own git_sha so re-running it regenerates the published data.
  const sha = DATA.meta.git_sha;
  $("#meth-repro").textContent = [
    "# 1. check out the exact commit this page was built from",
    `git checkout ${sha}`,
    "",
    "# 2. regenerate the feed (deterministic over committed evidence)",
    `node site/build.mjs --sha "$(git rev-parse --short HEAD)" --at "${DATA.meta.generated_at}"`,
    "",
    "# 3. serve it and open the dashboard",
    "python3 -m http.server -d site 8099   # → http://localhost:8099/",
  ].join("\n");
  $("#meth-repro-note").textContent =
    `This page was generated ${DATA.meta.generated_at} from ${sha}. ` +
    "site/data/ is gitignored (a build artifact); the Pages Action regenerates it on deploy.";
}

function fillSelect(sel, vals) { for (const v of vals) sel.append(el("option", { value: v, textContent: v })); }

// ---- URL <-> state (shareable filter/cell links) ----------------------------
function applyURL() {
  const p = new URLSearchParams(location.search);
  const rung = p.get("rung"); state.rung = DATA.experiment.rungs.includes(rung) ? rung : "";
  const repo = p.get("repo"); state.repo = DATA.experiment.repos.some((r) => r.id === repo) ? repo : "";
  const cell = p.get("cell"); state.cell = cell && DATA.cells.some((c) => `${c.rung}-${c.repo}` === cell) ? cell : null;
  if (p.has("arms")) { const vis = new Set(p.get("arms").split(",").filter(Boolean)); for (const a of ARMS) state.arms[a] = vis.has(a); }
  else for (const a of ARMS) state.arms[a] = true;
  state.showJudged = p.get("judged") === "1";
  state.showIncomplete = p.get("incomplete") !== "0";
  const fca = p.get("fca"); state.fcA = DATA.cells.some((c) => c.id === fca) ? fca : "";
  const fcb = p.get("fcb"); state.fcB = DATA.cells.some((c) => c.id === fcb) ? fcb : "";
}

// reflect current state into the form controls (after URL load / popstate)
function syncControls() {
  $("#f-rung").value = state.rung;
  $("#f-repo").value = state.repo;
  for (const cb of $("#f-arms").querySelectorAll("input")) cb.checked = state.arms[cb.dataset.arm];
  $("#t-judged").checked = state.showJudged;
  $("#t-incomplete").checked = state.showIncomplete;
  $("#fc-a").value = state.fcA;
  $("#fc-b").value = state.fcB;
}

// serialize state into the query string; only non-default keys are written so a
// pristine view stays a clean URL. replaceState — filtering shouldn't spam history.
function syncURL() {
  const p = new URLSearchParams();
  if (state.rung) p.set("rung", state.rung);
  if (state.repo) p.set("repo", state.repo);
  if (state.cell) p.set("cell", state.cell);
  if (visibleArms().length !== ARMS.length) p.set("arms", visibleArms().join(","));
  if (state.showJudged) p.set("judged", "1");
  if (!state.showIncomplete) p.set("incomplete", "0");
  if (state.fcA) p.set("fca", state.fcA);
  if (state.fcB) p.set("fcb", state.fcB);
  const qs = p.toString();
  history.replaceState(null, "", qs ? `${location.pathname}?${qs}` : location.pathname);
}

function filtered() {
  return DATA.cells.filter((c) => (!state.rung || c.rung === state.rung) && (!state.repo || c.repo === state.repo));
}

function render() {
  const cov = DATA.meta.coverage;
  $("#coverage-tally").textContent = `${cov.harvested} harvested · ${cov.pending} pending · ${cov.blocked_dnf} dnf/blocked of ${cov.total}`;
  renderCoverage();
  renderMetrics();
  if (state.cell) renderDetail(state.cell);
  renderFreeCompare();
  syncURL();
}

function renderCoverage() {
  const repos = DATA.experiment.repos.map((r) => r.id).filter((r) => !state.repo || r === state.repo);
  const rungs = DATA.experiment.rungs.filter((r) => !state.rung || r === state.rung);
  const byId = Object.fromEntries(DATA.cells.map((c) => [c.id, c]));

  const table = el("table", { className: "coverage" });
  const head = el("tr", {}, el("th", { textContent: "repo" }));
  for (const rg of rungs) {
    const th = el("th", { className: "rung", textContent: rg, title: "filter to " + rg });
    clickable(th, () => { state.rung = state.rung === rg ? "" : rg; $("#f-rung").value = state.rung; render(); }, `filter to rung ${rg}`);
    head.append(th);
  }
  table.append(head);

  for (const repo of repos) {
    const tr = el("tr");
    const rc = el("td", { className: "repo", textContent: repo, title: "filter to " + repo });
    clickable(rc, () => { state.repo = state.repo === repo ? "" : repo; $("#f-repo").value = state.repo; render(); }, `filter to repo ${repo}`);
    tr.append(rc);
    for (const rg of rungs) {
      const td = el("td");
      const mark = el("div", { className: "cellmark" });
      const cid = `${rg}-${repo}`;
      if (state.cell === cid) mark.classList.add("active");
      for (const arm of visibleArms()) {
        const c = byId[`${rg}-${arm}-${repo}`];
        // status by shape/fill, never good/bad color: filled=harvested,
        // empty=pending, hatched=blocked/DNF. DNF reason tooltipped when known.
        let st = "pending";
        if (c?.status === "harvested") st = c.flags?.includes("dnf") ? "dnf" : "harvested";
        else if (c?.status === "blocked") st = "blocked";
        const judged = state.showJudged && DATA.judge[`${rg}-${repo}`]?.scores?.[arm] ? " judged" : "";
        const reason = c?.dnf_reason ? ` — ${c.dnf_reason}` : "";
        const flagstr = c?.flags?.length ? ` [${c.flags.join(",")}]` : "";
        // DNF/incomplete toggle (§5.3): default shows them flagged; when off, the
        // segment is held as a blank placeholder so only completed runs read.
        const omitted = !state.showIncomplete && isIncomplete(c) ? " omitted" : "";
        mark.append(el("span", {
          className: `seg ${st} ${arm}${judged}${omitted}`,
          title: omitted ? `${rg} · ${arm} · ${repo}: hidden (incomplete/DNF)` : `${rg} · ${arm} · ${repo}: ${c?.status ?? "pending"}${flagstr}${reason}`,
        }));
      }
      clickable(mark, () => { state.cell = cid; renderDetail(cid); scrollToEl("#detail-section"); renderCoverage(); syncURL(); }, `inspect cell ${cid}`);
      td.append(mark); tr.append(td);
    }
    table.append(tr);
  }
  const host = $("#coverage"); host.replaceChildren(table);
}

// Metric small-multiples (§5.3): five metric families stacked as rows, each a
// row of small charts faceted by rung, the three arms as the series within each
// panel. One dot per repo, a tick at the per-rung-per-arm median; y-axis always
// from zero. Replaces the single tabbed chart — small-multiples over one busy
// chart keeps it legible and neutral.
function renderMetrics() {
  const host = $("#metrics-grid"); host.replaceChildren();
  const rungsShown = DATA.experiment.rungs.filter((r) => !state.rung || r === state.rung);
  const armsShown = visibleArms();
  const base = filtered().filter((c) => c.status === "harvested" && state.arms[c.arm]);

  if (!armsShown.length) {
    host.append(el("p", { className: "caveat", textContent: "no arms selected — enable an arm in the filter bar above." }));
    return;
  }

  for (const key of METRIC_FAMILIES) {
    const m = METRICS[key];
    const rows = base
      .filter((c) => m.get(c) != null)
      // DNF toggle (§5.3): drop harvested-but-DNF points when off; keep+flag when on
      .filter((c) => state.showIncomplete || !(c.flags ?? []).includes("dnf"))
      .map((c) => ({ rung: c.rung, arm: c.arm, repo: c.repo, value: m.get(c), id: `${c.rung}-${c.repo}`, flagged: (c.flags ?? []).includes("dnf") }));

    const fig = el("figure", { className: "figure metric-family" });
    fig.append(el("figcaption", { className: "mf-label", textContent: m.label }));

    if (!rows.length) {
      fig.append(el("p", { className: "caveat", textContent: "no harvested data for this metric in the current filter." }));
      host.append(fig);
      continue;
    }

    // honest aggregation (§5.3, T1.3): per-rung n printed on the facet axis, and
    // a min–max whisker behind the dots so no aggregate is shown as a lone tick.
    // n here = distinct repos contributing a value in that rung (partial rungs
    // self-report a smaller n).
    const nByRung = {};
    for (const r of rows) (nByRung[r.rung] ??= new Set()).add(r.repo);

    // one small chart per rung; arms (x) side by side within each.
    const nFacets = rungsShown.length;
    const width = Math.min(980, Math.max(360, nFacets * 200));
    const plot = Plot.plot({
      width, height: 224, marginLeft: 58, marginBottom: 42, marginTop: 26,
      style: { fontFamily: "system-ui, sans-serif", fontSize: "11px", background: "transparent" },
      fx: { label: null, domain: rungsShown },
      x: { label: null, domain: armsShown, tickRotate: 0 },
      y: { label: null, grid: true, zero: true, nice: true, tickFormat: "~s" },
      color: { domain: armsShown, range: armsShown.map((a) => ARM_COLOR[a]) },
      marks: [
        // facet header per rung carrying its honest n (partial rungs read smaller)
        Plot.axisFx({ anchor: "top", label: null, tickSize: 0, fontWeight: 600,
          tickFormat: (rg) => `${rg} · n=${nByRung[rg]?.size ?? 0}` }),
        Plot.frame({ stroke: cssVar("--rule") }),
        // min–max whisker per (arm,rung) — the full spread, never a lone mean
        Plot.ruleX(rows, Plot.groupX({ y1: "min", y2: "max" },
          { fx: "rung", x: "arm", y1: "value", y2: "value", stroke: "arm", strokeOpacity: 0.35, strokeWidth: 1.2 })),
        // per-(arm,rung) median tick — central tendency beside the raw spread
        Plot.tickY(rows, Plot.groupX({ y: "median" },
          { fx: "rung", x: "arm", y: "value", stroke: "arm", strokeWidth: 2.5 })),
        Plot.dot(rows.filter((r) => !r.flagged), {
          fx: "rung", x: "arm", y: "value", fill: "arm", r: 3, fillOpacity: 0.85, stroke: cssVar("--paper"), strokeWidth: 0.4,
          tip: true, channels: { repo: "repo", rung: "rung", arm: "arm", value: { value: "value", label: m.label } },
        }),
        // DNF points kept but flagged: hollow ring + ✕ so a partial run never
        // passes as a clean measurement (§5.3, truthbound).
        Plot.dot(rows.filter((r) => r.flagged), {
          fx: "rung", x: "arm", y: "value", r: 4.5, fill: "none", stroke: "arm", strokeWidth: 1.4, symbol: "times",
          tip: true, channels: { repo: "repo", rung: "rung", arm: "arm", value: { value: "value", label: m.label }, flag: { value: () => "DNF", label: "flag" } },
        }),
      ],
    });
    fig.append(plot);

    const nFlagged = rows.filter((r) => r.flagged).length;
    const n = new Set(rows.map((r) => r.id)).size;
    fig.append(el("figcaption", { className: "mf-cap" },
      `${m.label} — one dot per repo; whisker = min–max, tick = median (per rung × arm). ` +
      `Per-rung n is on the axis (partial rungs self-report a smaller n); ${n} task${n === 1 ? "" : "s"} shown total` +
      `${nFlagged ? `, incl. ${nFlagged} DNF point${nFlagged === 1 ? "" : "s"} ringed (✕)` : ""}. ` +
      `Axis from zero. n=1 per cell — a direction, not a measurement.`));
    host.append(fig);
  }
}

function renderDetail(cid) {
  state.cell = cid;
  const [rung, ...rest] = cid.split("-"); const repo = rest.join("-");
  // respect the global arm-visibility toggle (§4) — hidden arms drop their column
  const arms = visibleArms().map((a) => DATA.cells.find((c) => c.id === `${rung}-${a}-${repo}`)).filter(Boolean);
  const jr = DATA.judge[cid];
  const sec = $("#detail-section"); sec.hidden = false;
  $("#detail-id").textContent = `${rung} · ${repo}`;

  const host = $("#detail"); host.replaceChildren();
  const cols = el("div", { className: "armcols" });
  cols.style.gridTemplateColumns = `repeat(${Math.max(1, arms.length)}, 1fr)`;

  // cheapest-on-each-axis, stated factually (never "winner"): the lowest value
  // across arms on a cost-like axis, only when ≥2 arms have data (§6).
  const AXES = { context: (c) => c.metrics?.context, turns: (c) => c.metrics?.turns,
                 wall: (c) => c.metrics?.run_wall_s, cost: (c) => c.cost?.usd };
  const cheapest = {};
  for (const [k, get] of Object.entries(AXES)) {
    const vals = arms.map(get).filter((v) => v != null);
    cheapest[k] = vals.length > 1 ? Math.min(...vals) : null;
  }
  const lowest = (c, axis) => cheapest[axis] != null && AXES[axis](c) === cheapest[axis];

  for (const c of arms) {
    const col = el("div", { className: "armcol" });
    col.append(el("h4", {}, [el("span", { className: "bar", style: `background:${ARM_COLOR[c.arm]}` }),
      document.createTextNode(c.arm), ...(c.flags?.length ? [el("span", { className: "flag", textContent: c.flags.join(" ") })] : [])]));
    const rowsM = [
      ["status", c.status, null],
      ["engagement", c.engagement ? `${c.engagement.key}=${c.engagement.value} ${c.engagement.passed ? "✓" : "✗"}` : "—", null],
      ["context", c.metrics?.context?.toLocaleString() ?? "—", "context"],
      ["turns", c.metrics?.turns ?? "—", "turns"],
      ["wall", c.metrics?.run_wall_s != null ? c.metrics.run_wall_s + "s" : "—", "wall"],
      ["cost", c.cost?.usd != null ? "$" + c.cost.usd.toFixed(4) : "—", "cost"],
      ["cache r/c", c.cost ? `${c.cost.cache_read.toLocaleString()} / ${c.cost.cache_create.toLocaleString()}` : "—", null],
    ];
    for (const [k, v, axis] of rowsM) {
      const valSpan = el("span", { className: "v", textContent: String(v) });
      if (axis && lowest(c, axis)) { valSpan.classList.add("low"); valSpan.append(el("span", { className: "lowtag", textContent: " lowest" })); }
      col.append(el("div", { className: "metricrow" }, [el("span", { className: "k", textContent: k }), valSpan]));
    }
    // per-turn context-growth sparkline (§5.3) — drilled here, lazy-fetched from
    // series/<cell>.json; provenance is the raw file, not the ledger scalar.
    renderSparkline(col, c);
    // engagement / tool-usage table — the "did it do it the hard way?" evidence
    if (c.tools) {
      const tb = el("div", { className: "tools" });
      tb.append(el("div", { className: "tools-h", textContent: "tool usage" }));
      for (const [key, label] of [["bash_calls", "bash"], ["grove_tools", "grove"], ["lsp_tools", "lsp"], ["reads", "read"], ["mcp_nongrove_tools", "mcp"], ["tool_calls", "total"]]) {
        if (c.tools[key] == null) continue;
        const gate = c.engagement?.key === key;
        const v = el("span", { className: "v", textContent: String(c.tools[key]) });
        if (gate) v.append(el("span", { className: "lowtag", textContent: c.engagement.passed ? " gate ✓" : " gate ✗" }));
        tb.append(el("div", { className: "metricrow", }, [el("span", { className: "k", textContent: label }), v]));
      }
      col.append(tb);
    }
    // cite-link verification for this arm's transcript (T3.5)
    if (c.cite_check) {
      const cc = c.cite_check;
      const cite = el("div", { className: "citecheck" });
      cite.append(el("span", { className: "k", textContent: "cites resolved " }),
        el("span", { className: "v", textContent: `${cc.resolved}/${cc.located}` }),
        document.createTextNode(cc.sha ? ` at ${cc.sha.slice(0, 7)}` : ""));
      if (cc.ambiguous || cc.unlocatable)
        cite.append(el("span", { className: "lowtag", textContent: ` (${cc.ambiguous} amb · ${cc.unlocatable} unloc)` }));
      col.append(cite);
    }
    if (jr?.scores?.[c.arm]) {
      const s = jr.scores[c.arm];
      const jd = el("div", { className: "judge" });
      jd.append(el("div", {}, el("span", { className: "score", textContent: `grounding ${s.grounding} · completeness ${s.completeness}` })));
      jd.append(el("div", { className: "verdict", textContent: s.verdict ?? "" }));
      col.append(jd);
    }
    if (c.evidence?.readable) {
      const link = el("a", { href: "#", textContent: "read transcript →" });
      link.onclick = (e) => { e.preventDefault(); openTranscript(c); };
      col.append(el("div", { style: "margin-top:.5rem;font-size:.82rem" }, link));
    }
    cols.append(col);
  }

  // prompt verbatim + judge synthesis + key revisions (judge transparency is first-class)
  const head = el("div");
  const prompt = arms.find((a) => a.prompt)?.prompt;
  if (prompt) {
    head.append(el("div", { className: "genesis", textContent: "The prompt shown to all three arms — the only thing they saw. Reference keys were judge-only (genesis wall); they are not on this page except as post-hoc key revisions below." }));
    head.append(el("pre", { className: "prompt-text", textContent: prompt }));
  } else {
    head.append(el("div", { className: "prompt", textContent: "(bare prompt not found in feed)" }));
  }
  host.append(head, cols);
  // spine-coverage strip (§8, T2.2): aligned per-arm Full/Partial/Miss so the
  // quality comparison is concrete at a glance, not buried in prose.
  renderSpineStrip(host, jr, arms);
  if (jr?.verdict) host.append(el("p", { className: "note", style: "margin-top:1rem", textContent: "Judge synthesis: " + jr.verdict }));
  for (const kr of jr?.key_revisions ?? [])
    host.append(el("div", { className: "keyrev" }, `Reference key corrected (${kr.level}): ${kr.reason}  [${kr.cite}]`));
  // side-by-side compare (§8, T2.1): the three readable trails in parallel panes
  renderCompareTranscripts(host, arms);
  renderCoverage();
}

// Free cell-vs-cell compare (§8, T2.3): two arbitrary harvested cells side by
// side — e.g. grove L2 vs L3 redis to see how an arm scales with complexity, or
// two arms on one task. Aligned metric strip (lower-on-each-cost-axis marked
// factually, never "winner") + the two readable trails in parallel panes.
function renderFreeCompare() {
  const out = $("#fc-out"); if (!out) return;
  out.replaceChildren();
  const a = state.fcA && cellById(state.fcA);
  const b = state.fcB && cellById(state.fcB);
  if (!a || !b) {
    out.append(el("p", { className: "caveat", textContent: "pick two harvested cells above to compare." }));
    return;
  }
  if (a.id === b.id) {
    out.append(el("p", { className: "caveat", textContent: "pick two different cells." }));
    return;
  }
  const pair = [a, b];
  const AXES = { context: (c) => c.metrics?.context, turns: (c) => c.metrics?.turns,
                 wall: (c) => c.metrics?.run_wall_s, cost: (c) => c.cost?.usd };
  const lower = {};
  for (const [k, get] of Object.entries(AXES)) {
    const vals = pair.map(get).filter((v) => v != null);
    lower[k] = vals.length === 2 ? Math.min(...vals) : null;
  }
  const fmt = { context: (v) => v?.toLocaleString() ?? "—", turns: (v) => v ?? "—",
    wall: (v) => v != null ? v + "s" : "—", cost: (v) => v != null ? "$" + v.toFixed(4) : "—" };

  // aligned metric strip: rows = metrics, columns = the two cells
  const tbl = el("table", { className: "fc-metrics" });
  const hr = el("tr", {}, el("th", { textContent: "" }));
  for (const c of pair) hr.append(el("th", {}, [el("span", { className: "bar", style: `background:${ARM_COLOR[c.arm]}` }), document.createTextNode(" " + c.id)]));
  tbl.append(hr);
  for (const [k, get] of Object.entries(AXES)) {
    const tr = el("tr", {}, el("td", { className: "fc-k", textContent: k }));
    for (const c of pair) {
      const v = get(c);
      const td = el("td", { className: "fc-v" });
      td.append(document.createTextNode(fmt[k](v)));
      if (lower[k] != null && v === lower[k]) td.append(el("span", { className: "lowtag", textContent: " lower" }));
      tr.append(td);
    }
    tbl.append(tr);
  }
  // judge coverage row (the judge's own word per arm), when both cells are judged
  const covRow = el("tr", {}, el("td", { className: "fc-k", textContent: "coverage" }));
  for (const c of pair) {
    const s = DATA.judge[`${c.rung}-${c.repo}`]?.scores?.[c.arm];
    const cov = s ? coverageOf(s.verdict) : null;
    covRow.append(el("td", { className: "fc-v", textContent: cov ? `${COV_GLYPH[cov] ?? ""} ${cov}` : "—" }));
  }
  tbl.append(covRow);
  out.append(tbl);

  // the two transcripts in parallel — reuse the compare-pane machinery, labelled
  // by full cell id (arm alone wouldn't disambiguate L2 vs L3 of the same arm).
  const bar = el("div", { className: "compare-bar", style: "margin-top:.8rem" });
  const sync = el("label", { className: "toggle compare-sync" },
    [el("input", { type: "checkbox" }), document.createTextNode(" sync scroll")]);
  bar.append(sync); out.append(bar);
  const panes = el("div", { className: "compare-panes" });
  panes.style.gridTemplateColumns = "repeat(2, 1fr)";
  out.append(panes);
  buildPanes(pair, panes, sync.querySelector("input"), (c) => c.id);
}

// Spine-coverage strip (§8, T2.2 / §13.5 #5). The reference key's required spine
// is NOT in the feed and stays judge-only (genesis wall), so a fabricated
// per-element checklist is off the table. Instead we render the spec's endorsed
// fallback: the blind judge's own per-arm coverage verdict (Full / Partial /
// Miss — parsed from the leading word of the verdict prose) aligned side by side,
// with completeness/grounding. Glyphs encode coverage, never a good/bad hue
// (truthbound: no verdict coloring). Full prose stays in the arm columns above.
const COVERAGE_RE = /^\s*(Full|Partial|Miss|None|Incomplete)\b/i;
const COV_GLYPH = { Full: "●", Partial: "◐", Miss: "○", None: "○", Incomplete: "◐" };
const coverageOf = (verdict) => {
  const m = COVERAGE_RE.exec(verdict || "");
  return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : null;
};
function renderSpineStrip(host, jr, arms) {
  if (!jr?.scores) return;
  const have = arms.filter((c) => jr.scores[c.arm]);
  if (!have.length) return;
  const strip = el("section", { className: "spine" });
  strip.append(el("div", { className: "spine-h",
    textContent: "Spine coverage — the blind judge's per-arm verdict against the reference key's required spine" }));
  const row = el("div", { className: "spine-row" });
  row.style.gridTemplateColumns = `repeat(${have.length}, 1fr)`;
  for (const c of have) {
    const s = jr.scores[c.arm];
    const cov = coverageOf(s.verdict);
    const cell = el("div", { className: "spine-cell" });
    cell.append(el("div", { className: "spine-arm" },
      [el("span", { className: "bar", style: `background:${ARM_COLOR[c.arm]}` }), document.createTextNode(c.arm)]));
    cell.append(el("div", { className: "spine-cov" },
      [el("span", { className: "cov-glyph", textContent: COV_GLYPH[cov] ?? "—" }),
       document.createTextNode(" " + (cov ?? "unverdicted"))]));
    cell.append(el("div", { className: "spine-score", textContent: `completeness ${s.completeness} · grounding ${s.grounding}` }));
    row.append(cell);
  }
  strip.append(row);
  strip.append(el("p", { className: "caveat spine-cap",
    textContent: "Full / Partial / Miss is the blind judge's own coverage word, parsed from the per-arm verdict — " +
      "not a fabricated per-element checklist. The reference key stays judge-only (genesis wall); the full verdict " +
      "prose is in each arm column above and the synthesis below (§8, §13.5)." }));
  host.append(strip);
}

// Side-by-side arms compare (§8): the same locked cell's transcripts shown in
// parallel scrolling panes, one per visible arm with a readable trail. Lazy —
// the (up to ~120 KB) markdown is fetched + parsed only when the reader opens
// the strip (§11 perf budget). Synchronized scroll is offered but OFF by
// default: the trails diverge in length, so locked scroll mostly misaligns.
function renderCompareTranscripts(host, arms) {
  const withTrail = arms.filter((c) => c.evidence?.readable);
  if (withTrail.length < 2) return; // nothing to compare against
  const wrap = el("section", { className: "compare" });
  const bar = el("div", { className: "compare-bar" });
  const btn = el("button", { className: "compare-toggle", type: "button",
    textContent: `compare ${withTrail.length} transcripts side by side ▸` });
  const sync = el("label", { className: "toggle compare-sync", hidden: true },
    [el("input", { type: "checkbox" }), document.createTextNode(" sync scroll")]);
  bar.append(btn, sync);
  wrap.append(bar);
  const panes = el("div", { className: "compare-panes", hidden: true });
  panes.style.gridTemplateColumns = `repeat(${withTrail.length}, 1fr)`;
  wrap.append(panes);
  host.append(wrap);

  let built = false;
  btn.onclick = () => {
    const open = panes.hidden;
    panes.hidden = !open; sync.hidden = !open;
    btn.textContent = `compare ${withTrail.length} transcripts side by side ${open ? "▾" : "▸"}`;
    if (open && !built) { built = true; buildPanes(withTrail, panes, sync.querySelector("input")); }
  };
}

function buildPanes(arms, panes, syncBox, labelFor = (c) => c.arm) {
  const scrollers = [];
  for (const c of arms) {
    const pane = el("div", { className: "cmp-pane" });
    pane.append(el("div", { className: "cmp-head" },
      [el("span", { className: "bar", style: `background:${ARM_COLOR[c.arm]}` }),
       document.createTextNode(labelFor(c)),
       ...(c.metrics?.turns != null ? [el("span", { className: "cmp-turns", textContent: `${c.metrics.turns} turns` })] : [])]));
    const scroll = el("div", { className: "cmp-scroll" }, el("p", { className: "caveat", textContent: "loading…" }));
    pane.append(scroll);
    panes.append(pane);
    scrollers.push(scroll);
    fetch(c.evidence.readable).then((r) => r.text())
      .then((md) => { scroll.innerHTML = marked.parse(md); linkifyCites(scroll, REPO[c.repo]?.gh, c.sha); })
      .catch(() => scroll.replaceChildren(el("p", { className: "caveat", textContent: `could not load ${c.evidence.readable}` })));
  }
  // optional synchronized scroll — proportional (trails differ in length), with a
  // reentrancy guard so echoed scroll events don't fight. Off unless box checked.
  let locked = false;
  for (const s of scrollers) s.addEventListener("scroll", () => {
    if (!syncBox.checked || locked) return;
    locked = true;
    const frac = s.scrollTop / Math.max(1, s.scrollHeight - s.clientHeight);
    for (const o of scrollers) if (o !== s) o.scrollTop = frac * (o.scrollHeight - o.clientHeight);
    requestAnimationFrame(() => { locked = false; });
  });
}

// Context-growth sparkline (§5.3): the per-turn input-context curve for one arm
// run, lazy-fetched from series/<cell>.json. Truthbound provenance — the curve
// is build-derived from the run's raw stream-json, NOT the ledger (whose
// `context` is a single cumulative scalar — total input+cache tokens across all
// models/turns — not the per-turn growth, §3.1). Axis from zero.
const sparkCache = {};
function renderSparkline(host, c) {
  if (!c.series_local) return;
  const box = el("div", { className: "spark" });
  box.append(el("div", { className: "spark-h" },
    [el("span", { className: "k", textContent: "context growth" }),
     el("span", { className: "spark-turns", textContent: `${c.series_turns ?? "?"} turns` })]));
  const slot = el("div", { className: "spark-plot" }, el("span", { className: "caveat", textContent: "loading…" }));
  box.append(slot);
  const prov = el("div", { className: "spark-prov" });
  prov.append(document.createTextNode("curve from "), el("code", {}, c.evidence?.raw ?? "raw jsonl"),
    document.createTextNode(" — build-derived, not the ledger scalar"));
  box.append(prov);
  host.append(box);

  const draw = (series) => {
    if (!series?.length) { slot.replaceChildren(el("span", { className: "caveat", textContent: "no per-turn series" })); return; }
    const fig = Plot.plot({
      width: 240, height: 62, marginLeft: 36, marginBottom: 14, marginTop: 6, marginRight: 6,
      style: { fontFamily: "system-ui, sans-serif", fontSize: "9px", background: "transparent" },
      x: { label: null, ticks: [] },
      y: { label: null, zero: true, nice: true, ticks: 2, tickFormat: "~s" },
      marks: [
        Plot.areaY(series, { x: "turn", y: "ctx", fill: ARM_COLOR[c.arm], fillOpacity: 0.12 }),
        Plot.lineY(series, { x: "turn", y: "ctx", stroke: ARM_COLOR[c.arm], strokeWidth: 1.4 }),
        Plot.dot(series, { x: "turn", y: "ctx", r: 1.3, fill: ARM_COLOR[c.arm],
          tip: true, channels: { turn: "turn", "context tokens": "ctx" } }),
      ],
    });
    slot.replaceChildren(fig);
  };

  if (sparkCache[c.id]) { draw(sparkCache[c.id]); return; }
  fetch(c.series_local).then((r) => r.json())
    .then((series) => { sparkCache[c.id] = series; draw(series); })
    .catch(() => slot.replaceChildren(el("span", { className: "caveat", textContent: "series unavailable" })));
}

// transcript modal: readable trail (marked) ↔ raw stream-json. The raw view
// renders one collapsible row per event (summary cheap, pretty JSON lazy on
// expand) so a large jsonl never builds a multi-MB <pre> in one shot.
let txOpener = null; // element to restore focus to when the modal closes (T3.6)
function closeTranscript() {
  $("#tx-overlay").classList.remove("open");
  if (txOpener?.focus) txOpener.focus();
  txOpener = null;
}
async function openTranscript(c) {
  const body = $("#tx-body");
  txOpener = document.activeElement;
  $("#tx-overlay").classList.add("open");
  $("#tx-close").focus();
  let view = "readable";
  const cache = {};

  const head = el("div", { className: "tx-head" });
  // header context strip — frames the trail by what it cost to produce (§7)
  const left = el("div", { className: "tx-head-l" });
  left.append(el("div", { className: "tx-title" }, `${c.id} · ${c.arm}`));
  const bits = [
    `model ${DATA.meta.model}`,
    c.metrics?.turns != null ? `${c.metrics.turns} turns` : null,
    c.metrics?.run_wall_s != null ? `${c.metrics.run_wall_s}s wall` : null,
    c.cost?.usd != null ? `$${c.cost.usd.toFixed(4)}` : null,
    c.metrics?.context != null ? `${c.metrics.context.toLocaleString()} ctx tokens` : null,
    c.engagement ? `${c.engagement.key}=${c.engagement.value} ${c.engagement.passed ? "✓" : "✗"}` : null,
  ].filter(Boolean).join("  ·  ");
  left.append(el("div", { className: "tx-meta" }, bits));
  const toggle = el("div", { className: "tx-toggle" });
  const bReadable = el("button", { textContent: "readable", onclick: () => switchTo("readable") });
  const bRaw = el("button", { textContent: "raw json", onclick: () => switchTo("raw"), disabled: !c.evidence.raw_local });
  toggle.append(bReadable, bRaw);
  head.append(left, toggle);
  const content = el("div", { className: "tx-content" });
  body.replaceChildren(head, content);

  function switchTo(v) {
    view = v;
    bReadable.setAttribute("aria-pressed", v === "readable");
    bRaw.setAttribute("aria-pressed", v === "raw");
    render();
  }

  async function render() {
    if (view === "readable") {
      if (!cache.readable) {
        content.innerHTML = `<p class="caveat">loading…</p>`;
        try { cache.readable = marked.parse(await fetch(c.evidence.readable).then((r) => r.text())); }
        catch { cache.readable = `<p>could not load transcript: ${c.evidence.readable}</p>`; }
      }
      content.innerHTML =
        `<p class="caveat">provenance: <code>${c.evidence.raw ?? "—"}</code></p>` + cache.readable;
      linkifyCites(content, REPO[c.repo]?.gh, c.sha);
      if (c.subagents?.length) content.append(renderSubagents(c));
    } else {
      if (!cache.raw) {
        content.innerHTML = `<p class="caveat">loading raw…</p>`;
        try { cache.raw = renderRaw(await fetch(c.evidence.raw_local).then((r) => r.text())); }
        catch { cache.raw = el("p", {}, `could not load raw: ${c.evidence.raw_local}`); }
      }
      content.replaceChildren(cache.raw);
    }
  }
  switchTo("readable");
}

// Build a lazy, collapsible event list from a stream-json blob. One <details>
// per line; the pretty JSON body is rendered only when the row is first opened.
function renderRaw(text) {
  const lines = text.split("\n").filter((l) => l.trim());
  const list = el("div", { className: "rawlist" });
  list.append(el("p", { className: "caveat" }, `${lines.length} stream-json events — click any to expand.`));
  for (const line of lines) {
    let obj = null; try { obj = JSON.parse(line); } catch { /* keep raw */ }
    const d = el("details", { className: "rawev" });
    const sum = el("summary", {}, rawSummary(obj, line));
    const pre = el("pre");
    let filled = false;
    d.ontoggle = () => { if (d.open && !filled) { pre.textContent = obj ? JSON.stringify(obj, null, 2) : line; filled = true; } };
    d.append(sum, pre);
    list.append(d);
  }
  return list;
}

function rawSummary(obj, line) {
  if (!obj) return line.slice(0, 120);
  const type = obj.type ?? "?";
  let extra = "";
  if (type === "assistant" || type === "user") {
    extra = (obj.message?.content ?? []).map((p) =>
      p.type === "tool_use" ? `▸ ${p.name}` : p.type === "tool_result" ? "◂ result" : p.type === "text" ? "💬 text" : p.type).join("  ");
  } else if (type === "result") {
    extra = `${obj.subtype ?? ""} · ${obj.num_turns ?? "?"} turns · $${(obj.total_cost_usd ?? 0).toFixed(4)}${obj.is_error ? " · ERROR" : ""}`;
  } else if (type === "system") {
    extra = obj.subtype ?? "";
  }
  return `${type}${extra ? "  —  " + extra : ""}`;
}

// Subagents (sidechain Task/Agent sessions) — the only copy of that fanned-out
// work (§7). Each is a nested collapsible sub-trail, parsed lazily on first open.
function renderSubagents(c) {
  const wrap = el("div", { className: "subagents" });
  wrap.append(el("div", { className: "sub-h" },
    `Subagents (${c.subagents.length}) — nested sessions this run spawned; the only copy of that work.`));
  for (const s of c.subagents) {
    const d = el("details", { className: "subagent" });
    const desc = s.description ?? s.id;
    d.append(el("summary", {}, `↳ ${s.agentType ?? "agent"} · ${desc} · ${s.turns} turns · ${s.tools} tools`));
    const sbody = el("div", { className: "sub-body" });
    let loaded = false;
    d.ontoggle = async () => {
      if (!d.open || loaded) return;
      loaded = true;
      sbody.innerHTML = `<p class="caveat">loading…</p>`;
      try {
        const txt = await fetch(s.file).then((r) => r.text());
        sbody.replaceChildren(renderSessionTrail(txt));
        linkifyCites(sbody, REPO[c.repo]?.gh, c.sha);
      } catch { sbody.textContent = `could not load subagent: ${s.file}`; }
    };
    d.append(sbody);
    wrap.append(d);
  }
  return wrap;
}

// Parse a Claude Code session jsonl (agent-<id>.jsonl) into a legible trail:
// reasoning text blocks + `▸ tool(args)` calls, in order.
function renderSessionTrail(text) {
  const trail = el("div", { className: "trail" });
  const events = text.split("\n").filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  for (const e of events) {
    if (e.type !== "assistant" && e.type !== "user") continue;
    for (const part of e.message?.content ?? []) {
      if (part.type === "text" && part.text?.trim())
        trail.append(el("div", { className: "t-reason" }, part.text));
      else if (part.type === "tool_use")
        trail.append(el("div", { className: "t-tool" }, `▸ ${part.name}(${summarizeArgs(part.input)})`));
    }
  }
  if (!trail.children.length) trail.append(el("p", { className: "caveat" }, "no readable steps in this session."));
  return trail;
}

function summarizeArgs(input) {
  if (!input || typeof input !== "object") return "";
  const s = input.command ?? input.file_path ?? input.pattern ?? input.path ?? input.query ?? JSON.stringify(input);
  return String(s).replace(/\s+/g, " ").slice(0, 140);
}

// Detect `path.ext:line` (optionally `:line-line2`) cites in the rendered trail
// and link each to the GitHub blob at the cell's pinned SHA, opened in a new
// tab — so a reader can verify grounding the same way the judge did (§7). Walks
// text nodes only (never inside an existing <a>), so existing markup is intact.
const CITE_RE = /([A-Za-z0-9._\-]+(?:\/[A-Za-z0-9._\-]+)*\.[A-Za-z]{1,6}):(\d+)(?:[-:](\d+))?/g;
function linkifyCites(root, gh, sha) {
  if (!gh || !sha) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue || !n.nodeValue.includes(":")) return NodeFilter.FILTER_REJECT;
      for (let p = n.parentElement; p && p !== root; p = p.parentElement)
        if (p.tagName === "A") return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const targets = [];
  while (walker.nextNode()) targets.push(walker.currentNode);
  for (const node of targets) {
    CITE_RE.lastIndex = 0;
    if (!CITE_RE.test(node.nodeValue)) continue;
    CITE_RE.lastIndex = 0;
    const text = node.nodeValue;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = CITE_RE.exec(text))) {
      const [full, path, l1, l2] = m;
      frag.append(text.slice(last, m.index));
      const cleanPath = path.replace(/^\.?\//, "");
      const hash = l2 ? `#L${l1}-L${l2}` : `#L${l1}`;
      const a = el("a", {
        href: `https://github.com/${gh}/blob/${sha}/${cleanPath}${hash}`,
        target: "_blank", rel: "noopener", className: "cite",
        title: `open at ${gh}@${sha.slice(0, 7)} (new tab)`,
      });
      a.textContent = full;
      frag.append(a);
      last = m.index + full.length;
    }
    frag.append(text.slice(last));
    node.parentNode.replaceChild(frag, node);
  }
}
