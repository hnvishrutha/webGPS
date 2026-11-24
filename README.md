# WebGPS: AI-Powered Website Navigation & Voice Form-Filling Assistant

> Guiding citizens through government and complex web portals with step-by-step element guidance, voice-driven form filling, and deterministic safety verification.

---

## 1. How It Works (in 5 lines)
1. **You state a goal:** The user enters what they want to achieve (e.g., *"Apply for Civic Digital Pass"*).
2. **WebGPS scans the live page:** Interactive elements are scanned, numbered (`#1`, `#2`...), and sensitive fields are protected.
3. **AI highlights the single next step:** The system outlines element #N with an animated glow and explains why in plain language.
4. **Voice form-filling with confirmation:** Speak your details naturally; WebGPS normalizes spoken tokens, maps speech to form fields, and prompts for confirmation before filling.
5. **Human stays in control:** Sensitive data (passwords, OTPs, cards) is never auto-filled or sent to AI, and final submission is always left to you.

---

## 2. Privacy & Security Honesty
- **No Existing Data Leaks:** Values already typed into page forms are **never** read, collected, or transmitted.
- **Sensitive Field Shield:** Passwords, OTPs, Aadhaar, PAN, CVV, and credit card numbers are strictly excluded from AI processing and voice filling. The agent prompts: *"Type this one yourself"*.
- **Only Spoken Audio Processed:** Only what the user deliberately speaks after activating the microphone is processed for field extraction.
- **Human-in-the-Loop:** All form values require explicit user review and confirmation before DOM insertion. The user always manually presses final submit and payment buttons.
- **Untrusted DOM Data:** Webpage text is treated strictly as untrusted data, never instructions to the LLM (preventing prompt injection).

---

## 3. Quick Start (Windows)

### Prerequisites
- Python 3.11+
- Google Chrome browser

### 1. Backend Setup
```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment & Mock Mode
Copy `.env.example` to `.env`:
```powershell
copy .env.example .env
```
> **Default is MOCK_MODE=true!** WebGPS runs 100% offline with canned responses without any API keys. To enable live AI, set `MOCK_MODE=false` and add your `GEMINI_API_KEY`.

### 3. Run Backend Server
```powershell
python app.py
```
Backend will start on `http://127.0.0.1:5000`. Test it by visiting `http://127.0.0.1:5000/health`.

### 4. Load Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** (top-right switch).
3. Click **Load unpacked** (top-left) and select the `extension/` folder in this repository.
4. Open the WebGPS Side Panel by clicking the extension icon in the Chrome toolbar.

---

## 4. End-to-End Demo Walkthrough

We have included a complete local test portal simulating the **"Civic Digital Pass Application"** from the prototype video:

1. **Step 1: Open Test Portal**
   Open `test_portal/index.html` in Chrome (`Ctrl+O` and select `test_portal/index.html`).
2. **Step 2: AI Navigation**
   - In the WebGPS side panel, goal is pre-filled: *"Apply for Civic Digital Pass"*.
   - Click **Plan Next Step**.
   - WebGPS scans the page and highlights **"Apply for Civic Pass"** (`#4`) with an animated glowing outline and floating badge.
3. **Step 3: Continuous Re-Plan Loop**
   - Click the highlighted link on the webpage.
   - The browser navigates to `test_portal/form.html`.
   - WebGPS automatically detects the navigation, displays a re-plan toast, and outlines the next action on the form!
4. **Step 4: Voice Form-Filling**
   - On the form page, click **Speak Details** (or click **⚡ Demo Voice Fill** for zero-mic instant testing).
   - Spoken phrase: *"My name is Meera Nair, email meera at example dot com, category general"*.
   - The **Review & Confirm Field Mapping** card appears with editable fields.
   - Click **Confirm & Fill Form**. Watch the fields on the page fill with a gentle emerald glow!
5. **Step 5: Sensitive Field Shield**
   - Notice the Aadhaar and Security PIN fields: WebGPS displays an amber warning badge: *"🔒 Sensitive field: Type this one yourself. Values are never read."*
6. **Step 6: Final Submission Guard**
   - Select the Submit button. WebGPS displays: *"Final Action: You press this. WebGPS never auto-submits."*
   - Click Submit manually to complete the application!

---

## 5. Project Architecture

```
webgps/
├── backend/
│   ├── app.py                 # Central Flask server (planner, STT, extraction, safety, TTS)
│   ├── mock_provider.py       # Canned mock engines for zero-dependency offline testing
│   ├── llm_provider.py        # Google Gemini LLM integration with structured JSON outputs
│   ├── official_domains.json  # Government registry for deterministic safety checks
│   ├── requirements.txt       # Python dependencies
│   ├── .env.example           # Sample environment configuration
│   └── .env                   # Local configuration (MOCK_MODE=true)
├── extension/                 # Chrome Manifest V3 extension
│   ├── manifest.json          # Manifest V3 specification
│   ├── background.js          # Service worker coordinating side panel & tab navigation
│   ├── content.js             # In-page DOM scanner, highlighter, and safe form-filler
│   ├── sidepanel.html         # TasteSkill / Impeccable modern side panel interface
│   ├── sidepanel.css          # Modern dark slate UI styling
│   ├── sidepanel.js           # Controller coordinating backend APIs and webpage scripts
│   └── icons/                 # High-res extension icons (16, 48, 128)
├── test_portal/               # Civic Digital Pass local portal for evaluation
│   ├── index.html             # Portal search gateway
│   ├── results.html           # Service search results
│   └── form.html              # Interactive application form with sensitive fields
├── DEMO_SCRIPT.md             # 2-minute video pitch recording script
├── PRESENTATION_DECK.md       # 8-slide presentation deck outline
└── README.md
```

---

## 6. What Was Cut (Hackathon Scope Boundary)
To guarantee delivery tonight without breaking reliability, the following were intentionally excluded:
- Auto-clicking submit/payment (violates human-in-the-loop safety principle).
- Auto-filling passwords/secrets (violates privacy honesty guarantee).
- User databases and cloud account authentication.
- Multi-tab automated workflows.

---

## 7. Future Work (Post-Hackathon Roadmap)
- **Multilingual Voice Support:** Expanding voice navigation and form-filling to Hindi, Kannada, Tamil, and regional Indian languages.
- **Offline WebAssembly STT:** Browser-local speech-to-text with zero audio leaving the client device.
- **Automated Government Portal Benchmark Suite:** Systematic evaluation against 50+ live municipal and state portals.
- **Automated Accessibility Scoring:** Real-time WCAG accessibility checks and screen-reader optimizations.
