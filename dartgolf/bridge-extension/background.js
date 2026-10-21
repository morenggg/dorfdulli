/**
 * DartGolf Bridge – Hintergrunddienst.
 * Leitet Würfe und den Zustand des Autodarts-Tabs an offene DartGolf-Tabs weiter.
 */
const DARTGOLF_URLS = [
  'https://dorfdulliracing.de/dartgolf/*',
  'https://www.dorfdulliracing.de/dartgolf/*',
];

function forwardToDartGolf(message) {
  chrome.tabs.query({ url: DARTGOLF_URLS }, (tabs) => {
    for (const tab of tabs) {
      if (typeof tab.id !== 'number') continue;
      chrome.tabs.sendMessage(tab.id, message, () => { void chrome.runtime.lastError; });
    }
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message) return;
  if (message.type === 'dartgolf-throw') {
    forwardToDartGolf({ type: 'dartgolf-throw', payload: message.payload });
  } else if (message.type === 'dartgolf-autodarts') {
    forwardToDartGolf({ type: 'dartgolf-autodarts', state: message.state });
  }
});
