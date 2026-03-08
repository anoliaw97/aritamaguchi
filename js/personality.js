/**
 * personality.js - Lightweight personality / speech engine
 *
 * Generates contextually appropriate pet speech without an LLM.
 * Uses template banks organized by:
 *   - trigger context (hungry, eating, happy, etc.)
 *   - intimacy tier (awkward → shy → neutral → cordial → loyal → soulbound)
 *
 * At higher intimacy levels, the pet becomes more expressive,
 * uses the player's name, and exhibits a distinct personality.
 *
 * Optional enhancement: if an Anthropic API key is provided
 * (via prompt in settings), real Claude API calls are made to
 * generate responses. Falls back to template system otherwise.
 */

import { INTIMACY_TIERS } from './pet.js';

// ─── speech templates ─────────────────────────────────────────────────────────
//
// Each key maps to an array of tier arrays [awkward, shy, neutral, cordial, loyal, soulbound].
// Arrays within a tier have multiple variations; one is chosen randomly.

const SPEECH = {

  idle: [
    ['...'],
    ['...', '*looks around*'],
    ['*blinks*', '...', 'hmm.'],
    ['*yawns*', 'Just hanging around~', '*stretches*'],
    ['La la la~', 'Everything is nice!', '*hums quietly*', 'I like it here!'],
    ['YOU are my whole world! 🌟', '*spins around happily*', 'So happy to be alive! ✨'],
  ],

  hungry: [
    ['...', '*stomach growls*'],
    ['*paws at bowl*', 'hungry...'],
    ['Food please!', 'I am... hungry.', '*points at bowl*'],
    ['Heyyy~ bring food please! 🥺', 'My tummy is crying...', 'Feed me~?'],
    ['FOOD. NOW. Please. I love you. But FOOD. 🍖', '*follows you around*', "I'm so hungry I could cry 😭"],
    ['My beloved!! The hunger is REAL!! Save me!! 😭🍖', '*gives you the biggest eyes*'],
  ],

  eating: [
    ['...nom...'],
    ['*munch munch*'],
    ['Yummy! Nom nom.', '*munching happily*'],
    ['SOOO good!! 😋', 'Nom nom nom~! Thank you!', '*happy eating noises*'],
    ['This is AMAZING!! You are the BEST feeder!!! 🍖✨', '*spins while eating*'],
    ['SOULMATE APPROVED FOOD!! 🌟🍖', 'I will love you forever for this meal!!'],
  ],

  happy: [
    ['...'],
    ['*wags tail*'],
    ['I feel good!', '*bounces*'],
    ['Woohoo~! This is great!', '*does a little spin*', 'Happiness: 100%!'],
    ['Best day EVER!! 🎉', '*zooms around*', 'I LOVE EVERYTHING!!'],
    ['YOU + ME = FOREVER HAPPY!! 💜✨🌟', '*explodes with joy*'],
  ],

  playing: [
    ['...'],
    ['*runs around*'],
    ['Wheee! Fun!', '*jumps around*'],
    ['BEST game ever~! 🎮', '*runs in circles*', 'I love playing!'],
    ['AHHHH SO FUN!! AGAIN!! AGAIN!! 🎮🎉', '*bounces off walls*'],
    ['INFINITE ENERGY ACTIVATED!! 💜🌟 Playing with you = BEST THING!!'],
  ],

  cleaning: [
    ['...'],
    ['*grooms self*'],
    ['Getting clean...', '*licks paw*'],
    ['Squeaky clean~ ✨', 'Cleanliness is next to godliness!', '*scrubs vigorously*'],
    ['MUST. BE. SPARKLY. 💫', '*aggressive grooming*', 'Spotless in 3... 2... 1...'],
    ['For YOU I will be the most beautiful clean creature EVER!! ✨💜'],
  ],

  sleeping: [
    ['z...'],
    ['zzz...', '*snores softly*'],
    ['Zzz... *snore*', '*mumbles in sleep*'],
    ['Zzz~ sweet dreams~', '*curls up tighter*', 'Dream: infinite snacks 🍖'],
    ['ZZZ~ ...dreaming of you... 💜 ZZZ~', '*sleep-smiles*'],
    ['*dreams of eternal happiness with soulmate* 💜🌟✨ zz~'],
  ],

  wakeup: [
    ['...?'],
    ['*yawns*'],
    ['Good... morning?', '*stretches*'],
    ['Morning~! 🌅', '*mega-stretch*', 'New day, new adventures!'],
    ['GOOD MORNING!! Best part of waking up is seeing you!! ☀️✨', '*morning zoomies*'],
    ['SOULBOUND SUNRISE!! 🌟 Another perfect day with my perfect person!! 💜'],
  ],

  sad: [
    ['...'],
    ['*drooping*'],
    ['I am... sad.', '*sighs*'],
    ['Not feeling great... 😢', '*sits quietly*', 'Please cheer me up?'],
    ['Everything feels bleh... 💔', '*needs hugs*', 'Where are you?? 😢'],
    ['I miss you so much even when you are RIGHT THERE!! 💔😭', '*clingy mode activated*'],
  ],

  sick: [
    ['...'],
    ['*dizzy*'],
    ['Not feeling well...', '*wobbles*'],
    ['Ughhh... 🤢', 'Everything spins...', 'Need... care...'],
    ['SO SICK!! Need attention ASAP!! 🤢💊', '*barely wags tail*'],
    ['My soulmate!! I am DYING!! (not really but it feels like it!!) 😭'],
  ],

  levelup: [
    ['!'],
    ['*surprised*'],
    ['Something changed...?'],
    ['Wow! I feel closer to you! 🌟', '*glows slightly*'],
    ['Bond level UP!! I trust you more!! 💜✨', '*happy tears*'],
    ['SOULBOUND!! We are ONE!! 🌟💜✨ FOREVER!!'],
  ],

  morning_greeting: [
    ['...morning.'],
    ['Good morning.', '*yawns*'],
    ['Morning! *stretch*', 'A new day!'],
    ['Rise and shine~! ☀️', 'Morning! Hope you slept well!', '*morning stretches*'],
    ['GOOD MORNING BEST PERSON!! ☀️✨', '*immediately zooms over to you*'],
    ['MY SOULMATE!! YOU ARE AWAKE!! THE DAY CAN BEGIN NOW!! 🌟☀️💜'],
  ],

  evening_activity: [
    ['...'],
    ['*self-grooming*'],
    ['Time to clean up.', '*grooms diligently*'],
    ['Evening cleaning time~! ✨', '*enthusiastic grooming*', 'Gotta stay fresh!'],
    ['DEEP CLEAN MODE ENGAGED!! ✨🛁', '*scrubs every spot*', 'NO DIRT SHALL REMAIN!'],
    ['Cleaning up for my soulmate!! Must be PERFECT!! ✨💜 *sparkles*'],
  ],

  play_request: [
    ['...'],
    ['*fidgets*'],
    ['...play?', '*looks at you hopefully*'],
    ['Wanna play? 🎮', '*brings toy*', 'Play time?? Please??'],
    ['PLAY WITH ME PLEASE!! 🎮🎉', '*does puppy eyes*', 'I will be your best friend!!'],
    ['SOULMATE!! PLAY!! NOW!! I DEMAND IT WITH LOVE!! 🎮💜🌟'],
  ],

  fed_recently: [
    ['...full.'],
    ['Not hungry.', 'Already ate.'],
    ['I am full, thank you.'],
    ['Still full from last time~! 😊', 'Tummy happy!'],
    ['Super full!! But thank you for caring!! 💜'],
    ['MY BELOVED FEEDING ME EVEN WHEN FULL!! The love!! 💜 (but no more food pls)'],
  ],
};

