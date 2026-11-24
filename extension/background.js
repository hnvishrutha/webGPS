/**
 * background.js - WebGPS Manifest V3 Service Worker
 *
 * Configures side panel behavior to open seamlessly when
 * the extension action icon in the Chrome toolbar is clicked.
 */

// Enable side panel to open on action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("WebGPS: Failed to set panel behavior:", error));

chrome.runtime.onInstalled.addListener(() => {
  console.log("WebGPS Extension installed successfully.");
});
