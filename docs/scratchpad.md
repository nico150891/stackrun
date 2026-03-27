# Scratchpad

Session notes and discoveries go here.

---

## 2026-03-27 — Project Bootstrap

- Initialized project with Node 20 + TypeScript 5 + ESM
- Registry MVP: 3 tools (stripe, github, notion) as JSON files
- Using `type: "module"` in package.json for ESM support
- chalk v5 and ora v9 are ESM-only, so ESM is required
