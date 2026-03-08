/**
 * tamagotchi.ino - Aritamaguchi Arduino Keychain Edition
 * =========================================================
 * A complete Tamagotchi pet system optimized for:
 *   - Arduino Nano / Uno (ATmega328P)
 *   - SSD1306 128×64 OLED (I²C)
 *   - 3-button interface
 *   - Optional passive buzzer
 *   - Coin cell or LiPo battery
 *
 * Required libraries (install via Library Manager):
 *   - Adafruit SSD1306  (>=2.5.0)
 *   - Adafruit GFX      (>=1.11.0)
 *
 * Wiring:
 *   OLED SDA  → A4 (Arduino Nano/Uno)
 *   OLED SCL  → A5
 *   OLED VCC  → 3.3V or 5V
 *   OLED GND  → GND
 *   BTN_A     → D2 + 10kΩ pull-up (or use INPUT_PULLUP)
 *   BTN_B     → D3 + 10kΩ pull-up
 *   BTN_C     → D4 + 10kΩ pull-up
 *   BUZZER    → D5 (optional, passive buzzer to GND)
 *
 * Power considerations for keychain form factor:
 *   - Arduino Nano uses ~19mA active (300h on 2xAAA)
 *   - With sleep mode: ~0.6µA sleep → weeks on coin cell
 *   - Display off during sleep saves ~8mA
 *
 * Memory usage (estimate):
 *   Flash: ~18KB / 32KB
 *   SRAM:  ~700B / 2KB
 *   EEPROM: 10B / 1KB
 *
 * Controls:
 *   A (short)  → cycle action menu  (Feed / Play / Clean)
 *   B (short)  → execute selected action
 *   B (hold 2s)→ enter settings menu
 *   C (short)  → toggle stats screen
 *   C (hold 2s)→ toggle sound
 *
 * For ESP8266/ESP32 variant (WiFi keychain):
 *   - Same code compiles on ESP8266 with minor pin changes
 *   - ESP8266 can sync time via NTP for real clock support
 *   - Enables cloud backup of pet save data
 */

#include <Wire.h>
#include "pet_ai.h"
#include "display.h"

// ─── globals ─────────────────────────────────────────────────────────────────

PetAI          pet;
DisplayManager display;

// Hold-button detection
static uint32_t btnBHoldStart = 0;
static bool     btnBHeld      = false;
static uint32_t btnCHoldStart = 0;
static bool     btnCHeld      = false;

#define HOLD_TIME_MS  2000UL

// ─── power management ────────────────────────────────────────────────────────
// Light sleep between frames to save power on battery-powered keychain.
// Wakes on TIMER interrupt every 16ms (~60fps max) or button press.
//
// For deep sleep (pet sleeping at night), use watchdog timer for 8s wakeups.

#include <avr/sleep.h>
#include <avr/power.h>

void enableLightSleep() {
  // Reduce clock to 8MHz when pet is sleeping (saves ~half power)
  // Comment out if using 3.3V to avoid BOD issues
  // clock_prescale_set(clock_div_2);
}

void disableLightSleep() {
  // clock_prescale_set(clock_div_1);
}

// ─── setup ───────────────────────────────────────────────────────────────────

void setup() {
  // Disable unused peripherals to save power
  power_adc_disable();
  power_spi_disable();
  power_usart0_disable();  // comment out if you need Serial for debugging

  // Seed random with floating analog pin
  randomSeed(analogRead(A0));

  // Init pet AI
  pet.begin();

  // Init display & buttons
  if (!display.begin()) {
    // OLED init failed — blink built-in LED as error indicator
    pinMode(LED_BUILTIN, OUTPUT);
    while (1) {
      digitalWrite(LED_BUILTIN, HIGH); delay(200);
      digitalWrite(LED_BUILTIN, LOW);  delay(200);
    }
  }
}

// ─── main loop ───────────────────────────────────────────────────────────────

