/**
 * display.h - OLED display helpers for Aritamaguchi (Arduino)
 *
 * Depends on: Adafruit SSD1306 + Adafruit GFX libraries
 * Screen: 128×64 OLED (I2C address 0x3C)
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  [🍖 ████░░] [💜 ████░░] [✨ ████░░]    HH:MM  │  (top bar)
 *   │                                                                  │
 *   │                  [PET SPRITE 32×32]                              │
 *   │                                                                  │
 *   │  "Status message..."                              [BOND: SHY]   │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Three-button interface:
 *   BTN_A (left)   – cycle action (Feed / Play / Clean)
 *   BTN_B (center) – confirm/execute selected action
 *   BTN_C (right)  – toggle info screen
 *
 * Power save:
 *   - Display dims after 30s of inactivity
 *   - Deep sleep when pet is sleeping (wake on button)
 */

#ifndef DISPLAY_H
#define DISPLAY_H

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "sprites.h"
#include "pet_ai.h"

// ─── hardware pin definitions ────────────────────────────────────────────────
// Adjust to match your wiring
#define OLED_WIDTH   128
#define OLED_HEIGHT   64
#define OLED_RESET    -1   // use -1 if sharing Arduino reset pin
#define OLED_I2C_ADDR 0x3C

#define BTN_A_PIN    2    // Feed (left)
#define BTN_B_PIN    3    // Confirm (center) – interrupt-capable
#define BTN_C_PIN    4    // Info (right)
#define BUZZER_PIN   5    // optional passive buzzer

// ─── bar geometry ────────────────────────────────────────────────────────────
#define BAR_Y        0
#define BAR_H        7
#define BAR_HUNGER_X 0
#define BAR_HAPPY_X  44
#define BAR_CLEAN_X  88
#define BAR_W        36

// ─── sprite position ─────────────────────────────────────────────────────────
#define SPR_X        48
#define SPR_Y        12

// ─── text positions ──────────────────────────────────────────────────────────
#define STATUS_Y     56
#define BOND_X       80
#define BOND_Y       56

// ─── display timout ──────────────────────────────────────────────────────────
#define DIM_TIMEOUT_MS  30000UL

// ─── tones (passive buzzer) ──────────────────────────────────────────────────
void playNote(uint8_t pin, uint16_t freq, uint16_t durationMs) {
  if (freq == 0) { delay(durationMs); return; }
  tone(pin, freq, durationMs);
  delay(durationMs);
  noTone(pin);
}

void playFeed()  { playNote(BUZZER_PIN, 440, 80); delay(30); playNote(BUZZER_PIN, 660, 100); }
void playHappy() {
  uint16_t notes[] = {440,550,660,880};
  for (uint8_t i = 0; i < 4; i++) { playNote(BUZZER_PIN, notes[i], 70); delay(10); }
}
void playError() { playNote(BUZZER_PIN, 220, 150); }
void playLevelUp() {
  uint16_t notes[] = {440,660,880,1100};
  for (uint8_t i = 0; i < 4; i++) { playNote(BUZZER_PIN, notes[i], 100); delay(20); }
}

// ─── DisplayManager class ────────────────────────────────────────────────────
class DisplayManager {
public:
  Adafruit_SSD1306 oled;

  uint8_t  selectedAction;   // 0=Feed 1=Play 2=Clean
  bool     showInfo;
  bool     dimmed;
  uint32_t lastActivity;
  uint32_t lastDraw;

  DisplayManager() : oled(OLED_WIDTH, OLED_HEIGHT, &Wire, OLED_RESET) {
    selectedAction = 0;
    showInfo       = false;
    dimmed         = false;
    lastActivity   = 0;
    lastDraw       = 0;
  }

  // ─── setup ──────────────────────────────────────────────────────────────

