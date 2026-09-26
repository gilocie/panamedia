let integrationEnabled = true;

// Load settings from storage
chrome.storage.local.get(['integrationEnabled'], (result) => {
  if (result.integrationEnabled !== undefined) {
    integrationEnabled = result.integrationEnabled;
  }
});

// Listen for message from popup/content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleIntegration') {
    integrationEnabled = message.enabled;
    chrome.storage.local.set({ integrationEnabled });
    sendResponse({ status: 'ok', enabled: integrationEnabled });
  } else if (message.action === 'getIntegrationStatus') {
    sendResponse({ enabled: integrationEnabled });
  } else if (message.action === 'downloadManual') {
    // Retrieve cookies for current page
    chrome.cookies.getAll({ url: message.url }, (cookies) => {
      let cookieString = '';
      if (cookies && cookies.length > 0) {
        cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      }
      
      const payload = {
        action: 'download',
        url: message.url,
        filename: '',
        isYoutube: message.url.includes('youtube.com/') || message.url.includes('youtu.be/'),
        headers: {
          'Cookie': cookieString,
          'User-Agent': navigator.userAgent,
          'Referer': message.url
        }
      };
      
      chrome.runtime.sendNativeMessage('com.netdownloader.native', payload, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.error('Manual download send error:', err.message);
          sendResponse({ status: 'error', error: err.message });
        } else {
          sendResponse({ status: 'ok' });
        }
      });
    });
    return true; // Keep message channel open asynchronously
  }
});

// Intercept downloads
chrome.downloads.onCreated.addListener((downloadItem) => {
  if (!integrationEnabled) return;
  
  // Skip downloads initiated by extension itself, or system pages
  if (downloadItem.url.startsWith('chrome-extension://') || 
      downloadItem.url.startsWith('chrome://') ||
      downloadItem.url.startsWith('data:') ||
      downloadItem.url.startsWith('blob:')) {
    return;
  }
  
  // Pause immediately to prevent browser from downloading in background
  chrome.downloads.pause(downloadItem.id);
  
  // Retrieve cookies for the download URL
  chrome.cookies.getAll({ url: downloadItem.url }, (cookies) => {
    let cookieString = '';
    if (cookies && cookies.length > 0) {
      cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    }
    
    // Get user-agent from navigator
    const userAgent = navigator.userAgent;
    
    // Prepare download payload
    const payload = {
      action: 'download',
      url: downloadItem.url,
      filename: downloadItem.filename ? downloadItem.filename.split(/[\\/]/).pop() : '',
      headers: {
        'Cookie': cookieString,
        'User-Agent': userAgent,
        'Referer': downloadItem.referrer || ''
      }
    };
    
    // Send to native messaging host
    chrome.runtime.sendNativeMessage('com.netdownloader.native', payload, (response) => {
      const err = chrome.runtime.lastError;
      if (err || !response || (response.status !== 'ok' && response.status !== 'launched')) {
        console.error('Native messaging host error:', err ? err.message : 'Unknown response');
        // Resume browser's default download if native host fails
        chrome.downloads.resume(downloadItem.id);
      } else {
        // Cancel browser download as native downloader has taken over!
        chrome.downloads.cancel(downloadItem.id);
      }
    });
  });
});
