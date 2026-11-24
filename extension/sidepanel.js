/**
 * sidepanel.js - WebGPS Side Panel Controller
 *
 * Coordinates scanning requests and DOM highlighting between the side panel UI
 * and the active webpage content script.
 */

document.addEventListener("DOMContentLoaded", () => {
  const scanBtn = document.getElementById("scanBtn");
  const goalInput = document.getElementById("goalInput");
  const statsBar = document.getElementById("statsBar");
  const totalCountEl = document.getElementById("totalCount");
  const inViewCountEl = document.getElementById("inViewCount");
  const sensitiveCountEl = document.getElementById("sensitiveCount");
  const pageTitleBadge = document.getElementById("pageTitleBadge");
  const emptyState = document.getElementById("emptyState");
  const elementsList = document.getElementById("elementsList");

  // Highlighter Controls (Step 3)
  const manualHighlightInput = document.getElementById("manualHighlightInput");
  const manualHighlightBtn = document.getElementById("manualHighlightBtn");
  const activeGuidanceCard = document.getElementById("activeGuidanceCard");
  const guidanceBadge = document.getElementById("guidanceBadge");
  const guidanceText = document.getElementById("guidanceText");
  const guidanceWarning = document.getElementById("guidanceWarning");
  const clearHighlightBtn = document.getElementById("clearHighlightBtn");

  // Local cache of scanned elements
  let scannedElements = [];
  let currentActiveId = null;

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
      await new Promise((r) => setTimeout(r, 100));
      return await chrome.tabs.sendMessage(tabId, message);
    }
  }

  /**
   * Highlights element on the live webpage and reflects it in the UI.
   */
  async function triggerHighlight(elementId, reasonText) {
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
        updateGuidanceCard(currentActiveId, isSensitive, label, reason);
        highlightCardInList(currentActiveId);
      } else {
        console.warn("Highlight failed:", response ? response.error : "Unknown error");
      }
    } catch (err) {
      console.error("Failed to highlight element:", err);
    }
  }

  /**
   * Updates the Active Guidance callout banner in the side panel.
   */
  function updateGuidanceCard(id, isSensitive, label, reason) {
    guidanceBadge.textContent = `#${id} ${isSensitive ? "🔒 Sensitive" : "Target"}`;

    if (isSensitive) {
      activeGuidanceCard.classList.add("is-sensitive-active");
      guidanceText.textContent = `WebGPS located sensitive field: "${label}".`;
      guidanceWarning.style.display = "flex";
    } else {
      activeGuidanceCard.classList.remove("is-sensitive-active");
      guidanceText.textContent = reason || `Click on "${label}" to proceed towards your goal.`;
      guidanceWarning.style.display = "none";
    }

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

    // Update stats
    const total = elements.length;
    const inView = elements.filter((e) => e.in_viewport).length;
    const sensitive = elements.filter((e) => e.sensitive).length;

    totalCountEl.textContent = total;
    inViewCountEl.textContent = inView;
    sensitiveCountEl.textContent = sensitive;
    statsBar.style.display = "grid";

    pageTitleBadge.textContent = pageTitle || "Scanned Page";
    pageTitleBadge.title = pageTitle || "";

    // Build cards
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

      // Click card to highlight this element on the page
      card.addEventListener("click", () => {
        triggerHighlight(el.id);
      });

      elementsList.appendChild(card);
    });

    emptyState.style.display = "none";
    elementsList.style.display = "flex";
  }

  /**
   * Action: Scan Current Page Elements
   */
  async function handleScan() {
    clearActiveHighlight();
    scanBtn.disabled = true;
    scanBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin">
        <line x1="12" y1="2" x2="12" y2="6"></line>
        <line x1="12" y1="18" x2="12" y2="22"></line>
        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
      </svg>
      <span>Scanning...</span>
    `;

    try {
      const tab = await getActiveTab();
      if (!tab || !tab.id) {
        throw new Error("No active browser tab found.");
      }

      if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("chrome-extension://")) {
        throw new Error("Chrome extensions cannot scan internal browser pages. Please open any web page or localhost.");
      }

      const response = await sendContentMessage(tab.id, { action: "SCAN_PAGE" });
      if (response && response.success && response.data) {
        renderElements(response.data.elements, response.data.page_title);
      } else {
        throw new Error(response ? response.error : "No response from page scanner.");
      }
    } catch (err) {
      console.error("Scan failed:", err);
      emptyState.style.display = "block";
      emptyState.querySelector(".empty-text").innerHTML = `
        <span style="color: #f87171; font-weight: 600;">Scan Failed:</span> ${err.message}
      `;
      elementsList.style.display = "none";
      statsBar.style.display = "none";
      pageTitleBadge.textContent = "Error";
    } finally {
      scanBtn.disabled = false;
      scanBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <span>Scan Page Elements</span>
      `;
    }
  }

  // Manual Highlight button trigger
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
  scanBtn.addEventListener("click", handleScan);
});
