# WebGPS: AI-Powered Website Navigation & Voice Form-Filling Assistant

> Guiding citizens through government and complex portals with step-by-step element guidance, voice-driven form filling, and safety verification.

---

## 1. How It Works (in 5 lines)
1. **You state a goal:** The user enters what they want to achieve (e.g., "Apply for Civic Digital Pass").
2. **WebGPS scans the live page:** Interactive elements are scanned and assigned clean numeric badges.
3. **AI highlights the single next step:** The system outlines element #N and explains why in plain language.
4. **Voice form-filling with confirmation:** Speak your details naturally; WebGPS maps speech to form fields and prompts for confirmation before filling.
5. **Human stays in control:** Sensitive data (passwords, OTPs, cards) is never auto-filled or sent to AI, and final submission is always left to you.

---

## 2. Privacy & Security Honesty
- **No Existing Data Leaks:** Values already typed into page forms are never read, collected, or transmitted.
- **Sensitive Field Shield:** Passwords, OTPs, Aadhaar, PAN, CVV, and credit card numbers are strictly excluded from AI processing and voice filling. The agent prompts: *"Type this one yourself"*.
- **Only Spoken Audio Processed:** Only what the user deliberately speaks after activating the microphone is processed for field extraction.
- **Human-in-the-Loop:** All form values require explicit user confirmation before DOM insertion. The user always manually presses final submit and payment buttons.

---

## 3. Quick Start (Windows)

### Prerequisites
- Python 3.11+
- Google Chrome browser

### 1. Backend Setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment & Mock Mode
Copy `.env.example` to `.env`:
```bash
copy .env.example .env
```
By default, `MOCK_MODE=true` is enabled! This allows testing the full navigation and form-filling loop offline with canned responses without any API keys.

### 3. Run Backend Server
```bash
python app.py
```
Backend will start on `http://127.0.0.1:5000`. Test it by visiting `http://127.0.0.1:5000/health`.

### 4. Load Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** (top-right switch).
3. Click **Load unpacked** and select the `extension/` folder.
4. Open the WebGPS Side Panel from the Chrome toolbar.

---

## 4. Project Structure
```
webgps/
├── backend/
│   ├── app.py                 # Flask server coordinating planner, STT, and safety
│   ├── mock_provider.py       # Canned mock responses for zero-dependency testing
│   ├── official_domains.json  # Government registry for safety checks
│   ├── requirements.txt       # Python dependencies
│   ├── .env.example           # Sample environment configuration
│   └── .env                   # Local configuration (MOCK_MODE=true)
├── extension/                 # Chrome Manifest V3 extension
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── sidepanel.html
│   └── sidepanel.js
├── test_portal/               # Civic Digital Pass local portal for evaluation
│   ├── index.html
│   ├── results.html
│   └── form.html
└── README.md
```

---

## 5. Future Work (Post-Hackathon Roadmap)
- Real portal multi-lingual voice navigation (Hindi, Kannada, Tamil).
- Offline speech recognition via WebAssembly.
- Automated evaluation suite against high-traffic government portals.
- Automated accessibility scoring.
