const MENU_ID = "qwen-reverse-image";

function installContextMenu() {
  chrome.contextMenus.remove(MENU_ID, () => {
    chrome.runtime.lastError;
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "反推生图 图片",
      contexts: ["image"],
    });
  });
}

chrome.runtime.onInstalled.addListener(installContextMenu);
chrome.runtime.onStartup.addListener(installContextMenu);
installContextMenu();

async function injectReverseImageUi(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["styles/content.css"],
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["scripts/content.js"],
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab || !tab.id || !info.srcUrl) {
    return;
  }

  try {
    await injectReverseImageUi(tab.id);
    await chrome.tabs.sendMessage(tab.id, {
      action: "qwenReverseImage.showModal",
      imageUrl: info.srcUrl,
    });
  } catch (error) {
    console.error("Failed to open reverse image modal:", error);
  }
});
