/**
 * content.js - WebGPS Page Scanner & Contract Enforcer
 *
 * Responsibilities:
 * 1. Scans interactive elements on the page (a, button, input, select, textarea, etc.).
 * 2. Assigns deterministic integer IDs (1..N).
 * 3. Identifies sensitive fields (passwords, OTPs, CVV, Aadhaar, PAN) and flags them.
 * 4. STRICT PRIVACY HONESTY: Never extracts or leaks input values.
 * 5. Caches element references in window.__webgps_elements for fast highlighting.
 */

(() => {
  // Global reference map: id -> DOM element
  window.__webgps_elements = new Map();

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
    // 1. Password input type is always sensitive
    if (el.tagName === "INPUT" && el.type === "password") {
      return true;
    }

    // 2. Check attributes against sensitive keywords
    const attrsToCheck = [
      el.getAttribute("name") || "",
      el.getAttribute("id") || "",
      el.getAttribute("placeholder") || "",
      el.getAttribute("aria-label") || "",
      el.getAttribute("autocomplete") || ""
    ];

    // Check associated <label> text
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
    // Check if inside fieldset with legend
    const fieldset = el.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend && legend.textContent.trim()) {
        return legend.textContent.trim().substring(0, 40);
      }
    }

    // Search upwards or backward for the nearest heading
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
    // 1. Explicit aria-label
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) {
      return ariaLabel.trim().substring(0, 80);
    }

    // 2. Associated label by for="id"
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label && label.textContent.trim()) {
        return label.textContent.trim().substring(0, 80);
      }
    }

    // 3. Parent label
    const parentLabel = el.closest("label");
    if (parentLabel && parentLabel.textContent.trim()) {
      // Clone and remove inputs to get text only
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll("input, select, textarea, button").forEach((c) => c.remove());
      const labelText = clone.textContent.trim();
      if (labelText) return labelText.substring(0, 80);
    }

    // 4. Placeholder for inputs
    const placeholder = el.getAttribute("placeholder");
    if (placeholder && placeholder.trim()) {
      return placeholder.trim().substring(0, 80);
    }

    // 5. Button/Link inner text or title
    const innerText = el.innerText || el.textContent || "";
    if (innerText.trim()) {
      return innerText.trim().replace(/\s+/g, " ").substring(0, 80);
    }

    // 6. Title or Name attribute
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

      // Skip elements that are inside the WebGPS sidepanel iframe/ui itself
      if (el.closest("#webgps-container, #webgps-badge-layer")) continue;

      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role") || (tag === "a" ? "link" : tag === "button" ? "button" : tag);
      const type = el.getAttribute("type") || (tag === "input" ? "text" : undefined);
      const label = getCleanLabel(el);
      const sensitive = isSensitiveElement(el);
      const inView = isInViewport(el);
      const group = findNearestGroup(el);

      // Collect options for select dropdowns (for form filling mapping)
      let options = undefined;
      if (tag === "select") {
        options = Array.from(el.options)
          .map((opt) => opt.text.trim())
          .filter(Boolean)
          .slice(0, 20); // Cap dropdown options
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

      // Store in memory map for later highlighter & filler access
      window.__webgps_elements.set(currentId, el);
      elements.push(elementData);

      currentId++;
      if (elements.length >= 100) break; // Contract cap at 100 elements
    }

    return {
      elements: elements,
      page_title: document.title || "Untitled Page",
      url: window.location.href,
      timestamp: Date.now()
    };
  }

  // Listen for requests from extension side panel
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
  });

  console.log("WebGPS Content Script loaded and active.");
})();
