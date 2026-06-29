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

const ARM_COLOR = { baseline: "#0072B2", grove: "#E69F00", lsp: "#009E73" };
const ARMS = ["baseline", "grove", "lsp"];

const METRICS = {
  context: { label: "Context (peak tokens)", get: (c) => c.metrics?.context, fmt: (v) => v?.toLocaleString() },
  turns: { label: "Turns", get: (c) => c.metrics?.turns, fmt: (v) => v },
  wall: { label: "Wall clock (s)", get: (c) => c.metrics?.run_wall_s, fmt: (v) => v != null ? v + "s" : "—" },
  cache: { label: "Cache tokens (read+create)", get: (c) => c.cost ? (c.cost.cache_read + c.cost.cache_create) : null, fmt: (v) => v?.toLocaleString() },
  cost: { label: "Cost (billed USD)", get: (c) => c.cost?.usd, fmt: (v) => v != null ? "$" + v.toFixed(3) : "—" },
};

const state = { rung: "", repo: "", metric: "cost", cell: null };
let DATA;

init();
async function init() {
  const [meta, experiment, cells, judge] = await Promise.all(
    ["meta", "experiment", "cells", "judge"].map((f) => fetch(`data/${f}.json`).then((r) => r.json()))
  );
  DATA = { meta, experiment, cells, judge: Object.fromEntries(judge.map((j) => [j.id, j])) };

  $("#purpose").textContent = experiment.purpose ?? "";
  $("#provenance").textContent =
    `generated ${meta.generated_at} · ${meta.git_sha} · model ${meta.model} · ` +
    `${meta.coverage.harvested}/${meta.coverage.total} cells harvested · ${Object.keys(DATA.judge).length} judged`;
  $("#finding-text").textContent =
    "The same exploration task, given to an agent with three rungs of navigation power: plain text search (baseline), fast-light structural (grove/tree-sitter), and authoritative semantic (lsp/LSP) — across a task-complexity ladder. The question is where on that ladder the extra power stops paying for itself. Where rungs are fully run and judged, answer quality is a near-tie; the arms separate on cost and route, not correctness. Everything below links to the raw run that produced it — check it.";
  $("#caveats").innerHTML = "<b>Caveats:</b> " + meta.caveats.join(" ");

  // filters
  fillSelect($("#f-rung"), experiment.rungs);
  fillSelect($("#f-repo"), experiment.repos.map((r) => r.id));
  $("#f-rung").onchange = (e) => { state.rung = e.target.value; render(); };
  $("#f-repo").onchange = (e) => { state.repo = e.target.value; render(); };

  // metric tabs
  for (const [k, m] of Object.entries(METRICS)) {
    const b = el("button", { textContent: m.label, onclick: () => { state.metric = k; render(); } });
    b.dataset.k = k; $("#metric-tabs").append(b);
  }
  $("#tx-close").onclick = () => $("#tx-overlay").classList.remove("open");
  $("#tx-overlay").onclick = (e) => { if (e.target.id === "tx-overlay") e.target.classList.remove("open"); };

  render();
}

function fillSelect(sel, vals) { for (const v of vals) sel.append(el("option", { value: v, textContent: v })); }

function filtered() {
  return DATA.cells.filter((c) => (!state.rung || c.rung === state.rung) && (!state.repo || c.repo === state.repo));
}

function render() {
  for (const b of $("#metric-tabs").children) b.setAttribute("aria-pressed", b.dataset.k === state.metric);
  const cov = DATA.meta.coverage;
  $("#coverage-tally").textContent = `${cov.harvested} harvested · ${cov.pending} pending · ${cov.blocked_dnf} dnf/blocked of ${cov.total}`;
  renderCoverage();
  renderChart();
  if (state.cell) renderDetail(state.cell);
}

function renderCoverage() {
  const repos = DATA.experiment.repos.map((r) => r.id).filter((r) => !state.repo || r === state.repo);
  const rungs = DATA.experiment.rungs.filter((r) => !state.rung || r === state.rung);
  const byId = Object.fromEntries(DATA.cells.map((c) => [c.id, c]));

  const table = el("table", { className: "coverage" });
  const head = el("tr", {}, el("th", { textContent: "repo" }));
  for (const rg of rungs) {
    const th = el("th", { className: "rung", textContent: rg, title: "filter to " + rg });
    th.onclick = () => { state.rung = state.rung === rg ? "" : rg; $("#f-rung").value = state.rung; render(); };
    head.append(th);
  }
  table.append(head);

  for (const repo of repos) {
    const tr = el("tr");
    const rc = el("td", { className: "repo", textContent: repo, title: "filter to " + repo });
    rc.onclick = () => { state.repo = state.repo === repo ? "" : repo; $("#f-repo").value = state.repo; render(); };
    tr.append(rc);
    for (const rg of rungs) {
      const td = el("td");
      const mark = el("div", { className: "cellmark" });
      const cid = `${rg}-${repo}`;
      if (state.cell === cid) mark.classList.add("active");
      for (const arm of ARMS) {
        const c = byId[`${rg}-${arm}-${repo}`];
        const st = c?.status === "harvested" ? "harvested" : c?.status === "blocked" ? "blocked" : "pending";
        mark.append(el("span", { className: `seg ${st} ${arm}`, title: `${rg} · ${arm} · ${repo}: ${c?.status ?? "pending"}` }));
      }
      mark.onclick = () => { state.cell = cid; renderDetail(cid); $("#detail-section").scrollIntoView({ behavior: "smooth" }); renderCoverage(); };
      td.append(mark); tr.append(td);
    }
    table.append(tr);
  }
  const host = $("#coverage"); host.replaceChildren(table);
}

