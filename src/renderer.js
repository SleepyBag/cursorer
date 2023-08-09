const zhutixButton = document.getElementById("zhutixButton");
zhutixButton.onclick = () => openWebsiteInNewWindow("https://zhutix.com/tag/cursors/");
const deviantArtButton = document.getElementById("deviantArtButton");
deviantArtButton.onclick = () => openWebsiteInNewWindow("https://www.deviantart.com/tag/cursors");

function openWebsiteInNewWindow(url) {
  // Create the browser window.
  const newWindow = window.open(url, '', 'height=768,width=1024');
}