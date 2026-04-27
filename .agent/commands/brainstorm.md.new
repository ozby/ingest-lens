---
description: 'Turn ideas into designs through collaborative dialogue. Use before any creative work.'
argument-hint: [topic]
allowed-tools: Read, Glob, Grep, Write, Edit
---

# Brainstorm Command

Turn ideas into fully formed designs and specs through natural collaborative dialogue.

**Arguments**: $ARGUMENTS

---

## When to Use

- Before creating new features
- Before building components
- Before adding functionality
- Before modifying behavior
- When exploring design options

---

## The Process

### Phase 1: Understanding the Idea

1. **Check project context first**
   - Read relevant files, docs, recent commits
   - Understand existing patterns

2. **Ask questions one at a time**
   - Prefer multiple choice when possible
   - Only one question per message
   - Focus on: purpose, constraints, success criteria

### Phase 2: Exploring Approaches

1. **Propose 2-3 different approaches** with trade-offs
2. **Lead with your recommendation** and explain why
3. **Present options conversationally**

### Phase 3: Presenting the Design

1. **Break design into sections** (200-300 words each)
2. **Ask after each section** if it looks right
3. **Cover:** architecture, components, data flow, error handling, testing
4. **Be flexible** - go back and clarify if needed

---

## Output

After design is validated:

1. **Write to:** `docs/system/design/YYYY-MM-DD-<topic>-design.md`
2. **Commit** the design document

---

## Next Steps

After brainstorming, offer:

1. **Create implementation plan**: `ak blueprint new "<goal>" --complexity <XS|S|M|L|XL>`
2. **Execute plan**: `/pll` (Blueprint-aware adapter over ultrawork/subagents)
3. **Verify completion**: `/verify <target>`

---

## Key Principles

| Principle                     | Description                 |
| ----------------------------- | --------------------------- |
| **One question at a time**    | Don't overwhelm             |
| **Multiple choice preferred** | Easier to answer            |
| **YAGNI ruthlessly**          | Remove unnecessary features |
| **Explore alternatives**      | Always 2-3 approaches       |
| **Incremental validation**    | Present in sections         |
| **Be flexible**               | Clarify when confused       |

---

## Example Session

```
User: /brainstorm user notification system

Claude: Let me understand the current state first...
[Reads relevant files]

I see you have an existing email service. Let me ask about the notification system:

What types of notifications do you need?
1. Email only
2. Email + in-app
3. Email + in-app + push
4. Custom combination

User: 2

Claude: For in-app notifications, what's the expected volume?
1. Low (< 100/day per user)
2. Medium (100-1000/day per user)
3. High (> 1000/day per user)

...continues with focused questions...
```

---

## Workflow Reference

This command implements the brainstorming workflow for collaborative design exploration.
