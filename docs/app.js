(function() {
  'use strict';

  // ==================== CONFIG ====================
  var CONFIG = {
    appName: 'Wiki Explorer',
    storageKey: 'mdg_wikiexplorer',
    api: {
      searchUrl: 'https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srsearch=',
      summaryUrl: 'https://en.wikipedia.org/api/rest_v1/page/summary/',
      randomUrl: 'https://en.wikipedia.org/api/rest_v1/page/random/summary',
      qrUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data='
    }
  };

  // ==================== STATE ====================
  var state = {
    currentScreen: 'home',
    screenHistory: [],
    isLoading: false,
    error: null,
    data: {
      savedArticles: {} // Keyed by normalized title: { title, description, extract, thumbnail, url }
    },
    currentArticle: null // Holds the currently viewed article summary data
  };

  // ==================== DOM REFS ====================
  var screens = {};

  function collectScreens() {
    document.querySelectorAll('.screen').forEach(function(s) {
      if (s.id) screens[s.id] = s;
    });
  }

  // ==================== NAVIGATION ====================
  function navigateTo(screenId, options) {
    options = options || {};
    var addToHistory = options.addToHistory !== false;

    if (addToHistory && state.currentScreen) {
      state.screenHistory.push(state.currentScreen);
    }

    Object.values(screens).forEach(function(s) { s.classList.add('hidden'); });
    if (screens[screenId]) {
      screens[screenId].classList.remove('hidden');
      state.currentScreen = screenId;
      onScreenEnter(screenId);
      focusFirst(screens[screenId]);
    }
  }

  function navigateBack() {
    // If QR modal is open, close it first instead of going back a screen
    var qrModal = document.getElementById('qr-modal');
    if (qrModal && !qrModal.classList.contains('hidden')) {
      closeQR();
      return;
    }

    if (state.screenHistory.length > 0) {
      navigateTo(state.screenHistory.pop(), { addToHistory: false });
    }
  }

  // ==================== FOCUS MANAGEMENT ====================
  function focusFirst(container) {
    var el = container.querySelector('.focusable:not([disabled]):not(.hidden)');
    if (el) el.focus();
  }

  function moveFocus(direction) {
    var container = screens[state.currentScreen];
    if (!container) return;

    // Handle modal focus if open
    var qrModal = document.getElementById('qr-modal');
    if (qrModal && !qrModal.classList.contains('hidden')) {
      container = qrModal;
    }

    var focusables = Array.from(
      container.querySelectorAll('.focusable:not([disabled]):not(.hidden)')
    );
    if (focusables.length === 0) return;

    var current = document.activeElement;
    var idx = focusables.indexOf(current);

    if (idx === -1) {
      focusFirst(container);
      return;
    }

    var nextIdx;
    if (direction === 'up' || direction === 'left') {
      nextIdx = idx > 0 ? idx - 1 : focusables.length - 1;
    } else {
      nextIdx = idx < focusables.length - 1 ? idx + 1 : 0;
    }
    focusables[nextIdx].focus();

    var scrollParent = focusables[nextIdx].closest('.content, .list-container');
    if (scrollParent) {
      focusables[nextIdx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // ==================== WIKIPEDIA API LAYER ====================
  function searchWikipedia(query) {
    if (!query || query.trim() === '') {
      showToast('Please enter a search query', 'error');
      return;
    }

    setLoading(true, 'Searching Wikipedia...');
    clearError();

    var url = CONFIG.api.searchUrl + encodeURIComponent(query);

    fetch(url)
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP status ' + res.status);
        return res.json();
      })
      .then(function(data) {
        setLoading(false);
        var results = data.query ? data.query.search : [];
        renderSearchResults(results);
      })
      .catch(function(err) {
        setLoading(false);
        setError('Search failed. Check connection.');
        console.error('[WikiAPI] Search Error:', err);
      });
  }

  function fetchArticleSummary(title, skipApi) {
    // If offline and article is saved, load from localStorage
    if (state.data.savedArticles[title]) {
      loadArticleDetail(state.data.savedArticles[title]);
      navigateTo('detail');
      showToast('Loaded offline version', 'success');
      return;
    }

    if (skipApi) {
      setError('Article not available offline');
      return;
    }

    setLoading(true, 'Fetching article...');
    clearError();

    var url = CONFIG.api.summaryUrl + encodeURIComponent(title);

    fetch(url)
      .then(function(res) {
        if (!res.ok) throw new Error('Article not found or API error.');
        return res.json();
      })
      .then(function(data) {
        setLoading(false);
        loadArticleDetail(data);
        navigateTo('detail');
      })
      .catch(function(err) {
        setLoading(false);
        setError('Failed to fetch article. Check connection.');
        console.error('[WikiAPI] Fetch Error:', err);
      });
  }

  function fetchRandomArticle() {
    setLoading(true, 'Getting random article...');
    clearError();

    fetch(CONFIG.api.randomUrl)
      .then(function(res) {
        if (!res.ok) throw new Error('API error fetching random page.');
        return res.json();
      })
      .then(function(data) {
        setLoading(false);
        loadArticleDetail(data);
        navigateTo('detail');
      })
      .catch(function(err) {
        setLoading(false);
        setError('Could not fetch random page.');
        console.error('[WikiAPI] Random Error:', err);
      });
  }

  // ==================== RENDER HELPERS ====================
  function renderSearchResults(results) {
    var container = document.getElementById('search-results');
    if (!container) return;
    container.innerHTML = '';

    if (results.length === 0) {
      container.innerHTML = '<div class="error-container"><div class="error-message">No matching topics found</div></div>';
      return;
    }

    results.forEach(function(item) {
      var snippet = item.snippet.replace(/<\/?[^>]+(>|$)/g, ''); // Strip HTML tags
      var el = document.createElement('button');
      el.className = 'list-item focusable';
      el.dataset.action = 'view-article';
      el.dataset.title = item.title;
      el.innerHTML = 
        '<span class="list-item-icon">📝</span>' +
        '<div class="list-item-content">' +
          '<div class="list-item-title">' + item.title + '</div>' +
          '<div class="list-item-meta">' + snippet + '</div>' +
        '</div>';
      container.appendChild(el);
    });

    // Refresh focus to focus the first result
    focusFirst(screens.search);
  }

  function loadArticleDetail(data) {
    state.currentArticle = data;
    
    document.getElementById('detail-title').textContent = data.title;
    document.getElementById('detail-description').textContent = data.description || 'Encyclopedia Article';
    document.getElementById('detail-extract').textContent = data.extract;

    // Display image if available
    var thumbContainer = document.getElementById('detail-thumbnail-container');
    var thumbImg = document.getElementById('detail-thumbnail');
    if (data.thumbnail && data.thumbnail.source) {
      thumbImg.src = data.thumbnail.source;
      thumbContainer.classList.remove('hidden');
    } else {
      thumbContainer.classList.add('hidden');
      thumbImg.src = '';
    }

    // Reset scroll to top
    var scrollContainer = document.getElementById('detail-scroll-container');
    if (scrollContainer) scrollContainer.scrollTop = 0;

    // Update save button state
    updateSaveButtonUI(data.title);
  }

  function renderSavedList() {
    var container = document.getElementById('saved-list');
    if (!container) return;
    container.innerHTML = '';

    var savedTitles = Object.keys(state.data.savedArticles);
    if (savedTitles.length === 0) {
      container.innerHTML = 
        '<div class="error-container" style="padding: 20px;">' +
          '<div class="error-icon">📚</div>' +
          '<div class="error-message">No offline articles saved yet. Save articles from the reader to view them here.</div>' +
        '</div>';
      return;
    }

    savedTitles.forEach(function(title) {
      var item = state.data.savedArticles[title];
      var el = document.createElement('button');
      el.className = 'list-item focusable';
      el.dataset.action = 'view-article';
      el.dataset.title = item.title;
      el.innerHTML = 
        '<span class="list-item-icon">📚</span>' +
        '<div class="list-item-content">' +
          '<div class="list-item-title">' + item.title + '</div>' +
          '<div class="list-item-meta">' + (item.description || 'Offline copy') + '</div>' +
        '</div>';
      container.appendChild(el);
    });
  }

  function updateSaveButtonUI(title) {
    var saveBtn = document.getElementById('detail-save-btn');
    if (!saveBtn) return;
    
    if (state.data.savedArticles[title]) {
      saveBtn.textContent = '⭐ Saved Offline';
      saveBtn.classList.add('active');
    } else {
      saveBtn.textContent = '☆ Save Offline';
      saveBtn.classList.remove('active');
    }
  }

  function updateSavedCountIndicator() {
    var count = Object.keys(state.data.savedArticles).length;
    var badge = document.getElementById('saved-badge');
    if (badge) {
      badge.textContent = count + (count === 1 ? ' Saved' : ' Saved');
    }
  }

  // ==================== DATA PERSISTENCE ====================
  function loadData() {
    try {
      var saved = localStorage.getItem(CONFIG.storageKey);
      if (saved) {
        var parsed = JSON.parse(saved);
        if (parsed && parsed.savedArticles) {
          state.data.savedArticles = parsed.savedArticles;
        }
      }
    } catch (e) {
      console.error('[Storage] Load error:', e);
    }
    updateSavedCountIndicator();
  }

  function saveData() {
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.data));
    } catch (e) {
      console.error('[Storage] Save error:', e);
    }
    updateSavedCountIndicator();
  }

  // ==================== ACTIONS ====================
  function toggleSaveArticle() {
    if (!state.currentArticle) return;
    var title = state.currentArticle.title;

    if (state.data.savedArticles[title]) {
      delete state.data.savedArticles[title];
      showToast('Removed from offline cache', 'info');
    } else {
      state.data.savedArticles[title] = {
        title: state.currentArticle.title,
        description: state.currentArticle.description,
        extract: state.currentArticle.extract,
        thumbnail: state.currentArticle.thumbnail,
        content_urls: state.currentArticle.content_urls
      };
      showToast('Saved for offline reading!', 'success');
    }
    saveData();
    updateSaveButtonUI(title);
  }

  function showQRModal() {
    if (!state.currentArticle) return;
    var articleUrl = '';
    
    if (state.currentArticle.content_urls && 
        state.currentArticle.content_urls.desktop && 
        state.currentArticle.content_urls.desktop.page) {
      articleUrl = state.currentArticle.content_urls.desktop.page;
    } else {
      articleUrl = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(state.currentArticle.title);
    }

    var qrImg = document.getElementById('qr-code-img');
    var qrModal = document.getElementById('qr-modal');
    if (qrImg && qrModal) {
      qrImg.src = CONFIG.api.qrUrl + encodeURIComponent(articleUrl);
      qrModal.classList.remove('hidden');
      focusFirst(qrModal);
    }
  }

  function closeQR() {
    var qrModal = document.getElementById('qr-modal');
    if (qrModal) {
      qrModal.classList.add('hidden');
      focusFirst(screens[state.currentScreen]);
    }
  }

  function clearAllSaved() {
    if (confirm('Clear all saved articles?')) {
      state.data.savedArticles = {};
      saveData();
      renderSavedList();
      showToast('All saved articles cleared', 'info');
      focusFirst(screens.saved);
    }
  }

  // ==================== UI STATE HELPERS ====================
  function setLoading(isLoading, text) {
    state.isLoading = isLoading;
    var spinner = document.getElementById('loading');
    var loadingTextEl = document.getElementById('loading-text');
    if (spinner) {
      if (text && loadingTextEl) loadingTextEl.textContent = text;
      spinner.classList.toggle('hidden', !isLoading);
    }
  }

  function setError(message) {
    state.error = message;
    var errorEl = document.getElementById('error');
    var msgEl = document.getElementById('error-message');
    if (errorEl && msgEl) {
      msgEl.textContent = message;
      errorEl.classList.remove('hidden');
      focusFirst(errorEl);
    }
  }

  function clearError() {
    state.error = null;
    var errorEl = document.getElementById('error');
    if (errorEl) errorEl.classList.add('hidden');
  }

  function showToast(message, type) {
    var toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = 'toast' + (type ? ' ' + type : '');
    toast.offsetHeight; // trigger reflow
    toast.classList.add('visible');
    setTimeout(function() { toast.classList.remove('visible'); }, 3000);
  }

  // ==================== ACTION ROUTING ====================
  function handleAction(action, element) {
    switch (action) {
      case 'back':
        navigateBack();
        break;
      case 'go-to-search':
        navigateTo('search');
        break;
      case 'go-to-saved':
        navigateTo('saved');
        break;
      case 'fetch-random':
        fetchRandomArticle();
        break;
      case 'featured-search':
      case 'quick-search':
        var term = element.dataset.term;
        var searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.value = term;
        navigateTo('search');
        searchWikipedia(term);
        break;
      case 'do-search':
        var query = document.getElementById('search-input').value;
        searchWikipedia(query);
        break;
      case 'view-article':
        var title = element.dataset.title;
        fetchArticleSummary(title);
        break;
      case 'toggle-save':
        toggleSaveArticle();
        break;
      case 'show-qr':
        showQRModal();
        break;
      case 'close-qr':
        closeQR();
        break;
      case 'clear-all-saved':
        clearAllSaved();
        break;
      case 'clear-error':
        clearError();
        focusFirst(screens[state.currentScreen]);
        break;
      default:
        console.log('[Action Unknown]', action);
        break;
    }
  }

  // ==================== SCREEN ENTER LIFECYCLE ====================
  function onScreenEnter(screenId) {
    if (screenId === 'home') {
      updateSavedCountIndicator();
    } else if (screenId === 'saved') {
      renderSavedList();
    }
  }

  // ==================== EVENT LISTENERS ====================
  function setupEvents() {
    document.addEventListener('click', function(e) {
      var actionEl = e.target.closest('[data-action]');
      if (actionEl) handleAction(actionEl.dataset.action, actionEl);
    });

    document.addEventListener('keydown', function(e) {
      var isInput = document.activeElement &&
        (document.activeElement.tagName === 'INPUT' ||
         document.activeElement.tagName === 'TEXTAREA');
      
      // Let standard input typing function normally, except for Enter/Esc
      if (isInput && !['Escape', 'Enter'].includes(e.key)) {
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
          moveFocus('up');
          e.preventDefault();
          break;
        case 'ArrowDown':
          moveFocus('down');
          e.preventDefault();
          break;
        case 'ArrowLeft':
          moveFocus('left');
          e.preventDefault();
          break;
        case 'ArrowRight':
          moveFocus('right');
          e.preventDefault();
          break;
        case 'Enter':
          if (isInput) {
            var submitAction = document.activeElement.dataset.submitAction;
            if (submitAction) handleAction(submitAction, document.activeElement);
          } else if (document.activeElement &&
                     document.activeElement.classList.contains('focusable')) {
            document.activeElement.click();
          }
          e.preventDefault();
          break;
        case 'Escape':
          navigateBack();
          e.preventDefault();
          break;
      }
    });
  }

  // ==================== INITIALIZATION ====================
  function init() {
    collectScreens();
    setupEvents();
    loadData();

    setTimeout(function() {
      navigateTo('home', { addToHistory: false });
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
