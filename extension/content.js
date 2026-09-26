// Injected content script for YouTube and standard video elements

function addYoutubeDownloadButton() {
  if (document.getElementById('netdownloader-yt-btn')) return;

  const selectors = [
    '#top-row.ytd-watch-metadata #actions #actions-inner #menu ytd-menu-renderer #items',
    '#top-row.ytd-watch-metadata #actions-inner #menu ytd-menu-renderer #items',
    'ytd-watch-metadata #actions #menu ytd-menu-renderer #items',
    '#meta-contents #subscribe-button'
  ];

  let targetElement = null;
  for (const selector of selectors) {
    targetElement = document.querySelector(selector);
    if (targetElement) break;
  }

  if (!targetElement) return;

  const btn = document.createElement('button');
  btn.id = 'netdownloader-yt-btn';
  btn.style.background = 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)';
  btn.style.color = '#fff';
  btn.style.marginLeft = '12px';
  btn.style.border = 'none';
  btn.style.borderRadius = '18px';
  btn.style.padding = '0 16px';
  btn.style.height = '36px';
  btn.style.fontSize = '13px';
  btn.style.fontFamily = 'Roboto, Arial, sans-serif';
  btn.style.fontWeight = '500';
  btn.style.cursor = 'pointer';
  btn.style.display = 'inline-flex';
  btn.style.alignItems = 'center';
  btn.style.justifyContent = 'center';
  btn.style.gap = '6px';
  btn.style.boxShadow = '0 2px 10px rgba(99, 102, 241, 0.3)';
  btn.style.transition = 'all 0.2s ease-in-out';
  btn.style.outline = 'none';

  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/>
    </svg>
    <span>Download with NetDownloader</span>
  `;

  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'translateY(-1px)';
    btn.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.5)';
  });
  
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'translateY(0)';
    btn.style.boxShadow = '0 2px 10px rgba(99, 102, 241, 0.3)';
  });

  btn.addEventListener('click', () => {
    const videoUrl = window.location.href;
    btn.style.background = '#10b981';
    btn.style.boxShadow = '0 2px 10px rgba(16, 185, 129, 0.3)';
    btn.querySelector('span').textContent = 'Sending...';

    chrome.runtime.sendMessage({ action: 'downloadManual', url: videoUrl }, (res) => {
      if (res && res.status === 'ok') {
        btn.querySelector('span').textContent = 'Sent to Client!';
        setTimeout(resetButton, 3000);
      } else {
        btn.style.background = '#ef4444';
        btn.style.boxShadow = '0 2px 10px rgba(239, 68, 68, 0.3)';
        btn.querySelector('span').textContent = 'Failed!';
        setTimeout(resetButton, 3000);
      }
    });
  });

  function resetButton() {
    btn.style.background = 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)';
    btn.style.boxShadow = '0 2px 10px rgba(99, 102, 241, 0.3)';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/>
      </svg>
      <span>Download with NetDownloader</span>
    `;
  }

  targetElement.appendChild(btn);
}

// Inject floating overlay button on standard HTML5 video elements
function injectGeneralHoverButton(video) {
  if (video.dataset.ndInjected) return;
  video.dataset.ndInjected = 'true';

  const parent = video.parentElement;
  if (!parent) return;

  const parentStyle = window.getComputedStyle(parent);
  if (parentStyle.position === 'static') {
    parent.style.position = 'relative';
  }

  const btn = document.createElement('div');
  btn.className = 'netdownloader-hover-badge';
  btn.style.position = 'absolute';
  btn.style.top = '12px';
  btn.style.right = '12px';
  btn.style.zIndex = '2147483647';
  btn.style.background = 'rgba(15, 15, 22, 0.85)';
  btn.style.backdropFilter = 'blur(8px)';
  btn.style.border = '1px solid rgba(99, 102, 241, 0.4)';
  btn.style.borderRadius = '20px';
  btn.style.padding = '6px 12px';
  btn.style.cursor = 'pointer';
  btn.style.display = 'none'; // Hidden by default, shown on hover
  btn.style.alignItems = 'center';
  btn.style.gap = '6px';
  btn.style.color = '#fff';
  btn.style.fontFamily = 'system-ui, sans-serif';
  btn.style.fontSize = '11px';
  btn.style.fontWeight = 'bold';
  btn.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.5)';
  btn.style.transition = 'all 0.2s ease-in-out';
  btn.style.userSelect = 'none';

  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="12" height="12" fill="#818cf8">
      <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/>
    </svg>
    <span>Download Video</span>
  `;

  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)';
    btn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    btn.style.transform = 'scale(1.05)';
  });
  
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'rgba(15, 15, 22, 0.85)';
    btn.style.borderColor = 'rgba(99, 102, 241, 0.4)';
    btn.style.transform = 'scale(1)';
  });

  parent.addEventListener('mouseenter', () => {
    btn.style.display = 'flex';
  });
  
  parent.addEventListener('mouseleave', () => {
    btn.style.display = 'none';
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();

    let videoUrl = video.src || video.querySelector('source')?.src || window.location.href;
    if (window.location.host.includes('youtube.com') || window.location.host.includes('youtu.be')) {
      videoUrl = window.location.href;
    }

    btn.querySelector('span').textContent = 'Sending...';
    btn.style.background = '#10b981';

    chrome.runtime.sendMessage({ action: 'downloadManual', url: videoUrl }, (res) => {
      if (res && res.status === 'ok') {
        btn.querySelector('span').textContent = 'Sent!';
        setTimeout(resetBadge, 2000);
      } else {
        btn.querySelector('span').textContent = 'Failed!';
        btn.style.background = '#ef4444';
        setTimeout(resetBadge, 2000);
      }
    });
  });

  function resetBadge() {
    btn.querySelector('span').textContent = 'Download Video';
    btn.style.background = 'rgba(15, 15, 22, 0.85)';
  }

  parent.appendChild(btn);
}

function scanForVideos() {
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    if (video.offsetWidth < 100 || video.offsetHeight < 100) return;
    injectGeneralHoverButton(video);
  });
}

// Watch for changes in the DOM
const observer = new MutationObserver(() => {
  if (window.location.href.includes('youtube.com/watch')) {
    addYoutubeDownloadButton();
  }
  scanForVideos();
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial scans
if (window.location.href.includes('youtube.com/watch')) {
  setTimeout(addYoutubeDownloadButton, 1500);
}
setTimeout(scanForVideos, 1500);
// Periodically check for dynamically loaded elements
setInterval(scanForVideos, 2500);
