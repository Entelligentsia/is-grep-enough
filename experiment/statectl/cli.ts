// Deterministic, zod-validated CLI — the ONLY writer of experiment/state.json.
// Every mutation parses the current state, applies a typed change, re-validates
// the whole document, and writes atomically. Invalid input is rejected, never
// persisted. No free-form JSON editing of the store anywhere in the experiment.
//
// Verbs:
//   validate                      parse spine + state against schema; nonzero on failure
//   register <repo>               idempotent, no-clobber: seed <repo>'s rung×arm cells as pending
//   status [--repo R] [--rung L]  counts by status (+ blocked list)
//   next                          first runnable pending cell-id in planned order (else empty)
//   reset <cell>                   clear a cell back to pending (drops metrics) — for re-runs
//   block <cell> <reason...>      set status=blocked + reason (verify-gate off-ramp)
//   set-status <cell> <status>    transition a registered cell's status
//   record <cell> k=v ...         merge typed metric fields into a side (validated)
//   setup-set <arm>/<repo> k=v    upsert a setup record
//   judge-set <rung>-<repo> --json '<json>'   upsert a judge record
//   reconcile                     report drift between registered cells and spine×repos
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Spine, State, SideRecord, SetupRecord, JudgeRecord, Status } from "./schema.ts";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const EXP_DIR = dirname(SCRIPT_DIR); // experiment/
const ROOT = dirname(EXP_DIR); // repo root
const STATE_PATH = process.env.EXP_STATE ?? join(EXP_DIR, "state.json");
const SPINE_PATH = process.env.EXP_SPINE ?? join(EXP_DIR, "spine.json");
const MANIFEST_PATH = process.env.EXP_MANIFEST ?? join(ROOT, "repos.manifest");

class CliError extends Error {}
const fail = (msg: string): never => {
  throw new CliError(msg);
};
const need = (v: string | undefined, usage: string): string => {
  if (!v) fail(usage);
  return v as string;
};
const now = () => new Date().toISOString();

function loadSpine(): Spine {
  return Spine.parse(JSON.parse(readFileSync(SPINE_PATH, "utf8")));
}
function loadState(): State {
  if (!existsSync(STATE_PATH)) {
    return State.parse({
      experiment: "nav-3way",
      spine: "experiment/spine.json",
      registered_repos: [],
      sides: {},
      setup: {},
      judge: {},
    });
  }
  return State.parse(JSON.parse(readFileSync(STATE_PATH, "utf8")));
}
function saveState(s: State) {
  const valid = State.parse(s); // re-validate the WHOLE doc before writing
  const tmp = STATE_PATH + ".tmp";
  writeFileSync(tmp, JSON.stringify(valid, null, 2) + "\n");
  renameSync(tmp, STATE_PATH); // atomic
}
function manifestRepos(): string[] {
  return readFileSync(MANIFEST_PATH, "utf8")
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0 && !l.startsWith("#"))
    .map((l: string) => l.split(/\s+/)[0]);
}

// cell-id = <rung>-<arm>-<repo>; repo may contain hyphens (e.g. spring-boot).
function parseCell(spine: Spine, id: string) {
  const parts = id.split("-");
  if (parts.length < 3) fail(`malformed cell-id: ${id}`);
  const rung = parts[0];
  const arm = parts[1];
  const repo = parts.slice(2).join("-");
  if (!spine.rungs.includes(rung)) fail(`unknown rung '${rung}' in ${id}`);
  if (!(arm in spine.arms)) fail(`unknown arm '${arm}' in ${id}`);
  return { rung, arm, repo };
}

function coerce(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}
function parseKV(args: string[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const a of args) {
    const i = a.indexOf("=");
    if (i < 0) fail(`expected key=value, got '${a}'`);
    o[a.slice(0, i)] = coerce(a.slice(i + 1));
  }
  return o;
}

// planned order: rung_order, then arm_order, then repo order (manifest sequence)
function orderedCells(spine: Spine, repos: string[]): string[] {
  const repoRank = new Map(manifestRepos().map((r, i) => [r, i]));
  const sorted = [...repos].sort(
    (a, b) => (repoRank.get(a) ?? 1e9) - (repoRank.get(b) ?? 1e9),
  );
  const cells: string[] = [];
  for (const rung of spine.order_policy.rung_order)
    for (const arm of spine.order_policy.arm_order)
      for (const repo of sorted) cells.push(`${rung}-${arm}-${repo}`);
  return cells;
}

function sideReady(spine: Spine, state: State, id: string): boolean {
  const { rung, arm, repo } = parseCell(spine, id);
  const promptOk = existsSync(join(EXP_DIR, "prompts", repo, `${rung}.txt`));
  const idxOk = spine.arms[arm].needs_index
    ? state.setup[`${arm}/${repo}`]?.ready === true
    : true;
  return promptOk && idxOk;
}

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};

