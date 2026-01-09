# Nexus AI Agent Guide

This repository uses a `.spec` folder to maintain distinct "Context Layers" for AI Agents.

## 📂 The `.spec` Directory Structure

The `.spec` folder is the **Single Source of Truth** for project requirements, design, and progress. Always consult these files before making changes.

- `tasks.md`: **Project Roadmap & Status**.
  - Check this file to see what to work on next (look for the first unchecked `[ ]` item).
  - Mark tasks as `[x]` ONLY after verification standards are met.
- `design.md`: **System Architecture & Technical Specifications**.
  - Contains database schemas, API contracts, and architectural decisions.
  - If you propose a major architectural change, update this file first.
- `tech-stack-notes.md`: **Technology Constraints & Best Practices**.

  - Contains confirmed libraries (e.g., "Use uv," "LangChain v1.0").
  - **Do not** introduce new libraries without checking this file or asking the user.

- `requirements.md`: **Product Requirements**.
  - High-level user stories and feature definitions.

## 🤖 Interaction Protocol

1. **Read-First**: Before writing code, read `.spec/tasks.md` to identify the active task.
2. **Context-Aware**: Use `uv` for dependency management as specified in `tech-stack-notes.md`.
3. **Update-Last**: After completing a task:
   - Run verification tests.
   - Update `tasks.md` to reflect progress.
   - If architectural details changed, update `design.md`.

## 🕵️ Deep Interview Protocol

**Trigger Mechanism**: Must be enabled when dealing with medium-to-large requirements, complex bugs, architectural refactoring, or explicit user instructions (e.g., "Start interview").

_Note: Not enabled by default for simple text changes or obvious minor bugs._

### 1. The Interviewer Persona

In this mode, pause coding and switch to **Deep Exploration Mode**:

- **Deep Questioning**: Reject obvious questions. Dig into "Why" and "What implies if not doing so".
- **Full-dimension Coverage**:
  - **Technical**: Architectural sanity, performance bottlenecks, dependency risks, maintainability.
  - **Product**: UI/UX details, user expectations, workflows, error handling.
  - **Trade-offs**: Clearly state "Plan A is fast but risks consistency, Plan B is robust but costly," and ask for a decision.
- **Challenge Assumptions**: "If data volume scales 100x, will this design fail?", "Is this over-engineered?"

### 2. Output Standards

After the interview, conclusions **MUST** be solidified into the `.spec` documents. Do not leave them just in chat history. This defines the "Interview Complete" state:

1. **Folder Structure**: Create a new folder `.spec/[demand_name]/` for the specific demand.
2. **Requirements**: Create `.spec/[demand_name]/requirements.md` with clear User Stories and Acceptance Criteria.
3. **Design**: Create `.spec/[demand_name]/design.md` with architectural decisions, API definitions, and core flows.
4. **Tasks**: Create `.spec/[demand_name]/tasks.md`, breaking down the solution into a Checklist.
