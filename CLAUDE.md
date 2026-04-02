# dy-chat-bot

CLI tool for reading and sending messages in 抖音聊天 (Douyin Chat) desktop app on macOS.

## Prerequisites

The 抖音聊天 app must be running with the injected API server (port 3456).
A modified `app.asar` has been installed that runs an HTTP API server on `127.0.0.1:3456` inside the Electron renderer process.

- Launch: `open -a "抖音聊天"`
- Verify: `node cli.js health`

## CLI Usage

```bash
node cli.js <command> [args]
```

| Command | Description |
|---------|-------------|
| `health` | Check API server is running |
| `user` | Show current logged-in user |
| `conversations` | List all conversations (ID, type, name) |
| `contacts` | List friends/contacts |
| `messages <convId> [limit]` | Get messages from a conversation |
| `send <convId> <message>` | Send a text message |
| `poll [since_ts]` | Poll for new incoming messages since timestamp |
| `image <md5>` | Download and convert a chat image to JPEG (returns local path) |
| `search <query>` | Search messages |
| `conv <convId>` | Get conversation detail |
| `listen-conv <convId> [mode]` | Per-conversation listener (one conv only) |
| `listen-supervisor` | Supervisor: emit active conversation signals |
| `peek-conv <convId>` | Check for new messages without consuming them |
| `send-if-clear <convId> <msg>` | Atomic peek+send: only sends if no new messages |
| `drain-conv <convId>` | Consume and return new messages in a conv |
| `sticker-cache <action>` | Manage sticker interpretation cache |
| `raw <path>` | Raw API call (e.g. `/api/ws-status`) |

## Message Format

Incoming messages from `poll` have this structure:
- `conversationId` - which conversation
- `sender` - sender UID
- `content` - JSON string with message payload
- `parsedContent.text` - the actual text for text messages (aweType: 0)
- `parsedContent.aweType` - message type (0=text, 500=gif, 700=text, 800=video share, 2702=image, 10500=comment share, 502=location)
- `type` - message type number (5=sticker, 7=text, 8=video share, 27=image, 105=share, 502=location)
- `createdAt` - timestamp in milliseconds

### Image messages (type 27, aweType 2702)
- `imageMd5` - image cache key (use with `image` command or `/api/image?md5=`)
- `localImagePath` - local JPEG path (auto-resolved by `listen-conv`/`listen-loop`; agents should `Read` this file to see the image)
- `imageUrl` - CDN URL (encrypted — do NOT fetch directly; use `imageMd5` instead)
- `imageThumbUrl` - thumbnail CDN URL (also encrypted)
- `imageWidth`, `imageHeight` - dimensions
- Raw data in `parsedContent.resource_url` has `thumb/medium/large/origin_url_list`, `data_size`, `oid`, `md5`

**Image pipeline**: Douyin CDN URLs return encrypted data. The Electron app decrypts and caches images locally. The `/api/image?md5=` endpoint serves these cached files. The CLI `image` command fetches and converts HEIC→JPEG to `/tmp/dy-images/{md5}.jpg`. `listen-conv` auto-resolves images so agents get a `localImagePath` they can `Read` directly.

### Video share messages (type 8, aweType 800)
- `videoTitle` - shared video title
- `videoAuthor` - content creator name
- `videoCoverUrl` - video cover/thumbnail URL
- `videoItemId` - Douyin video item ID
- Raw data in `parsedContent` has `content_thumb`, `cover_url`, `secUID`, `uid`

## User Data Directory

All user-specific data lives in `user/` (gitignored — safe from `git pull`):
- `user/config.json` — allowed chats, model settings
- `user/PERSONA.md` — bot personality and identity
- `user/memory/` — per-conversation memory files
- `user/sticker-cache.json` — cached sticker interpretations

Templates at project root: `config.example.json`, `PERSONA.example.md`

## Model Configuration

In `user/config.json`:
- `defaultModel` — model for all agents (default: `"sonnet"`). Values: `"sonnet"`, `"opus"`, `"haiku"`.
- `signature` — appended to every sent message by code (default: `"[Bot]"`). **Do NOT instruct the AI to append the signature** — `send` and `send-if-clear` handle it automatically.
- Per-chat override — each `allowedChats` entry can have a `"model"` field.

```json
{
  "defaultModel": "sonnet",
  "signature": "-- Chloe",
  "allowedChats": {
    "0:2:abc123": { "name": "My Group", "model": "opus" }
  }
}
```

## Architecture

### Multi-Agent Mode (default with `/dy-start`)

Each allowed conversation gets its own background agent:
- **Conversation agents** run `listen-conv <convId>`, handle one chat independently
- Each loads its own `user/memory/<convId>.md` for isolated context
- Sticker interpretations are cached in `user/sticker-cache.json` (shared across agents)
- Rolling debounce in `listen-conv` (0.5s reset, 3s cap) batches rapid-fire messages
- Before sending, agents peek for new messages — if found, they loop back and re-compose with full context

### Single-Agent Mode (with `/dy-start --single`)

Legacy mode: one agent handles all conversations sequentially via `listen-loop`.

### Sticker Cache

`sticker-cache.js` provides persistent caching of sticker interpretations:
- Cache key: sticker URL (primary) or keyword (secondary)
- `listen-conv` / `listen-loop` auto-enrich messages with `stickerInterpretation` on cache hit
- Agents write to cache on first encounter via `sticker-cache store`
- Max 1000 entries with LRU eviction

## Known Limitations

- `messages` command returns empty for most conversations (the native IM SDK expects protobuf-formatted params). Messages must be loaded in the app UI first.
- `send` command needs the correct content structure (not plain text). The content format uses protobuf serialization internally.
- `poll` works well for real-time monitoring of incoming messages.
- Only conversations visible in the app will appear in `conversations`.
