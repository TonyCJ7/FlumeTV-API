# FlumeTV cleanup subagents

Three focused subagents for cross-repo hygiene (API + UI). Both repos are in the **FlumeTV** Gortex workspace.

Principles: **YAGNI → DRY → SOLID** (`design-principles.mdc`). Fix order: **placement → dead code → layer/naming → types → style**.

| Subagent | Role | readonly |
| --- | --- | --- |
| `flumetv-cleanup-auditor` | Placement, dead code, layer, types, DS/style findings | yes |
| `flumetv-cleanup-fixer` | One folder + one phase per run | no |
| `flumetv-cleanup-verifier` | Skeptical checklist + typecheck/lint | yes |

## Usage

```
/flumetv-cleanup-auditor audit FlumeTV-UI utils/ and constants/ — placement + dead code

# parallel audits
/flumetv-cleanup-auditor audit FlumeTV-API src/utils
/flumetv-cleanup-auditor audit FlumeTV-UI utils/

# one phase at a time
/flumetv-cleanup-fixer phase placement — move types out of FlumeTV-UI utils/prefetchUiBand.utils.ts
/flumetv-cleanup-fixer phase dead-code — FlumeTV-API src/utils per audit DELETE rows

/flumetv-cleanup-verifier confirm placement pass on FlumeTV-UI
```

Canonical copies: `~/.cursor/agents/`.
