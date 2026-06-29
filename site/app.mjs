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

// metric families rendered as small-multiple rows (§5.3), in this order
const METRIC_FAMILIES = ["context", "turns", "wall", "cache", "cost"];

const state = { rung: "", repo: "", cell: null, showJudged: false };
let DATA;
let REPO = {}; // id → {id, lang, sha, gh} for cite-link construction

init();
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

  // filters
  fillSelect($("#f-rung"), experiment.rungs);
  fillSelect($("#f-repo"), experiment.repos.map((r) => r.id));
  $("#f-rung").onchange = (e) => { state.rung = e.target.value; render(); };
  $("#f-repo").onchange = (e) => { state.repo = e.target.value; render(); };

  $("#t-judged").onchange = (e) => { state.showJudged = e.target.checked; renderCoverage(); };
  $("#tx-close").onclick = () => $("#tx-overlay").classList.remove("open");
  $("#tx-overlay").onclick = (e) => { if (e.target.id === "tx-overlay") e.target.classList.remove("open"); };

  render();
}

function fillSelect(sel, vals) { for (const v of vals) sel.append(el("option", { value: v, textContent: v })); }

function filtered() {
  return DATA.cells.filter((c) => (!state.rung || c.rung === state.rung) && (!state.repo || c.repo === state.repo));
}

function render() {
  const cov = DATA.meta.coverage;
  $("#coverage-tally").textContent = `${cov.harvested} harvested · ${cov.pending} pending · ${cov.blocked_dnf} dnf/blocked of ${cov.total}`;
  renderCoverage();
  renderMetrics();
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
        // status by shape/fill, never good/bad color: filled=harvested,
        // empty=pending, hatched=blocked/DNF. DNF reason tooltipped when known.
        let st = "pending";
        if (c?.status === "harvested") st = c.flags?.includes("dnf") ? "dnf" : "harvested";
        else if (c?.status === "blocked") st = "blocked";
        const judged = state.showJudged && DATA.judge[`${rg}-${repo}`]?.scores?.[arm] ? " judged" : "";
        const reason = c?.dnf_reason ? ` — ${c.dnf_reason}` : "";
        const flagstr = c?.flags?.length ? ` [${c.flags.join(",")}]` : "";
        mark.append(el("span", {
          className: `seg ${st} ${arm}${judged}`,
          title: `${rg} · ${arm} · ${repo}: ${c?.status ?? "pending"}${flagstr}${reason}`,
        }));
      }
      mark.onclick = () => { state.cell = cid; renderDetail(cid); $("#detail-section").scrollIntoView({ behavior: "smooth" }); renderCoverage(); };
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
  const base = filtered().filter((c) => c.status === "harvested");

  for (const key of METRIC_FAMILIES) {
    const m = METRICS[key];
    const rows = base
      .filter((c) => m.get(c) != null)
      .map((c) => ({ rung: c.rung, arm: c.arm, repo: c.repo, value: m.get(c), id: `${c.rung}-${c.repo}` }));

    const fig = el("figure", { className: "figure metric-family" });
    fig.append(el("figcaption", { className: "mf-label", textContent: m.label }));

    if (!rows.length) {
      fig.append(el("p", { className: "caveat", textContent: "no harvested data for this metric in the current filter." }));
      host.append(fig);
      continue;
    }

    // one small chart per rung; arms (x) side by side within each.
    const nFacets = rungsShown.length;
    const width = Math.min(980, Math.max(360, nFacets * 200));
    const plot = Plot.plot({
      width, height: 200, marginLeft: 58, marginBottom: 36, marginTop: 8,
      style: { fontFamily: "system-ui, sans-serif", fontSize: "11px", background: "transparent" },
      fx: { label: null, domain: rungsShown },
      x: { label: null, domain: ARMS, tickRotate: 0 },
      y: { label: null, grid: true, zero: true, nice: true, tickFormat: "~s" },
      color: { domain: ARMS, range: ARMS.map((a) => ARM_COLOR[a]) },
      marks: [
        Plot.frame({ stroke: "#e3e1dc" }),
        // per-(arm,rung) median tick — central tendency beside the raw spread
        Plot.tickY(rows, Plot.groupX({ y: "median" },
          { fx: "rung", x: "arm", y: "value", stroke: "arm", strokeWidth: 2.5 })),
        Plot.dot(rows, {
          fx: "rung", x: "arm", y: "value", fill: "arm", r: 3, fillOpacity: 0.85, stroke: "white", strokeWidth: 0.4,
          tip: true, channels: { repo: "repo", rung: "rung", arm: "arm", value: { value: "value", label: m.label } },
        }),
      ],
    });
    fig.append(plot);

    const n = new Set(rows.map((r) => r.id)).size;
    fig.append(el("figcaption", { className: "mf-cap" },
      `${m.label} — one dot per repo across ${rungsShown.length} rung${rungsShown.length === 1 ? "" : "s"} ` +
      `(n=${n} task${n === 1 ? "" : "s"} shown); tick = per-rung-per-arm median. Axis from zero. n=1 per cell — a direction, not a measurement.`));
    host.append(fig);
  }
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
  // header context strip — frames the trail by what it cost to produce (§7)
  const left = el("div", { className: "tx-head-l" });
  left.append(el("div", { className: "tx-title" }, `${c.id} · ${c.arm}`));
  const bits = [
    `model ${DATA.meta.model}`,
    c.metrics?.turns != null ? `${c.metrics.turns} turns` : null,
    c.metrics?.run_wall_s != null ? `${c.metrics.run_wall_s}s wall` : null,
    c.cost?.usd != null ? `$${c.cost.usd.toFixed(4)}` : null,
    c.metrics?.context != null ? `${c.metrics.context.toLocaleString()} peak ctx` : null,
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
