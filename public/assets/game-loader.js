/**
 * InOut / Konjo Bet Global Game Loading Screen Controller
 */
(function (global) {
  'use strict';

  function hideLoader(delayMs) {
    const delay = typeof delayMs === 'number' ? delayMs : 200;
    setTimeout(() => {
      const loader = document.getElementById('inoutLoader');
      if (loader) {
        loader.classList.add('inout-loader-hidden');
        setTimeout(() => {
          if (loader.parentNode) {
            loader.style.display = 'none';
          }
        }, 450);
      }
    }, delay);
  }

  global.hideGameLoader = hideLoader;

  // Auto-hide after window load as a safety fallback
  window.addEventListener('load', () => {
    hideLoader(500);
  });

  // Maximum fallback timeout: guarantee dismissal within 1.5s
  setTimeout(() => {
    hideLoader(0);
  }, 1500);

})(typeof window !== 'undefined' ? window : this);
