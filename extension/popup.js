document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('integrationToggle');
  const badge = document.getElementById('statusBadge');
  const urlInput = document.getElementById('urlInput');
  const downloadBtn = document.getElementById('downloadBtn');

  // Load current status
  chrome.runtime.sendMessage({ action: 'getIntegrationStatus' }, (response) => {
    if (response) {
      toggle.checked = response.enabled;
      updateStatusBadge(response.enabled);
    }
  });

  // Handle toggle change
  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.runtime.sendMessage({ action: 'toggleIntegration', enabled: enabled }, (response) => {
      if (response) {
        updateStatusBadge(response.enabled);
      }
    });
  });

  // Automatically pre-fill the current tab URL
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].url) {
      const url = tabs[0].url;
      // Prefill if it's a web page and not a system page
      if (url.startsWith('http://') || url.startsWith('https://')) {
        urlInput.value = url;
      }
    }
  });

  // Handle manual download button click
  downloadBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) return;

    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Sending...';

    // Get active tab cookies and UA if possible
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      let referrer = '';
      if (tabs && tabs[0]) referrer = tabs[0].url;

      chrome.cookies.getAll({ url: url }, (cookies) => {
        let cookieString = '';
        if (cookies && cookies.length > 0) {
          cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        }

        const payload = {
          action: 'download',
          url: url,
          filename: '',
          headers: {
            'Cookie': cookieString,
            'User-Agent': navigator.userAgent,
            'Referer': referrer
          }
        };

        // If it's a YouTube link, flag it as youtube
        if (url.includes('youtube.com/') || url.includes('youtu.be/')) {
          payload.isYoutube = true;
        }

        chrome.runtime.sendNativeMessage('com.netdownloader.native', payload, (response) => {
          const err = chrome.runtime.lastError;
          downloadBtn.disabled = false;
          downloadBtn.textContent = 'Download';

          if (err || !response || (response.status !== 'ok' && response.status !== 'launched')) {
            alert('Could not communicate with net-downloader client. Make sure the desktop app is installed and integration is registered.');
          } else {
            urlInput.value = '';
            // Close the extension popup
            window.close();
          }
        });
      });
    });
  });

  function updateStatusBadge(enabled) {
    if (enabled) {
      badge.textContent = 'Active';
      badge.style.background = 'rgba(16, 185, 129, 0.15)';
      badge.style.color = '#34d399';
      badge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    } else {
      badge.textContent = 'Disabled';
      badge.style.background = 'rgba(239, 68, 68, 0.15)';
      badge.style.color = '#f87171';
      badge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    }
  }
});
