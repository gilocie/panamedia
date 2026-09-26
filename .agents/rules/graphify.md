---
trigger: always_on
description: Consult the graphify knowledge graph at graphify-out/ for codebase and architecture questions.
---

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- For codebase or architecture questions, when `graphify-out/graph.json` exists, first run `graphify query "<question>"` (CLI) or `query_graph` (MCP). Use `graphify path "<A>" "<B>"` / `shortest_path` for relationships and `graphify explain "<concept>"` / `get_node` for focused concepts. These return a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw grep output.
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)


# GRAPHIFY ARCHITECTURE & REASONING RULES

## 1. Source of Truth

The project architecture is defined by the Graphify output located in:

* `graphify-out/GRAPH_REPORT.md`
* `graphify-out/graph.json`

These files represent the structural map of the system and must be treated as the primary reference for understanding relationships, modules, and flows.

The full repository is NOT the default source for architectural understanding.

---

## 2. Analysis Behavior Rules

* Do NOT perform full repository scans during normal tasks.
* Do NOT re-derive architecture manually if Graphify output exists.
* Always begin understanding from Graphify reports first.
* Only open specific files when a targeted clarification or modification is required.

---

## 3. Incremental Understanding Principle

All work must follow incremental reasoning:

1. Read Graphify community structure first
2. Identify the relevant community or module
3. Inspect only the minimum required files
4. Make or explain changes locally

No global re-analysis unless explicitly required for full system redesign.

---

## 4. Community Stability Improvement Rule

When working with Graphify communities:

* Do not treat weak communities as errors to immediately refactor
* Instead:

  * Identify overlapping responsibilities
  * Group related logic gradually over time
  * Improve cohesion incrementally
* Avoid large-scale refactors that break working flows

Goal: stable evolution, not reconstruction

---

## 5. Anti-Redundancy Rule

* Avoid reprocessing the same modules in multiple analysis cycles
* Cache understanding mentally from Graphify output during the session
* Do not re-traverse unchanged areas of the project

---

## 6. System Evolution Principle

The system should evolve in a controlled manner:

* small modular improvements preferred
* avoid monolithic rewrites
* preserve working flows even if structure is imperfect
* prioritize stability over theoretical perfection

---

## 7. Safe Refactor Rule

Refactoring is allowed only when:

* it improves separation of concerns
* it reduces coupling between unrelated components
* it does NOT require full system re-evaluation

---

## 8. Final Objective

Maintain a system where:

* Graphify defines structure
* Code changes are incremental
* Analysis is localized
* Communities become gradually more cohesive over time
* No repeated full-project scanning is required for understanding

