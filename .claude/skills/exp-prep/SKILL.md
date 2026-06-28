---
name: exp-prep
description: Create navigation-3way experiment resources for ONE repo — clone pinned source, generate the 5 leveled tool-neutral prompts + reference answer keys + rationale (offline prompt genesis), verify cites, and register the repo's 15 cells in the validated state ledger. Use when onboarding a repo into the experiment. Argument is a single repo name from repos.manifest.
---

# /exp-prep — onboard one repo into the experiment

Offline **prompt genesis** for one repo, walled off from the experiment runtime.
End state: `experiment/prompts/<repo>/{L1..5.txt, L*.reference.md, RATIONALE.md}`
exist and verified, and the repo's 15 cells are registered as `pending`.

`$ARGUMENTS` = one repo name (e.g. `tokio`). Run for exactly one repo; do not fan
out to others unless told.

## Steps (do in order; stop and report on any failure)

1. **Validate repo.** Confirm `<repo>` is a name in `repos.manifest`. If not, stop
   and list valid names. Read its `lang` and `sha` columns.

2. **Skip if already prepped.** If `experiment/prompts/<repo>/` already has all of
   `L1.txt … L5.txt`, `L1.reference.md … L5.reference.md`, `RATIONALE.md`, then
   skip generation — go to step 6 (register) and report "already prepped".

3. **Ensure pinned source.** Run `experiment/clone-source.sh --repo <repo>`. It is
   idempotent and SHA-verifies. Confirm `experiment/repos/<repo>` exists at the
   pinned SHA (`git -C experiment/repos/<repo> rev-parse HEAD` == manifest sha).

4. **Generate (subagent).** Spawn ONE general-purpose subagent with the brief in
   `docs/GENERATOR_BRIEF.md`, substituting:
   - `{{REPO}}`=<repo>, `{{LANG}}`=<lang>, `{{SHA}}`=<sha>
   - `{{REPO_PATH}}`=`<abs>/experiment/repos/<repo>`
   - `{{OUT_DIR}}`=`<abs>/experiment/prompts/<repo>`
   - `{{ANCHOR_DIR}}`=`<abs>/experiment/prompts/redis` (the approved calibration anchor)
   Use absolute paths. The subagent explores with standard tools only (NOT
   grove/LSP) and writes the 5 prompts + 5 reference keys + RATIONALE.

5. **Cite-verification gate (you, independently).** Do NOT trust the subagent's
   self-report. Sample at least one cited `file:line` per level from the reference
   keys and confirm it matches `experiment/repos/<repo>` exactly (open the line).
   Also check each `L{n}.txt` is a single tool-neutral sub-question (no "list
   callers"/"grep"/"go to definition" phrasing, no level label). If a cite is
   wrong or a prompt is tool-shaped, send the subagent back to fix it; do not
   proceed until clean.

6. **Register (validated state only).** Run
   `experiment/statectl/statectl register <repo>`. This is the ONLY way the repo's
   cells enter the ledger — never hand-edit `state.json`. It is idempotent and
   no-clobber (won't reset cells already in progress).

7. **Report.** Print the 5 prompts (one line each), the per-level required-spine
   counts, any calibration concerns, and `statectl status --repo <repo>`.

## Guardrails
- Genesis is offline: nothing here is ever shown to a running arm.
- The validated CLI (`experiment/statectl/statectl`) is the only writer of
  `state.json`. Never Edit/Write/jq that file.
- The prompt files (`L{n}.txt`) are the only artifacts the runtime consumes; keep
  them free of meta-commentary, level labels, and tool hints.