function run() {
  switch (cmd) {
    case "validate": {
      loadSpine();
      loadState();
      console.log("ok: spine.json + state.json valid against schema");
      break;
    }

    case "register": {
      const spine = loadSpine();
      const repo = need(rest[0], "usage: register <repo>");
      if (!manifestRepos().includes(repo)) fail(`'${repo}' not in repos.manifest`);
      const st = loadState();
      let added = 0;
      for (const rung of spine.rungs)
        for (const arm of spine.order_policy.arm_order) {
          const id = `${rung}-${arm}-${repo}`;
          if (!st.sides[id]) {
            st.sides[id] = { status: "pending" };
            added++;
          }
        }
      if (!st.registered_repos.includes(repo)) st.registered_repos.push(repo);
      saveState(st);
      console.log(
        `registered ${repo}: +${added} cells (${spine.rungs.length}×${spine.order_policy.arm_order.length}, idempotent)`,
      );
      break;
    }

    case "status": {
      const spine = loadSpine();
      const st = loadState();
      const repoF = flag("--repo");
      const rungF = flag("--rung");
      const ids = Object.keys(st.sides).filter((id) => {
        const c = parseCell(spine, id);
        return (!repoF || c.repo === repoF) && (!rungF || c.rung === rungF);
      });
      const by: Record<string, number> = {};
      for (const id of ids) {
        const s = st.sides[id].status;
        by[s] = (by[s] ?? 0) + 1;
      }
      console.log(
        `cells: ${ids.length}${repoF ? ` repo=${repoF}` : ""}${rungF ? ` rung=${rungF}` : ""}`,
      );
      for (const s of Status.options) if (by[s]) console.log(`  ${s.padEnd(11)} ${by[s]}`);
      const blocked = ids.filter((id) => st.sides[id].status === "blocked");
      if (blocked.length) {
        console.log("blocked:");
        for (const id of blocked)
          console.log(`  ${id} — ${st.sides[id].blocked_reason ?? "?"}`);
      }
      break;
    }

    case "next": {
      const spine = loadSpine();
      const st = loadState();
      const next = orderedCells(spine, st.registered_repos).find(
        (id) => st.sides[id]?.status === "pending" && sideReady(spine, st, id),
      );
      if (next) console.log(next);
      break;
    }

    case "reset": {
      const spine = loadSpine();
      const id = need(rest[0], "usage: reset <cell>");
      parseCell(spine, id);
      const st = loadState();
      if (!st.sides[id]) fail(`cell '${id}' not registered`);
      st.sides[id] = { status: "pending" }; // clear all progress + metrics
      saveState(st);
      console.log(`${id} reset -> pending`);
      break;
    }

    case "block": {
      const spine = loadSpine();
      const id = need(rest[0], "usage: block <cell> <reason...>");
      parseCell(spine, id);
      const reason = rest.slice(1).join(" ") || "blocked";
      const st = loadState();
      if (!st.sides[id]) fail(`cell '${id}' not registered`);
      st.sides[id] = { ...st.sides[id], status: "blocked", blocked_reason: reason, ts: now() };
      saveState(st);
      console.log(`${id} -> blocked: ${reason}`);
      break;
    }

    case "set-status": {
      const spine = loadSpine();
      const id = need(rest[0], "usage: set-status <cell> <status>");
      const status = Status.parse(need(rest[1], "usage: set-status <cell> <status>"));
      parseCell(spine, id);
      const st = loadState();
      if (!st.sides[id]) fail(`cell '${id}' not registered (run register first)`);
      st.sides[id] = { ...st.sides[id], status, ts: now() };
      saveState(st);
      console.log(`${id} -> ${status}`);
      break;
    }

    case "record": {
      const spine = loadSpine();
      const id = need(rest[0], "usage: record <cell> k=v ...");
      parseCell(spine, id);
      const st = loadState();
      if (!st.sides[id]) fail(`cell '${id}' not registered`);
      const patch = parseKV(rest.slice(1));
      st.sides[id] = SideRecord.parse({ ...st.sides[id], ...patch, ts: now() });
      saveState(st);
      console.log(`${id} updated: ${Object.keys(patch).join(", ")}`);
      break;
    }

    case "setup-set": {
      const key = need(rest[0], "usage: setup-set <arm>/<repo> k=v ...");
      if (!key.includes("/")) fail("setup key must be <arm>/<repo>");
      const st = loadState();
      const patch = parseKV(rest.slice(1));
      st.setup[key] = SetupRecord.parse({ ...(st.setup[key] ?? {}), ...patch, ts: now() });
      saveState(st);
      console.log(`setup ${key} updated: ${Object.keys(patch).join(", ")}`);
      break;
    }

    case "judge-set": {
      const key = need(rest[0], "usage: judge-set <rung>-<repo> --json '<json>'");
      const json = need(flag("--json"), "usage: judge-set <rung>-<repo> --json '<json>'");
      const st = loadState();
      st.judge[key] = JudgeRecord.parse({ ...JSON.parse(json), ts: now() });
      saveState(st);
      console.log(`judge ${key} set`);
      break;
    }

    case "reconcile": {
      const spine = loadSpine();
      const st = loadState();
      const expected = new Set(orderedCells(spine, st.registered_repos));
      const have = new Set(Object.keys(st.sides));
      const missing = [...expected].filter((id) => !have.has(id));
      const extra = [...have].filter((id) => !expected.has(id));
      console.log(`expected ${expected.size}, have ${have.size}`);
      if (missing.length) console.log(`missing: ${missing.join(", ")}`);
      if (extra.length) console.log(`extra: ${extra.join(", ")}`);
      if (!missing.length && !extra.length) console.log("in sync");
      break;
    }

    default:
      console.log(
        "usage: statectl <validate|register|status|next|reset|block|set-status|record|setup-set|judge-set|reconcile>",
      );
      process.exit(cmd ? 1 : 0);
  }
}

try {
  run();
} catch (e) {
  if (e instanceof z.ZodError) {
    const issues = e.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ");
    console.error(`statectl: validation failed: ${issues}`);
  } else if (e instanceof CliError) {
    console.error(`statectl: ${e.message}`);
  } else {
    console.error(`statectl: ${e instanceof Error ? e.message : String(e)}`);
  }
  process.exit(1);
}
