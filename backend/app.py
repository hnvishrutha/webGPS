"""
app.py - WebGPS Backend Server (Flask)

Main backend coordinating:
1. /health: Verifies backend is running and returns active mode (Mock vs Live)
2. /plan: Generates navigation steps from scanned elements and user goal, with strict ID validation and retry logic
3. /transcribe: Speech-to-text (ElevenLabs STT or mock)
4. /extract-fields: Maps spoken user details to non-sensitive page form fields
5. /safety: Deterministic domain check against official_domains.json with evidence
6. /tts: Optional text-to-speech endpoint (ElevenLabs TTS or browser fallback indicator)
"""

import os
import json
import logging
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from dotenv import load_dotenv
import requests

import mock_provider
import llm_provider

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

app = Flask(__name__)
# Enable CORS for all origins so Chrome extension can communicate smoothly
CORS(app, resources={r"/*": {"origins": "*"}})

MOCK_MODE = os.getenv("MOCK_MODE", "true").lower() in ("true", "1", "yes")
PORT = int(os.getenv("PORT", 5000))
HOST = os.getenv("HOST", "127.0.0.1")

# Load official domains for safety check
DOMAINS_FILE = os.path.join(os.path.dirname(__file__), "official_domains.json")
try:
    with open(DOMAINS_FILE, "r", encoding="utf-8") as f:
        OFFICIAL_DOMAINS_CONFIG = json.load(f)
except Exception as e:
    OFFICIAL_DOMAINS_CONFIG = {
        "exact_domains": ["localhost", "127.0.0.1", "civicpass.gov.in"],
        "allowed_suffixes": [".gov.in", ".nic.in"],
        "known_lookalikes": ["civicpass-portal.com", "civicpass.co", "civic-gov-pass.org"]
    }


def validate_plan_response(plan_res, elements):
    """
    Validates that the planner's selected element_id actually exists
    in the elements array sent by the extension.
    Returns: (is_valid, validated_dict)
    """
    if not isinstance(plan_res, dict):
        return False, None

    valid_elements_map = {el.get("id"): el for el in elements if el.get("id") is not None}
    chosen_id = plan_res.get("element_id")

    if chosen_id is not None and chosen_id in valid_elements_map:
        matched_el = valid_elements_map[chosen_id]
        label = (matched_el.get("label") or "").lower()

        # Enforce contract rule: Submit or payment must have is_final_step: True
        if any(w in label for w in ["submit", "pay", "checkout", "confirm and submit", "make payment"]):
            plan_res["is_final_step"] = True

        return True, plan_res

    return False, None


