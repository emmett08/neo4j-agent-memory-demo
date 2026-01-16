# Agent Memory Storage Instructions

## Purpose
Enable agents to learn from trial-and-error experiences and avoid repeating failed approaches.

## When to Store a Memory

**Trigger Condition**: After trying 2+ different approaches for the same goal where earlier attempts failed, and one finally succeeds.

## What to Store

Create a memory entry with these components:

### 1. Context Pattern (for retrieval matching)

```
Environment: [OS, shell type, tool/command being used]
Goal: [What you were trying to accomplish]
Failure Indicators: [Specific error patterns, symptoms, or behaviors observed]
```

### 2. Failed Approaches (Procedural - what NOT to do)

```
Attempted Method 1: [Brief description]
  - Why it failed: [Specific error or symptom]
  - Don't use when: [Conditions that make this fail]

Attempted Method 2: [Brief description]
  - Why it failed: [Specific error or symptom]
  - Don't use when: [Conditions that make this fail]
```

### 3. Successful Approach (Procedural - what TO do)

```
Working Method: [Step-by-step procedure]
  - Why it works: [Root cause it addresses]
  - Use when: [Conditions that make this the right choice]
  - Confidence: [High/Medium/Low based on how reliably it worked]
```

### 4. Decision Rule (Semantic - the "fact" to remember)

```
RULE: When [context pattern], use [successful approach] instead of [failed approaches]
REASON: [One-sentence explanation of why]
```

## Example: Posting Multi-line Markdown to GitHub PR

```yaml
memory_type: procedural_with_semantic_rule
context:
  environment: "macOS, zsh shell, gh CLI"
  goal: "Post multi-line markdown comment to GitHub PR"
  failure_indicators:
    - "Terminal hangs with heredoc syntax"
    - "Formatting corruption with inline multi-line strings"
    - "dquote> prompts appearing"

failed_approaches:
  - method: "gh pr comment --body with inline multi-line string"
    failure: "Terminal hangs, formatting issues"
    dont_use_when: "Content contains special characters or is multi-line"

  - method: "heredoc (<<) syntax for multi-line content"
    failure: "Terminal formatting corruption, hangs"
    dont_use_when: "In this zsh environment with gh CLI"

successful_approach:
  method: "printf to temp file + gh pr comment --body-file"
  steps:
    1. "Use printf '%s\\n' with explicit line breaks to write to /tmp/file.md"
    2. "Use gh pr comment --body-file /tmp/file.md"
  why_it_works: "Avoids shell interpretation of special characters and heredoc issues"
  use_when: "Posting multi-line markdown in this environment"
  confidence: "high"

decision_rule:
  rule: "When posting multi-line markdown to GitHub PR in zsh, ALWAYS use printf-to-file + --body-file approach"
  reason: "This environment has heredoc and inline multi-line string issues with gh CLI"

episodic_anchor:
  when: "2026-01-16 during PR #8750 comment posting"
  what_happened: "Tried 3 different approaches before printf worked"
  lesson: "Don't waste time on heredoc in this environment"
```

## Retrieval Instructions

**Before attempting an action**, query memory with:
1. Current environment context
2. Goal you're trying to accomplish
3. Any similar patterns from current session

**If match found**:
- Skip failed approaches entirely
- Execute successful approach directly
- Only try alternatives if successful approach fails

**If no match found**:
- Proceed with best judgment
- **After 2+ failures**, create new memory entry following above template

## Memory Consolidation Rule

If you encounter the same pattern 3+ times:
- Upgrade from "procedural memory" to "semantic fact"
- Store as: "In environment X, for goal Y, ALWAYS use method Z"
- This becomes a hard rule, not just a preference

## Key Principles

1. **Be Specific**: "zsh shell with gh CLI" not just "posting comments"
2. **Include Failure Signatures**: So you can recognize the pattern early
3. **Store the "Why"**: Understanding prevents overgeneralization
4. **Version the Context**: Environment details matter (OS, tool versions)
5. **Confidence Levels**: Distinguish between "worked once" vs "always works"

## Benefits

- **Efficiency**: Avoid repeating failed approaches
- **Learning**: Build up knowledge base of environment-specific quirks
- **Reliability**: Higher success rate on first attempt
- **Context Awareness**: Understand when rules apply vs don't apply

## Memory Types Explained

### Episodic Memory
- **What**: Remembering specific past experiences
- **Example**: "On 2026-01-16, heredoc failed when posting PR comment"
- **Use**: Recognize similar situations and recall what worked/failed

### Procedural Memory
- **What**: Knowing how to do something automatically
- **Example**: "To post multi-line markdown: Step 1: printf to file, Step 2: use --body-file"
- **Use**: Execute learned procedures without conscious reasoning

### Semantic Memory
- **What**: General knowledge and facts
- **Example**: "This zsh environment has heredoc issues with gh CLI"
- **Use**: Know which approach to use without needing to remember specific episodes

## Implementation Notes

- Store memories in structured format (YAML, JSON) for easy retrieval
- Index by: environment, tool, goal, error patterns
- Include confidence scores to prioritize reliable patterns
- Periodically review and consolidate related memories
- Allow for memory updates when new information contradicts old patterns
