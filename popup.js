const partyButton = document.getElementById('party-button');

partyButton.onclick = () => {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, { party: true }, response => {

    });
  });
}
