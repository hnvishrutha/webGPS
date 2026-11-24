/**
 * sidepanel.js - WebGPS Side Panel Controller
 *
 * Full Feature Set:
 * 1. AI Navigation Planner with validation & retry
 * 2. Continuous Re-plan Loop on navigation
 * 3. Voice Form-Filling: WebSpeech / MediaRecorder / Demo STT -> /extract-fields -> Editable Confirmation Card -> Safe DOM Fill
 * 4. Deterministic Safety Verification with expandable Evidence Drawer
 * 5. Text-To-Speech (TTS) Voice Readout for steps
 */

document.addEventListener("DOMContentLoaded", () => {
  const BACKEND_URL = "http://127.0.0.1:5000";

  // Navigation & Planner Controls
  const planBtn = document.getElementById("planBtn");
  const scanBtn = document.getElementById("scanBtn");
  const goalInput = document.getElementById("goalInput");
  const autoReplanToggle = document.getElementById("autoReplanToggle");
  const modePillText = document.getElementById("modePillText");
  const navToast = document.getElementById("navToast");
  const navToastText = document.getElementById("navToastText");

  // Active AI Guidance Card (Step 4, 5 & 8)
  const activeGuidanceCard = document.getElementById("activeGuidanceCard");
  const guidanceBadge = document.getElementById("guidanceBadge");
  const guidanceText = document.getElementById("guidanceText");
  const guidanceWarning = document.getElementById("guidanceWarning");
  const finalStepAlert = document.getElementById("finalStepAlert");
  const clearHighlightBtn = document.getElementById("clearHighlightBtn");
  const candidatesContainer = document.getElementById("candidatesContainer");
  const candidatesList = document.getElementById("candidatesList");
  const ttsBtn = document.getElementById("ttsBtn");

  // Voice Form-Filling Controls (Step 6)
  const micBtn = document.getElementById("micBtn");
  const micBtnLabel = document.getElementById("micBtnLabel");
  const demoSpeechBtn = document.getElementById("demoSpeechBtn");
  const recordingIndicator = document.getElementById("recordingIndicator");
  const recordingStatusText = document.getElementById("recordingStatusText");
  const transcriptBox = document.getElementById("transcriptBox");
  const transcriptText = document.getElementById("transcriptText");
  const confirmationCard = document.getElementById("confirmationCard");
  const assignmentsList = document.getElementById("assignmentsList");
  const confirmFillBtn = document.getElementById("confirmFillBtn");
  const cancelFillBtn = document.getElementById("cancelFillBtn");
  const fillSuccessBanner = document.getElementById("fillSuccessBanner");

  // Safety Controls (Step 7)
  const safetyBanner = document.getElementById("safetyBanner");
  const safetyTitle = document.getElementById("safetyTitle");
  const safetyDesc = document.getElementById("safetyDesc");
  const toggleEvidenceBtn = document.getElementById("toggleEvidenceBtn");
  const safetyEvidenceDrawer = document.getElementById("safetyEvidenceDrawer");
  const evidenceList = document.getElementById("evidenceList");

  // Inspector & Stats
  const statsBar = document.getElementById("statsBar");
  const totalCountEl = document.getElementById("totalCount");
  const inViewCountEl = document.getElementById("inViewCount");
  const sensitiveCountEl = document.getElementById("sensitiveCount");
  const pageTitleBadge = document.getElementById("pageTitleBadge");
  const emptyState = document.getElementById("emptyState");
  const elementsList = document.getElementById("elementsList");

  // Manual Highlighter Controls (Step 3)
  const manualHighlightInput = document.getElementById("manualHighlightInput");
  const manualHighlightBtn = document.getElementById("manualHighlightBtn");

  // State Management
  let scannedElements = [];
  let currentActiveId = null;
  let navigationHistory = [];
  let currentSessionId = "webgps_session_" + Date.now();
  let isPlanningInProgress = false;
  let isRecording = false;
  let speechRecognition = null;
  let pendingAssignments = [];

  /**
   * Health Check: Checks backend status and updates mode indicator.
   */
  async function checkBackendStatus() {
    try {
      const res = await fetch(`${BACKEND_URL}/health`);
      if (res.ok) {
        const data = await res.json();
        modePillText.textContent = data.mock_mode ? "Mock Mode" : (data.llm_provider || "Live LLM");
      }
    } catch (e) {
      modePillText.textContent = "Offline (Mock Fallback)";
    }
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs.length > 0 ? tabs[0] : null;
  }

  async function sendContentMessage(tabId, message) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (err) {
      console.log("WebGPS: Injecting content script into tab", tabId);
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content.js"]
      });
      await new Promise((r) => setTimeout(r, 120));
      return await chrome.tabs.sendMessage(tabId, message);
    }
  }

  /**
   * Scans elements from the active tab and executes safety check.
   */
  async function performScan() {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      throw new Error("No active browser tab detected.");
    }

    if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("chrome-extension://")) {
      throw new Error("Extensions cannot scan browser internal pages. Please open a webpage or localhost.");
    }

    const response = await sendContentMessage(tab.id, { action: "SCAN_PAGE" });
    if (response && response.success && response.data) {
      renderElements(response.data.elements, response.data.page_title);
      // Run deterministic safety check on page URL and security signals
      runSafetyCheck(response.data.url, response.data.has_insecure_inputs);
      return response.data;
    } else {
      throw new Error(response ? response.error : "Failed to retrieve page scan.");
    }
  }

  /**
   * Step 7: Deterministic Safety Check with Evidence
   */
  async function runSafetyCheck(url, hasInsecureInputs) {
    try {
      const res = await fetch(`${BACKEND_URL}/safety`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url, has_insecure_inputs: hasInsecureInputs })
      });
      if (res.ok) {
        const data = await res.json();
        updateSafetyUI(data.level, data.findings);
      }
    } catch (e) {
      console.warn("Safety check network warning:", e);
    }
  }

  function updateSafetyUI(level, findings) {
    safetyBanner.className = `safety-banner ${level}`;
    evidenceList.innerHTML = "";

    if (level === "danger") {
      safetyTitle.textContent = "Security Alert: Look-alike / Insecure";
      safetyDesc.textContent = "Potential spoofed portal or insecure transport detected.";
    } else if (level === "caution") {
      safetyTitle.textContent = "Unverified Domain";
      safetyDesc.textContent = "Domain is not in the official government registry.";
    } else {
      safetyTitle.textContent = "Official Domain Verified";
      safetyDesc.textContent = "Recognized public gateway. Secrets and inputs protected.";
    }

    (findings || []).forEach((f) => {
      const item = document.createElement("div");
      item.className = "evidence-item";
      item.innerHTML = `
        <strong>${f.check} &bull; ${f.result.toUpperCase()}</strong>
        <span class="evidence-desc">${f.evidence}</span>
      `;
      evidenceList.appendChild(item);
    });
  }

  toggleEvidenceBtn.addEventListener("click", () => {
    const isHidden = safetyEvidenceDrawer.style.display === "none";
    safetyEvidenceDrawer.style.display = isHidden ? "block" : "none";
    toggleEvidenceBtn.innerHTML = isHidden ? "Evidence &#x25B4;" : "Evidence &#x25BE;";
  });

  /**
   * Highlights element on the live webpage and reflects it in the UI.
   */
  async function triggerHighlight(elementId, reasonText, isFinal = false) {
    const tab = await getActiveTab();
    if (!tab || !tab.id) return;

    const elData = scannedElements.find((e) => e.id === Number(elementId));
    const isSensitive = elData ? elData.sensitive : false;
    const label = elData ? elData.label : `Element #${elementId}`;
    const reason = reasonText || `Proceed with '${label}'`;

    try {
      const response = await sendContentMessage(tab.id, {
        action: "HIGHLIGHT_ELEMENT",
        element_id: Number(elementId),
        reason: reason
      });

      if (response && response.success) {
        currentActiveId = Number(elementId);
        updateGuidanceCard(currentActiveId, isSensitive, label, reason, isFinal);
        highlightCardInList(currentActiveId);

        navigationHistory.push({
          element_id: currentActiveId,
          label: label,
          timestamp: Date.now()
        });
        if (navigationHistory.length > 5) {
          navigationHistory.shift();
        }
      }
    } catch (err) {
      console.error("Failed to highlight element:", err);
    }
  }

  function updateGuidanceCard(id, isSensitive, label, reason, isFinal = false) {
    guidanceBadge.textContent = `#${id} ${isSensitive ? "🔒 Sensitive" : isFinal ? "⚠️ Submit" : "Target"}`;

    if (isSensitive) {
      activeGuidanceCard.classList.add("is-sensitive-active");
      guidanceText.textContent = `WebGPS located sensitive field: "${label}".`;
      guidanceWarning.style.display = "flex";
      finalStepAlert.style.display = "none";
    } else {
      activeGuidanceCard.classList.remove("is-sensitive-active");
      guidanceText.textContent = reason || `Click on "${label}" to proceed towards your goal.`;
      guidanceWarning.style.display = "none";

      if (isFinal) {
        finalStepAlert.style.display = "flex";
      } else {
        finalStepAlert.style.display = "none";
      }
    }

    candidatesContainer.style.display = "none";
    activeGuidanceCard.style.display = "block";
  }

  function displayCandidates(candidateIds) {
    candidatesList.innerHTML = "";
    candidateIds.forEach((cId) => {
      const el = scannedElements.find((e) => e.id === cId);
      const chip = document.createElement("button");
      chip.className = "candidate-chip";
      chip.textContent = `#${cId} ${el ? el.label.substring(0, 20) : "Element"}`;
      chip.addEventListener("click", () => triggerHighlight(cId));
      candidatesList.appendChild(chip);
    });
    candidatesContainer.style.display = "block";
    activeGuidanceCard.style.display = "block";
  }

  async function clearActiveHighlight() {
    const tab = await getActiveTab();
    if (tab && tab.id) {
      try {
        await sendContentMessage(tab.id, { action: "CLEAR_HIGHLIGHT" });
      } catch (e) {}
    }
    activeGuidanceCard.style.display = "none";
    currentActiveId = null;
    document.querySelectorAll(".element-card.is-active").forEach((c) => c.classList.remove("is-active"));
  }

  function highlightCardInList(id) {
    document.querySelectorAll(".element-card").forEach((card) => {
      if (Number(card.dataset.id) === Number(id)) {
        card.classList.add("is-active");
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else {
        card.classList.remove("is-active");
      }
    });
  }

  function renderElements(elements, pageTitle) {
    scannedElements = elements || [];
    elementsList.innerHTML = "";

    if (!elements || elements.length === 0) {
      emptyState.style.display = "block";
      emptyState.querySelector(".empty-text").innerHTML =
        "No interactive elements found on this page. Try scrolling or refreshing.";
      elementsList.style.display = "none";
      statsBar.style.display = "none";
      pageTitleBadge.textContent = "No elements";
      return;
    }

    const total = elements.length;
    const inView = elements.filter((e) => e.in_viewport).length;
    const sensitive = elements.filter((e) => e.sensitive).length;

    totalCountEl.textContent = total;
    inViewCountEl.textContent = inView;
    sensitiveCountEl.textContent = sensitive;
    statsBar.style.display = "grid";

    pageTitleBadge.textContent = pageTitle || "Scanned Page";
    pageTitleBadge.title = pageTitle || "";

    elements.forEach((el) => {
      const card = document.createElement("div");
      card.className = `element-card ${el.sensitive ? "is-sensitive" : ""}`;
      card.dataset.id = el.id;

      const badge = document.createElement("div");
      badge.className = "element-badge";
      badge.textContent = `#${el.id}`;

      const details = document.createElement("div");
      details.className = "element-details";

      const meta = document.createElement("div");
      meta.className = "element-meta";

      const tagPill = document.createElement("span");
      tagPill.className = "tag-pill";
      tagPill.textContent = (el.type ? `${el.tag}[${el.type}]` : el.tag).toUpperCase();

      const groupPill = document.createElement("span");
      groupPill.className = "group-pill";
      groupPill.textContent = el.group || "General";
      groupPill.title = `Section: ${el.group || "General"}`;

      const viewportPill = document.createElement("span");
      viewportPill.className = `viewport-pill ${el.in_viewport ? "in-view" : "off-view"}`;
      viewportPill.textContent = el.in_viewport ? "In View" : "Offscreen";

      meta.appendChild(tagPill);
      meta.appendChild(groupPill);
      meta.appendChild(viewportPill);

      const label = document.createElement("div");
      label.className = "element-label";
      label.textContent = el.label || `(${el.tag} without label)`;
      label.title = el.label || "";

      details.appendChild(meta);
      details.appendChild(label);

      if (el.sensitive) {
        const sensitiveIndicator = document.createElement("div");
        sensitiveIndicator.className = "sensitive-indicator";
        sensitiveIndicator.innerHTML = `
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <span>Sensitive (Protected from AI/voice fill)</span>
        `;
        details.appendChild(sensitiveIndicator);
      }

      card.appendChild(badge);
      card.appendChild(details);

      card.addEventListener("click", () => {
        triggerHighlight(el.id);
      });

      elementsList.appendChild(card);
    });

    emptyState.style.display = "none";
    elementsList.style.display = "flex";
  }

  /**
   * Action: AI Planner ("Plan Next Step")
   */
  async function handlePlan() {
    if (isPlanningInProgress) return;
    const goal = goalInput.value.trim();
    if (!goal) {
      alert("Please enter a navigation goal first.");
      goalInput.focus();
      return;
    }

    isPlanningInProgress = true;
    clearActiveHighlight();
    planBtn.disabled = true;
    planBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin">
        <line x1="12" y1="2" x2="12" y2="6"></line>
        <line x1="12" y1="18" x2="12" y2="22"></line>
      </svg>
      <span>Thinking...</span>
    `;

    try {
      const scanData = await performScan();
      if (!scanData || scanData.elements.length === 0) {
        throw new Error("No interactive elements found to plan with.");
      }

      const res = await fetch(`${BACKEND_URL}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: currentSessionId,
          goal: goal,
          url: scanData.url,
          page_title: scanData.page_title,
          elements: scanData.elements,
          history: navigationHistory.slice(-5)
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server HTTP ${res.status}`);
      }

      const planRes = await res.json();
      console.log("WebGPS Plan Result:", planRes);

      if (planRes.element_id) {
        await triggerHighlight(planRes.element_id, planRes.reason, planRes.is_final_step);
      } else if (planRes.unsure && planRes.candidates && planRes.candidates.length > 0) {
        guidanceBadge.textContent = "Unsure";
        guidanceText.textContent = planRes.reason;
        displayCandidates(planRes.candidates);
      } else {
        guidanceBadge.textContent = "Completed";
        guidanceText.textContent = planRes.reason || "Goal reached or no further action needed.";
        activeGuidanceCard.style.display = "block";
      }
    } catch (err) {
      console.error("Plan failed:", err);
      emptyState.style.display = "block";
      emptyState.querySelector(".empty-text").innerHTML = `
        <span style="color: #f87171; font-weight: 600;">Plan Error:</span> ${err.message}<br>
        <small style="color: #94a3b8; display: block; margin-top: 4px;">Ensure Flask server is running at <code>http://127.0.0.1:5000</code>.</small>
      `;
      elementsList.style.display = "none";
    } finally {
      isPlanningInProgress = false;
      planBtn.disabled = false;
      planBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
        <span>Plan Next Step</span>
      `;
    }
  }

  /**
   * Action: Inspect Scan Only
   */
  async function handleScanOnly() {
    clearActiveHighlight();
    scanBtn.disabled = true;
    scanBtn.innerHTML = `<span>Scanning...</span>`;
    try {
      await performScan();
    } catch (err) {
      emptyState.style.display = "block";
      emptyState.querySelector(".empty-text").innerHTML = `
        <span style="color: #f87171; font-weight: 600;">Scan Failed:</span> ${err.message}
      `;
      elementsList.style.display = "none";
    } finally {
      scanBtn.disabled = false;
      scanBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <span>Scan Only</span>
      `;
    }
  }

  // =========================================================================
  // STEP 6: VOICE FORM-FILLING PIPELINE (MIC -> STT -> EXTRACT -> CONFIRM -> FILL)
  // =========================================================================

  /**
   * Processes a spoken utterance string through backend /extract-fields,
   * presents the Confirmation Card, and prepares values for filling.
   */
  async function processSpokenUtterance(utterance) {
    transcriptText.textContent = `"${utterance}"`;
    transcriptBox.style.display = "block";
    fillSuccessBanner.style.display = "none";

    // 1. Ensure page elements are scanned
    if (scannedElements.length === 0) {
      await performScan();
    }

    // 2. Filter ONLY non-sensitive form fields
    const formFields = scannedElements.filter((el) => {
      return (
        ["input", "select", "textarea"].includes(el.tag) &&
        el.type !== "submit" &&
        el.type !== "button" &&
        !el.sensitive // NEVER send sensitive fields
      );
    });

    if (formFields.length === 0) {
      alert("No fillable non-sensitive form fields detected on this page.");
      return;
    }

    // 3. Call backend /extract-fields
    try {
      const res = await fetch(`${BACKEND_URL}/extract-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          utterance: utterance,
          fields: formFields
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log("WebGPS Extracted Fields:", data);

      if (!data.assignments || data.assignments.length === 0) {
        alert("WebGPS heard the utterance, but could not confidently match it to any form field.");
        return;
      }

      // 4. Render Editable Confirmation Card (Human-in-the-Loop)
      renderConfirmationCard(data.assignments);
    } catch (err) {
      console.error("Field extraction error:", err);
      alert("Field extraction failed: " + err.message);
    }
  }

  /**
   * Renders the confirmation card with editable inputs for each field value.
   */
  function renderConfirmationCard(assignments) {
    pendingAssignments = assignments;
    assignmentsList.innerHTML = "";

    assignments.forEach((assign, index) => {
      const el = scannedElements.find((e) => e.id === Number(assign.field_id));
      const row = document.createElement("div");
      row.className = "assignment-row";

      const nameLabel = document.createElement("label");
      nameLabel.className = "field-name";
      nameLabel.textContent = `${el ? el.label : "Field #" + assign.field_id}:`;

      const valInput = document.createElement("input");
      valInput.type = "text";
      valInput.className = "field-val-input";
      valInput.value = assign.value;
      valInput.dataset.index = index;

      valInput.addEventListener("input", (e) => {
        pendingAssignments[index].value = e.target.value;
      });

      row.appendChild(nameLabel);
      row.appendChild(valInput);
      assignmentsList.appendChild(row);
    });

    confirmationCard.style.display = "block";
    confirmationCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /**
   * Confirm & Fill: User clicks confirm to insert validated values into page DOM.
   */
  confirmFillBtn.addEventListener("click", async () => {
    confirmFillBtn.disabled = true;
    confirmFillBtn.innerHTML = `<span>Inserting...</span>`;

    const tab = await getActiveTab();
    if (tab && tab.id) {
      try {
        const res = await sendContentMessage(tab.id, {
          action: "FILL_FIELDS",
          assignments: pendingAssignments
        });

        if (res && res.success) {
          confirmationCard.style.display = "none";
          fillSuccessBanner.style.display = "block";
          fillSuccessBanner.scrollIntoView({ behavior: "smooth", block: "nearest" });

          // Voice feedback if TTS is available
          speakText(`Filled ${res.filled_count} fields. Review your details and click submit yourself.`);
        }
      } catch (err) {
        console.error("DOM fill error:", err);
        alert("Failed to insert fields into page: " + err.message);
      } finally {
        confirmFillBtn.disabled = false;
        confirmFillBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Confirm & Fill Form</span>
        `;
      }
    }
  });

  cancelFillBtn.addEventListener("click", () => {
    confirmationCard.style.display = "none";
    pendingAssignments = [];
  });

  /**
   * Microphone Button: Uses Web Speech API with fallback.
   */
  micBtn.addEventListener("click", () => {
    if (isRecording) {
      stopRecording();
      return;
    }

    // Check Web Speech API support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        speechRecognition = new SpeechRecognition();
        speechRecognition.continuous = false;
        speechRecognition.interimResults = false;
        speechRecognition.lang = "en-US";

        speechRecognition.onstart = () => {
          isRecording = true;
          micBtn.classList.add("recording");
          micBtnLabel.textContent = "Listening...";
          recordingIndicator.style.display = "flex";
        };

        speechRecognition.onresult = (event) => {
          const speechResult = event.results[0][0].transcript;
          console.log("WebGPS Voice Input:", speechResult);
          stopRecording();
          processSpokenUtterance(speechResult);
        };

        speechRecognition.onerror = (event) => {
          console.warn("Speech recognition notice:", event.error);
          stopRecording();
          // Fallback to demo utterance as specified in Section 6 fallback hierarchy
          alert(`Microphone notice: ${event.error}. Loading demo voice phrase for testing.`);
          triggerDemoVoice();
        };

        speechRecognition.onend = () => {
          stopRecording();
        };

        speechRecognition.start();
      } catch (e) {
        console.error("Mic initialization failed:", e);
        triggerDemoVoice();
      }
    } else {
      triggerDemoVoice();
    }
  });

  function stopRecording() {
    isRecording = false;
    micBtn.classList.remove("recording");
    micBtnLabel.textContent = "Speak Details";
    recordingIndicator.style.display = "none";
    if (speechRecognition) {
      try { speechRecognition.stop(); } catch (e) {}
      speechRecognition = null;
    }
  }

  /**
   * Demo Voice Trigger (Zero-dependency fallback)
   */
  function triggerDemoVoice() {
    const demoUtterance = "My name is Meera Nair, email meera at example dot com, category general";
    processSpokenUtterance(demoUtterance);
  }

  demoSpeechBtn.addEventListener("click", triggerDemoVoice);

  // =========================================================================
  // STEP 8: TEXT-TO-SPEECH (TTS) STEP READOUT
  // =========================================================================

  function speakText(text) {
    if (!text) return;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }

  ttsBtn.addEventListener("click", () => {
    const textToSpeak = guidanceText.textContent;
    if (textToSpeak) {
      speakText(textToSpeak);
    }
  });

  // =========================================================================
  // STEP 5 RE-PLAN LOOP: NAVIGATION BROADCAST LISTENER
  // =========================================================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "TAB_NAVIGATED") {
      if (autoReplanToggle && autoReplanToggle.checked) {
        getActiveTab().then((activeTab) => {
          if (activeTab && activeTab.id === message.tabId) {
            console.log("WebGPS Re-plan Loop: Tab navigated to", message.url);
            navToastText.textContent = `Navigated to ${message.title || "new page"}. Re-planning...`;
            navToast.style.display = "flex";

            setTimeout(async () => {
              try {
                await handlePlan();
              } finally {
                setTimeout(() => {
                  navToast.style.display = "none";
                }, 2000);
              }
            }, 600);
          }
        });
      }
    }

    if (message.action === "HIGHLIGHTED_ELEMENT_CLICKED") {
      console.log("WebGPS: User interacted with element #", message.element_id);
    }
  });

  // Event Listeners
  planBtn.addEventListener("click", handlePlan);
  scanBtn.addEventListener("click", handleScanOnly);

  manualHighlightBtn.addEventListener("click", () => {
    const val = parseInt(manualHighlightInput.value, 10);
    if (!isNaN(val) && val > 0) {
      triggerHighlight(val);
    }
  });

  manualHighlightInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const val = parseInt(manualHighlightInput.value, 10);
      if (!isNaN(val) && val > 0) {
        triggerHighlight(val);
      }
    }
  });

  clearHighlightBtn.addEventListener("click", clearActiveHighlight);

  // Initialize
  checkBackendStatus();
});
