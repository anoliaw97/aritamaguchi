/**
 * pet_ai.h - Pet state machine & AI for Arduino
 *
 * Memory budget (ATmega328P):
 *   SRAM:  ~200 bytes for PetState struct
 *   Flash: ~4KB for this module
 *   EEPROM: 12 bytes for persistent save
 *
 * Stats stored as uint8_t (0-255 mapped to 0-100 via /2.55).
 * Using fixed-point millis() math avoids floating point overhead.
 *
 * Behavior: simplified behavior tree vs the PC version
 *   Priority: Emergency > Sleep > TimeSchedule > RandomEvent > Idle
 */

#ifndef PET_AI_H
#define PET_AI_H

#include <Arduino.h>
#include <EEPROM.h>

// ─── EEPROM layout (12 bytes) ─────────────────────────────────────────────────
#define EE_MAGIC    0    // byte: 0xA7 = valid save
#define EE_HUNGER   1    // byte: 0-255
#define EE_HAPPY    2    // byte: 0-255
#define EE_CLEAN    3    // byte: 0-255
#define EE_INTIMACY_L 4  // uint16_t low  (0-1000 scaled ×25 → uint16_t fits)
#define EE_INTIMACY_H 5  // uint16_t high
#define EE_AGE      6    // uint16_t: days, low
#define EE_AGE_H    7    // uint16_t: days, high
#define EE_FLAGS    8    // bitfield: bit0=sound, bit1=alive
#define EE_CHECKSUM 9    // xor checksum
#define EEPROM_MAGIC 0xA7

// ─── state enum ──────────────────────────────────────────────────────────────
enum PetState : uint8_t {
  STATE_IDLE     = 0,
  STATE_HAPPY    = 1,
  STATE_HUNGRY   = 2,
  STATE_EATING   = 3,
  STATE_SLEEPING = 4,
  STATE_CLEANING = 5,
  STATE_SAD      = 6,
  STATE_EXCITED  = 7,
  NUM_STATES
};

// ─── pet data structure ───────────────────────────────────────────────────────
struct PetData {
  uint8_t  hunger;      // 0-200 (÷2 for percentage)
  uint8_t  happiness;
  uint8_t  clean;
  uint8_t  energy;
  uint16_t intimacy;    // 0-1000
  uint16_t ageDays;
  uint8_t  poopCount;   // 0-3
  uint8_t  flags;       // bit0=sound, bit1=initialized
};

// ─── string table (PROGMEM to save SRAM) ─────────────────────────────────────
static const char STR_FEED[]    PROGMEM = "Feed me!";
static const char STR_PLAY[]    PROGMEM = "Play?";
static const char STR_CLEAN[]   PROGMEM = "Clean pls";
static const char STR_HAPPY[]   PROGMEM = "YAY!";
static const char STR_SLEEP[]   PROGMEM = "Zzz...";
static const char STR_HUNGRY[]  PROGMEM = "Starving!";
static const char STR_SAD[]     PROGMEM = "...";
static const char STR_EAT[]     PROGMEM = "Nom nom!";
static const char STR_POOP[]    PROGMEM = "Clean me!";
static const char STR_BOND1[]   PROGMEM = "Bond: SHY";
static const char STR_BOND2[]   PROGMEM = "Bond: OK";
static const char STR_BOND3[]   PROGMEM = "Bond: GOOD";
static const char STR_BOND4[]   PROGMEM = "Bond: BEST";

// ─── PetAI class ─────────────────────────────────────────────────────────────
class PetAI {
public:
  PetData   data;
  PetState  state;
  PetState  prevState;
  bool      stateDirty;    // true when state just changed
  char      statusMsg[12]; // short message for OLED status line

  // timers (millis-based)
  uint32_t  _lastTick;
  uint32_t  _stateTimer;   // how long current state lasts
  uint32_t  _randomTimer;  // next random event
  uint32_t  _poopTimer;
  uint32_t  _saveTimer;

  uint8_t   animFrame;
  uint16_t  frameTick;     // counts up for animation timing

  // ─── init ────────────────────────────────────────────────────────────────

  void begin() {
    if (!load()) {
      // fresh start
      data.hunger    = 200;
      data.happiness = 200;
      data.clean     = 200;
      data.energy    = 200;
      data.intimacy  = 0;
      data.ageDays   = 0;
      data.poopCount = 0;
      data.flags     = 0x03;  // sound+alive
    }
    state      = STATE_IDLE;
    prevState  = STATE_IDLE;
    stateDirty = true;
    _lastTick  = millis();
    _stateTimer  = 0;
    _randomTimer = 20000UL;
    _poopTimer   = 180000UL;
    _saveTimer   = 60000UL;
    animFrame  = 0;
    frameTick  = 0;
    setMsg(STR_HAPPY);
  }

  // ─── EEPROM save/load ────────────────────────────────────────────────────

