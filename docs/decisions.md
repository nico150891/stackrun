# Architecture Decision Records

## ADR-001: ESM over CommonJS

**Date:** 2026-03-27
**Status:** Accepted

**Context:** chalk v5+ and ora v9+ are ESM-only packages. We need to decide the module system for the project.

**Decision:** Use ESM (`"type": "module"` in package.json, `"module": "ESNext"` in tsconfig).

**Consequences:**
- All imports must use ESM syntax
- `ts-node` needs `--esm` flag
- Compatible with modern Node.js ecosystem
- `__dirname` / `__filename` not available — use `import.meta.url` instead

---

## ADR-002: GitHub raw files as registry MVP

**Date:** 2026-03-27
**Status:** Accepted

**Context:** We need a registry to host tool manifests. Options: npm, custom API, GitHub raw, S3.

**Decision:** Use GitHub raw content URLs pointing to `registry/*.json` in this repo. An `index.json` lists all available tools.

**Consequences:**
- Zero infrastructure cost
- Easy to add tools via PR
- Limited: no search API, no versioning beyond git
- Will migrate to a proper API in V1

---

## ADR-003: Plaintext token storage for MVP

**Date:** 2026-03-27
**Status:** Accepted

**Context:** We need to store API tokens locally. Options: keychain, encrypted file, plaintext.

**Decision:** Store tokens in `~/.stackrun/tokens.json` as plaintext for MVP.

**Consequences:**
- Simple implementation
- Not secure for production — will add encryption in V1
- File permissions should be set to 600

---

## ADR-004: Claude rules and skills

**Date:** 2026-03-27
**Status:** Accepted

**Context:** To keep agent workflows consistent, we create reusable rules and skills under `.claude/`.

**Decision:**
- Claude rules and skills are maintained locally (not tracked in git)
- Rules cover: error handling conventions, manifest validation
- Skills cover: adding new SaaS tools to the registry

**Consequences:**
- Consistent agent behavior across sessions
- Documented workflows for common tasks
- Internal tooling stays separate from the public repo
