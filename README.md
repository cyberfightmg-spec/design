# Interior Style Bot

AI-система для Telegram, которая превращает фотографию реального помещения в несколько профессиональных вариантов интерьерного дизайна, сохраняя исходную архитектуру, ракурс и перспективу.

Главный принцип проекта — **Architecture Lock**: система меняет отделку, материалы, мебель, свет и декор, но не должна переносить стены, окна, двери, проёмы, лестницы, уровни, потолки или менять геометрию помещения.

## Что делает проект

Пользователь отправляет в Telegram фотографию помещения, выбирает нужные стили, после чего система:

1. сохраняет исходное изображение как единственный архитектурный референс;
2. формирует отдельный промпт для каждого выбранного интерьерного стиля;
3. генерирует каждый вариант **независимо от оригинала**, без цепочки "результат → следующий результат";
4. проверяет геометрию через Geometry Guardian;
5. при необходимости повторяет генерацию;
6. озвучивает названия стилей через Fish Audio;
7. собирает вертикальное видео 1080×1920 через FFmpeg;
8. отправляет готовый результат пользователю в Telegram.

## Ключевые возможности

- Telegram-интерфейс на grammY.
- 27 интерьерных стилей с отдельными профилями палитры, материалов, мебели, света и декора.
- Жёсткий **Architecture Lock**.
- Независимая генерация каждого стиля из исходного фото.
- Browser Worker на Playwright для работы с ChatGPT image generation.
- Абстракция Image Provider для возможной смены генератора.
- Geometry Guardian на FastAPI + OpenCV.
- Повторные попытки при провале геометрической проверки.
- Fish Audio TTS для голосового сопровождения.
- FFmpeg-рендер вертикального видео.
- Конфигурируемые параметры видео, QA, storage и логирования.
- Docker Compose для запуска основных сервисов.
- Monorepo на pnpm + Turborepo.

## Architecture Lock

Приоритет проекта:

1. сохранить архитектуру;
2. сохранить камеру;
3. сохранить перспективу;
4. применить выбранный стиль;
5. добиться фотореализма.

Нельзя:

- двигать, удалять или добавлять стены;
- переносить или менять размеры окон;
- переносить или менять размеры дверей и проёмов;
- менять высоту потолка или размеры комнаты;
- добавлять новые уровни, лестницы, колонны или архитектурные проёмы;
- менять положение камеры, фокусную перспективу, кадрирование и точки схода;
- превращать помещение в другую комнату.

Если характерная черта стиля требует изменения архитектуры, она должна быть передана через **материалы, мебель, свет, текстиль, отделку и декор**, а не через изменение геометрии.

## Структура проекта

```text
design/
├── apps/
│   ├── telegram-bot/       # Telegram UX, загрузка фото, выбор стилей
│   ├── browser-worker/     # Playwright + генерация изображений
│   └── renderer/           # FFmpeg pipeline
├── packages/
│   ├── core/               # типы, очередь, БД, конфигурация, storage
│   ├── styles/             # интерьерные стили и prompt builder
│   ├── voice/              # Fish Audio TTS
│   └── image-provider/     # интерфейс провайдера изображений
├── services/
│   └── geometry-guardian/  # FastAPI + OpenCV QA
├── config/
│   ├── styles.json         # профили интерьерных стилей
│   ├── video.json          # параметры видео
│   └── geometry.json       # правила геометрического контроля
├── assets/                 # шрифты и медиа
├── docker/                 # Dockerfiles
├── docker-compose.yml
└── .env.example
```

## Технологии

| Задача | Технология |
|---|---|
| Telegram Bot | Node.js 20, TypeScript, grammY |
| Генерация | Playwright + ChatGPT browser workflow |
| Монорепозиторий | pnpm, Turborepo |
| Хранилище / очередь | core package + SQLite |
| Видео | FFmpeg |
| Озвучка | Fish Audio |
| QA геометрии | Python, FastAPI, OpenCV, NumPy, SciPy |
| Контейнеризация | Docker Compose |

## Быстрый запуск

### Требования

- Node.js 20+
- pnpm 9+
- Python 3.10+
- FFmpeg
- Chromium/Playwright dependencies
- Telegram Bot Token
- Fish Audio API key и Voice ID

### 1. Установка Node.js-зависимостей

```bash
pnpm install
```

