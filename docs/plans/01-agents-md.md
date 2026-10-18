# 01 - Write AGENTS.md and lessons

**Goal:** the next agent (or person) can work on this plugin without repeating earlier mistakes.

## Steps
- [x] Write `AGENTS.md` (short, practical): what the plugin is, layout, how to test, DSH facts, XERJ facts, rules.
- [x] Write `docs/LESSONS.md`: every mistake made while building this, with cause, symptom and the check that would have caught it.
- [x] Link `docs/LESSONS.md` and `docs/plans/` from `AGENTS.md`.
- [x] Only record facts that were verified on this machine. Mark anything unverified.

## Source of the content
Findings from the troubleshooting session: the plugin never loaded in dsh because of three separate startup crashes, the client hid it with fake fallbacks, and indexing hung because the disk was 95% full.

## Done when
- `AGENTS.md` exists at the repo root and is under ~150 lines.
- `docs/LESSONS.md` lists each mistake with a prevention check.
- Every command quoted in them was run at least once.