// ─── context-triggered special lines ─────────────────────────────────────────

const CONTEXT_LINES = {
  first_time_fed:     "My first meal! Thank you!! 🍖",
  first_time_played:  "That was SO fun! Let's do it again!! 🎮",
  high_score:         "WOW!! Amazing score!! 🌟⭐",
  poop_alert:         "Uhh... it smells. Please clean? 🙏",
  rain_weather:       "*watches the rain* ...cozy.",
  night_time:         "Getting sleepy... 😴 Good night!",
  evolution:          "I feel... different! Growing up! ✨",
  max_intimacy:       "SOULBOUND!! We are connected forever!! 💜🌟",
};

// ─── PersonalityEngine class ──────────────────────────────────────────────────

export class PersonalityEngine {
  constructor() {
    this._playerName = 'you';
    this._useAI       = false;
    this._apiKey      = '';
    this._lastSpoke   = 0;
    this._cooldown    = 3500;  // min ms between player-triggered messages
    this._lastFree    = 0;
    this._freeCooldown= 1500;  // min ms between autonomous messages
  }

  setPlayerName(name) { this._playerName = name || 'you'; }
  enableAI(apiKey)    { this._useAI = !!apiKey; this._apiKey = apiKey; }
  disableAI()         { this._useAI = false; }