  void save() {
    EEPROM.write(EE_MAGIC,    EEPROM_MAGIC);
    EEPROM.write(EE_HUNGER,   data.hunger);
    EEPROM.write(EE_HAPPY,    data.happiness);
    EEPROM.write(EE_CLEAN,    data.clean);
    EEPROM.write(EE_INTIMACY_L, (uint8_t)(data.intimacy & 0xFF));
    EEPROM.write(EE_INTIMACY_H, (uint8_t)(data.intimacy >> 8));
    EEPROM.write(EE_AGE,      (uint8_t)(data.ageDays & 0xFF));
    EEPROM.write(EE_AGE_H,    (uint8_t)(data.ageDays >> 8));
    EEPROM.write(EE_FLAGS,    data.flags);
    // simple XOR checksum
    uint8_t ck = EEPROM_MAGIC ^ data.hunger ^ data.happiness ^ data.clean ^ data.flags;
    EEPROM.write(EE_CHECKSUM, ck);
  }

  bool load() {
    if (EEPROM.read(EE_MAGIC) != EEPROM_MAGIC) return false;
    uint8_t h  = EEPROM.read(EE_HUNGER);
    uint8_t ha = EEPROM.read(EE_HAPPY);
    uint8_t c  = EEPROM.read(EE_CLEAN);
    uint8_t fl = EEPROM.read(EE_FLAGS);
    uint8_t ck = EEPROM.read(EE_CHECKSUM);
    if ((EEPROM_MAGIC ^ h ^ ha ^ c ^ fl) != ck) return false;

    data.hunger    = h;
    data.happiness = ha;
    data.clean     = c;
    data.energy    = 200;  // reset energy on boot
    data.flags     = fl;
    data.intimacy  = (uint16_t)EEPROM.read(EE_INTIMACY_L) |
                     ((uint16_t)EEPROM.read(EE_INTIMACY_H) << 8);
    data.ageDays   = (uint16_t)EEPROM.read(EE_AGE) |
                     ((uint16_t)EEPROM.read(EE_AGE_H) << 8);
    data.poopCount = 0;
    return true;
  }

  // ─── player actions ──────────────────────────────────────────────────────

  bool feed() {
    if (state == STATE_SLEEPING) return false;
    if (data.hunger >= 200)     return false;
    data.hunger    = min(200, (int)data.hunger + 60);
    data.happiness = min(200, (int)data.happiness + 10);
    if (data.intimacy < 1000) data.intimacy += 8;
    setState(STATE_EATING, 3000);
    setMsg(STR_EAT);
    return true;
  }

  bool play() {
    if (state == STATE_SLEEPING) return false;
    if (data.energy < 30)        return false;
    if (data.hunger < 20)        return false;
    data.happiness = min(200, (int)data.happiness + 40);
    data.energy    = max(0,   (int)data.energy    - 40);
    data.hunger    = max(0,   (int)data.hunger    - 16);
    if (data.intimacy < 1000) data.intimacy += 12;
    setState(STATE_HAPPY, 4000);
    setMsg(STR_HAPPY);
    return true;
  }

  bool clean() {
    if (state == STATE_SLEEPING) return false;
    if (data.clean >= 190)       return false;
    data.clean     = min(200, (int)data.clean     + 80);
    data.happiness = min(200, (int)data.happiness + 16);
    if (data.intimacy < 1000) data.intimacy += 5;
    data.poopCount = 0;
    setState(STATE_CLEANING, 3000);
    setMsg(STR_CLEAN);
    return true;
  }

  // ─── main update ─────────────────────────────────────────────────────────

