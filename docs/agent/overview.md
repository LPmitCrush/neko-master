# Agent Mode Overview

## What Agent mode solves

Agent mode allows a centralized Neko Master panel to receive data from remote LAN gateways without direct collector-to-gateway access.

- Panel service runs in one central location (cloud VPS, NAS, server)
- Agent runs close to each gateway (OpenWrt, Linux host, router companion box)
- Agent pulls local gateway data and reports to panel over HTTP API

This is ideal for multi-site homes/labs and distributed deployments.

## Data flow

1. Neko Master backend creates an `agent://<agent-id>` backend with system-managed token
2. Agent polls Clash/Surge gateway API locally
3. Agent submits batch deltas to `/api/agent/report`
4. Agent sends periodic heartbeat to `/api/agent/heartbeat`
5. Dashboard reads unified backend statistics and realtime cache

## Direct vs Agent

- `Direct`
  - collector connects gateway directly
  - lowest latency for local setup
  - requires network reachability from collector to gateway
- `Agent`
  - collector does not pull remote gateway directly
  - one extra hop (agent report), better network isolation
  - easier for cross-LAN / NAT / private subnet deployments

## Security model

- Agent backend token is system-generated and treated as a credential
- Token rotation invalidates old running agents
- One backend token is bound to one `agentId` (multi-agent token reuse is rejected)
