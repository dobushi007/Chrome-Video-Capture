import React from 'react';
import { createRoot } from 'react-dom/client';
import ContentWrapper from './Content';
import '../../assets/styles/tailwind.css';
import { BackgroundEvents, ContentEvents } from '../../common/util';
let root = null;
// Put content app in shadow DOM so we can encapsulate the style (otherwise it inherits from page)
// create screenspace container
const container = document.createElement('screenspace-container');
container.className = 'screenspace';
container.setAttribute('style', 'all: initial;');
// create shadow under container
const shadow = container.attachShadow({ mode: 'open' });
// create inner div inside shadow
const innerDiv = document.createElement('div');
innerDiv.id = 'shadow-container';
shadow.appendChild(innerDiv);
// create tailwind style
const linkElem = document.createElement('link');
linkElem.setAttribute('rel', 'stylesheet');
const linkUrl = chrome.runtime.getURL('tailwind.css');
linkElem.setAttribute('href', linkUrl);
// add tailwind inside shadow
shadow.appendChild(linkElem);
// append screenspace container to document
document.lastChild.appendChild(container);

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  switch (request.type) {
    case ContentEvents.setWindowZoom:
      document.body.style.zoom = request.data.zoom;
      break;
    case ContentEvents.getWindowZoom:
      sendResponse({ pageZoom: document.body.style.zoom });
      break;
    case ContentEvents.startCountdown:
      try {
        root.unmount();
        root = createRoot(shadow);
        root.render(<ContentWrapper />);
      } catch (e) {}
      break;
    default:
      break;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.shiftKey && (event.ctrlKey || event.metaKey) && event.key === 'e') {
    root.render(<ContentWrapper />);
  } else if ((event.ctrlKey || event.metaKey) && event.key === 'e') {
    chrome.runtime.sendMessage({ type: BackgroundEvents.takeScreenshot });
  }
});

// create root with shadow and render jsx
root = createRoot(shadow);
