# demo-ui (React 19 + TypeScript 5+)

A minimal, best-practice prompt runner UI:

- Explicit primary CTA (Run agent) — avoids the auto-run anti-pattern.
- Chip inputs for tags/symptoms with keyboard affordances (Enter/Backspace).
- Environment fingerprint controls (OS, package manager, container).
- Streaming NDJSON event log focused on tool activity.
- Predictable state transitions via reducer.

## Run

Start the demo API first (port 8080), then:

```bash
npm -w apps/demo-ui run dev
```

Open http://localhost:5173
