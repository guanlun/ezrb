chrome.runtime.onInstalled.addListener(function() {
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([{
      actions: [new chrome.declarativeContent.ShowPageAction()],
    }]);
  });
});