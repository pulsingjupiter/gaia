# Security Policy

## Reporting a vulnerability

If you discover a security issue in Gaia, please report it privately by
opening a GitHub security advisory:

<https://github.com/adrianlee2026-glitch/gaia/security/advisories/new>

Please do not file public issues for security problems.

## Scope

Gaia is designed for **local-only personal use** on a single macOS
machine. It currently ships with **no authentication** and assumes the
loopback interface is trusted.

- Do not expose port 7878 (or any Gaia port) to the public internet.
- Do not run Gaia behind a public tunnel (ngrok, Cloudflare Tunnel,
  tailscale funnel, etc.) without adding your own authentication layer
  in front.
- Do not run Gaia on a shared multi-user machine where untrusted users
  have shell access.

## Known security posture

- No built-in authentication on the HTTP server.
- No CSRF tokens on mutating endpoints.
- SQLite database stored as a plain file (no encryption at rest).
- The agent runner spawns Claude Code subprocesses with the same
  permissions as the user running Gaia, including access to the
  filesystem and any shell tools the user has installed.
- Settings, secrets, and chat history live in `app/data/gaia.db` as
  plaintext.

## Out of scope

- Vulnerabilities in the upstream Claude Code CLI (report those to
  Anthropic).
- macOS-specific issues caused by `osascript` driving Terminal.app or
  iTerm2 — these are inherent to the integration.
- Third-party npm dependencies — please report directly upstream.

## Response expectations

This is a solo, MIT-licensed side project. Best effort only. No SLA,
no bug bounty, no guaranteed response window. I will acknowledge
serious reports and patch what I can.