  bool begin() {
    if (!oled.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
      return false;  // OLED not found
    }
    oled.clearDisplay();
    oled.setTextColor(SSD1306_WHITE);

    // button pins with internal pull-ups
    pinMode(BTN_A_PIN, INPUT_PULLUP);
    pinMode(BTN_B_PIN, INPUT_PULLUP);
    pinMode(BTN_C_PIN, INPUT_PULLUP);
    pinMode(BUZZER_PIN, OUTPUT);

    lastActivity = millis();
    splashScreen();
    return true;
  }

  void splashScreen() {
    oled.clearDisplay();
    oled.setTextSize(1);
    oled.setCursor(8, 10);
    oled.print(F("ARITAMAGUCHI"));
    oled.setCursor(22, 25);
    oled.print(F("v1.0"));
    oled.setCursor(4, 40);
    oled.print(F("Press B to start"));
    oled.display();
    // wait for button
    while (digitalRead(BTN_B_PIN) == HIGH) delay(50);
    wakeUp();
  }

  // ─── input polling ───────────────────────────────────────────────────────

  struct ButtonState {
    bool a, b, c;
  };

  // Debounced button read (50ms)
  ButtonState readButtons() {
    static uint32_t lastA = 0, lastB = 0, lastC = 0;
    static bool     prevA = HIGH, prevB = HIGH, prevC = HIGH;
    uint32_t now = millis();
    ButtonState result = {false, false, false};

    bool ra = (digitalRead(BTN_A_PIN) == LOW);
    bool rb = (digitalRead(BTN_B_PIN) == LOW);
    bool rc = (digitalRead(BTN_C_PIN) == LOW);

    if (ra && !prevA && now - lastA > 50) { result.a = true; lastA = now; }
    if (rb && !prevB && now - lastB > 50) { result.b = true; lastB = now; }
    if (rc && !prevC && now - lastC > 50) { result.c = true; lastC = now; }

    if (ra || rb || rc) {
      lastActivity = now;
      if (dimmed) wakeUp();
    }

    prevA = ra; prevB = rb; prevC = rc;
    return result;
  }

  void wakeUp() {
    dimmed = false;
    oled.ssd1306_command(SSD1306_DISPLAYON);
    oled.dim(false);
    lastActivity = millis();
  }

  void checkDim() {
    if (!dimmed && millis() - lastActivity > DIM_TIMEOUT_MS) {
      dimmed = true;
      oled.dim(true);
    }
  }

  // ─── main draw ───────────────────────────────────────────────────────────

  void draw(const PetAI& pet) {
    if (millis() - lastDraw < 100) return;  // cap at 10fps to save power
    lastDraw = millis();

    oled.clearDisplay();

    if (showInfo) {
      _drawInfoScreen(pet);
    } else {
      _drawMainScreen(pet);
    }

    oled.display();
  }

  // ─── handle action button ────────────────────────────────────────────────

  // Returns action code: 0=none 1=feed 2=play 3=clean
  uint8_t handleButtons(PetAI& pet) {
    ButtonState btn = readButtons();
    uint8_t     action = 0;

    if (btn.a) {
      // cycle selection
      selectedAction = (selectedAction + 1) % 3;
    }

    if (btn.b) {
      // execute
      bool ok = false;
      switch (selectedAction) {
        case 0: ok = pet.feed();  if (ok && pet.soundEnabled()) playFeed();  action = 1; break;
        case 1: ok = pet.play();  if (ok && pet.soundEnabled()) playHappy(); action = 2; break;
        case 2: ok = pet.clean(); if (ok && pet.soundEnabled()) playHappy(); action = 3; break;
      }
      if (!ok && pet.soundEnabled()) playError();
    }

    if (btn.c) {
      showInfo = !showInfo;
    }

    return action;
  }

private:
  // ─── stat bar helper ──────────────────────────────────────────────────────

