"""
app.py - WebGPS Backend Server (Flask)

Main backend coordinating:
1. /health: Verifies backend is running and returns active mode (Mock vs Live)
2. /plan: Generates navigation steps from scanned elements and user goal, with strict ID validation and retry logic
3. /transcribe: Speech-to-text (ElevenLabs STT or mock)
4. /extract-fields: Maps spoken user details to page form fields
5. /safety: Deterministic domain check against official_domains.json
"""

import os
import json
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

import mock_provider

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
        "known_lookalikes": []
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
        tag = (matched_el.get("tag") or "").lower()

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
        "version": "1.0.0-mvp"
    }), 200


@app.route("/plan", methods=["POST"])
def plan():
    """
    Navigation planner endpoint.
    Expects: session_id, goal, url, page_title, elements, history
    Returns: element_id, reason, confidence, is_final_step, unsure, candidates

    Contract Validator:
    - ID must exist in the provided elements list.
    - On failure, retry once.
    - If still failing, return unsure: True with top 3 candidates.
    - Submit/payment elements return is_final_step: True.
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

    # Attempt 1: Call planner
    plan_result = mock_provider.mock_plan(
        session_id=session_id,
        goal=goal,
        url=url,
        page_title=page_title,
        elements=elements,
        history=history
    )

    is_valid, validated_result = validate_plan_response(plan_result, elements)

    # Retry Once if validation failed
    if not is_valid:
        logging.warning("Planner validator: chosen element_id not in elements list. Retrying once...")
        plan_result = mock_provider.mock_plan(
            session_id=session_id,
            goal=goal,
            url=url,
            page_title=page_title,
            elements=elements,
            history=history
        )
        is_valid, validated_result = validate_plan_response(plan_result, elements)

    # If still invalid, return unsure with top 3 candidate elements
    if not is_valid:
        logging.error("Planner validator failed after retry. Returning unsure status with candidates.")
        candidate_ids = [el.get("id") for el in elements[:3] if el.get("id") is not None]
        return jsonify({
            "element_id": None,
            "reason": "Could not determine a single high-confidence next step. Please select from candidates.",
            "confidence": 0.3,
            "is_final_step": False,
            "unsure": True,
            "candidates": candidate_ids
        }), 200

    logging.info(f"Planner succeeded: element_id={validated_result.get('element_id')} is_final={validated_result.get('is_final_step')}")
    return jsonify(validated_result), 200


@app.route("/transcribe", methods=["POST"])
def transcribe():
    """
    Speech-to-text endpoint.
    Accepts audio data (or mock trigger) and returns transcribed text.
    """
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
