# Decision log

Append-only. One row per decision. Newest at the bottom. A later decision that reverses an earlier one names the row it replaces.

Agents add a row in the same PR that acts on the decision. A decision without a row here does not exist.

| ID | Date | Decision | Decided by | Replaces |
|---|---|---|---|---|
| D001 | 2026-10-30 | Product name is Kvasir | Sagar | |
| D002 | 2026-10-30 | Kvasir is a personal tool first; team features are small-circle sharing | Sagar | |
| D003 | 2026-10-30 | Licence stays AGPL-3.0-only | Sagar | |
| D004 | 2026-10-30 | Separate repository with fresh history; no upstream tracking; fixes ported by hand | Sagar | |
| D005 | 2026-10-30 | Platform is desktop (Electron) plus a mobile companion | Sagar | |
| D006 | 2026-10-30 | Priority areas: voice and mobile, retention, regulation grounding, team and evidence | Sagar | |
| D007 | 2026-10-30 | Proposed, confirm at P1 start: the graph stays objective; learner state lives in a separate learner store | Claude (proposal) | |
