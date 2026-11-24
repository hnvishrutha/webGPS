"""
mock_provider.py - WebGPS Mock AI & Speech Provider

Provides deterministic, reliable mock responses for:
1. /plan: Element picking and navigation reasoning with history awareness
2. /transcribe: Speech-to-text (STT) canned responses
3. /extract-fields: Form field mapping and normalization
4. /tts: Text-to-speech fallback indicator

This ensures the entire WebGPS pipeline can run and be evaluated
with 100% reliability, without requiring live API keys or active internet access.
"""

from typing import List, Dict, Any, Optional
import re

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
    Picks a valid element ID from the provided elements list based on:
    1. Looking for elements matching keywords in the goal or common navigation steps.
    2. Prioritizing search boxes, pass application links, or form inputs.
    3. Respecting history to avoid infinite loops on the same step.
    4. Identifying if the element is a final submit/payment step.
    5. Guarantees that the returned element_id exists in the input elements list.
    """
    if not elements:
        return {
            "element_id": None,
            "reason": "No interactive elements were found on this page.",
            "confidence": 0.0,
            "is_final_step": False
        }

    goal_lower = (goal or "").lower()
    history_ids = set()
    if history:
        for h in history:
            if isinstance(h, dict) and "element_id" in h:
                history_ids.add(h["element_id"])
            elif isinstance(h, int):
                history_ids.add(h)

    selected_element = None
    reason = "Proceed with this action to reach your goal."
    is_final = False

    # Check for Final Submit or Payment
    for el in elements:
        label = (el.get("label") or "").lower()
        if any(w in label for w in ["submit application", "final submit", "pay now", "make payment", "confirm and submit"]):
            # If we've already filled or reached the end
            selected_element = el
            reason = f"You are at the final stage. Review your details and click '{el.get('label')}' to complete submission."
            is_final = True
            break

    # If not at final submit, check search box if user wants to search
    if not selected_element and "search" in goal_lower:
        for el in elements:
            label = (el.get("label") or "").lower()
            tag = (el.get("tag") or "").lower()
            role = (el.get("role") or "").lower()
            if (tag == "input" or role == "searchbox") and "search" in label:
                selected_element = el
                reason = f"Type your search query into '{el.get('label')}' to find civic services."
                break

    # Check for service/application links (e.g. "Apply for Civic Pass", "Civic Digital Pass")
    if not selected_element:
        for el in elements:
            if el.get("id") in history_ids:
                continue
            label = (el.get("label") or "").lower()
            if any(kw in label for kw in ["civic pass", "digital pass", "apply for pass", "apply now", "new application"]):
                selected_element = el
                reason = f"Click '{el.get('label')}' to begin your pass application."
                break

    # Check for form fields on application page
    if not selected_element:
        for el in elements:
            tag = (el.get("tag") or "").lower()
            if tag in ["input", "select", "textarea"] and not el.get("sensitive", False):
                if el.get("id") not in history_ids:
                    selected_element = el
                    label = el.get("label", "input field")
                    reason = f"Fill in your '{label}' using voice assistant or typing."
                    break

    # If sensitive field is next
    if not selected_element:
        for el in elements:
            if el.get("sensitive", False) and el.get("id") not in history_ids:
                selected_element = el
                label = el.get("label", "credential field")
                reason = f"Sensitive field detected: '{label}'. For your security, type this one yourself."
                break

    # Fallback to first non-sensitive clickable element not in history
    if not selected_element:
        for el in elements:
            if not el.get("sensitive", False) and el.get("id") not in history_ids:
                selected_element = el
                reason = f"Select '{el.get('label', 'this element')}' to continue towards your goal."
                break

    # Fallback to the very first element in the list
    if not selected_element:
        selected_element = elements[0]
        reason = f"Continue navigation using element #{selected_element.get('id')}."

    # Mark final if element label indicates submission
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
            match = re.search(r'category\s+([A-Za-z\s]+)', utterance_clean, re.IGNORECASE)
            cat_val = match.group(1).strip() if match else "General"
            
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
                    "value": cat_val.capitalize(),
                    "confidence": 0.94
                })
                assigned_ids.add(field_id)

    missing = [f.get("id") for f in fields if f.get("id") not in assigned_ids and not f.get("sensitive", False)]

    return {
        "assignments": assignments,
        "unmatched": unmatched,
        "missing": missing
    }
