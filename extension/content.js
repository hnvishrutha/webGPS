/**
 * content.js - WebGPS Page Scanner, Highlighter & Contract Enforcer
 *
 * Responsibilities:
 * 1. Scans interactive elements on the page.
 * 2. Assigns deterministic integer IDs (1..N).
 * 3. Identifies sensitive fields (passwords, OTPs, CVV, Aadhaar, PAN) and flags them.
 * 4. STRICT PRIVACY HONESTY: Never extracts or leaks input values.
 * 5. Highlights target element N with animated glowing overlay and floating badge.
 * 6. Supports "Type this one yourself" sensitive field guidance.
 */

(() => {
  // Global reference map: id -> DOM element
  window.__webgps_elements = new Map();
  let currentHighlightedId = null;
  let activeOverlayEl = null;
  let repositionHandler = null;

  // Keyword patterns for sensitive fields
  const SENSITIVE_PATTERNS = [
    /password/i,
    /otp/i,
    /pin\b/i,
    /cvv/i,
    /cvc/i,
    /card.*num/i,
    /credit.*card/i,
    /debit.*card/i,
    /aadhaar/i,
    /aadhar/i,
    /pan\b/i,
    /ssn\b/i,
    /secret/i,
    /security.*code/i
  ];

  /**
   * Determines if an element should be treated as sensitive data.
   */
  function isSensitiveElement(el) {
    if (el.tagName === "INPUT" && el.type === "password") {
      return true;
    }

    const attrsToCheck = [
      el.getAttribute("name") || "",
      el.getAttribute("id") || "",
      el.getAttribute("placeholder") || "",
      el.getAttribute("aria-label") || "",
      el.getAttribute("autocomplete") || ""
    ];

    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) attrsToCheck.push(label.textContent || "");
    }
    const parentLabel = el.closest("label");
    if (parentLabel) attrsToCheck.push(parentLabel.textContent || "");

    const fullText = attrsToCheck.join(" ").toLowerCase();
    return SENSITIVE_PATTERNS.some((pattern) => pattern.test(fullText));
  }

  /**
   * Checks if an element is visible to the user.
   */
  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /**
   * Checks if an element is currently inside the visible viewport.
   */
  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
      rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
      rect.bottom > 0 &&
      rect.left < (window.innerWidth || document.documentElement.clientWidth) &&
      rect.right > 0
    );
  }

  /**
   * Finds the closest preceding heading or legend for contextual grouping.
   */
  function findNearestGroup(el) {
    const fieldset = el.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend && legend.textContent.trim()) {
        return legend.textContent.trim().substring(0, 40);
      }
    }

    let curr = el;
    while (curr && curr !== document.body) {
      let prev = curr.previousElementSibling;
      while (prev) {
        if (/^H[1-6]$/.test(prev.tagName)) {
          const text = prev.textContent.trim();
          if (text) return text.substring(0, 40);
        }
        const heading = prev.querySelector("h1, h2, h3, h4, h5, h6");
        if (heading && heading.textContent.trim()) {
          return heading.textContent.trim().substring(0, 40);
        }
        prev = prev.previousElementSibling;
      }
      curr = curr.parentElement;
    }
    return document.title ? document.title.substring(0, 30) : "General";
  }

  /**
   * Extracts clean, descriptive label text without reading input values.
   */
  function getCleanLabel(el) {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) {
      return ariaLabel.trim().substring(0, 80);
    }

    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label && label.textContent.trim()) {
        return label.textContent.trim().substring(0, 80);
      }
    }

    const parentLabel = el.closest("label");
    if (parentLabel && parentLabel.textContent.trim()) {
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll("input, select, textarea, button").forEach((c) => c.remove());
      const labelText = clone.textContent.trim();
      if (labelText) return labelText.substring(0, 80);
    }

    const placeholder = el.getAttribute("placeholder");
    if (placeholder && placeholder.trim()) {
      return placeholder.trim().substring(0, 80);
    }

    const innerText = el.innerText || el.textContent || "";
    if (innerText.trim()) {
      return innerText.trim().replace(/\s+/g, " ").substring(0, 80);
    }

    const title = el.getAttribute("title");
    if (title && title.trim()) {
      return title.trim().substring(0, 80);
    }

    const name = el.getAttribute("name");
    if (name && name.trim()) {
      return name.trim().substring(0, 80);
    }

    return `${el.tagName.toLowerCase()} element`;
  }

  /**
   * Scans the DOM and produces the standard Contract Element array.
   */
  function scanPageElements() {
    window.__webgps_elements.clear();

    const selector = [
      "a[href]",
      "button",
      "input:not([type='hidden'])",
      "select",
      "textarea",
      "[role='button']",
      "[role='link']",
      "[role='searchbox']",
      "[tabindex='0']"
    ].join(", ");

    const candidates = Array.from(document.querySelectorAll(selector));
    const elements = [];
    let currentId = 1;

    for (const el of candidates) {
      if (!isElementVisible(el)) continue;

      // Skip elements that are part of WebGPS overlays
      if (el.closest("#webgps-overlay-layer, #webgps-badge-layer")) continue;

      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role") || (tag === "a" ? "link" : tag === "button" ? "button" : tag);
      const type = el.getAttribute("type") || (tag === "input" ? "text" : undefined);
      const label = getCleanLabel(el);
      const sensitive = isSensitiveElement(el);
      const inView = isInViewport(el);
      const group = findNearestGroup(el);

      let options = undefined;
      if (tag === "select") {
        options = Array.from(el.options)
          .map((opt) => opt.text.trim())
          .filter(Boolean)
          .slice(0, 20);
      }

      const elementData = {
        id: currentId,
        tag: tag,
        role: role,
        label: label,
        type: type,
        visible: true,
        in_viewport: inView,
        sensitive: sensitive,
        group: group,
        options: options
      };

      window.__webgps_elements.set(currentId, el);
      elements.push(elementData);

      currentId++;
      if (elements.length >= 100) break;
    }

    return {
      elements: elements,
      page_title: document.title || "Untitled Page",
      url: window.location.href,
      timestamp: Date.now()
    };
  }

  /**
   * Removes any active highlight overlay from the webpage.
   */
  function clearHighlight() {
    if (activeOverlayEl) {
      activeOverlayEl.remove();
      activeOverlayEl = null;
    }
    if (repositionHandler) {
      window.removeEventListener("scroll", repositionHandler, true);
      window.removeEventListener("resize", repositionHandler, true);
      repositionHandler = null;
    }
    currentHighlightedId = null;
  }

  /**
   * Injects CSS animation keyframes for the highlight box into the page.
   */
  function ensureHighlightStyles() {
    if (document.getElementById("webgps-style-block")) return;
    const style = document.createElement("style");
    style.id = "webgps-style-block";
    style.textContent = `
      @keyframes webgps-pulse-primary {
        0% { box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.4), 0 0 18px rgba(99, 102, 241, 0.5); }
        50% { box-shadow: 0 0 0 7px rgba(99, 102, 241, 0.15), 0 0 28px rgba(99, 102, 241, 0.7); }
        100% { box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.4), 0 0 18px rgba(99, 102, 241, 0.5); }
      }
      @keyframes webgps-pulse-sensitive {
        0% { box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.4), 0 0 18px rgba(245, 158, 11, 0.5); }
        50% { box-shadow: 0 0 0 7px rgba(245, 158, 11, 0.15), 0 0 28px rgba(245, 158, 11, 0.7); }
        100% { box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.4), 0 0 18px rgba(245, 158, 11, 0.5); }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Highlights element N with a smooth scroll, glowing outline, and floating badge.
   * If the element is sensitive, uses amber warning styling and notice.
   */
  function highlightElement(elementId, reason) {
    ensureHighlightStyles();
    clearHighlight();

    // Re-scan if elements cache is empty
    if (window.__webgps_elements.size === 0) {
      scanPageElements();
    }

    const targetEl = window.__webgps_elements.get(Number(elementId));
    if (!targetEl) {
      console.warn(`WebGPS: Element ID #${elementId} not found on page.`);
      return { success: false, error: `Element #${elementId} not found` };
    }

    const isSensitive = isSensitiveElement(targetEl);
    currentHighlightedId = elementId;

    // Smoothly scroll the element into view
    targetEl.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest"
    });

    // Create the overlay container
    const overlay = document.createElement("div");
    overlay.id = "webgps-overlay-layer";
    overlay.style.cssText = `
      position: absolute;
      pointer-events: none;
      z-index: 2147483645;
      border-radius: 6px;
      transition: all 0.15s ease-out;
      box-sizing: border-box;
    `;

    if (isSensitive) {
      overlay.style.border = "3px solid #f59e0b";
      overlay.style.animation = "webgps-pulse-sensitive 2s infinite";
    } else {
      overlay.style.border = "3px solid #6366f1";
      overlay.style.animation = "webgps-pulse-primary 2s infinite";
    }

    // Floating Badge
    const badge = document.createElement("div");
    badge.style.cssText = `
      position: absolute;
      top: -30px;
      left: -2px;
      background: ${isSensitive ? "#b45309" : "#4338ca"};
      color: #ffffff;
      padding: 3px 9px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      gap: 5px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
      white-space: nowrap;
      pointer-events: none;
    `;

    if (isSensitive) {
      badge.innerHTML = `<span>🔒 #${elementId} Sensitive: Type this yourself</span>`;
    } else {
      badge.innerHTML = `<span>📍 #${elementId} ${reason ? reason.substring(0, 45) : "Click here"}</span>`;
    }

    overlay.appendChild(badge);
    document.body.appendChild(overlay);
    activeOverlayEl = overlay;

    // Position updater function
    function updateOverlayPosition() {
      if (!targetEl || !overlay) return;
      const rect = targetEl.getBoundingClientRect();
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;

      // Add a slight 4px padding around target element
      const padding = 4;
      overlay.style.left = `${rect.left + scrollX - padding}px`;
      overlay.style.top = `${rect.top + scrollY - padding}px`;
      overlay.style.width = `${rect.width + padding * 2}px`;
      overlay.style.height = `${rect.height + padding * 2}px`;

      // Flip badge below if near top of page
      if (rect.top < 36) {
        badge.style.top = `${rect.height + padding * 2 + 4}px`;
      } else {
        badge.style.top = `-30px`;
      }
    }

    // Immediate position calculation & delay calculation after smooth scroll
    updateOverlayPosition();
    setTimeout(updateOverlayPosition, 250);
    setTimeout(updateOverlayPosition, 500);

    // Keep overlay positioned during user scroll or resize
    repositionHandler = updateOverlayPosition;
    window.addEventListener("scroll", repositionHandler, { passive: true, capture: true });
    window.addEventListener("resize", repositionHandler, { passive: true });

    return {
      success: true,
      element_id: elementId,
      sensitive: isSensitive
    };
  }

  // Listen for messages from side panel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "PING") {
      sendResponse({ status: "PONG" });
      return true;
    }

    if (message.action === "SCAN_PAGE") {
      try {
        const scanResult = scanPageElements();
        sendResponse({ success: true, data: scanResult });
      } catch (err) {
        console.error("WebGPS Scanner Error:", err);
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (message.action === "HIGHLIGHT_ELEMENT") {
      try {
        const res = highlightElement(message.element_id, message.reason);
        sendResponse(res);
      } catch (err) {
        console.error("WebGPS Highlight Error:", err);
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (message.action === "CLEAR_HIGHLIGHT") {
      clearHighlight();
      sendResponse({ success: true });
      return true;
    }
  });

  console.log("WebGPS Content Script (with Highlighter) loaded and active.");
})();