function renderChart() {
  const m = METRICS[state.metric];
  const rows = filtered()
    .filter((c) => c.status === "harvested" && m.get(c) != null)
    .map((c) => ({ rung: c.rung, arm: c.arm, repo: c.repo, value: m.get(c), id: `${c.rung}-${c.repo}` }));

  const fig = Plot.plot({
    width: 980, height: 280, marginLeft: 64, marginBottom: 34,
    style: { fontFamily: "system-ui, sans-serif", fontSize: "11px", background: "transparent" },
    x: { label: "rung", domain: DATA.experiment.rungs.filter((r) => !state.rung || r === state.rung) },
    y: { label: m.label, grid: true, zero: true, nice: true },
    fx: { label: null },
    color: { domain: ARMS, range: ARMS.map((a) => ARM_COLOR[a]) },
    marks: [
      Plot.frame({ stroke: "#e3e1dc" }),
      // per-(arm,rung) median bar — central tendency alongside the raw spread
      Plot.barY(rows, Plot.groupX({ y: "median" }, { fx: "arm", x: "rung", y: "value", fill: "arm", fillOpacity: 0.14 })),
      Plot.dot(rows, {
        fx: "arm", x: "rung", y: "value", fill: "arm", r: 3.2, fillOpacity: 0.9,
        tip: true, channels: { repo: "repo", value: "value" },
      }),
    ],
  });
  $("#chart").replaceChildren(fig);
  const n = new Set(rows.map((r) => r.id)).size;
  $("#chart-cap").textContent =
    `${m.label} — one dot per repo (n=${n} task${n === 1 ? "" : "s"} shown), faceted by arm. ` +
    `Axis starts at zero; tick = per-rung median. n=1 per cell — a direction, not a measurement.`;
}

function renderDetail(cid) {
  state.cell = cid;
  const [rung, ...rest] = cid.split("-"); const repo = rest.join("-");
  const arms = ARMS.map((a) => DATA.cells.find((c) => c.id === `${rung}-${a}-${repo}`)).filter(Boolean);
  const jr = DATA.judge[cid];
  const sec = $("#detail-section"); sec.hidden = false;
  $("#detail-id").textContent = `${rung} · ${repo}`;

  const host = $("#detail"); host.replaceChildren();
  const cols = el("div", { className: "armcols" });
  for (const c of arms) {
    const col = el("div", { className: "armcol" });
    col.append(el("h4", {}, [el("span", { className: "bar", style: `background:${ARM_COLOR[c.arm]}` }),
      document.createTextNode(c.arm), ...(c.flags?.length ? [el("span", { className: "flag", textContent: c.flags.join(" ") })] : [])]));
    const rowsM = [
      ["status", c.status],
      ["engagement", c.engagement ? `${c.engagement.key}=${c.engagement.value} ${c.engagement.passed ? "✓" : "✗"}` : "—"],
      ["context", c.metrics?.context?.toLocaleString() ?? "—"],
      ["turns", c.metrics?.turns ?? "—"],
      ["wall", c.metrics?.run_wall_s != null ? c.metrics.run_wall_s + "s" : "—"],
      ["cost", c.cost?.usd != null ? "$" + c.cost.usd.toFixed(4) : "—"],
      ["cache r/c", c.cost ? `${c.cost.cache_read.toLocaleString()} / ${c.cost.cache_create.toLocaleString()}` : "—"],
    ];
    for (const [k, v] of rowsM) col.append(el("div", { className: "metricrow" }, [el("span", { className: "k", textContent: k }), el("span", { className: "v", textContent: String(v) })]));
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

  // prompt + judge synthesis + key revisions (judge transparency is first-class)
  const head = el("div");
  head.append(el("div", { className: "prompt", textContent: "Prompt and reference key live in the transcript header (genesis wall: arms saw only the bare prompt)." }));
  host.append(head, cols);
  if (jr?.verdict) host.append(el("p", { className: "note", style: "margin-top:1rem", textContent: "Judge synthesis: " + jr.verdict }));
  for (const kr of jr?.key_revisions ?? [])
    host.append(el("div", { className: "keyrev" }, `Reference key corrected (${kr.level}): ${kr.reason}  [${kr.cite}]`));
  renderCoverage();
}

// transcript modal: readable trail (marked) ↔ raw stream-json. The raw view
// renders one collapsible row per event (summary cheap, pretty JSON lazy on
// expand) so a large jsonl never builds a multi-MB <pre> in one shot.
async function openTranscript(c) {
  const body = $("#tx-body");
  $("#tx-overlay").classList.add("open");
  let view = "readable";
  const cache = {};

  const head = el("div", { className: "tx-head" });
  const title = el("span", { className: "caveat" }, `${c.id} · ${c.arm}`);
  const toggle = el("div", { className: "tx-toggle" });
  const bReadable = el("button", { textContent: "readable", onclick: () => switchTo("readable") });
  const bRaw = el("button", { textContent: "raw json", onclick: () => switchTo("raw"), disabled: !c.evidence.raw_local });
  toggle.append(bReadable, bRaw);
  head.append(title, toggle);
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