void loop() {
  // ─ update pet AI
  pet.update();

  // ─ handle buttons
  handleButtons();

  // ─ draw frame
  display.draw(pet);
  display.checkDim();

  // ─ state change audio feedback
  if (pet.stateDirty && pet.soundEnabled()) {
    switch (pet.state) {
      case STATE_HAPPY:    playHappy(); break;
      case STATE_SLEEPING: playNote(BUZZER_PIN, 330, 100); break;
      case STATE_HUNGRY:   playNote(BUZZER_PIN, 220, 200); break;
      default: break;
    }
    pet.stateDirty = false;
  } else {
    pet.stateDirty = false;
  }

  // ─ light sleep to save power (16ms = ~60fps cap)
  // In a real keychain build, use proper sleep modes here
  delay(16);
}

// ─── button handling ─────────────────────────────────────────────────────────

void handleButtons() {
  uint32_t now = millis();

  // Read raw buttons (before debounce in DisplayManager)
  bool rawB = (digitalRead(BTN_B_PIN) == LOW);
  bool rawC = (digitalRead(BTN_C_PIN) == LOW);

  // B hold detection (settings)
  if (rawB) {
    if (!btnBHeld) { btnBHoldStart = now; btnBHeld = true; }
    else if (now - btnBHoldStart >= HOLD_TIME_MS) {
      btnBHeld = false;  // reset to prevent repeat
      showSettingsMenu();
      return;
    }
  } else {
    btnBHeld = false;
  }

  // C hold detection (toggle sound)
  if (rawC) {
    if (!btnCHeld) { btnCHoldStart = now; btnCHeld = true; }
    else if (now - btnCHoldStart >= HOLD_TIME_MS) {
      btnCHeld = false;
      pet.toggleSound();
      display.wakeUp();
      // visual feedback: invert display briefly
      display.oled.invertDisplay(true);
      delay(200);
      display.oled.invertDisplay(false);
      return;
    }
  } else {
    btnCHeld = false;
  }

  // Normal button handling via DisplayManager
  uint8_t action = display.handleButtons(pet);

  // Intimacy boost on any successful interaction
  if (action > 0) {
    display.wakeUp();
  }
}

// ─── settings menu ───────────────────────────────────────────────────────────

void showSettingsMenu() {
  display.oled.clearDisplay();
  display.oled.setTextSize(1);
  display.oled.setCursor(0, 0);
  display.oled.print(F("-- SETTINGS --"));

  display.oled.setCursor(0, 12);
  display.oled.print(F("A: Sound "));
  display.oled.print(pet.soundEnabled() ? F("ON") : F("OFF"));

  display.oled.setCursor(0, 22);
  display.oled.print(F("B: Reset pet"));

  display.oled.setCursor(0, 32);
  display.oled.print(F("C: Exit"));

  display.oled.display();

  // Wait for input
  uint32_t start = millis();
  while (millis() - start < 10000UL) {
    if (digitalRead(BTN_A_PIN) == LOW) {
      delay(50);
      if (digitalRead(BTN_A_PIN) == LOW) {
        pet.toggleSound();
        break;
      }
    }
    if (digitalRead(BTN_B_PIN) == LOW) {
      delay(50);
      if (digitalRead(BTN_B_PIN) == LOW) {
        // Confirm reset
        display.oled.clearDisplay();
        display.oled.setCursor(0, 20);
        display.oled.print(F("Hold B 3s to reset"));
        display.oled.display();
        uint32_t holdStart = millis();
        while (digitalRead(BTN_B_PIN) == LOW) {
          if (millis() - holdStart >= 3000UL) {
            pet.begin();  // reinit = soft reset
            EEPROM.write(EE_MAGIC, 0x00);  // invalidate save
            pet.data.flags = 0x03;
            break;
          }
        }
        break;
      }
    }
    if (digitalRead(BTN_C_PIN) == LOW) {
      delay(50); break;
    }
    delay(10);
  }

  display.wakeUp();
}
