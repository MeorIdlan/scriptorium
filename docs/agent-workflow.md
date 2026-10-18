# Agent workflow

How the orchestrator session runs Gate 5 (Implementation) and the
pre-finalize review with subagents. These rules sit on top of the superpowers
skills `subagent-driven-development` (SDD) and `executing-plans`. Where they
disagree with a skill, this file wins.

## Roles

| Role | Who | Model / effort | Defined in |
|---|---|---|---|
| Orchestrator | the main session | Opus 5.5, medium | your session settings (`/model`, `/effort`) |
| Implementer | `implementer` agent | Haiku 5.5, high | `.claude/agents/implementer.md` |
| Reviewer | `reviewer` agent | Sonnet 5.5, high | `.claude/agents/reviewer.md` |

The orchestrator plans, dispatches, keeps the ledger, makes the decisions
the plan leaves open and updates the card. It never writes feature code in
subagent mode, and it never fixes review findings itself.

## Dispatching

- Dispatch with `subagent_type: "implementer"` or `subagent_type: "reviewer"`.
  **Leave `model` out.** Passing `model` overrides the agent file. This
  replaces SDD's "Model Selection" section and its "always specify the model"
  rule.
- The only allowed `model` overrides:
  - **Fix rounds 4–5:** a fresh `implementer` with `model: "sonnet"`.
  - **Final whole-branch review:** `reviewer` with `model: "opus"`.
- Use SDD's templates (`implementer-prompt.md`, `task-reviewer-prompt.md`,
  `re-review-prompt.md`, and `requesting-code-review`'s `code-reviewer.md` for
  the final review) as the **prompt body**. Ignore their `Subagent
  (general-purpose)` and `model:` header lines.
- Every implementer dispatch also carries:
  - the card URL, so commits end with `Trello: <card url>`
  - the `Co-Authored-By:` line from your own commit-attribution instructions
- Keep SDD's other dispatch rules: brief and report as files, never the whole
  plan, no history pasted in, one implementer at a time, batch small edits
  that are all the same kind.

## Subagent mode (SDD)

Follow `subagent-driven-development` as written for:
- the per-plan workspace and ledger
- the plan check before Task 1
- `task-brief` and `review-package`
- the review after each task, and the fix loop (rounds 1–3 resume the same
  implementer; rounds 4–5 hand the task to a fresh one on Sonnet, see above)
- the cap after round 5 and recorded decisions
- the final review with one fix pass
- the "Rulings I made" list at the end

Playbook additions SDD doesn't know about. None of them pauses the run.
- After a task's line in the ledger says `complete`, tick its `Implementation`
  item on the card, and tick any subtask whose linked items are all ticked.
- Run `/task-sync` (or post a progress comment) every 2–3 completed tasks:
  `Tasks 3/8, subtasks 2/4 done; next: …`.
- A decision that changes scope (adds or drops a subtask or acceptance
  criterion) is not one the orchestrator can make. Stop and ask the dev, as
  the playbook says. Decisions on plan details within scope go in the ledger
  as SDD says.
- Record gotchas in the vault notes as they turn up.

## Inline mode (executing-plans)

For bounded work, short plans or tightly coupled tasks the orchestrator
writes the code itself, following `executing-plans` and TDD. Review still
goes to the agents:
- After each task, or each group of tightly coupled tasks, dispatch `reviewer`
  with a `review-package` diff and the task text.
- The orchestrator fixes findings inline, then dispatches a scoped re-review.
- The final whole-branch review is the same as in subagent mode
  (`reviewer`, `model: "opus"`).

## Pre-finalize

The SDD/inline final whole-branch review counts as pre-finalize step 2
(`requesting-code-review`). Don't run a second one. Steps 1 (full test
suite, real output) and 3 (walk the acceptance criteria) still apply. Point
the final reviewer at the ledger's deferred-minor and parked lines.
