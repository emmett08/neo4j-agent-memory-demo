# Summary

<!-- What changed and why (2–6 bullet points). Keep it concrete. -->

- 
- 

## Context / Ticket

- Links: <!-- issue/ticket/incident -->
- Scope: <!-- what is intentionally NOT included -->

---

# Findings (pre-change analysis)

<!-- What you inspected: entry points, call graph, data flow, affected modules, patterns, coupled debt. -->

- Entry points:
- Key modules/files:
- Existing patterns/conventions:
- Coupled technical debt found:

---

# Alternatives considered

## A) Minimal approach (Level 0–1)
- Summary:
- Pros:
- Cons:
- Risk:
- Debt impact:

## B) Cleaner / longer-term approach (Level 1–2)
- Summary:
- Pros:
- Cons:
- Risk:
- Debt impact:

## Recommended approach
- Choice:
- Rationale:

---

# Refactor level

- [ ] Level 0 (Patch Only)
- [ ] Level 1 (Local Refactor)
- [ ] Level 2 (Slice Refactor)
- [ ] Level 3 (Systemic Refactor)

Justification:

---

# Debt budget

**Paid down**
- [ ] Reduced duplication
- [ ] Reduced complexity / clearer responsibilities
- [ ] Improved cohesion / boundaries
- [ ] Smaller modules / avoided god files
- [ ] Improved error handling / correctness
- [ ] Improved test coverage / determinism
- [ ] Improved naming / readability
- [ ] Other: <!-- describe -->

**Introduced**
- [ ] Additional indirection / abstraction
- [ ] New modules/files
- [ ] New configuration surface
- [ ] Temporary shim / compatibility layer
- [ ] Other: <!-- describe -->

**Net (must be positive):**
- Net positive explanation:

---

# Debt Paydown Score (Mandatory)

- [ ] Score computed using the required formula in `AGENTS.md`
- [ ] Metrics gathered from tools/commands where available (unavailable metrics set to 0 and marked)
- [ ] Score is consistent with the Debt Budget (net debt reduction)

## Score
- **DebtPaydownScore_PR (0–100):** 

## Inputs used (paste actual values)
Quality deltas:
- ΔC (complexity): 
- ΔD (duplication): 
- ΔT (tests): 
- ΔS (size/modularity): 
- ΔB (build/quality issues fixed): 

Risk/cost:
- P (risk: Low=0.2 / Med=0.5 / High=0.8): 
- N_deps (new external deps): 
- A (API change: 0 / 0.5 / 1): 
- Churn (LOC added+deleted): 

## Derived values
- ΔQ = 1.5·ΔC + 1.2·ΔD + 2.0·ΔT + 1.0·ΔS + 0.8·ΔB =
- ΔR = 1.5·P + 1.2·N_deps + 1.5·A + tanh(Churn/400) =
- Score = round(100 * σ(ΔQ − ΔR)) where σ(x)=1/(1+e^(−x)) =

## Notes
- What drove the score most:
- Unavailable metrics (if any) and why:

---

# Design & maintainability checklist

- [ ] No “god file” introduced; changes are split into cohesive smaller modules where appropriate
- [ ] SOLID/DRY applied judiciously (no pattern-for-pattern’s-sake)
- [ ] Refactor payoff applied to other beneficiary call sites (within chosen refactor level)
- [ ] No magic strings / hard-coded numbers that should be configurable
- [ ] Configuration/constants are typed and documented (where applicable)
- [ ] Public surface area kept small (exports limited; APIs minimal)

### New abstractions
- [ ] No new abstractions introduced
- [ ] Any new abstraction has **≥ 2 real uses** in production code
- [ ] Exception used (testability / boundary / security-correctness) and justified below

Details (if applicable):
- Abstraction(s):
- Use site #1:
- Use site #2:
- Exception justification (if any):

---

# Tests

### Added/updated
- [ ] Unit tests
- [ ] Integration tests
- [ ] Smoke test / minimal E2E verification

### Commands run (paste actual commands + brief results)
- Unit:
  - ``
- Integration:
  - ``
- Smoke:
  - ``

### Before/after evidence
- [ ] Tests would fail before the change (or a regression test demonstrates the bug)
- [ ] All tests pass after the change

---

# Verification (how reviewers can validate)

1. 
2. 
3. 

Expected result:

---

# Risk & rollout

- Risk level: Low / Medium / High
- Rollout plan (if applicable):
- Backwards compatibility: Yes / No (if No, provide migration steps)
- Monitoring/alerts/logging changes (if applicable):

---

# Reviewer notes

<!-- Call out tricky bits, trade-offs, or non-obvious decisions. -->