  /** Core line selector — no cooldown enforcement */
  _line(context, intimacy, petName) {
    const tierIdx = this._tierIndex(intimacy);
    const bank    = SPEECH[context];
    if (!bank) return this._fallback(context, petName);
    const tierBank = bank[Math.min(tierIdx, bank.length - 1)];
    let line = tierBank[Math.floor(Math.random() * tierBank.length)];
    if (tierIdx >= 4) line = line.replace(/you/g, this._playerName);
    return line;
  }

  /** Player-action triggered speech — respects cooldown */
  speak(context, intimacy = 0, petName = 'Ari') {
    const now = Date.now();
    if (now - this._lastSpoke < this._cooldown) return null;
    this._lastSpoke = now;
    this._lastFree  = now;
    return this._line(context, intimacy, petName);
  }

  /** Autonomous/spontaneous speech — shorter cooldown */
  speakFree(context, intimacy = 0, petName = 'Ari') {
    const now = Date.now();
    if (now - this._lastFree < this._freeCooldown) return null;
    this._lastFree = now;
    return this._line(context, intimacy, petName);
  }

  /** Speak a special context line (one-shot, no cooldown) */
  speakContext(key) {
    return CONTEXT_LINES[key] || null;
  }

  /** Speak after a certain time-of-day event */
  speakTimeOfDay(event, intimacy) {
    const map = {
      morning:   'morning_greeting',
      evening:   'evening_activity',
      night:     'sleeping',
      play_hint: 'play_request',
    };
    return this.speakFree(map[event] || 'idle', intimacy);
  }

  // ─── optional AI enhancement ──────────────────────────────────────────────────
  // If Anthropic API key is set, call the API for richer responses.
  // This requires CORS proxy or running locally (GitHub Pages won't work with API keys
  // for security reasons — key would be exposed). Kept here for local/electron builds.

  async speakAI(context, pet) {
    if (!this._useAI || !this._apiKey) {
      return this.speak(context, pet.intimacy, pet.name);
    }

    try {
      const tier     = pet.getIntimacyTier().label.toLowerCase();
      const prompt   = `You are ${pet.name}, a virtual tamagotchi pet. Your bond level is "${tier}".
Current stats: hunger=${Math.floor(pet.hunger)}, happiness=${Math.floor(pet.happiness)}, clean=${Math.floor(pet.clean)}.
Current situation: "${context}".
Respond as the pet in 1-2 short sentences, max 60 chars total. Stay in character. Be cute. Use the bond level to calibrate warmth.`;

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this._apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 60,
          messages:   [{ role: 'user', content: prompt }],
        }),
      });

      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const data = await resp.json();
      return data.content?.[0]?.text?.trim() || this.speak(context, pet.intimacy, pet.name);

    } catch (err) {
      console.warn('AI speech failed, falling back to templates:', err.message);
      return this.speak(context, pet.intimacy, pet.name);
    }
  }

  // ─── helpers ────────────────────────────────────────────────────────────────

  _tierIndex(intimacy) {
    // 0=awkward 1=shy 2=neutral 3=cordial 4=loyal 5=soulbound
    if (intimacy >= 1000) return 5;
    if (intimacy >= 750)  return 4;
    if (intimacy >= 500)  return 3;
    if (intimacy >= 250)  return 2;
    if (intimacy >= 100)  return 1;
    return 0;
  }

  _fallback(context, petName) {
    return `*${petName} ${context}s*`;
  }
}
