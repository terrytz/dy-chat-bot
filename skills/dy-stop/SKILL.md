---
name: dy-stop
description: Stop the Douyin Chat bot started with /dy-start
---

# Stop Douyin Chat Listener

Stop the `/dy-start` polling loop — works for both multi-agent and single-agent modes.

## Usage

`/dy-stop`

## Behavior

Remove all lock files that keep the listeners alive:

```bash
rm -f /tmp/dy-listen.lock /tmp/dy-listen-*.lock /tmp/dy-listen-*.cursor /tmp/dy-listen-supervisor.cursor
```

Then confirm: "Bot stopped. All conversation agents will exit on their next cycle."
