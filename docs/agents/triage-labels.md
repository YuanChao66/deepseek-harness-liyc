# Triage labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the label strings used in this repo's issue tracker.

| Role in mattpocock/skills | Label in our tracker | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Maintainer needs to evaluate this issue |
| `needs-info` | `needs-info` | Waiting on reporter for more information |
| `ready-for-agent` | `ready-for-agent` | Fully specified, ready for an AFK agent |
| `ready-for-human` | `ready-for-human` | Requires human implementation |
| `wontfix` | `wontfix` | Will not be actioned |

Category roles are `bug` and `enhancement`.

This repo's tracker is local markdown, so a state role is recorded as the `Status:` line in the issue file and a category as a `Category:` line, not as a tracker label. When a skill mentions a role, write the corresponding string into `Status:`.