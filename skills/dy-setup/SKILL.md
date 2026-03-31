---
name: dy-setup
description: Interactive setup wizard for dy-chat-bot — locates or clones the project, configures persona, allowed chats, and verifies the API connection
---

# dy-chat-bot Setup Wizard

Set up dy-chat-bot for reading and sending messages in 抖音聊天 (Douyin Chat) desktop app on macOS.

## Usage

`/dy-setup`

## Constants

- **GitHub repo**: detect from `git remote get-url origin` in the project directory, or ask the user
- **Default project dir**: `~/dy-chat-bot`
- **Path config**: `~/.dy-chat-bot-path`

## Execution

Walk the user through each step. Check what's already configured and skip completed steps.

### Step 1: Prerequisites

Run `node --version`. Require Node.js 18+. If missing or too old, tell the user to install/upgrade and stop.

### Step 2: Locate the project

The project needs `cli.js` in a directory on disk, with user data in `user/`.

**Check in order:**

1. Read `~/.dy-chat-bot-path` — if it exists and the path contains `cli.js`, use it. Done.
2. Check if the **current working directory** contains `cli.js` — if yes, use it.
3. Check `~/dy-chat-bot/cli.js` — if it exists, use it.
4. Search for `cli.js` near the installed skills location using Glob: `**/dy-chat-bot/cli.js` (search up to 3 levels from home directory).

**If found**: save the path and continue:
```bash
echo "/absolute/path/to/project" > ~/.dy-chat-bot-path
```

**If NOT found**: ask the user where to set up the project (default: `~/dy-chat-bot`), then clone:
```bash
git clone https://github.com/<OWNER>/dy-chat-bot.git <chosen-path>
echo "<chosen-path>" > ~/.dy-chat-bot-path
```

If `git clone` fails (no internet, repo not found), tell the user:
> I couldn't clone the repo. Please clone it manually:
> `git clone <repo-url> ~/dy-chat-bot`
> Then run `/dy-setup` again.

Then stop.

### Step 3: Ensure user data directory exists

Read `~/.dy-chat-bot-path` to get the project directory. All user data lives in `<project>/user/`.

```bash
mkdir -p "$DY_DIR/user/memory"
```

**user/config.json** — if missing, copy from template:
```bash
cp "$DY_DIR/config.example.json" "$DY_DIR/user/config.json"
```

**user/PERSONA.md** — if missing, copy from template:
```bash
cp "$DY_DIR/PERSONA.example.md" "$DY_DIR/user/PERSONA.md"
```

IMPORTANT: The `user/` directory is gitignored — `git pull` will never overwrite these files.

### Step 4: Check 抖音聊天 app

```bash
ls /Applications/抖音聊天.app 2>/dev/null && echo "FOUND" || echo "NOT_FOUND"
```

If not found, tell the user:
> 抖音聊天 (Douyin Chat) desktop app is required. Download it from the official Douyin website or Mac App Store.

Stop here — the app is required.

### Step 5: Check API server

Launch the app and verify the API:

```bash
open -a "抖音聊天"
```

Wait 5 seconds, then run `node cli.js health` from the project directory.

**If health check passes**: continue.

**If it fails**: explain:
> The 抖音聊天 app needs a modified `app.asar` that runs an HTTP API server on `127.0.0.1:3456`.
> This modification is not included — you need to inject an HTTP server into the Electron app's renderer process.
>
> Required endpoints:
> - `GET /health`, `GET /api/user`, `GET /api/conversations`
> - `GET /api/contacts`, `GET /api/messages?convId=&limit=20`
> - `GET /api/new-messages?since=0`, `POST /api/send {convId, text}`
>
> Once installed, restart the app and run `/dy-setup` again.

Stop here.

### Step 6: Configure persona

Read the current `user/PERSONA.md`. Ask the user these questions (show current values as defaults):

1. **Bot name** — What should your bot be called?
2. **Trigger word** — What word should trigger the bot? (default: bot name, lowercase)
3. **Signature** — Appended to all sent messages (default: `[BotName]`)
4. **Owner name** — Your name
5. **Personality** — Any tweaks, or keep defaults?
6. **Language** — Chinese, English, bilingual, or other?

Update `user/PERSONA.md` using the Edit tool with their answers. Only change what they specified.

### Step 7: Configure allowed chats

Run `node cli.js conversations` from the project directory and show the user the **full list** — both group chats and one-to-one DMs. Display the type (DM/Group) next to each name so the user can tell them apart.

Ask:
> Which conversations should the bot monitor? You can pick groups, DMs, or both.
> Enter conversation IDs or names, or "all" to monitor everything.

Update `user/config.json` with their selections:
- If "all" → set `"allowedChats": {}`
- Otherwise → set `"allowedChats": { "<id>": "<name>", ... }`

### Step 8: Configure agent model

Ask:
> Which AI model should the bot use? (default: sonnet)
> Options: **sonnet** (fast, recommended), **opus** (smartest, slower), **haiku** (cheapest, fastest)

Update `user/config.json` with `"defaultModel": "<choice>"`.

Then ask:
> Want to use a different model for any specific conversation? (e.g. opus for your VIP group)

If yes, for each conversation they specify, update the corresponding `allowedChats` entry to include `"model": "<choice>"`. Example:
```json
"allowedChats": {
  "123456": { "name": "My Group", "model": "opus" }
}
```

If no, move on.

### Step 9: Summary and start

Print:

```
Setup complete!

  Project dir:     <path>
  Bot name:        <name>
  Trigger:         <trigger>
  Signature:       <signature>
  Monitored chats: <list or "all">
  Default model:   <model>
```

Then ask:
> Want to start the bot now?

If yes: invoke the `/dy-start` skill to launch the listener immediately.

If no: tell the user:
> You can start the bot anytime with `/dy-start`, and stop it with `/dy-stop`.
