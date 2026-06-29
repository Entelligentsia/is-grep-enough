#!/usr/bin/env node
// Synthesize the dashboard data feed from committed experiment artifacts.
// Runs at ANY point over whatever evidence exists — partial rungs are emitted
// flagged, never dropped. Output is a pure function of the inputs (stamp the
// git SHA / timestamp via args, never Date.now() in logic) so the feed is
// diffable and reproducible.
//
//   node site/build.mjs [--root .] [--out site/data] [--sha <git-sha>] [--at <iso>]
//
// Emits site/data/{meta,experiment,cells,judge}.json and copies the readable
// transcripts into site/data/transcripts/ so the published site/ is self-contained.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ROOT = arg("--root", ".");
const OUT = arg("--out", join(ROOT, "site/data"));
const SHA = arg("--sha", "uncommitted");
const AT = arg("--at", "unstamped"); // pass an ISO string from the caller; never invented here

const rd = (p) => readFileSync(join(ROOT, p), "utf8");
const rj = (p) => JSON.parse(rd(p));

const state = rj("experiment/state.json");
const spine = rj("experiment/spine.json");

// ---- manifest: pinned SHA + language + GitHub slug per repo ------------------
// gh = "owner/repo" derived from the clone url, used to build blob cite links
// (https://github.com/<gh>/blob/<sha>/<path>#L<n>) at the cell's pinned SHA.
const ghSlug = (url) => url ? url.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "") : null;
const manifest = {};
for (const line of rd("repos.manifest").split("\n")) {
  if (!line.trim() || line.trim().startsWith("#")) continue;
  const [name, lang, url, sha] = line.trim().split(/\s+/);
  if (name) manifest[name] = { lang, sha, gh: ghSlug(url) };
}

const ARMS = spine.arms; // {baseline,grove,lsp}
const ARM_IDS = spine.order_policy?.arm_order ?? ["baseline", "grove", "lsp"];
const RUNGS = spine.rungs ?? ["L1", "L2", "L3", "L4", "L5"];
const REPOS = state.registered_repos ?? Object.keys(manifest);
const ENGAGE_KEY = { baseline: "bash_calls", grove: "grove_tools", lsp: "lsp_tools" };
// fixed, colorblind-safe (Okabe–Ito), identity-only — NEVER quality/traffic-light
const ARM_COLOR = { baseline: "#0072B2", grove: "#E69F00", lsp: "#009E73" };

// ---- per-run metric extraction from the raw stream-json ----------------------
function readRun(rawPath) {
  if (!existsSync(rawPath)) return null;
  const events = rd2(rawPath).split("\n").filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const tools = {}; let toolCalls = 0;
  let bash = 0, reads = 0, grove = 0, lsp = 0, mcpNonGrove = 0;
  const series = []; let turn = 0;
  for (const e of events) {
    if (e.type !== "assistant") continue;
    const u = e.message?.usage;
    if (u && e.parent_tool_use_id == null) {
      turn++;
      const cr = u.cache_read_input_tokens ?? 0, cc = u.cache_creation_input_tokens ?? 0, inp = u.input_tokens ?? 0;
      // per-turn token components: ctx is the input side of this turn (fresh +
      // cache); `out` is what the turn generated. cum_cost is intentionally NOT
      // emitted — only the run's total is billed; per-turn cost would be a
      // token-derived estimate, not a billed figure (§13, truthbound).
      series.push({ turn, ctx: inp + cr + cc, in: inp, cache_read: cr, cache_create: cc, out: u.output_tokens ?? 0 });
    }
    for (const c of e.message?.content ?? []) {
      if (c.type !== "tool_use") continue;
      tools[c.name] = (tools[c.name] || 0) + 1; toolCalls++;
      if (c.name === "Bash") bash++;
      else if (c.name === "Read") reads++;
      else if (c.name?.startsWith("mcp__grove__")) grove++;
      else if (c.name?.startsWith("mcp__")) mcpNonGrove++;
    }
  }
  lsp += tools["LSP"] || 0;
  const r = events.find((e) => e.type === "result");
  const u = r?.usage ?? {};
  return {
    has_result: !!r && r.is_error !== true,
    is_error: r?.is_error === true,
    turns: r?.num_turns ?? null,
    wall_s: r ? Math.round((r.duration_ms ?? 0) / 1000) : null,
    cost: r?.total_cost_usd ?? null,
    context: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    cost_split: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0,
                  cache_create: u.cache_creation_input_tokens ?? 0, cache_read: u.cache_read_input_tokens ?? 0 },
    tools: { tool_calls: toolCalls, bash_calls: bash, reads, grove_tools: grove, lsp_tools: lsp, mcp_nongrove_tools: mcpNonGrove, by_name: tools },
    series,
  };
}
function rd2(p) { return readFileSync(p, "utf8"); }

