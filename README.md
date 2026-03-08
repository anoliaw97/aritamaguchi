# 🌟 Aritamaguchi

A state-of-the-art virtual pet system — playable in the browser and scalable to an Arduino keychain.

## Live Demo

Deployed via GitHub Pages: see the **Actions** tab for the live URL after first push.

---

## Features

### Pet System (PC / Web)
- **Real-time stat decay** — hunger, happiness, cleanliness, energy all evolve in real time
- **Behavior tree AI** — multi-priority state machine (Emergency → Sleep → Schedule → Random → Idle)
- **Time-of-day awareness** — morning stretch, evening clean routine, forced sleep at night
- **Ragnarok Online-style intimacy system** — 6 bond tiers (Awkward → Shy → Neutral → Cordial → Loyal → Soulbound)
- **Pet evolution** — appearance scales with intimacy (Baby → Juvenile → Adult)
- **Mini-game** — "Catch the Star" yields happiness/intimacy rewards
- **Personality engine** — 100+ contextual speech lines, tiered by intimacy level
- **Optional Claude AI speech** — provide an Anthropic API key in Settings for dynamic responses
- **LocalStorage persistence** — pet survives browser refresh and simulates offline time (up to 8 hours)
- **Web Audio API sounds** — retro square-wave tones, no external audio files
- **Responsive design** — works on mobile and desktop

### Arduino Keychain Edition
- **ATmega328P optimized** — 18KB flash, ~700B SRAM usage
- **SSD1306 OLED** — 128×64 pixel display with 32×32 pet sprites
- **3-button interface** — Feed / Play / Clean via simple button cycling
- **EEPROM persistence** — pet survives power loss (10-byte save with checksum)
- **Power-saving** — display dims after 30s, optional deep sleep during pet sleep
- **Passive buzzer** — chiptune feedback tones
- **Dual target** — same AI logic compiles for ESP8266/ESP32 with WiFi NTP clock sync

---

## Architecture

```
aritamaguchi/
├── index.html              ← main app shell
├── css/
│   └── style.css           ← dark purple retro device styling
├── js/
│   ├── game.js             ← main game loop, input wiring, orchestration
│   ├── pet.js              ← pet state machine + behavior tree AI
│   ├── renderer.js         ← canvas rendering engine
│   ├── sprites.js          ← procedural pixel-art character drawing
│   ├── events.js           ← time-of-day scheduler + mini-game logic
│   ├── personality.js      ← speech template engine (+ optional Claude API)
│   └── ui.js               ← DOM stat bars, panels, toast, speech bubble
├── arduino/
│   └── tamagotchi/
│       ├── tamagotchi.ino  ← main sketch
│       ├── pet_ai.h        ← pet AI (SRAM-optimized state machine)
│       ├── sprites.h       ← PROGMEM OLED bitmaps (32×32, 1bpp)
│       └── display.h       ← SSD1306 rendering + button handling
└── .github/
    └── workflows/
        └── deploy.yml      ← GitHub Pages auto-deploy
```

---

## Playing (Web)

| Key | Action |
|-----|--------|
| `F` | Feed |
| `P` | Play (opens mini-game) |
| `C` | Clean |
| `M` | Menu |
| `Space` / `Enter` | Poke pet |
| `←` / `→` | Mini-game movement |
| `Esc` | Close panels |

---

## Pet Stats

| Stat | Description | Decay rate |
|------|-------------|------------|
| 🍖 Hunger | Feed to restore | ~1%/4min |
| 💜 Happiness | Play/clean to raise | ~1%/8min |
| ✨ Cleanliness | Clean to restore | ~1%/11min |
| ⚡ Energy | Recovered by sleep | Depletes while playing |
| 🌟 Intimacy | Bond level (0-1000) | Grows with good care |

### Intimacy Tiers (Ragnarok Online-inspired)

| Tier | Range | Behavior |
|------|-------|----------|
| Awkward | 0-99 | Minimal reactions, shy speech |
| Shy | 100-249 | Starts opening up |
| Neutral | 250-499 | Normal interactions |
| Cordial | 500-749 | More animations, richer speech |
| Loyal | 750-999 | Special dances, very expressive |
| Soulbound | 1000 | Maximum bond, unique effects |

---

## Arduino Build

### Required libraries

```
Adafruit SSD1306 >= 2.5.0
Adafruit GFX     >= 1.11.0
```

Install via Arduino IDE → Tools → Manage Libraries.

### Wiring (Arduino Nano)

| Component | Arduino Pin |
|-----------|-------------|
| OLED SDA  | A4 |
| OLED SCL  | A5 |
| OLED VCC  | 3.3V |
| Button A (Feed)  | D2 |
| Button B (Confirm) | D3 |
| Button C (Info)  | D4 |
| Buzzer (+) | D5 |

### Button Controls

| Button | Short press | Hold 2s |
|--------|-------------|---------|
| A | Cycle action (Feed/Play/Clean) | — |
| B | Execute action | Settings menu |
| C | Toggle stats screen | Toggle sound |

### Keychain Form Factor

Recommended components for keychain build:
- Arduino Pro Mini 3.3V (8MHz) — smaller than Nano
- 0.96" SSD1306 OLED
- 3× tactile buttons (6×6mm)
- LiPo 100mAh (approx. 5 days battery)
- TP4056 charging module

For ultra-low power, target **ESP8266** variant:
- WiFi for NTP time sync (accurate day/night cycle)
- Deep sleep down to 20µA
- Cloud save via HTTP webhook

---

## Optional AI Speech (Claude API)

For richer, dynamic pet responses:

1. Open the game → Menu → AI Speech → ON
2. Paste your Anthropic API key when prompted
3. The pet will use `claude-haiku-4-5` for natural speech

> **Note:** The API key is stored only in `sessionStorage` and never persisted.
> For production use, proxy requests through a backend to keep the key secure.

The fallback template engine provides 100+ lines across 6 intimacy tiers — the pet will feel alive even without an API key.

---

## GitHub Actions Deploy

The workflow in `.github/workflows/deploy.yml` automatically:
1. Validates all JS/HTML files are present
2. Injects build metadata
3. Deploys to GitHub Pages on push to `main`/`master`/`claude/*`

Enable GitHub Pages in repo Settings → Pages → Source: GitHub Actions.

---

## Credits

Inspired by:
- Bandai Tamagotchi (1996)
- Gravity/Ragnarok Online pet intimacy system
- Classic LCD pet games
