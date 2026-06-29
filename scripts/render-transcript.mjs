#!/usr/bin/env node
// Render a Claude stream-json (.jsonl) run into a STANDALONE, fully-readable
// markdown document — one self-contained artifact per arm run.
//
// Supersedes scripts/extract-transcript.sh. The old jq renderer clamped every
// text block (prompt, reasoning) to 160 chars via `oneline`, so the prompt was
// ellipsised and the reasoning trail was lossy. This renderer:
//   - shows the PROMPT verbatim (from --prompt-file, the only reliable source —
//     the stream's first user event is a tool_result, not the prompt),
//   - shows every reasoning block in FULL (no truncation),
//   - leads with a metadata header (arm/repo/rung/model/turns/wall/context/cost/
//     engagement/evidence/SHA) so the document stands alone,
//   - splices Task/Agent subagent steps under their spawn,
//   - renders the final answer verbatim.
//
// Usage:
//   node scripts/render-transcript.mjs <raw.jsonl> \
//        [--prompt-file F] [--manifest repos.manifest] [--evidence PATH] > out.md
//
// Self-contained: cost/turns/wall come from the run's own `result` event;
// tool/engagement counts are recomputed from the stream (mirroring
// side-metrics.sh) so the document never disagrees with the ledger's gate.

import { readFileSync } from "node:fs";
import { basename } from "node:path";

const args = process.argv.slice(2);
const raw = args.find((a) => !a.startsWith("--"));
const opt = (name, def = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
if (!raw) {
  console.error("usage: render-transcript.mjs <raw.jsonl> [--prompt-file F] [--manifest M] [--evidence PATH]");
  process.exit(2);
}
const promptFile = opt("--prompt-file");
const manifestPath = opt("--manifest", "repos.manifest");
const evidencePath = opt("--evidence", raw);

// ---- parse identity from filename: <repo>-<rung>.claude.<arm>.jsonl ----------
const fname = basename(raw);
const m = fname.match(/^(.+)-(L\d)\.claude\.(baseline|grove|lsp)\.jsonl$/);
if (!m) {
  console.error(`cannot parse <repo>-<rung>.claude.<arm> from: ${fname}`);
  process.exit(2);
}
const [, repo, rung, arm] = m;

const ARM_LABEL = {
  baseline: "baseline — text search (bash + coreutils)",
  grove: "grove — structural (grove MCP/CLI)",
  lsp: "lsp — semantic (native Claude Code LSP tool)",
};
const ENGAGE_KEY = { baseline: "bash_calls", grove: "grove_tools", lsp: "lsp_tools" };

// ---- pinned SHA + language from the manifest (best-effort) --------------------
let sha = null, lang = null;
try {
  for (const line of readFileSync(manifestPath, "utf8").split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const [name, l, , s] = line.trim().split(/\s+/);
    if (name === repo) { lang = l; sha = s; break; }
  }
} catch { /* manifest optional */ }

// ---- load the stream ---------------------------------------------------------
const events = readFileSync(raw, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean);

// ---- recompute metrics from the stream (mirror side-metrics.sh) --------------
const toolCounts = {};
let toolCalls = 0;
const bump = (name) => { toolCounts[name] = (toolCounts[name] || 0) + 1; toolCalls++; };
const isGrove = (n) => n && n.startsWith("mcp__grove__");
const isLsp = (n) => n && (n === "LSP" || n.startsWith("mcp__lsp") || /lsp/i.test(n) && n.startsWith("mcp__"));
let groveTools = 0, lspTools = 0, bashCalls = 0, reads = 0, mcpNonGrove = 0;

for (const e of events) {
  if (e.type !== "assistant") continue;
  for (const c of e.message?.content ?? []) {
    if (c.type !== "tool_use") continue;
    bump(c.name);
    if (c.name === "Bash") bashCalls++;
    else if (c.name === "Read") reads++;
    else if (isGrove(c.name)) groveTools++;
    else if (c.name?.startsWith("mcp__")) { mcpNonGrove++; if (isLsp(c.name)) lspTools++; }
  }
}
// native LSP tool surfaces as a top-level `LSP` tool, not mcp__ — count it too.
lspTools += toolCounts["LSP"] || 0;

const result = events.find((e) => e.type === "result");
const usage = result?.usage ?? {};
const cost = result?.total_cost_usd ?? null;
const wall = result ? Math.round((result.duration_ms ?? 0) / 1000) : null;
const turns = result?.num_turns ?? null;
const isError = result?.is_error === true;
const hasResult = !!result && !isError;
const context =
  (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);

const engageKey = ENGAGE_KEY[arm];
const engageVal = { bash_calls: bashCalls, grove_tools: groveTools, lsp_tools: lspTools }[engageKey];
const engaged = engageVal > 0;

// ---- helpers -----------------------------------------------------------------
const n = (x) => (x == null ? "—" : x.toLocaleString("en-US"));
const usd = (x) => (x == null ? "—" : `$${x.toFixed(4)}`);
const collapse = (s) => String(s).replace(/\s+/g, " ").trim();
const argline = (input) => {
  if (input == null) return "";
  const pick =
    input.command ?? input.pattern ?? input.file_path ?? input.path ?? input.query ??
    input.name ?? input.file ?? input.id ?? input.name_path ?? input.symbol ?? input.description;
  let s = pick != null ? collapse(pick) : collapse(JSON.stringify(input));
  if (s.length > 300) s = s.slice(0, 297) + "…";
  return s;
};
const blockquote = (s) => s.split("\n").map((l) => "> " + l).join("\n");

// ---- splice subagent steps under their spawning Agent/Task tool_use ----------
const kids = {}; // parent_tool_use_id -> [lines]
for (const e of events) {
  if (e.type !== "assistant" || e.parent_tool_use_id == null) continue;
  const pid = e.parent_tool_use_id;
  (kids[pid] ??= []);
  for (const c of e.message?.content ?? []) {
    if (c.type === "text" && c.text?.trim()) kids[pid].push("    ↳ 💬 " + collapse(c.text));
    else if (c.type === "tool_use") kids[pid].push("    ↳ `" + c.name + "(" + argline(c.input) + ")`");
  }
}

// ---- emit --------------------------------------------------------------------
const out = [];
const promptText = promptFile ? readFileSync(promptFile, "utf8").trim() : null;

out.push(`# ${repo} · ${rung} · ${arm} — readable transcript\n`);
out.push(
  `> ${ARM_LABEL[arm]}, over **${repo}**${lang ? ` (${lang})` : ""}` +
  `${sha ? ` @ \`${sha.slice(0, 9)}\`` : ""}, model \`sonnet\`. ` +
  `One run (n=1). This document is generated from the run's own stream-json; ` +
  `every number below is recomputed from that transcript.\n`
);