  void _drawBar(int16_t x, int16_t y, uint8_t pct, const __FlashStringHelper* label) {
    oled.drawRect(x, y, BAR_W, BAR_H, SSD1306_WHITE);
    int16_t fill = (int16_t)(BAR_W - 2) * pct / 100;
    if (fill > 0) {
      oled.fillRect(x + 1, y + 1, fill, BAR_H - 2, SSD1306_WHITE);
    }
  }

  // ─── main screen ─────────────────────────────────────────────────────────

  void _drawMainScreen(const PetAI& pet) {
    // ── stat bars (top strip) ──
    // Hunger icon: small bone symbol (3×5)
    oled.setCursor(0, 0);
    oled.setTextSize(1);
    oled.print(F("\x9f"));  // bone-like char (font-dependent)
    _drawBar(8,  0, pet.hungerPct(), nullptr);

    oled.setCursor(44, 0);
    oled.print(F("\x3"));   // heart char
    _drawBar(52, 0, pet.happinessPct(), nullptr);

    oled.setCursor(88, 0);
    oled.print(F("*"));
    _drawBar(96, 0, pet.cleanPct(), nullptr);

    // ── pet sprite (32×32 centered, offset Y=12) ──
    const uint8_t* frame = nullptr;
    uint8_t sprIdx = 0;
    switch (pet.state) {
      case STATE_IDLE:     sprIdx = 0; break;
      case STATE_HAPPY:
      case STATE_EXCITED:  sprIdx = 1; break;
      case STATE_HUNGRY:   sprIdx = 2; break;
      case STATE_EATING:   sprIdx = 3; break;
      case STATE_SLEEPING: sprIdx = 4; break;
      case STATE_CLEANING: sprIdx = 5; break;
      default:             sprIdx = 0; break;
    }

    // Read frame pointer from PROGMEM (double indirection)
    const uint8_t* framePtr = (const uint8_t*)pgm_read_ptr(
      &SPRITE_TABLE[sprIdx].frames[pet.animFrame & 1]
    );
    oled.drawBitmap(SPR_X, SPR_Y, framePtr, SPR_W, SPR_H, SSD1306_WHITE);

    // ── poop indicators ──
    for (uint8_t i = 0; i < pet.data.poopCount; i++) {
      oled.fillCircle(4 + i * 6, 46, 2, SSD1306_WHITE);
    }

    // ── action selector (bottom left) ──
    static const char* ACTIONS[] = {"[FEED]", "[PLAY]", "[CLEAN]"};
    oled.setCursor(0, STATUS_Y);
    oled.print(ACTIONS[selectedAction]);

    // ── status message ──
    oled.setCursor(0, STATUS_Y - 9);
    oled.print(pet.statusMsg);

    // ── bond tier (bottom right) ──
    static const char* TIERS[] = {"AWKWARD","SHY","OK","GOOD","LOYAL"};
    oled.setCursor(BOND_X, STATUS_Y);
    oled.print(TIERS[pet.intimacyTier()]);
  }

  // ─── info screen ─────────────────────────────────────────────────────────

  void _drawInfoScreen(const PetAI& pet) {
    oled.setTextSize(1);
    oled.setCursor(0, 0);
    oled.print(F("-- PET STATS --"));

    oled.setCursor(0, 10);
    oled.print(F("Hunger: "));
    oled.print(pet.hungerPct());
    oled.print(F("%"));

    oled.setCursor(0, 20);
    oled.print(F("Happy: "));
    oled.print(pet.happinessPct());
    oled.print(F("%"));

    oled.setCursor(0, 30);
    oled.print(F("Clean: "));
    oled.print(pet.cleanPct());
    oled.print(F("%"));

    oled.setCursor(0, 40);
    oled.print(F("Bond: "));
    oled.print(pet.data.intimacy);

    oled.setCursor(0, 50);
    oled.print(F("Age: "));
    oled.print(pet.data.ageDays);
    oled.print(F("d"));

    oled.setCursor(80, 50);
    oled.print(F("[C]=back"));
  }
};

#endif // DISPLAY_H
