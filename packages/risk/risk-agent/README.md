---
description: Enterprise risk-monitoring agent plugin skeleton exposing the read-only get_monitor_health tool.
kind: package-reference
---

# @deepseek-ai/dsh-risk-agent

English | [中文](README.zh.md)

## Summary

@deepseek-ai/dsh-risk-agent is the enterprise risk-monitoring agent plugin: loading it registers the read-only, idempotent `get_monitor_health` tool, and unloading deregisters the tool with its registrations.

## Table of Contents

- Use this package
- Understand the implementation
- Dev Note

## Use this package

Add the plugin to a deployment `cordis.yml`:

```yaml
- name: '@deepseek-ai/dsh-risk-agent'
  config:
    concurrencyBudget:
      queueBacklog: 100 # TBD-002: replace once the load-test baseline lands
```

The plugin declares `inject: ['tools']` and validates `Config` against the DOC-14 top-level schema before registering anything; unknown fields, out-of-range values, missing references, and a disabled config audit fail loud with a field path. `concurrencyBudget.queueBacklog` has no default (TBD-002) and must be supplied by the deployment.

## Understand the implementation

- `src/plugin/index.ts` is the only Cordis-facing assembly point and the only module importing `@deepseek-ai/cordis`.
- `src/application/config/` owns schema validation, cross-field invariants, immutable versioned snapshots, last-known-good rollback, and config audit.
- `src/application/security/` establishes the tenant context from a trusted identity only; a claimed `tenantId` is compared, never trusted.
- `src/domain/tenant/` defines the immutable `TenantContext`.
- `src/tools/get-monitor-health.ts` owns the tool definition, the single-source `MONITOR_HEALTH_VALUES` enum, and the zero-coverage snapshot builder.
- With no components or data sources configured, the tool reports `UNKNOWN` with zero coverage counts and an empty `dataSources` list; an unconfigured deployment never reads as healthy.
- `tests/layering.spec.ts` mechanically enforces the layering red lines: dependency direction `plugin → application → domain`, a pure `domain/`, and tool handlers that never touch repositories.

## Dev Note

Unreleased: not yet part of any shipped profile. Package rules live in [AGENTS.md](AGENTS.md).

## Model Experience

### get_monitor_health tool

#### What the model sees

The read-only `get_monitor_health` tool with optional `components`, `dataSources`, and `tenantId` filters; a `tenantId` that does not match the trusted identity fails the call; results carry `health`, `plugin` uptime, `dataSources`, and four `coverage` counts.

#### Token effect

Fixed tool definition; each call appends one compact health snapshot.

#### KV Cache effect

Append-only: the tool definition is stable across turns and each result appends like any tool result.

## Known Limitations and Deferred Work

- Collectors, repositories, thresholds, and metrics are not implemented yet; `tenantId` is already checked against the trusted identity, and a mismatch fails with `AuthorizationError`.
- Cross-file references from metrics, rules, and channels are deferred to issues 06 and 07.
- `concurrencyBudget.queueBacklog` (TBD-002) and `observability.metricReportTarget` (TBD-001) keep their documented pending-default markers.