out.push(`| field | value |`);
out.push(`|---|---|`);
out.push(`| arm | \`${arm}\` — ${ARM_LABEL[arm].split("—")[1].trim()} |`);
out.push(`| repo · rung | ${repo}${lang ? ` (${lang})` : ""} · ${rung} |`);
out.push(`| pinned source | ${sha ? `\`${sha}\`` : "—"} |`);
out.push(`| status | ${hasResult ? "completed" : "**DNF** (no clean result event)"}${isError ? " · **is_error**" : ""} |`);
out.push(`| engagement | \`${engageKey} = ${engageVal}\` (gate: > 0 → ${engaged ? "✓ used its capability" : "✗ DID NOT ENGAGE"}) |`);
out.push(`| turns | ${n(turns)} |`);
out.push(`| wall clock | ${wall == null ? "—" : `${wall} s`} |`);
out.push(`| context (peak) | ${n(context)} tokens |`);
out.push(`| cost (billed) | ${usd(cost)} |`);
out.push(`| &nbsp;&nbsp;↳ token split | in ${n(usage.input_tokens)} · out ${n(usage.output_tokens)} · cache-create ${n(usage.cache_creation_input_tokens)} · cache-read ${n(usage.cache_read_input_tokens)} |`);
out.push(`| tool calls | ${n(toolCalls)} (${Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(", ") || "none"}) |`);
out.push(`| evidence | \`${evidencePath}\` |`);
out.push("");

out.push(`## Prompt — verbatim (exactly what the arm was shown)\n`);
out.push(`The running arm saw only this. Reference keys and rationale were withheld (the genesis wall).\n`);
out.push(promptText ? blockquote(promptText) : "> _(prompt file not supplied to the renderer; pass --prompt-file experiment/prompts/" + repo + "/" + rung + ".txt)_");
out.push("");

out.push(`## Reasoning trail\n`);
out.push(`Each \`💬\` is the agent's own reasoning; each \`▸\` is a tool call, in order. Subagent steps are spliced under their spawn (\`↳\`).\n`);

for (const e of events) {
  if (e.parent_tool_use_id != null) continue; // top-level only; children spliced above
  if (e.type !== "assistant") continue;
  for (const c of e.message?.content ?? []) {
    if (c.type === "text" && c.text?.trim()) {
      out.push(`\n💬 ${c.text.trim()}\n`);
    } else if (c.type === "tool_use" && (c.name === "Agent" || c.name === "Task")) {
      out.push(`▸ \`${c.name}(${argline(c.input)})\`  ⟶ subagent:`);
      out.push((kids[c.id] ?? ["    ↳ _(no steps captured in stream)_"]).join("\n"));
      out.push(`    ↳ ⟹ returned to parent\n`);
    } else if (c.type === "tool_use") {
      out.push(`&nbsp;&nbsp;▸ \`${c.name}(${argline(c.input)})\``);
    }
  }
}

out.push(`\n## Final answer\n`);
if (result) {
  out.push(`_Result event — ${result.subtype ?? "?"}, ${wall ?? "?"} s, ${n(turns)} turns${isError ? ", **is_error=true**" : ""}._\n`);
  out.push(result.result ?? "_(no result text)_");
} else {
  out.push("_(no result event — this run did not finish cleanly)_");
}
out.push("");

process.stdout.write(out.join("\n") + "\n");
