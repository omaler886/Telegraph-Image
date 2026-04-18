(function () {
  var uploadErrorMessage = '';

  function normalizeMessage(message) {
    if (!message) return 'Upload failed';
    var text = String(message).replace(/\s+/g, ' ').trim();
    if (!text) return 'Upload failed';
    return text;
  }

  function setUploadError(message) {
    uploadErrorMessage = normalizeMessage(message);
    window.__uploadErrorMessage = uploadErrorMessage;
    renderUploadError();
  }

  function tryParseErrorBody(bodyText) {
    if (!bodyText) return '';
    try {
      var parsed = JSON.parse(bodyText);
      return parsed.error || parsed.description || parsed.message || bodyText;
    } catch (error) {
      return bodyText;
    }
  }

  function isVisible(node) {
    if (!node) return false;
    if (node.hidden) return false;
    if (node.style && node.style.display === 'none') return false;
    var computed = window.getComputedStyle ? window.getComputedStyle(node) : null;
    return !computed || computed.display !== 'none';
  }

  function findErrorNode() {
    var wrapper = document.querySelector('.wrapper.error');
    if (wrapper) {
      return wrapper.querySelector('.area.error .text-area span') || wrapper.querySelector('.text-area span');
    }

    var errorAreas = document.querySelectorAll('.area.error');
    for (var i = 0; i < errorAreas.length; i += 1) {
      if (isVisible(errorAreas[i])) {
        return errorAreas[i].querySelector('.text-area span');
      }
    }
    return null;
  }

  function renderUploadError() {
    if (!uploadErrorMessage) return;
    var errorNode = findErrorNode();
    if (!errorNode) return;
    errorNode.textContent = uploadErrorMessage;
    errorNode.title = uploadErrorMessage;
    errorNode.style.whiteSpace = 'normal';
    errorNode.style.wordBreak = 'break-word';
    errorNode.style.display = 'inline-block';
    errorNode.style.maxWidth = '240px';
    errorNode.style.lineHeight = '1.6';
    errorNode.style.textAlign = 'center';
  }

  function patchXHR() {
    if (!window.XMLHttpRequest) return;
    var originalOpen = XMLHttpRequest.prototype.open;
    var originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__uploadHelperUrl = typeof url === 'string' ? url : String(url || '');
      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      var requestUrl = this.__uploadHelperUrl || '';
      var isUploadRequest = /(^|\/)upload(\?|$)/.test(requestUrl);

      if (isUploadRequest) {
        this.addEventListener('load', function () {
          if (this.status >= 400) {
            var message = tryParseErrorBody(this.responseText);
            if (!message) {
              message = 'HTTP ' + this.status + (this.statusText ? ' ' + this.statusText : '');
            }
            setUploadError(message);
          }
        });
        this.addEventListener('error', function () {
          setUploadError('Network error occurred');
        });
        this.addEventListener('abort', function () {
          setUploadError('Request aborted');
        });
        this.addEventListener('timeout', function () {
          setUploadError('Request timed out');
        });
      }

      return originalSend.apply(this, arguments);
    };
  }

  function patchFetch() {
    if (!window.fetch) return;
    var originalFetch = window.fetch;

    window.fetch = function (input, init) {
      var requestUrl =
        typeof input === 'string'
          ? input
          : input && typeof input.url === 'string'
            ? input.url
            : '';
      var isUploadRequest = /(^|\/)upload(\?|$)/.test(requestUrl);

      return originalFetch.call(this, input, init).then(function (response) {
        if (isUploadRequest && !response.ok) {
          return response.clone().text().then(function (bodyText) {
            var message = tryParseErrorBody(bodyText);
            if (!message) {
              message = 'HTTP ' + response.status + (response.statusText ? ' ' + response.statusText : '');
            }
            setUploadError(message);
            return response;
          });
        }
        return response;
      }).catch(function (error) {
        if (isUploadRequest) {
          setUploadError(error && error.message ? error.message : 'Network error occurred');
        }
        throw error;
      });
    };
  }

  function installObserver() {
    function onReady() {
      renderUploadError();
      var observer = new MutationObserver(renderUploadError);
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      });
      window.setInterval(renderUploadError, 1000);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady);
    } else {
      onReady();
    }
  }

  window.__setUploadErrorMessage = setUploadError;
  patchXHR();
  patchFetch();
  installObserver();
})();
