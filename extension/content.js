/**
 * content.js - WebGPS Page Scanner, Highlighter, Form Filler & Contract Enforcer
 *
 * Responsibilities:
 * 1. Scans interactive elements and classifies sensitive fields.
 * 2. Strictly adheres to privacy contracts: never reads or leaks input values.
 * 3. Highlights target elements with animated focus overlay.
 * 4. Fills form fields ONLY after explicit user confirmation on non-sensitive fields.
 * 5. Fires DOM input & change events for modern frontend frameworks.
 * 6. Checks for insecure transport / password on non-HTTPS.
 */

(() => {
  window.__webgps_elements = new Map();
  let currentHighlightedId = null;
  let activeOverlayEl = null;
  let repositionHandler = null;

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

  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
      rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
      rect.bottom > 0 &&
      rect.left < (window.innerWidth || document.documentElement.clientWidth) &&
      rect.right > 0
    );
  }

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

    // Safety flags check
    const isHttp = window.location.protocol === "http:" && !window.location.hostname.includes("localhost") && !window.location.hostname.includes("127.0.0.1");
    const hasPasswordOnHttp = isHttp && document.querySelector("input[type='password']") !== null;

    return {
      elements: elements,
      page_title: document.title || "Untitled Page",
      url: window.location.href,
      has_insecure_inputs: hasPasswordOnHttp,
      is_http: isHttp,
      timestamp: Date.now()
    };
  }

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

  function highlightElement(elementId, reason) {
    ensureHighlightStyles();
    clearHighlight();

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

    targetEl.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest"
    });

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

    function updateOverlayPosition() {
      if (!targetEl || !overlay) return;
      const rect = targetEl.getBoundingClientRect();
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;

      const padding = 4;
      overlay.style.left = `${rect.left + scrollX - padding}px`;
      overlay.style.top = `${rect.top + scrollY - padding}px`;
      overlay.style.width = `${rect.width + padding * 2}px`;
      overlay.style.height = `${rect.height + padding * 2}px`;

      if (rect.top < 36) {
        badge.style.top = `${rect.height + padding * 2 + 4}px`;
      } else {
        badge.style.top = `-30px`;
      }
    }

    updateOverlayPosition();
    setTimeout(updateOverlayPosition, 250);
    setTimeout(updateOverlayPosition, 500);

    repositionHandler = updateOverlayPosition;
    window.addEventListener("scroll", repositionHandler, { passive: true, capture: true });
    window.addEventListener("resize", repositionHandler, { passive: true });

    targetEl.addEventListener("click", () => {
      chrome.runtime.sendMessage({
        action: "HIGHLIGHTED_ELEMENT_CLICKED",
        element_id: elementId
      }).catch(() => {});
    }, { once: true });

    return {
      success: true,
      element_id: elementId,
      sensitive: isSensitive
    };
  }

  /**
   * Fills form fields on the page following user confirmation.
   * Strictly enforces that sensitive fields are NEVER filled.
   */
  function fillFormFields(assignments) {
    let filledCount = 0;

    for (const item of (assignments || [])) {
      const el = window.__webgps_elements.get(Number(item.field_id));
      if (!el) continue;

      // Hard Security Shield: Never auto-fill sensitive fields
      if (isSensitiveElement(el)) {
        console.warn(`WebGPS Shield: Blocked auto-fill on sensitive field #${item.field_id}`);
        continue;
      }

      if (el.tagName === "SELECT") {
        let matched = false;
        const targetVal = String(item.value).toLowerCase();
        for (let i = 0; i < el.options.length; i++) {
          const opt = el.options[i];
          if (opt.text.toLowerCase() === targetVal || opt.value.toLowerCase() === targetVal) {
            el.selectedIndex = i;
            matched = true;
            break;
          }
        }
        if (!matched && el.options.length > 1) {
          el.selectedIndex = 1;
        }
      } else {
        el.value = item.value;
      }

      // Dispatch standard DOM events so Angular, React, Vue, and vanilla JS pick up changes
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));

      // Temporary green outline to visually confirm filled field
      const origBorder = el.style.border;
      const origTransition = el.style.transition;
      el.style.transition = "border-color 0.2s ease, box-shadow 0.2s ease";
      el.style.borderColor = "#10b981";
      el.style.boxShadow = "0 0 0 3px rgba(16, 185, 129, 0.25)";

      setTimeout(() => {
        el.style.borderColor = origBorder;
        el.style.boxShadow = "";
        el.style.transition = origTransition;
      }, 2500);

      filledCount++;
    }

    return { success: true, filled_count: filledCount };
  }

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

    if (message.action === "FILL_FIELDS") {
      try {
        const res = fillFormFields(message.assignments);
        sendResponse(res);
      } catch (err) {
        console.error("WebGPS Fill Error:", err);
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

  console.log("WebGPS Content Script (Scanner + Highlighter + Form Filler) loaded and active.");
})();
