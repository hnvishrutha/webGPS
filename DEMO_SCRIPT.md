# WebGPS: 2-Minute Demo Video Pitch Script

**Duration:** ~2 minutes  
**Goal:** Demonstrate AI-guided website navigation, voice form-filling with human confirmation, deterministic safety verification, and strict privacy controls.

---

### Scene 1: The Problem (0:00 - 0:15)
- **Visual:** Screen shows cluttered government service portal with hundreds of confusing links, plus a news headline about citizen phishing scams.
- **Narrator (Pitch):**
  > "Millions of citizens struggle to navigate complex government portals, often getting stuck on lengthy forms or falling prey to deceptive look-alike websites.
  > Today, we're introducing **WebGPS** — the AI assistant that numbers real page elements, highlights every next step, and fills forms through voice while ensuring the human always stays in complete control."

---

### Scene 2: Stating the Goal & Automatic Navigation (0:15 - 0:40)
- **Visual:** User opens the WebGPS side panel on `test_portal/index.html`. The goal is set to *"Apply for Civic Digital Pass"*. User clicks **Plan Next Step**.
- **Action:** WebGPS scans the live page, assigns numeric badges, and highlights `#4: Apply for Civic Pass` with a glowing animated outline and callout badge.
- **Side Panel:** Shows reason: *"Click 'Apply for Civic Pass' to begin your pass application."*
- **Continuous Re-Plan Loop:** User clicks the link. The page navigates to `test_portal/form.html`. WebGPS automatically detects navigation, re-plans, and highlights the next step without any extra clicks!
- **Narrator:**
  > "You simply state your goal. WebGPS scans the live DOM, numbers the interactive elements, and outlines the single best action. As you click, our continuous re-plan loop keeps you on track without ever auto-clicking."

---

### Scene 3: Voice Form-Filling with Human Confirmation (0:40 - 1:15)
- **Visual:** On the Civic Pass Application Form, user clicks **Speak Details** (or **Demo Voice Fill**).
- **Spoken Utterance:** *"My name is Meera Nair, email meera at example dot com, category general."*
- **Action:**
  1. Speech is transcribed.
  2. WebGPS AI extracts only the non-sensitive fields.
  3. The **Review & Confirm Field Mapping** card appears, displaying:
     - Full Name: `Meera Nair`
     - Email Address: `meera@example.com` (normalized automatically from spoken format)
     - Citizen Category: `General` (matched to real dropdown option)
  4. The user verifies the values and clicks **Confirm & Fill Form**.
  5. The fields on the webpage instantly populate with a gentle green confirmation glow!
- **Narrator:**
  > "On long forms, simply speak your details. WebGPS normalizes spoken tokens, maps speech to the page's real inputs, and shows a review card. Nothing is inserted until you confirm."

---

### Scene 4: Privacy Shield & Sensitive Field Protection (1:15 - 1:35)
- **Visual:** Cursor moves to the password / PIN / Aadhaar fields.
- **Action:** WebGPS highlights the field in warning amber with badge:
  `🔒 Sensitive Field: Type this one yourself`.
- **Narrator:**
  > "Privacy honesty is our core pillar. WebGPS never reads existing typed values, and strictly shields passwords, OTPs, Aadhaar numbers, and financial details. The AI simply tells you: 'Type this one yourself.'"

---

### Scene 5: Deterministic Safety Verification (1:35 - 1:50)
- **Visual:** WebGPS side panel safety drawer expands to reveal deterministic checks:
  - Official government registry match (`.gov.in`, `.nic.in`, `localhost`).
  - Transport encryption check (TLS vs plain HTTP).
  - Phishing/look-alike domain detection.
- **Narrator:**
  > "Our deterministic safety engine verifies domain authenticity against official registries and alerts you if you land on an unencrypted or suspicious look-alike domain."

---

### Scene 6: Final Submission & Human Control (1:50 - 2:05)
- **Visual:** Reaching the end of the form. The **Submit Application** button is highlighted.
- **Side Panel Alert:** Prominently warns:
  **"Final Action: You press this. WebGPS highlights the submit button, but never auto-clicks. You stay in control."**
- **Action:** User manually clicks Submit. Success banner appears: *"Application Submitted Successfully!"*
- **Narrator (Closing):**
  > "When it comes to final submission and payment, WebGPS stops and hands the wheel to you.
  > **The AI guides and fills what you tell it, but you stay in control.**
  > Thank you!"
