/**
 * sidepanel.js - WebGPS Side Panel Controller
 *
 * Coordinates scanning requests, backend /plan communication,
 * and DOM highlighting between the side panel UI and active webpage.
 */

document.addEventListener("DOMContentLoaded", () => {
  const BACKEND_URL = "http://127.0.0.1:5000";

  // Action Buttons
  const planBtn = document.getElementById("planBtn");
  const scanBtn = document.getElementById("scanBtn");
  const goalInput = document.getElementById("goalInput");

  // Status & Metrics
  const statsBar = document.getElementById("statsBar");
  const totalCountEl = document.getElementById("totalCount");
  const inViewCountEl = document.getElementById("inViewCount");
  const sensitiveCountEl = document.getElementById("sensitiveCount");
  const pageTitleBadge = document.getElementById("pageTitleBadge");
  const emptyState = document.getElementById("emptyState");
  const elementsList = document.getElementById("elementsList");

  // Active AI Guidance Card (Step 4)
  const activeGuidanceCard = document.getElementById("activeGuidanceCard");
  const guidanceBadge = document.getElementById("guidanceBadge");
  const guidanceText = document.getElementById("guidanceText");
  const guidanceWarning = document.getElementById("guidanceWarning");
  const finalStepAlert = document.getElementById("finalStepAlert");
  const clearHighlightBtn = document.getElementById("clearHighlightBtn");
  const candidatesContainer = document.getElementById("candidatesContainer");
  const candidatesList = document.getElementById("candidatesList");

  // Manual Highlighter Controls (Step 3)
  const manualHighlightInput = document.getElementById("manualHighlightInput");
  const manualHighlightBtn = document.getElementById("manualHighlightBtn");

  // State Management
  let scannedElements = [];
  let currentActiveId = null;
  let navigationHistory = []; // Last 5 steps per Contract
  let currentSessionId = "webgps_session_" + Date.now();

  /**
   * Retrieves the currently active browser tab.
   */
  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs.length > 0 ? tabs[0] : null;
  }

  /**
   * Sends a message to the active tab, programmatically injecting
   * content script if the tab was loaded before extension initialization.
   */
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
   * Scans elements from the active tab and updates UI state.
   */
  async function performScan() {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      throw new Error("No active browser tab detected.");
    }

    if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("chrome-extension://")) {
      throw new Error("Extensions cannot scan browser internal pages. Please navigate to any web page or localhost.");
    }

    const response = await sendContentMessage(tab.id, { action: "SCAN_PAGE" });
    if (response && response.success && response.data) {
      renderElements(response.data.elements, response.data.page_title);
      return response.data;
    } else {
      throw new Error(response ? response.error : "Failed to retrieve page scan.");
    }
  }

  /**
   * Calls Flask backend /plan endpoint with contract parameters.
   */
  async function requestPlanFromBackend(goal, url, pageTitle, elements) {
    const payload = {
      session_id: currentSessionId,
      goal: goal,
      url: url,
      page_title: pageTitle,
      elements: elements,
      history: navigationHistory.slice(-5)
    };

    const res = await fetch(`${BACKEND_URL}/plan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Backend returned HTTP ${res.status}`);
    }

    return await res.json();
  }

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

        // Record in history (max 5)
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

  /**
   * Updates the Active Guidance callout banner in the side panel.
   */
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

  /**
   * Displays candidate selection chips when planner is unsure.
   */
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

  /**
   * Clears any active highlight on page and resets UI.
   */
  async function clearActiveHighlight() {
    const tab = await getActiveTab();
    if (tab && tab.id) {
      try {
        await sendContentMessage(tab.id, { action: "CLEAR_HIGHLIGHT" });
      } catch (e) {
        // Ignore
      }
    }
    activeGuidanceCard.style.display = "none";
    currentActiveId = null;
    document.querySelectorAll(".element-card.is-active").forEach((c) => c.classList.remove("is-active"));
  }

  /**
   * Highlights the corresponding card in the side panel list.
   */
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

  /**
   * Renders the scanned elements into the side panel card list.
   */
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
   * Action 1: AI Planner ("Plan Next Step")
   * Combines scanning, Flask /plan API call, validation, and auto-highlighting.
   */
  async function handlePlan() {
    const goal = goalInput.value.trim();
    if (!goal) {
      alert("Please enter a navigation goal first.");
      goalInput.focus();
      return;
    }

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
      // 1. Scan page elements
      const scanData = await performScan();
      if (!scanData || scanData.elements.length === 0) {
        throw new Error("No interactive elements found to plan with.");
      }

      // 2. Request plan from backend /plan
      const planRes = await requestPlanFromBackend(
        goal,
        scanData.url,
        scanData.page_title,
        scanData.elements
      );

      console.log("WebGPS Plan Result:", planRes);

      // 3. Highlight target element
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
        <small style="color: #94a3b8; display: block; margin-top: 4px;">Make sure the Flask backend is running on <code>http://127.0.0.1:5000</code>.</small>
      `;
      elementsList.style.display = "none";
    } finally {
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
   * Action 2: Inspect Scan Only
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
});
