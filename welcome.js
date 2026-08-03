// Inline handlers are blocked by the MV3 content security policy.
document.getElementById('open-settings')
  .addEventListener('click', () => chrome.runtime.openOptionsPage());
