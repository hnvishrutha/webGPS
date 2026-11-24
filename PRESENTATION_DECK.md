# WebGPS Pitch Deck Outline

> **WebGPS – AI-Powered Website Navigation & Voice Form-Filling Assistant**  
> *Guidance, Voice Form-Filling, and Safety Verification with Human-in-the-Loop Control*

---

## Slide 1: Title & Vision
- **Header:** WebGPS: The Intelligent Navigator for the Web
- **Tagline:** Turning labyrinthine citizen and service portals into clear, voice-assisted journeys.
- **Presenter:** Hackathon Team WebGPS
- **Key Takeaway:** AI guides and maps, but the human always stays in complete control.

---

## Slide 2: The Problem
- **Portal Complexity:** Public utilities, municipal gateways, and services feature hundreds of links, dense jargon, and non-intuitive layouts.
- **Form Fatigue:** Lengthy digital forms lead to dropped applications and user frustration.
- **Phishing & Deceptive Sites:** Citizens frequently fall prey to look-alike scam portals that mimic government styling.
- **Loss of Agency:** Aggressive automation bots take control away from users, creating liability and trust issues.

---

## Slide 3: The Solution – WebGPS
- **Live DOM Element Numbering:** Scans active page elements and numbers them cleanly (`#1`, `#2`...).
- **Highlight-Only Step Guidance:** AI selects a single element with clear rationale; outlines it with an animated focus ring.
- **Voice-Driven Form Filling:** Speak natural details; AI maps speech to fields and presents an editable confirmation card.
- **Deterministic Safety Inspector:** Cross-references live domains against authorized registries (`.gov.in`) and checks protocol security.

---

## Slide 4: System Architecture & The Guidance Loop
```
  [ Chrome Webpage ]  <--- (Highlight Overlay) --- [ Content Script ]
          |                                               ^
     (DOM Scan)                                     (User Click)
          v                                               |
  [ WebGPS Side Panel ] ---> POST /plan ---> [ Flask Backend Server ]
          ^                                        |
          |--- (Validated Next Step ID) <----------+
```
- **Untrusted DOM Data:** Webpage text is treated strictly as data, never instructions (prompt injection immune).
- **ID Validation Contract:** Backend validator guarantees selected element IDs exist in the live page scan.
- **Continuous Re-Plan Loop:** Navigation events trigger immediate re-scanning and step updates.

---

## Slide 5: Voice Form-Filling with Human Confirmation
- **Spoken Utterance:** *"My name is Meera Nair, email meera at example dot com, category general"*.
- **Token Normalization:** Speech-to-text + LLM converts spoken tokens into valid email and dropdown options.
- **Review Card:** User reviews exact values with inline editing before anything touches the page.
- **DOM Insertion:** Dispatches native `input` and `change` events for seamless compatibility across modern frameworks.

---

## Slide 6: Privacy Honesty & Security Guarantees
- **No Existing Data Leaks:** Values already typed into page forms are NEVER extracted or transmitted.
- **Secret Shield:** Passwords, OTPs, CVV, and Aadhaar/PAN numbers are strictly excluded from AI processing.
  - The AI explicitly advises: *"Type this one yourself"*.
- **Human-in-the-Loop Final Action:** WebGPS NEVER auto-clicks submission or payment buttons. The user always performs the final action.

---

## Slide 7: Resilience & Offline Mock Mode
- **Zero-Dependency Guarantee:** Built-in `MOCK_MODE=true` allows full end-to-end evaluation with canned responses without any API keys.
- **Live Providers:** Supports Google Gemini API for navigation decisions and field extraction, plus ElevenLabs for speech synthesis and transcription.
- **Graceful Fallback:** Automatic fallback from live APIs to mock engines ensures demo never fails.

---

## Slide 8: Future Roadmap
1. **Multilingual Voice Support:** Expanding voice navigation to Indian vernacular languages (Hindi, Kannada, Tamil, Telugu).
2. **Offline WebAssembly STT:** Browser-local speech transcription with zero audio leaving the device.
3. **Automated Portal Evaluation Suite:** Continuous testing suite benchmarking high-traffic public service portals.
4. **Universal Accessibility Standards:** Full screen-reader and keyboard shortcut coordination.
