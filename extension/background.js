/**
 * background.js - WebGPS Manifest V3 Service Worker
 *
 * Responsibilities:
 * 1. Enables side panel to open on extension action click.
 * 2. Monitors tab navigation events to power the automatic Re-plan Loop.
 */

// Enable side panel to open on toolbar action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("WebGPS: Failed to set panel behavior:", error));

chrome.runtime.onInstalled.addListener(() => {
  console.log("WebGPS Extension installed successfully.");
});

// Broadcast tab navigation events to side panel for Re-plan Loop
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    !tab.url.startsWith("chrome://") &&
    !tab.url.startsWith("chrome-extension://")
  ) {
    chrome.runtime.sendMessage({
      action: "TAB_NAVIGATED",
      tabId: tabId,
      url: tab.url,
      title: tab.title
    }).catch(() => {
      // Side panel may not be open; ignore harmless disconnected port
    });
  }
});