// ---- cite verification (T3.5): resolve a transcript's file:line cites against
// the repo's PINNED source so the dashboard's blob links are confirmed, not just
// asserted. A cite RESOLVES if its file is located — exact relative path, or a
// unique basename match in the pinned tree — AND the line is within the file.
// Bare names with >1 match are "ambiguous"; ones with no match "unlocatable":
// both are limits of a mechanical checker, reported honestly, never failures.
// (Reading pinned source is a reporting step, like judging — never shown to an
// arm; the genesis wall governs running, not this build.)
const CITE_RE = /([A-Za-z0-9._\-]+(?:\/[A-Za-z0-9._\-]+)*\.[A-Za-z]{1,6}):(\d+)(?:[-:](\d+))?/g;
const SKIP_DIRS = new Set([".git", "node_modules"]);
const repoIndexCache = {};
function repoIndex(repo) {
  if (repo in repoIndexCache) return repoIndexCache[repo];
  const root = join(ROOT, `experiment/repos/${repo}`);
  const idx = new Map(), byPath = new Set();
  if (existsSync(root)) {
    const stack = [[root, ""]];
    while (stack.length) {
      const [dir, rel] = stack.pop();
      let ents; try { ents = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of ents) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) stack.push([join(dir, e.name), r]); }
        else if (e.isFile()) { byPath.add(r); let a = idx.get(e.name); if (!a) idx.set(e.name, a = []); a.push(r); }
      }
    }
  }
  return (repoIndexCache[repo] = { idx, byPath, root, exists: existsSync(root) });
}
const lineCountCache = {};
function lineCount(abs) {
  if (abs in lineCountCache) return lineCountCache[abs];
  let n; try { n = readFileSync(abs, "utf8").split("\n").length; } catch { n = -1; }
  return (lineCountCache[abs] = n);
}
function verifyCites(repo, transcriptAbs) {
  const { idx, byPath, root, exists } = repoIndex(repo);
  if (!exists) return null; // no pinned source → can't verify, don't fabricate a number
  let txt; try { txt = readFileSync(transcriptAbs, "utf8"); } catch { return null; }
  let resolved = 0, out_of_range = 0, ambiguous = 0, unlocatable = 0;
  const seen = new Set(), fails = [];
  CITE_RE.lastIndex = 0;
  let m;
  while ((m = CITE_RE.exec(txt))) {
    const path = m[1].replace(/^\.?\//, ""), line = +m[2];
    const key = `${path}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let rel = byPath.has(path) ? path : null;
    if (!rel && !path.includes("/")) {
      const cand = idx.get(path);
      if (cand?.length === 1) rel = cand[0];
      else if (cand?.length > 1) { ambiguous++; continue; }
    }
    if (!rel) { unlocatable++; continue; }
    const n = lineCount(join(root, rel));
    if (n >= 0 && line <= n) resolved++;
    else { out_of_range++; if (fails.length < 5) fails.push(key); }
  }
  return { checked: seen.size, located: resolved + out_of_range, resolved, out_of_range, ambiguous, unlocatable,
           sha: manifest[repo]?.sha ?? null, fails };
}

// ---- assemble cells over the FULL grid (missing cells flagged, never dropped) -
const cells = [];
let nHarvested = 0, nDnf = 0, nPending = 0;
mkdirSync(join(OUT, "transcripts"), { recursive: true });
mkdirSync(join(OUT, "raw"), { recursive: true });
mkdirSync(join(OUT, "series"), { recursive: true });
let nSeries = 0;

for (const rung of RUNGS) {
  for (const repo of REPOS) {
    for (const arm of ARM_IDS) {
      const id = `${rung}-${arm}-${repo}`;
      const side = state.sides?.[id];
      const status = side?.status ?? "pending";
      // the BARE prompt the arm saw (genesis wall: reference keys are NOT shown).
      const promptPath = join(ROOT, `experiment/prompts/${repo}/${rung}.txt`);
      const prompt = existsSync(promptPath) ? readFileSync(promptPath, "utf8").trim() : null;
      const rawPath = join(ROOT, `evidence/nav3/${rung}/raw/${repo}-${rung}.claude.${arm}.jsonl`);
      const readableRel = `evidence/nav3/${rung}/readable/${repo}-${rung}.claude.${arm}.md`;
      const run = status === "harvested" ? readRun(rawPath) : null;

      // copy the readable transcript into the self-contained site artifact
      let transcript = null;
      const readableAbs = join(ROOT, readableRel);
      if (existsSync(readableAbs)) {
        const dest = `transcripts/${repo}-${rung}.${arm}.md`;
        copyFileSync(readableAbs, join(OUT, dest));
        transcript = `data/${dest}`;
      }

      // copy the raw stream-json so the "raw" toggle resolves on the static site
      // (the repo-relative evidence/ path is outside site/). raw_local = fetchable
      // by the page; evidence.raw stays the provenance path it was harvested from.
      let rawLocal = null;
      if (existsSync(rawPath)) {
        const dest = `raw/${repo}-${rung}.${arm}.jsonl`;
        copyFileSync(rawPath, join(OUT, dest));
        rawLocal = `data/${dest}`;
      }

      // subagents: sidechain Task/Agent sessions captured under
      // raw/subagents/<repo>-<rung>.<arm>/agent-<id>.jsonl (+ .meta.json). These
      // are the ONLY copy of that fanned-out work (§7) — copy them in and surface
      // each one's type/description + tool/turn counts.
      const subDir = join(ROOT, `evidence/nav3/${rung}/raw/subagents/${repo}-${rung}.${arm}`);
      const subagents = [];
      if (existsSync(subDir)) {
        for (const fn of readdirSync(subDir)) {
          if (!fn.endsWith(".jsonl")) continue;
          const id = fn.replace(/^agent-/, "").replace(/\.jsonl$/, "");
          const metaPath = join(subDir, fn.replace(/\.jsonl$/, ".meta.json"));
          const m = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
          const destDir = `subagents/${repo}-${rung}.${arm}`;
          mkdirSync(join(OUT, destDir), { recursive: true });
          copyFileSync(join(subDir, fn), join(OUT, destDir, fn));
          let tools = 0, turns = 0;
          for (const e of readFileSync(join(subDir, fn), "utf8").split("\n").filter((l) => l.trim())
            .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)) {
            if (e.type !== "assistant") continue;
            turns++;
            for (const c of e.message?.content ?? []) if (c.type === "tool_use") tools++;
          }
          subagents.push({ id, agentType: m.agentType ?? null, description: m.description ?? null,
                           spawnDepth: m.spawnDepth ?? null, turns, tools, file: `data/${destDir}/${fn}` });
        }
      }

      // Per-turn context-growth series is emitted as its own file (§3.3) and
      // kept OUT of cells.json — the curve is build-derived from the raw jsonl,
      // and inlining 3k points bloated cells.json past 400 KB (TX.1). The cell
      // carries only a pointer; the sparkline lazy-fetches it on drill.
      let seriesLocal = null;
      if (run?.series?.length) {
        const dest = `series/${id}.json`;
        writeFileSync(join(OUT, dest), JSON.stringify(run.series));
        seriesLocal = `data/${dest}`;
        nSeries++;
      }

      const engageKey = ENGAGE_KEY[arm];
      const engageVal = run?.tools?.[engageKey] ?? null;
      const flags = [];
      if (status !== "harvested") flags.push("incomplete");
      if (run && !run.has_result) flags.push("dnf");
      if (side?.status === "blocked") flags.push("blocked");

      if (status === "harvested") nHarvested++;
      else if (status === "blocked") nDnf++;
      else nPending++;

      cells.push({
        id, rung, repo, arm, status, prompt,
        lang: manifest[repo]?.lang ?? null,
        sha: manifest[repo]?.sha ?? null,
        engaged: side?.engaged ?? (engageVal != null ? engageVal > 0 : null),
        engagement: engageKey && engageVal != null ? { key: engageKey, value: engageVal, passed: engageVal > 0 } : null,
        metrics: {
          context: run?.context ?? side?.context ?? null,
          run_wall_s: run?.wall_s ?? side?.run_wall_s ?? null,
          turns: run?.turns ?? null,
          tool_calls: run?.tools?.tool_calls ?? null,
        },
        cost: run ? { usd: run.cost, ...run.cost_split } : null,
        tools: run?.tools ?? null,
        series_local: seriesLocal, // pointer to series/<id>.json (per-turn ctx growth); curve provenance = raw file
        series_turns: run?.series?.length ?? null,
        evidence: { raw: existsSync(rawPath) ? `evidence/nav3/${rung}/raw/${repo}-${rung}.claude.${arm}.jsonl` : null, raw_local: rawLocal, readable: transcript },
        // cite-link verification against pinned source (T3.5) — confirmed, not asserted
        cite_check: status === "harvested" && existsSync(readableAbs) ? verifyCites(repo, readableAbs) : null,
        subagents,
        dnf_reason: side?.note ?? side?.reason ?? null,
        flags,
      });
    }
  }
}

// ---- judge records (pass through; judge transparency is first-class) ---------
const judge = [];
for (const [cell, rec] of Object.entries(state.judge ?? {})) {
  const [rung, repo] = [cell.split("-")[0], cell.split("-").slice(1).join("-")];
  judge.push({ id: cell, rung, repo, scores: rec.scores, key_revisions: rec.key_revisions ?? [], verdict: rec.verdict ?? null, ts: rec.ts ?? null });
}

// ---- experiment definition ---------------------------------------------------
const experiment = {
  name: state.experiment ?? "nav-3way",
  purpose: spine.purpose ?? null,
  model: spine.model ?? "sonnet",
  rungs: RUNGS,
  repos: REPOS.map((r) => ({ id: r, ...(manifest[r] ?? {}) })),
  arms: ARM_IDS.map((id) => ({ id, label: ARMS[id]?.capability ?? id, color: ARM_COLOR[id], engage_key: ENGAGE_KEY[id] })),
  order: spine.order_policy ?? null,
};

const meta = {
  generated_at: AT,
  git_sha: SHA,
  model: spine.model ?? "sonnet",
  ledger_writer: "statectl (state.json is statectl-only; this feed is read-only over it)",
  coverage: { harvested: nHarvested, blocked_dnf: nDnf, pending: nPending, total: cells.length },
  caveats: [
    "n=1 per cell — read directions, not measurements; no replication or significance.",
    "Dollar cost is the billed total_cost_usd recorded by each run (model: sonnet); not a list-price estimate.",
    "Cache-read tokens are heavily discounted vs fresh input — read the token split, not a single total.",
    "Wall-clock includes model latency, not pure tool time.",
    "Partial rungs (incomplete cells) are shown flagged; some lsp cells outside L2/L3 may predate corrected setup and need re-running.",
  ],
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "meta.json"), JSON.stringify(meta, null, 2));
writeFileSync(join(OUT, "experiment.json"), JSON.stringify(experiment, null, 2));
writeFileSync(join(OUT, "cells.json"), JSON.stringify(cells, null, 2));
writeFileSync(join(OUT, "judge.json"), JSON.stringify(judge, null, 2));

const nSub = cells.reduce((a, c) => a + c.subagents.length, 0);
console.error(`feed → ${OUT}  | cells: ${cells.length} (${nHarvested} harvested, ${nDnf} dnf/blocked, ${nPending} pending) | judged: ${judge.length} | transcripts: ${readdirSync(join(OUT, "transcripts")).length} | raw: ${readdirSync(join(OUT, "raw")).length} | series: ${nSeries} | subagents: ${nSub}`);