  void update() {
    uint32_t now = millis();
    uint32_t dt  = now - _lastTick;
    _lastTick    = now;

    // animation tick (60ms per frame)
    frameTick += dt;
    if (frameTick >= 500) {
      frameTick  = 0;
      animFrame  = (animFrame + 1) % 2;
    }

    // ─ stat decay (per ms, scaled)
    // Hunger decays ~1 unit per minute (200 units / 200 min = ~1000ms per unit)
    static uint32_t decayAcc = 0;
    decayAcc += dt;
    if (decayAcc >= 1000) {
      decayAcc -= 1000;
      _decayStats();
    }

    // ─ state lock
    if (_stateTimer > 0) {
      if (dt >= _stateTimer) _stateTimer = 0;
      else _stateTimer -= dt;
      if (_stateTimer > 0) return;  // still in locked state
    }

    // ─ behavior tree
    _runAI();

    // ─ random events
    if (_randomTimer > 0) _randomTimer -= min(dt, _randomTimer);
    if (_randomTimer == 0) {
      _triggerRandom();
      _randomTimer = 15000UL + (uint32_t)(random(0, 20000));
    }

    // ─ poop timer
    if (_poopTimer > 0) _poopTimer -= min(dt, _poopTimer);
    if (_poopTimer == 0) {
      _poopTimer = 180000UL + (uint32_t)(random(0, 180000));
      if (data.poopCount < 3) {
        data.poopCount++;
        if (data.clean > 20) data.clean -= 20;
        if (data.happiness > 10) data.happiness -= 10;
        setMsg(STR_POOP);
      }
    }

    // ─ auto-save
    if (_saveTimer > 0) _saveTimer -= min(dt, _saveTimer);
    if (_saveTimer == 0) {
      save();
      _saveTimer = 60000UL;
    }
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  uint8_t hungerPct()    const { return data.hunger    / 2; }
  uint8_t happinessPct() const { return data.happiness / 2; }
  uint8_t cleanPct()     const { return data.clean     / 2; }
  uint8_t energyPct()    const { return data.energy    / 2; }

  uint8_t intimacyTier() const {
    if (data.intimacy >= 750) return 4;  // loyal
    if (data.intimacy >= 500) return 3;  // cordial
    if (data.intimacy >= 250) return 2;  // neutral
    if (data.intimacy >= 100) return 1;  // shy
    return 0;                             // awkward
  }

  bool soundEnabled() const { return (data.flags & 0x01) != 0; }
  void toggleSound()  { data.flags ^= 0x01; }

private:
  // ─── state management ────────────────────────────────────────────────────

  void setState(PetState s, uint32_t durationMs = 0) {
    if (s != state) {
      prevState  = state;
      state      = s;
      stateDirty = true;
    }
    _stateTimer = durationMs;
  }

  void setMsg(const char* progmemStr) {
    strncpy_P(statusMsg, progmemStr, sizeof(statusMsg) - 1);
    statusMsg[sizeof(statusMsg) - 1] = '\0';
  }

  // ─── stat decay ──────────────────────────────────────────────────────────

  void _decayStats() {
    bool sleeping = (state == STATE_SLEEPING);

    // hunger: ~1 unit/min (2 units = 1%)
    if (data.hunger > 0) data.hunger--;

    // happiness: slower
    if (!sleeping && data.happiness > 0 && (random(0, 3) == 0)) data.happiness--;

    // cleanliness: very slow
    if (data.clean > 0 && (random(0, 5) == 0)) data.clean--;

    // energy
    if (sleeping) {
      if (data.energy < 200) data.energy++;
      if (data.energy < 200) data.energy++;  // faster recovery
    } else if (state == STATE_HAPPY && data.energy > 0) {
      data.energy--;
    }

    // intimacy drift
    if (data.hunger < 20 || data.happiness < 20) {
      if (data.intimacy > 0 && (random(0, 20) == 0)) data.intimacy--;
    } else if (data.hunger > 100 && data.happiness > 100 && data.clean > 100) {
      if (data.intimacy < 1000 && (random(0, 200) == 0)) data.intimacy++;
    }
  }

  // ─── behavior tree (simplified) ──────────────────────────────────────────

  void _runAI() {
    // 1. Emergency
    if (data.hunger < 10) {
      setState(STATE_HUNGRY);
      setMsg(STR_HUNGRY);
      return;
    }
    if (data.happiness < 10) {
      setState(STATE_SAD);
      setMsg(STR_SAD);
      return;
    }

    // 2. Energy / sleep
    if (data.energy < 20 && state != STATE_SLEEPING) {
      setState(STATE_SLEEPING);
      setMsg(STR_SLEEP);
      return;
    }
    if (state == STATE_SLEEPING) {
      if (data.energy >= 190) setState(STATE_IDLE);
      return;
    }

    // 3. Hunger warning
    if (data.hunger < 60 && state == STATE_IDLE) {
      setState(STATE_HUNGRY);
      setMsg(STR_FEED);
      return;
    }

    // 4. Default to idle
    if (state == STATE_HUNGRY && data.hunger >= 80) setState(STATE_IDLE);
    if (state == STATE_SAD    && data.happiness >= 60) setState(STATE_IDLE);
  }

  // ─── random events ───────────────────────────────────────────────────────

  void _triggerRandom() {
    if (state == STATE_SLEEPING || _stateTimer > 0) return;
    if (data.hunger < 20) return;

    uint8_t r = random(0, 6);
    switch (r) {
      case 0:
      case 1:
        // self-clean
        setState(STATE_CLEANING, 3000);
        if (data.clean < 200) data.clean += 10;
        setMsg(STR_CLEAN);
        break;
      case 2:
        // happy dance (if enough happiness)
        if (data.happiness > 80) {
          setState(STATE_HAPPY, 3000);
          setMsg(STR_HAPPY);
        }
        break;
      case 3:
        // excited jump (high intimacy)
        if (data.intimacy >= 250) {
          setState(STATE_EXCITED, 2500);
          setMsg(STR_HAPPY);
        }
        break;
      default:
        // idle, nothing
        break;
    }
  }
};

#endif // PET_AI_H
