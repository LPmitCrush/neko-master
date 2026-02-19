# Agent Troubleshooting

## `exec format error`

Cause: binary architecture mismatch.

Check:

```sh
file ./neko-agent
uname -m
```

Fix: use matching release package for current target.

## Agent always offline

Checklist:

- `--server-url` points to panel host (not remote machine localhost)
- backend token is current (not rotated/expired)
- backend is in Agent mode
- heartbeat endpoint reachable from agent host

## `Invalid agent token`

- token mismatch between agent process and backend config
- rotate token in UI and restart agent with new token

## `AGENT_TOKEN_ALREADY_BOUND`

Cause: same backend token used by another `agentId`.

Fix:

- do not share one backend token across multiple agent instances
- create separate backend per agent, or rotate token and rebind intentionally

## `426` compatibility errors

Possible codes:

- `AGENT_PROTOCOL_TOO_OLD`
- `AGENT_VERSION_REQUIRED`
- `AGENT_VERSION_TOO_OLD`

Fix:

- upgrade agent to a newer release package
- check collector env requirements:
  - `MIN_AGENT_PROTOCOL_VERSION`
  - `MIN_AGENT_VERSION`

## Surge decode errors

Recent agent parser supports mixed field formats (`id` number/string, numeric strings).
If still failing, collect error logs and open an issue with response sample.
