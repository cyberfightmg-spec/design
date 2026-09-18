# Interior Style Bot

Telegram-бот, который превращает фото любого помещения в профессиональные варианты дизайна интерьера в 27 стилях.

## Ключевой принцип

**Architecture Lock** — архитектура помещения полностью заморожена. Меняется только интерьерное оформление. Стены, окна, двери, перспектива — неизменны.

## Quick Start

### 1. Установка зависимостей

```bash
# Node.js (pnpm)
pnpm install

# Python (Geometry Guardian)
cd services/geometry-guardian
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..
```

### 2. Настройка окружения

```bash
cp .env.example .env
# Заполните: TELEGRAM_BOT_TOKEN, FISH_API_KEY, FISH_VOICE_ID
```

### 3. Добавить шрифт

Поместите файл `Oks Free 0013.otf` в:
```
assets/fonts/Oks-Free-0013.otf
```

### 4. Авторизация ChatGPT (один раз вручную)

```bash
# Запустить браузер в non-headless режиме
BROWSER_HEADLESS=false pnpm worker
# Войти в ChatGPT вручную — сессия сохранится
# После входа остановить и запустить с BROWSER_HEADLESS=true
```

### 5. Запуск

**Три отдельных процесса:**

```bash
# Терминал 1: Geometry Guardian
cd services/geometry-guardian && uvicorn main:app --port 8001

# Терминал 2: Browser Worker
pnpm worker

# Терминал 3: Telegram Bot
pnpm bot
```

**Или через Docker:**

```bash
docker-compose up
```

## Architecture

```
interior-style-bot/
├── apps/
│   ├── telegram-bot/     # grammY bot (P0)
│   ├── browser-worker/   # Playwright + ChatGPT automation (P1)
│   └── renderer/         # FFmpeg video pipeline (P5)
├── packages/
│   ├── core/             # DB, queue, types, config
│   ├── styles/           # 27 style profiles
│   ├── voice/            # Fish Audio TTS
│   └── image-provider/   # ImageGenerator interface
├── services/
│   └── geometry-guardian/ # Python OpenCV QA (P7)
├── assets/fonts/          # Oks Free 0013.otf
├── config/
│   ├── styles.json
│   ├── video.json
│   └── geometry.json
└── storage/
    ├── projects/          # Per-project files
    └── audio-cache/       # Cached TTS audio
```

## Development Priority

| Priority | Feature |
|---|---|
| P0 | Telegram bot: upload + style selection |
| P1 | ChatGPT browser generation |
| P2 | Style prompts (27 profiles) |
| P3 | Image storage |
| P4 | Fish Audio TTS |
| P5 | FFmpeg video render |
| P6 | Oks Free text overlay |
| P7 | Geometry Guardian (OpenCV) |
| P8 | Retries + resume |
| P9 | Advanced geometry (SAM2, future) |

## First Milestone

```
1 photo → 3 styles → Fish Audio voice → 1080×1920 MP4
```

## Key Rules

1. **Never chain generations**: each style is generated independently from the original photo
2. **Camera is locked**: no zoom, pan, or perspective change in video
3. **Hard cuts only**: no slide, zoom, or parallax transitions
4. **Single font**: Oks Free everywhere
5. **Voice**: only intro question + style names

## Tech Stack

- **Bot**: Node.js 20, TypeScript, grammY
- **Browser**: Playwright (ChatGPT Images 2.5)
- **DB**: SQLite (better-sqlite3)
- **Video**: FFmpeg
- **TTS**: Fish Audio API
- **QA**: Python, OpenCV
- **Monorepo**: pnpm + Turborepo
