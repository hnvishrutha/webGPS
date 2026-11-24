"""
app.py - WebGPS Backend Server (Flask)

Main backend coordinating:
1. /health: Verifies backend is running and returns active mode (Mock vs Live)
2. /plan: Generates navigation steps from scanned elements and user goal
3. /transcribe: Speech-to-text (ElevenLabs STT or mock)
4. /extract-fields: Maps spoken user details to page form fields
5. /safety: Deterministic domain check against official_domains.json
"""

import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Import mock providers
import mock_provider

# Load environment configuration
load_dotenv()

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
        "known_lookalikes": []
    }


@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint to test connection and configuration."""
    return jsonify({
        "status": "online",
        "service": "WebGPS Backend",
        "mock_mode": MOCK_MODE,
        "version": "1.0.0-mvp"
    }), 200


@app.route("/plan", methods=["POST"])
def plan():
    """
    Navigation planner endpoint.
    Expects: session_id, goal, url, page_title, elements, history
    Returns: element_id, reason, confidence, is_final_step
    """
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id", "default")
    goal = data.get("goal", "")
    url = data.get("url", "")
    page_title = data.get("page_title", "")
    elements = data.get("elements", [])
    history = data.get("history", [])

    if not goal:
        return jsonify({"error": "Missing 'goal' in request body."}), 400

    # In MOCK_MODE (or fallback), use mock provider
    result = mock_provider.mock_plan(
        session_id=session_id,
        goal=goal,
        url=url,
        page_title=page_title,
        elements=elements,
        history=history
    )
    return jsonify(result), 200


@app.route("/transcribe", methods=["POST"])
def transcribe():
    """
    Speech-to-text endpoint.
    Accepts audio data (or mock trigger) and returns transcribed text.
    """
    # In mock mode, return standard demo sentence
    result = mock_provider.mock_transcribe()
    return jsonify(result), 200


@app.route("/extract-fields", methods=["POST"])
def extract_fields():
    """
    Form field extraction endpoint.
    Maps transcribed user utterance to the available non-sensitive fields.
    """
    data = request.get_json(silent=True) or {}
    utterance = data.get("utterance", "")
    fields = data.get("fields", [])

    result = mock_provider.mock_extract_fields(utterance, fields)
    return jsonify(result), 200


@app.route("/safety", methods=["POST"])
def safety_check():
    """
    Deterministic domain and page safety check.
    Checks official domains list, lookalikes, and insecure flags.
    """
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").lower()
    has_insecure_inputs = data.get("has_insecure_inputs", False)

    findings = []
    level = "ok"

    # 1. Official domain check
    exact_list = OFFICIAL_DOMAINS_CONFIG.get("exact_domains", [])
    suffixes = OFFICIAL_DOMAINS_CONFIG.get("allowed_suffixes", [])
    lookalikes = OFFICIAL_DOMAINS_CONFIG.get("known_lookalikes", [])

    is_lookalike = any(l in url for l in lookalikes)
    is_official = any(d in url for d in exact_list) or any(s in url for s in suffixes)

    if is_lookalike:
        level = "danger"
        findings.append({
            "check": "Domain Authenticity",
            "result": "suspicious",
            "evidence": "URL matches a known phishing/lookalike domain pattern."
        })
    elif not is_official:
        level = "caution"
        findings.append({
            "check": "Domain Authenticity",
            "result": "unverified",
            "evidence": "Domain is not listed in the official government registry (.gov.in / .nic.in)."
        })
    else:
        findings.append({
            "check": "Domain Authenticity",
            "result": "verified",
            "evidence": "Official government domain recognized."
        })

    # 2. Insecure / Protocol check
    if url.startswith("http://") and not ("localhost" in url or "127.0.0.1" in url):
        level = "danger"
        findings.append({
            "check": "Encryption",
            "result": "insecure",
            "evidence": "Page is served over plain HTTP without TLS encryption."
        })

    if has_insecure_inputs:
        level = "danger"
        findings.append({
            "check": "Sensitive Data",
            "result": "warning",
            "evidence": "Payment or credentials requested over unencrypted channel."
        })

    return jsonify({
        "level": level,
        "findings": findings
    }), 200


if __name__ == "__main__":
    print(f"🚀 Starting WebGPS Backend on http://{HOST}:{PORT} (Mock Mode: {MOCK_MODE})")
    app.run(host=HOST, port=PORT, debug=True)
