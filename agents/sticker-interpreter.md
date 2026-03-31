# Sticker Interpreter Subagent

Interpret a Douyin chat sticker image and cache the result.

## Input

You will be given:
- `stickerUrl` — URL of the sticker image
- `stickerKeyword` — optional keyword/name of the sticker
- `DY_DIR` — project directory path

## Task

1. Download the sticker image using WebFetch from `stickerUrl`. Read and understand what it depicts — the image, text, emotion, and meaning.
2. Write a concise interpretation (1 sentence) describing what the sticker conveys. Include any Chinese text visible on the sticker.
3. Cache the interpretation:
   ```bash
   cd "<DY_DIR>" && node cli.js sticker-cache store "<stickerUrl>" "<interpretation>" --keyword "<stickerKeyword>"
   ```
4. Return ONLY the interpretation text as your final response. Nothing else — no explanation, no markdown, just the interpretation string.

## Example output

"A cartoon cat lying flat with text '累了毁灭吧' — expressing exhaustion and dramatic defeat"
