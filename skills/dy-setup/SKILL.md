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

## Important: Use AskUserQuestion

Every question to the user MUST use the **AskUserQuestion** tool. Never combine multiple questions into one. Ask one question at a time, wait for the answer, then proceed.

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

**If NOT found**: use AskUserQuestion:
> Where should I set up the project? (default: ~/dy-chat-bot)

Then clone:
```bash
git clone https://github.com/<OWNER>/dy-chat-bot.git <chosen-path>
echo "<chosen-path>" > ~/.dy-chat-bot-path
```

If `git clone` fails, tell the user to clone manually and run `/dy-setup` again. Stop.

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

Run `node cli.js health` from the project directory.

**If health check passes**: continue.

**If it fails**: run the injection script to patch the app:

```bash
./inject.sh
```

This backs up the original `app.asar`, patches it with the API server, re-signs the app, and launches it. Wait for the app to fully load, then retry `node cli.js health`.

If the health check still fails after injection, ask the user to check that the 抖音聊天 app is open and logged in, then retry.

### Step 6: Configure persona

Read the current `user/PERSONA.md`. Ask each question **one at a time** using AskUserQuestion, showing the current value as default:

**6a.** AskUserQuestion:
> What should your bot be called? (current: <current name>)

**6b.** AskUserQuestion:
> What word should trigger the bot? (default: <bot name lowercase>)

**6c.** AskUserQuestion:
> What signature should be appended to sent messages? (default: -- <BotName>)

Save the answer to `user/config.json` as `"signature": "<answer>"`. This is appended by code, not by the AI.

**6d.** AskUserQuestion:
> What's your name? (for the Owner field)

**6e.** AskUserQuestion:
> Any personality tweaks? Describe how the bot should behave, or say "keep defaults"

**6f.** AskUserQuestion:
> What language should the bot use? (Chinese / English / bilingual / other)

Update `user/PERSONA.md` using the Edit tool with their answers (name, trigger, owner, personality, language). Do NOT put the signature in PERSONA.md — it's in `config.json` and appended by code automatically.

### Step 7: Configure allowed chats

Run `node cli.js conversations` from the project directory and show the user the **full list** — both group chats and one-to-one DMs. Display the type (DM/Group) next to each name so the user can tell them apart.

AskUserQuestion:
> Which conversations should the bot monitor? You can pick groups, DMs, or both.
> Enter conversation IDs, names, or "all" to monitor everything.

Update `user/config.json` with their selections:
- If "all" → set `"allowedChats": {}`
- Otherwise → set `"allowedChats": { "<id>": { "name": "<name>" }, ... }`

### Step 8: Configure default model

AskUserQuestion:
> Which AI model should the bot use by default?
> - **sonnet** — fast, good balance (recommended)
> - **opus** — smartest, slower, more expensive
> - **haiku** — cheapest, fastest, less capable

Update `user/config.json` with `"defaultModel": "<choice>"`.

### Step 9: Per-conversation model overrides

AskUserQuestion:
> Want to use a different model for any specific conversation? (e.g. opus for a VIP group)
> Say "no" to skip, or list conversations and their models.

If yes, for each conversation they specify, update the corresponding `allowedChats` entry to include `"model": "<choice>"`. Example:
```json
"allowedChats": {
  "123456": { "name": "My Group", "model": "opus" }
}
```

### Step 10: Summary and start

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

AskUserQuestion:
> Want to start the bot now? (yes/no)

If yes: invoke the `/dy-start` skill to launch the listener immediately.

If no: tell the user:
> You can start the bot anytime with `/dy-start`, and stop it with `/dy-stop`.
