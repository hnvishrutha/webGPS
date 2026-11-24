"""
test_full_suite.py - WebGPS Automated Functional & Structural Integrity Test Suite

Validates:
1. Project file structure, extension manifest, and icons.
2. Backend API endpoints: /health, /plan, /transcribe, /extract-fields, /safety, /tts.
3. Privacy constraints & contracts: sensitive field shields, validator retries, final submit flags.
"""

import os
import sys
import json
import unittest

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, backend_dir)

from app import app
import mock_provider
import llm_provider


class WebGPSIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()
        cls.root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    # =========================================================================
    # 1. Structural & File Integrity Checks
    # =========================================================================
    def test_01_manifest_and_extension_files(self):
        """Verifies Chrome Extension Manifest V3 and required assets exist."""
        manifest_path = os.path.join(self.root_dir, "extension", "manifest.json")
        self.assertTrue(os.path.exists(manifest_path), "manifest.json must exist")

        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        self.assertEqual(manifest.get("manifest_version"), 3, "Manifest version must be 3")
        self.assertIn("sidePanel", manifest.get("permissions", []), "sidePanel permission required")
        self.assertIn("activeTab", manifest.get("permissions", []), "activeTab permission required")
        self.assertTrue(manifest.get("side_panel", {}).get("default_path") == "sidepanel.html")

        # Verify extension files
        for fname in ["background.js", "content.js", "sidepanel.html", "sidepanel.css", "sidepanel.js"]:
            fpath = os.path.join(self.root_dir, "extension", fname)
            self.assertTrue(os.path.exists(fpath), f"Missing extension file: {fname}")
            self.assertGreater(os.path.getsize(fpath), 0, f"File {fname} is empty")

        # Verify icons
        for sz in [16, 48, 128]:
            icon_path = os.path.join(self.root_dir, "extension", "icons", f"icon{sz}.png")
            self.assertTrue(os.path.exists(icon_path), f"Missing icon: icon{sz}.png")

    def test_02_test_portal_pages(self):
        """Verifies local test portal pages exist and are non-empty."""
        for page in ["index.html", "results.html", "form.html"]:
            portal_file = os.path.join(self.root_dir, "test_portal", page)
            self.assertTrue(os.path.exists(portal_file), f"Missing portal page: {page}")
            self.assertGreater(os.path.getsize(portal_file), 100, f"Page {page} too small")

    # =========================================================================
    # 2. Backend /health & Configuration Checks
    # =========================================================================
    def test_03_health_endpoint(self):
        """Tests /health endpoint response and mock mode status."""
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("status"), "online")
        self.assertIn("mock_mode", data)
        self.assertIn("llm_provider", data)

    # =========================================================================
    # 3. /plan Contract & Validator Checks
    # =========================================================================
    def test_04_plan_navigation_step(self):
        """Tests that /plan chooses a valid element and returns reason."""
        elements = [
            {"id": 1, "tag": "a", "label": "Home", "sensitive": False},
            {"id": 2, "tag": "input", "label": "Search services", "type": "search", "sensitive": False},
            {"id": 3, "tag": "button", "label": "Search", "sensitive": False},
            {"id": 4, "tag": "a", "label": "Apply for Civic Pass", "sensitive": False}
        ]
        res = self.client.post("/plan", json={
            "goal": "Apply for Civic Digital Pass",
            "elements": elements
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("element_id"), 4, "Should choose element #4 (Apply for Civic Pass)")
        self.assertFalse(data.get("is_final_step"))
        self.assertTrue(len(data.get("reason", "")) > 5)

    def test_05_plan_final_submit_guard(self):
        """Tests that submit buttons trigger is_final_step: true."""
        elements = [
            {"id": 1, "tag": "input", "label": "Full Name", "sensitive": False},
            {"id": 9, "tag": "button", "label": "Submit Application", "sensitive": False}
        ]
        res = self.client.post("/plan", json={
            "goal": "Finalize my application",
            "elements": elements
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("element_id"), 9)
        self.assertTrue(data.get("is_final_step"), "Submit button must flag is_final_step: True")

    def test_06_plan_empty_and_validator_safety(self):
        """Tests that missing or empty elements return unsure gracefully without error."""
        res = self.client.post("/plan", json={
            "goal": "Find something",
            "elements": []
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("unsure"))
        self.assertIsNone(data.get("element_id"))

    # =========================================================================
    # 4. /transcribe & /extract-fields Speech Pipeline Checks
    # =========================================================================
    def test_07_transcribe_endpoint(self):
        """Tests /transcribe returns demo utterance in mock mode."""
        res = self.client.post("/transcribe")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("text", data)
        self.assertIn("Meera Nair", data["text"])

    def test_08_extract_fields_mapping_and_normalization(self):
        """Tests field mapping, email normalization, and sensitive field exclusion."""
        fields = [
            {"id": 1, "label": "Full Name", "tag": "input", "sensitive": False},
            {"id": 2, "label": "Email Address", "tag": "input", "sensitive": False},
            {"id": 3, "label": "Citizen Category", "tag": "select", "options": ["General", "Student", "Senior"], "sensitive": False},
            {"id": 4, "label": "Aadhaar Card", "tag": "input", "sensitive": True}, # SENSITIVE SHIELD
            {"id": 5, "label": "Password", "tag": "input", "type": "password", "sensitive": True} # SENSITIVE SHIELD
        ]

        utterance = "My name is Meera Nair, email meera at example dot com, category general"
        res = self.client.post("/extract-fields", json={
            "utterance": utterance,
            "fields": fields
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        assignments = data.get("assignments", [])

        # Verify non-sensitive assignments
        field_map = {a["field_id"]: a["value"] for a in assignments}
        self.assertEqual(field_map.get(1), "Meera Nair", "Name must match")
        self.assertEqual(field_map.get(2), "meera@example.com", "Email must be normalized")
        self.assertEqual(field_map.get(3), "General", "Dropdown must match valid option")

        # PRIVACY CONTRACT TEST: Sensitive fields (4 and 5) must NEVER be assigned
        self.assertNotIn(4, field_map, "Sensitive Aadhaar must NOT be assigned")
        self.assertNotIn(5, field_map, "Sensitive Password must NOT be assigned")

    # =========================================================================
    # 5. /safety Deterministic Verification Checks
    # =========================================================================
    def test_09_safety_official_domain(self):
        """Tests safety verification on authentic government portal."""
        res = self.client.post("/safety", json={
            "url": "https://civicpass.gov.in/portal"
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("level"), "ok")
        self.assertTrue(any(f["result"] == "verified" for f in data.get("findings", [])))

    def test_10_safety_lookalike_phishing_detection(self):
        """Tests detection of known deceptive look-alike domain."""
        res = self.client.post("/safety", json={
            "url": "http://civicpass-portal.com/login"
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("level"), "danger")
        self.assertTrue(any(f["result"] == "suspicious" for f in data.get("findings", [])))

    def test_11_tts_endpoint(self):
        """Tests text-to-speech endpoint."""
        res = self.client.post("/tts", json={"text": "Click element #4"})
        self.assertEqual(res.status_code, 200)


if __name__ == "__main__":
    unittest.main()