### 2. Geometry Guardian

```bash
cd services/geometry-guardian
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..
```

### 3. Переменные окружения

```bash
cp .env.example .env
```

Основные переменные:

| Переменная | Назначение |
|---|---|
| `TELEGRAM_BOT_TOKEN` | токен Telegram-бота |
| `IMAGE_PROVIDER` | `chatgpt-browser` или `openai-api` |
| `CHATGPT_BROWSER_PROFILE` | путь к постоянному browser profile |
| `BROWSER_HEADLESS` | headless-режим браузера |
| `FISH_MODE` | `api` или `browser` |
| `FISH_API_KEY` | API-ключ Fish Audio |
| `FISH_VOICE_ID` | ID выбранного голоса |
| `GEOMETRY_GUARDIAN_MODE` | `basic` или `advanced` |
| `GEOMETRY_GUARDIAN_URL` | URL QA-сервиса |
| `MAX_GEOMETRY_RETRIES` | число повторных генераций после QA fail |
| `VIDEO_WIDTH` / `VIDEO_HEIGHT` | размер итогового видео |
| `VIDEO_FPS` | FPS |
| `BGM_ENABLED` | включение фоновой музыки |
| `COMPARE_MODE` | debug-overlay original/generated |
| `LOG_LEVEL` | уровень логов |
| `STORAGE_PATH` | путь к storage |

Не коммитьте реальные токены и API-ключи в репозиторий.

### 4. Шрифт

Добавьте:

```text
assets/fonts/Oks-Free-0013.otf
```

### 5. Авторизация ChatGPT

Первый запуск Browser Worker выполните с отображаемым браузером:

```bash
BROWSER_HEADLESS=false pnpm worker
```

Войдите в ChatGPT вручную. Browser profile сохранит сессию. После этого можно вернуть:

```bash
BROWSER_HEADLESS=true
```

### 6. Запуск сервисов

Отдельно:

```bash
# Geometry Guardian
cd services/geometry-guardian
uvicorn main:app --port 8001

# Browser Worker
pnpm worker

# Telegram Bot
pnpm bot
```

Или:

```bash
docker compose up --build
```

## Команды monorepo

```bash
pnpm build
pnpm dev
pnpm lint
pnpm test
pnpm test:integration
pnpm bot
pnpm worker
pnpm renderer
pnpm guardian
```

## Pipeline

```text
Telegram photo
    ↓
Original source of truth
    ↓
Style selection
    ↓
Prompt builder + Architecture Lock
    ↓
Browser/Image Provider
    ↓
Generated image
    ↓
Geometry Guardian
    ├── PASS → save result
    └── FAIL → retry
    ↓
Fish Audio
    ↓
FFmpeg renderer
    ↓
1080×1920 MP4
    ↓
Telegram delivery
```

## Базовые правила генерации

- Каждый стиль генерируется только из исходного фото.
- Никаких chained generations.
- Camera lock обязателен.
- Геометрия важнее стилистических эффектов.
- Видео не использует zoom, pan или parallax.
- Переходы — hard cuts.
- Один основной шрифт — Oks Free.
- Голос используется для intro и названий стилей.

## Текущий milestone

```text
1 фото → несколько выбранных стилей → geometry QA → Fish Audio → 1080×1920 MP4 → Telegram
```

## Направления развития

- более строгий semantic geometry QA;
- SAM2/segmentation для advanced geometry mode;
- дополнительные image providers;
- очередь задач и полноценный resume после сбоя;
- web-панель администратора;
- аналитика генераций и QA-fail причин;
- пресеты видео и брендинга;
- multi-room проекты;
- SaaS-режим с пользователями, лимитами и биллингом.

## Безопасность

- храните секреты только в `.env`;
- используйте отдельные browser profiles для production;
- не публикуйте cookies и session storage;
- ограничивайте доступ к storage и generated assets;
- перед production deployment добавьте rate limits, monitoring и backup.

## Статус

Проект находится в активной разработке. Основная архитектура, Telegram-бот, browser worker, style profiles, renderer, voice package и Geometry Guardian уже представлены в репозитории; отдельные части production-hardening и advanced geometry остаются направлениями развития.

## Лицензия

Лицензия в репозитории пока не указана. До добавления файла `LICENSE` стандартные права автоматически не предоставляются.