@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint to test connection and configuration."""
    return jsonify({
        "status": "online",
        "service": "WebGPS Backend",
        "mock_mode": MOCK_MODE,
        "llm_provider": "Mock" if MOCK_MODE else "Google Gemini",
        "stt_provider": "Mock" if MOCK_MODE else "ElevenLabs / Browser WebSpeech",
        "version": "1.0.0-mvp"
    }), 200


@app.route("/plan", methods=["POST"])
def plan():
    """
    Navigation planner endpoint.
    Expects: session_id, goal, url, page_title, elements, history
    Returns: element_id, reason, confidence, is_final_step, unsure, candidates
    """
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id", "default_session")
    goal = data.get("goal", "").strip()
    url = data.get("url", "")
    page_title = data.get("page_title", "")
    elements = data.get("elements", [])
    history = data.get("history", [])

    if not goal:
        return jsonify({"error": "Missing 'goal' in request body."}), 400

    if not elements:
        return jsonify({
            "element_id": None,
            "reason": "No interactive elements were detected on this page.",
            "confidence": 0.0,
            "is_final_step": False,
            "unsure": True,
            "candidates": []
        }), 200

    if MOCK_MODE:
        plan_result = mock_provider.mock_plan(
            session_id=session_id, goal=goal, url=url, page_title=page_title, elements=elements, history=history
        )
    else:
        plan_result = llm_provider.plan_with_llm(
            session_id=session_id, goal=goal, url=url, page_title=page_title, elements=elements, history=history
        )

    is_valid, validated_result = validate_plan_response(plan_result, elements)

    # Retry once if invalid
    if not is_valid:
        logging.warning("Planner validator: chosen element_id not in elements list. Retrying once...")
        if MOCK_MODE:
            plan_result = mock_provider.mock_plan(session_id, goal, url, page_title, elements, history)
        else:
            plan_result = llm_provider.plan_with_llm(session_id, goal, url, page_title, elements, history)
        is_valid, validated_result = validate_plan_response(plan_result, elements)

    if not is_valid:
        candidate_ids = [el.get("id") for el in elements[:3] if el.get("id") is not None]
        return jsonify({
            "element_id": None,
            "reason": "Could not determine a single high-confidence next step. Please select from candidates.",
            "confidence": 0.3,
            "is_final_step": False,
            "unsure": True,
            "candidates": candidate_ids
        }), 200

    return jsonify(validated_result), 200


@app.route("/transcribe", methods=["POST"])
def transcribe():
    """
    Speech-to-text endpoint.
    Returns transcribed text using ElevenLabs STT if configured, or mock response.
    """
    eleven_key = os.getenv("ELEVENLABS_API_KEY", "").strip()

    # If live audio file provided and key exists, call ElevenLabs STT
    if eleven_key and "audio" in request.files:
        audio_file = request.files["audio"]
        try:
            headers = {"xi-api-key": eleven_key}
            files = {"file": (audio_file.filename or "audio.webm", audio_file.read(), "audio/webm")}
            resp = requests.post("https://api.elevenlabs.io/v1/speech-to-text", headers=headers, files=files, timeout=12)
            if resp.status_code == 200:
                data = resp.json()
                return jsonify({"text": data.get("text", "")}), 200
        except Exception as e:
            logging.error(f"ElevenLabs STT API error: {e}. Falling back to mock transcribe.")

    # Mock fallback
    return jsonify(mock_provider.mock_transcribe()), 200


@app.route("/extract-fields", methods=["POST"])
def extract_fields():
    """
    Form field extraction endpoint.
    Strictly enforces:
    1. Only non-sensitive form fields are considered.
    2. Drops any assignments not in the requested fields list.
    3. Never assigns to sensitive fields.
    4. Normalizes email and dropdown values against actual options.
    """
    data = request.get_json(silent=True) or {}
    utterance = data.get("utterance", "")
    fields = data.get("fields", [])

    # SECURITY SHIELD: Filter out any sensitive field before sending to LLM
    safe_fields = [f for f in fields if not f.get("sensitive", False)]

    if MOCK_MODE or not os.getenv("GEMINI_API_KEY"):
        result = mock_provider.mock_extract_fields(utterance, safe_fields)
    else:
        result = llm_provider.extract_fields_with_llm(utterance, safe_fields)

    # Validator & Option Matcher
    valid_ids = {f.get("id") for f in safe_fields if f.get("id") is not None}
    field_map = {f.get("id"): f for f in safe_fields}

    validated_assignments = []
    unmatched = list(result.get("unmatched", []))

    for assign in result.get("assignments", []):
        f_id = assign.get("field_id")
        val = assign.get("value")
        if f_id in valid_ids:
            target_field = field_map[f_id]
            options = target_field.get("options")
            if options:
                matched_opt = next((o for o in options if str(o).lower() == str(val).lower()), None)
                if matched_opt:
                    assign["value"] = matched_opt
                    validated_assignments.append(assign)
                else:
                    unmatched.append(f"Value '{val}' does not match dropdown options for {target_field.get('label')}")
            else:
                validated_assignments.append(assign)

    assigned_ids = {a.get("field_id") for a in validated_assignments}
    missing = [f_id for f_id in valid_ids if f_id not in assigned_ids]

    return jsonify({
        "assignments": validated_assignments,
        "unmatched": unmatched,
        "missing": missing
    }), 200


@app.route("/safety", methods=["POST"])
def safety_check():
    """
    Deterministic domain and page safety check.
    Returns level ('ok', 'caution', 'danger') and findings with evidence.
    If lookup cannot be done, says 'could not verify', never 'safe'.
    """
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").lower().strip()
    has_insecure_inputs = data.get("has_insecure_inputs", False)
    has_payment_signals = data.get("has_payment_signals", False)

    findings = []
    level = "ok"

    if not url:
        return jsonify({
            "level": "caution",
            "findings": [{
                "check": "Domain Verification",
                "result": "could not verify",
                "evidence": "No active URL provided to safety inspector."
            }]
        }), 200

    exact_list = OFFICIAL_DOMAINS_CONFIG.get("exact_domains", [])
    suffixes = OFFICIAL_DOMAINS_CONFIG.get("allowed_suffixes", [])
    lookalikes = OFFICIAL_DOMAINS_CONFIG.get("known_lookalikes", [])

    is_lookalike = any(l in url for l in lookalikes)
    is_official = any(d in url for d in exact_list) or any(s in url for s in suffixes)

    # Check 1: Official Domain & Lookalike Pattern Check
    if is_lookalike:
        level = "danger"
        findings.append({
            "check": "Domain Authenticity",
            "result": "suspicious",
            "evidence": "Domain matches known deceptive/phishing look-alike pattern."
        })
    elif not is_official:
        level = "caution"
        findings.append({
            "check": "Domain Authenticity",
            "result": "unverified",
            "evidence": "Domain not present in official national registry (.gov.in / .nic.in)."
        })
    else:
        findings.append({
            "check": "Domain Authenticity",
            "result": "verified",
            "evidence": "Official recognized public domain (.gov.in / authorized demo gateway)."
        })

    # Check 2: Transport Layer Security & Insecure Input Signals
    if url.startswith("http://") and not ("localhost" in url or "127.0.0.1" in url):
        level = "danger"
        findings.append({
            "check": "Transport Encryption",
            "result": "insecure",
            "evidence": "Page transmitted over unencrypted HTTP protocol."
        })
    else:
        findings.append({
            "check": "Transport Encryption",
            "result": "secure",
            "evidence": "Secure communication channel active."
        })

    if has_insecure_inputs:
        level = "danger"
        findings.append({
            "check": "Sensitive Credential Channel",
            "result": "insecure_form",
            "evidence": "Credentials or payment fields detected over non-TLS form submission."
        })

    if has_payment_signals:
        if level != "danger":
            level = "caution"
        findings.append({
            "check": "Payment / Financial Signals",
            "result": "caution",
            "evidence": "Payment or transaction signals detected on page. User must verify authority before payment."
        })

    return jsonify({
        "level": level,
        "findings": findings
    }), 200


@app.route("/tts", methods=["POST"])
def text_to_speech():
    """
    Optional text-to-speech endpoint.
    Uses ElevenLabs TTS if key configured, otherwise returns browser fallback flag.
    """
    data = request.get_json(silent=True) or {}
    text = data.get("text", "")
    eleven_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    voice_id = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM").strip()

    if eleven_key and text:
        try:
            url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
            headers = {
                "xi-api-key": eleven_key,
                "Content-Type": "application/json"
            }
            body = {
                "text": text,
                "model_id": "eleven_monolingual_v1",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}
            }
            resp = requests.post(url, headers=headers, json=body, timeout=10)
            if resp.status_code == 200:
                return Response(resp.content, mimetype="audio/mpeg")
        except Exception as e:
            logging.error(f"ElevenLabs TTS failed: {e}")

    # Fallback indicator instructing frontend to use Web Speech API
    return jsonify({"use_browser_speech": True, "text": text}), 200


if __name__ == "__main__":
    print(f"🚀 Starting WebGPS Backend on http://{HOST}:{PORT} (Mock Mode: {MOCK_MODE})")
    app.run(host=HOST, port=PORT, debug=True)
