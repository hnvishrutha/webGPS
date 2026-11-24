"""
mock_provider.py - WebGPS Mock AI & Speech Provider

Provides deterministic, reliable mock responses for:
1. /plan: Element picking and navigation reasoning
2. /transcribe: Speech-to-text (STT) canned responses
3. /extract-fields: Form field mapping and normalization
4. /tts: Text-to-speech fallback indicator

This ensures the entire WebGPS pipeline can run and be evaluated
with 100% reliability, without requiring live API keys or active internet access.
"""

from typing import List, Dict, Any, Optional
import re

# Standard demo utterance for form-filling
MOCK_DEMO_UTTERANCE = "My name is Meera Nair, email meera at example dot com, category general"


def mock_plan(
    session_id: str,
    goal: str,
    url: str,
    page_title: str,
    elements: List[Dict[str, Any]],
    history: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Mock decision engine for navigation.
    Picks a valid element ID from the provided elements list based on simple heuristics:
    1. Looks for elements matching keywords in the goal or common navigation steps.
    2. Identifies if the element is a final submit/payment step.
    3. Guarantees that the returned element_id exists in the input elements list.
    """
    if not elements:
        return {
            "element_id": None,
            "reason": "No interactive elements were found on this page.",
            "confidence": 0.0,
            "is_final_step": False
        }

    goal_lower = (goal or "").lower()
    selected_element = None
    reason = "Proceed with this action to reach your goal."
    is_final = False

    # Heuristic 1: If looking for digital pass / civic pass / search
    for el in elements:
        label = (el.get("label") or "").lower()
        tag = (el.get("tag") or "").lower()
        role = (el.get("role") or "").lower()

        # Check for Final Submit or Payment first
        if any(w in label for w in ["submit application", "final submit", "pay now", "make payment", "confirm and submit"]):
            selected_element = el
            reason = f"You are at the final stage. Review your details and click '{el.get('label')}'."
            is_final = True
            break

        # Check for search input
        if "search" in goal_lower and (tag == "input" or role == "searchbox") and "search" in label:
            selected_element = el
            reason = f"Type your search query into '{el.get('label')}' to find civic services."
            break

        # Check for service/application links
        if ("pass" in goal_lower or "apply" in goal_lower) and any(kw in label for kw in ["civic pass", "digital pass", "apply now", "new application"]):
            selected_element = el
            reason = f"Click '{el.get('label')}' to begin your pass application."
            break

    # If no specific keyword matched, pick the first clickable non-sensitive element
    if not selected_element:
        for el in elements:
            if not el.get("sensitive", False) and el.get("tag") in ["a", "button", "input"]:
                selected_element = el
                reason = f"Select '{el.get('label', 'this element')}' to continue towards your goal: {goal}."
                break

    # Fallback to the very first element if needed
    if not selected_element:
        selected_element = elements[0]
        reason = f"Navigate using element #{selected_element.get('id')}."

    # Detect if the chosen element is a submit button
    label = (selected_element.get("label") or "").lower()
    if any(w in label for w in ["submit", "pay", "checkout"]):
        is_final = True

    return {
        "element_id": selected_element.get("id"),
        "reason": reason,
        "confidence": 0.95,
        "is_final_step": is_final
    }


def mock_transcribe(audio_bytes: Optional[bytes] = None) -> Dict[str, str]:
    """
    Mock speech-to-text response mimicking ElevenLabs STT.
    Returns the standard hackathon demo sentence.
    """
    return {
        "text": MOCK_DEMO_UTTERANCE
    }


def normalize_spoken_value(text: str) -> str:
    """
    Helper to normalize spoken email addresses and symbols.
    Example: 'meera at example dot com' -> 'meera@example.com'
    """
    val = text.strip()
    # Replace email spoken tokens
    val = re.sub(r'\s+at\s+', '@', val, flags=re.IGNORECASE)
    val = re.sub(r'\s+dot\s+', '.', val, flags=re.IGNORECASE)
    return val


def mock_extract_fields(
    utterance: str,
    fields: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Mock field extraction mapping spoken utterance to real form fields.
    Strictly adheres to contracts:
    - Never assigns to sensitive fields.
    - Only assigns to field_ids that exist in the request list.
    - Normalizes emails and names.
    - Matches dropdown options if present.
    """
    utterance_clean = utterance or MOCK_DEMO_UTTERANCE
    assignments = []
    unmatched = []
    assigned_ids = set()

    for f in fields:
        field_id = f.get("id")
        label = (f.get("label") or "").lower()
        field_type = (f.get("type") or "").lower()
        options = f.get("options") or []

        # Enforce security constraint: Never assign to sensitive fields
        if f.get("sensitive", False):
            continue

        # Match Name
        if any(k in label or k in str(field_id).lower() for k in ["name", "full name", "applicant"]):
            match = re.search(r'name\s+is\s+([A-Za-z\s]+?)(?:,\s*email|$)', utterance_clean, re.IGNORECASE)
            name_val = match.group(1).strip() if match else "Meera Nair"
            assignments.append({
                "field_id": field_id,
                "value": name_val,
                "confidence": 0.98
            })
            assigned_ids.add(field_id)

        # Match Email
        elif any(k in label or k in str(field_id).lower() for k in ["email", "e-mail"]):
            match = re.search(r'email\s+([a-zA-Z0-9\s\.\@]+?)(?:,\s*category|$)', utterance_clean, re.IGNORECASE)
            raw_email = match.group(1).strip() if match else "meera at example dot com"
            email_val = normalize_spoken_value(raw_email)
            assignments.append({
                "field_id": field_id,
                "value": email_val,
                "confidence": 0.96
            })
            assigned_ids.add(field_id)

        # Match Category / Dropdown
        elif any(k in label or k in str(field_id).lower() for k in ["category", "type", "pass type"]):
            match = re.search(r'category\s+([A-Za-z]+)', utterance_clean, re.IGNORECASE)
            cat_val = match.group(1).strip().capitalize() if match else "General"
            
            # If options list is given, check validity
            if options:
                matched_option = next((opt for opt in options if opt.lower() == cat_val.lower()), None)
                if matched_option:
                    assignments.append({
                        "field_id": field_id,
                        "value": matched_option,
                        "confidence": 0.94
                    })
                    assigned_ids.add(field_id)
                else:
                    unmatched.append(f"Category '{cat_val}' not in dropdown options: {options}")
            else:
                assignments.append({
                    "field_id": field_id,
                    "value": cat_val,
                    "confidence": 0.94
                })
                assigned_ids.add(field_id)

    missing = [f.get("id") for f in fields if f.get("id") not in assigned_ids and not f.get("sensitive", False)]

    return {
        "assignments": assignments,
        "unmatched": unmatched,
        "missing": missing
    }
