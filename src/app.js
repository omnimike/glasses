// ==================== CONFIG ====================
const CONFIG = {
  appName: 'Wikipedia Glasses',
  storageKey: 'mdg_wikiexplorer',
  api: {
    searchUrl: 'https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srsearch=',
    summaryUrl: 'https://en.wikipedia.org/api/rest_v1/page/summary/',
    randomUrl: 'https://en.wikipedia.org/api/rest_v1/page/random/summary'
  }
};

// ==================== STATE ====================
const state = {
  currentScreen: 'home',
  screenHistory: [],
  isLoading: false,
  error: null,
  toastTimeout: null, // Track toast timeout to clear it on screen transition
  data: {
    savedArticles: {} // Keyed by normalized title: { title, description, extract, thumbnail, url }
  },
  currentArticle: null // Holds the currently viewed article summary data
};

// ==================== DOM REFS ====================
const screens = {};

const collectScreens = () => {
  document.querySelectorAll('.screen').forEach((s) => {
    if (s.id) screens[s.id] = s;
  });
};

// ==================== NAVIGATION ====================
const navigateTo = (screenId, options = {}) => {
  const addToHistory = options.addToHistory !== false;

  // Clear active toast notifications on screen change
  if (state.toastTimeout) {
    clearTimeout(state.toastTimeout);
    state.toastTimeout = null;
  }
  const toast = document.getElementById('toast');
  if (toast) {
    toast.classList.remove('visible');
  }

  if (addToHistory && state.currentScreen) {
    const historyItem = {
      screenId: state.currentScreen
    };
    if (state.currentScreen === 'detail') {
      historyItem.article = state.currentArticle;
    } else if (state.currentScreen === 'search') {
      const searchTitle = document.getElementById('search-title');
      const searchResults = document.getElementById('search-results');
      historyItem.query = searchTitle ? searchTitle.textContent : '';
      historyItem.resultsHtml = searchResults ? searchResults.innerHTML : '';
    }
    state.screenHistory.push(historyItem);
  }

  Object.values(screens).forEach((s) => { s.classList.add('hidden'); });
  if (screens[screenId]) {
    screens[screenId].classList.remove('hidden');
    state.currentScreen = screenId;
    onScreenEnter(screenId);
    focusFirst(screens[screenId]);
  }
};

const navigateBack = () => {
  if (state.screenHistory.length > 0) {
    const prevState = state.screenHistory.pop();
    if (prevState.screenId === 'detail') {
      loadArticleDetail(prevState.article);
    } else if (prevState.screenId === 'search') {
      const searchTitle = document.getElementById('search-title');
      const searchResults = document.getElementById('search-results');
      if (searchTitle) searchTitle.textContent = prevState.query;
      if (searchResults) searchResults.innerHTML = prevState.resultsHtml;
    }
    navigateTo(prevState.screenId, { addToHistory: false });
  }
};

// ==================== FOCUS MANAGEMENT ====================
const focusFirst = (container) => {
  const el = container.querySelector('.focusable:not([disabled]):not(.hidden)');
  if (el) el.focus();
};

const moveHomeFocus = (idx, direction, total) => {
  const recentSavedGrid = document.getElementById('recent-saved-grid');
  const numSaved = recentSavedGrid ? recentSavedGrid.querySelectorAll('.focusable:not(.hidden)').length : 0;

  const badgeIdx = 0;
  const recentStart = 1;
  const recentEnd = numSaved;
  const exploreStart = numSaved + 1;
  const exploreEnd = numSaved + 6;
  const randomIdx = numSaved + 7;

  const navigateRecentGrid = (gridIdx, numItems, dir) => {
    const row = Math.floor(gridIdx / 3);
    const col = gridIdx % 3;
    const numRows = Math.ceil(numItems / 3);

    if (dir === 'left') {
      const nextCol = (col - 1 + 3) % 3;
      let targetIdx = row * 3 + nextCol;
      if (targetIdx >= numItems) {
        targetIdx = numItems - 1;
      }
      return recentStart + targetIdx;
    }
    if (dir === 'right') {
      const nextCol = (col + 1) % 3;
      let targetIdx = row * 3 + nextCol;
      if (targetIdx >= numItems) {
        targetIdx = numItems - 1;
      }
      return recentStart + targetIdx;
    }
    if (dir === 'up') {
      if (row > 0) {
        return recentStart + ((row - 1) * 3 + col);
      }
      return badgeIdx;
    }
    if (dir === 'down') {
      if (row < numRows - 1) {
        let nextIdx = (row + 1) * 3 + col;
        if (nextIdx >= numItems) {
          nextIdx = numItems - 1;
        }
        return recentStart + nextIdx;
      }
      return exploreStart + col;
    }
    return recentStart + gridIdx;
  };

  const navigateExploreGrid = (gridIdx, dir) => {
    const row = Math.floor(gridIdx / 3);
    const col = gridIdx % 3;

    if (dir === 'left') {
      const nextCol = (col - 1 + 3) % 3;
      return exploreStart + (row * 3 + nextCol);
    }
    if (dir === 'right') {
      const nextCol = (col + 1) % 3;
      return exploreStart + (row * 3 + nextCol);
    }
    if (dir === 'up') {
      if (row > 0) {
        return exploreStart + ((row - 1) * 3 + col);
      }
      if (numSaved > 0) {
        const recentRows = Math.ceil(numSaved / 3);
        let targetIdx = (recentRows - 1) * 3 + col;
        if (targetIdx >= numSaved) {
          targetIdx = numSaved - 1;
        }
        return recentStart + targetIdx;
      }
      return badgeIdx;
    }
    if (dir === 'down') {
      if (row === 0) {
        return exploreStart + (3 + col);
      }
      return randomIdx;
    }
    return exploreStart + gridIdx;
  };

  if (idx === badgeIdx) {
    if (direction === 'down' || direction === 'right') {
      return numSaved > 0 ? recentStart : exploreStart;
    }
    if (direction === 'up' || direction === 'left') return randomIdx;
  }

  if (numSaved > 0 && idx >= recentStart && idx <= recentEnd) {
    return navigateRecentGrid(idx - recentStart, numSaved, direction);
  }

  if (idx >= exploreStart && idx <= exploreEnd) {
    return navigateExploreGrid(idx - exploreStart, direction);
  }

  if (idx === randomIdx) {
    if (direction === 'up') return exploreEnd - 2;
    if (direction === 'down') return badgeIdx;
    return direction === 'left' ? exploreEnd : badgeIdx;
  }

  return badgeIdx;
};

const moveSearchFocus = (idx, direction, total) => {
  if (idx === 0) {
    if (total > 1) {
      if (direction === 'down' || direction === 'right') return 1;
      if (direction === 'up' || direction === 'left') return total - 1;
    }
    return 0;
  }

  if (idx >= 1) {
    if (direction === 'up') {
      return idx - 1;
    }
    if (direction === 'down') {
      return idx < total - 1 ? idx + 1 : 0;
    }
    if (direction === 'left' || direction === 'right') {
      return idx;
    }
  }

  return 0;
};

const moveDetailFocus = (idx, direction, total) => {
  // Header row: Back (0), Home (1), Save (2)
  if (idx >= 0 && idx <= 2) {
    if (direction === 'down') {
      return Math.min(3, total - 1);
    }
    if (direction === 'up') {
      return total - 1;
    }
    if (direction === 'left') {
      return idx === 0 ? 2 : idx - 1;
    }
    if (direction === 'right') {
      return idx === 2 ? 0 : idx + 1;
    }
  }

  // Page content row: Scroll container (3) and wiki-links (4+)
  if (idx >= 3) {
    if (direction === 'up') {
      if (idx === 3) return 0;
      return idx - 1;
    }
    if (direction === 'down') {
      return idx < total - 1 ? idx + 1 : 0;
    }
    if (direction === 'left') {
      return idx > 0 ? idx - 1 : total - 1;
    }
    if (direction === 'right') {
      return idx < total - 1 ? idx + 1 : 0;
    }
  }

  return 0;
};

const moveFocus = (direction) => {
  const container = screens[state.currentScreen];
  if (!container) return;

  const focusables = Array.from(
    container.querySelectorAll('.focusable:not([disabled]):not(.hidden)')
  );
  if (focusables.length === 0) return;

  const current = document.activeElement;
  const idx = focusables.indexOf(current);

  if (idx === -1) {
    focusFirst(container);
    return;
  }

  let nextIdx;
  if (state.currentScreen === 'home') {
    nextIdx = moveHomeFocus(idx, direction, focusables.length);
  } else if (state.currentScreen === 'search') {
    nextIdx = moveSearchFocus(idx, direction, focusables.length);
  } else if (state.currentScreen === 'detail') {
    nextIdx = moveDetailFocus(idx, direction, focusables.length);
  } else {
    if (direction === 'up' || direction === 'left') {
      nextIdx = idx > 0 ? idx - 1 : focusables.length - 1;
    } else {
      nextIdx = idx < focusables.length - 1 ? idx + 1 : 0;
    }
  }
  focusables[nextIdx].focus();

  const scrollParent = focusables[nextIdx].closest('.content, .list-container');
  if (scrollParent) {
    focusables[nextIdx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
};

// ==================== WIKIPEDIA API LAYER ====================
const searchWikipedia = (query) => {
  if (!query || query.trim() === '') {
    showToast('Please enter a search query', 'error');
    return;
  }

  setLoading(true, 'Searching Wikipedia...');
  clearError();

  const searchTitle = document.getElementById('search-title');
  if (searchTitle) searchTitle.textContent = query;

  const url = CONFIG.api.searchUrl + encodeURIComponent(query);

  fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP status ${res.status}`);
      return res.json();
    })
    .then((data) => {
      setLoading(false);
      const results = data.query ? data.query.search : [];
      renderSearchResults(results);
    })
    .catch((err) => {
      setLoading(false);
      setError('Search failed. Check connection.');
      console.error('[WikiAPI] Search Error:', err);
    });
};

const fetchArticleSummary = (title, skipApi) => {
  const hasSaved = !!state.data.savedArticles[title];

  if (skipApi || !navigator.onLine) {
    if (hasSaved) {
      navigateTo('detail');
      loadArticleDetail(state.data.savedArticles[title]);
      showToast(!navigator.onLine ? 'Offline mode: Loaded saved copy' : 'Loaded offline version', 'success');
      return;
    }
    if (skipApi) {
      setError('Article not available offline');
      return;
    }
  }

  setLoading(true, 'Fetching article...');
  clearError();

  const summaryUrl = CONFIG.api.summaryUrl + encodeURIComponent(title);
  const parseUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json&origin=*&redirects=true`;

  Promise.all([
    fetch(summaryUrl).then((res) => res.ok ? res.json() : null),
    fetch(parseUrl).then((res) => res.ok ? res.json() : null)
  ])
  .then((results) => {
    setLoading(false);
    const summaryData = results[0];
    const parseData = results[1];

    if (!summaryData && !parseData) {
      throw new Error('Article not found or API error.');
    }

    const mergedData = {};
    if (summaryData) {
      Object.assign(mergedData, summaryData);
    } else {
      mergedData.title = parseData.parse.title;
      mergedData.description = 'Encyclopedia Article';
      mergedData.extract = '';
    }

    if (parseData && parseData.parse && parseData.parse.text) {
      const rawHtml = parseData.parse.text['*'];
      mergedData.fullHtml = processFullHtml(rawHtml);
      mergedData.title = parseData.parse.title; // update title in case of redirects
    } else if (summaryData) {
      mergedData.fullHtml = `<p>${summaryData.extract}</p>`;
    }

    if (state.data.savedArticles[title]) {
      const savedObj = {
        title: mergedData.title,
        description: mergedData.description,
        extract: mergedData.extract,
        fullHtml: mergedData.fullHtml,
        thumbnail: mergedData.thumbnail,
        content_urls: mergedData.content_urls
      };
      state.data.savedArticles[title] = savedObj;
      if (mergedData.title !== title) {
        state.data.savedArticles[mergedData.title] = savedObj;
        delete state.data.savedArticles[title];
      }
      saveData();
      showToast('Updated saved article content', 'success');
    }

    navigateTo('detail');
    loadArticleDetail(mergedData);
  })
  .catch((err) => {
    setLoading(false);
    if (hasSaved) {
      navigateTo('detail');
      loadArticleDetail(state.data.savedArticles[title]);
      showToast('Could not update; loaded saved copy', 'info');
    } else {
      setError('Failed to fetch article. Check connection.');
      console.error('[WikiAPI] Fetch Error:', err);
    }
  });
};

const fetchRandomArticle = () => {
  setLoading(true, 'Getting random article...');
  clearError();

  fetch(CONFIG.api.randomUrl)
    .then((res) => {
      if (!res.ok) throw new Error('API error fetching random page.');
      return res.json();
    })
    .then((data) => {
      fetchArticleSummary(data.title);
    })
    .catch((err) => {
      setLoading(false);
      setError('Could not fetch random page.');
      console.error('[WikiAPI] Random Error:', err);
    });
};

const processFullHtml = (htmlText) => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlText;

  const selectorsToRemove = [
    '.infobox',
    '.mw-editsection',
    'sup.reference',
    '.reference',
    '.navbox',
    '.reflist',
    '.catlinks',
    '.printfooter',
    '.ambox',
    '.hatnote',
    'table',
    '.thumb',
    '.gallery',
    'figure',
    'figcaption',
    'img',
    'style',
    'script'
  ];

  selectorsToRemove.forEach((selector) => {
    tempDiv.querySelectorAll(selector).forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
  });

  tempDiv.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href && href.startsWith('/wiki/') && !href.includes(':')) {
      const articleTitle = decodeURIComponent(href.substring(6)).replace(/_/g, ' ');
      a.className = 'focusable wiki-link';
      a.setAttribute('tabindex', '0');
      a.setAttribute('data-action', 'view-article');
      a.setAttribute('data-title', articleTitle);
      a.removeAttribute('href');
    } else {
      const span = document.createElement('span');
      span.textContent = a.textContent;
      if (a.parentNode) {
        a.parentNode.replaceChild(span, a);
      }
    }
  });

  return tempDiv.innerHTML;
};

// ==================== RENDER HELPERS ====================
const renderSearchResults = (results) => {
  const container = document.getElementById('search-results');
  if (!container) return;
  container.innerHTML = '';

  if (results.length === 0) {
    container.innerHTML = `
      <div class="error-container">
        <div class="error-message">No matching topics found</div>
      </div>
    `;
    return;
  }

  results.forEach((item) => {
    const snippet = item.snippet.replace(/<\/?[^>]+(>|$)/g, ''); // Strip HTML tags
    const el = document.createElement('button');
    el.className = 'list-item focusable';
    el.dataset.action = 'view-article';
    el.dataset.title = item.title;
    el.innerHTML = `
      <div class="list-item-content">
        <div class="list-item-title">${item.title}</div>
        <div class="list-item-meta">${snippet}</div>
      </div>
    `;
    container.appendChild(el);
  });

  focusFirst(screens.search);
};

const loadArticleDetail = (data) => {
  state.currentArticle = data;
  
  document.getElementById('detail-title').textContent = data.title;
  document.getElementById('detail-description').textContent = data.description || 'Encyclopedia Article';
  const extractEl = document.getElementById('detail-extract');
  if (data.fullHtml) {
    extractEl.innerHTML = data.fullHtml;
  } else {
    extractEl.textContent = data.extract;
  }

  const scrollContainer = document.getElementById('detail-scroll-container');
  if (scrollContainer) scrollContainer.scrollTop = 0;

  updateSaveButtonUI(data.title);
};

const renderSavedList = () => {
  const container = document.getElementById('saved-list');
  if (!container) return;
  container.innerHTML = '';

  const savedTitles = Object.keys(state.data.savedArticles);
  if (savedTitles.length === 0) {
    container.innerHTML = `
      <div class="error-container" style="padding: 20px;">
        <div class="error-icon">&#9888;</div>
        <div class="error-message">No offline articles saved yet. Save articles from the reader to view them here.</div>
      </div>
    `;
    return;
  }

  savedTitles.forEach((title) => {
    const item = state.data.savedArticles[title];
    const el = document.createElement('button');
    el.className = 'list-item focusable';
    el.dataset.action = 'view-article';
    el.dataset.title = item.title;
    el.innerHTML = `
      <div class="list-item-content">
        <div class="list-item-title">${item.title}</div>
        <div class="list-item-meta">${item.description || 'Offline copy'}</div>
      </div>
    `;
    container.appendChild(el);
  });
};

const renderRecentSavedGrid = () => {
  const container = document.getElementById('recent-saved-container');
  const grid = document.getElementById('recent-saved-grid');
  if (!container || !grid) return;

  const keys = Object.keys(state.data.savedArticles);
  if (keys.length === 0) {
    container.classList.add('hidden');
    grid.innerHTML = '';
    return;
  }

  const recentKeys = keys.slice(-9).reverse();
  container.classList.remove('hidden');
  grid.innerHTML = '';

  recentKeys.forEach((title) => {
    const item = state.data.savedArticles[title];
    const el = document.createElement('button');
    el.className = 'nav-item focusable';
    el.dataset.action = 'view-article';
    el.dataset.title = item.title;
    el.textContent = item.title;
    grid.appendChild(el);
  });
};

const updateSaveButtonUI = (title) => {
  const saveBtn = document.getElementById('detail-save-btn');
  if (!saveBtn) return;
  
  if (state.data.savedArticles[title]) {
    saveBtn.innerHTML = '&#9733;'; // Solid star
    saveBtn.classList.add('active');
    saveBtn.setAttribute('aria-label', 'Saved Offline');
  } else {
    saveBtn.innerHTML = '&#9734;'; // Outline star
    saveBtn.classList.remove('active');
    saveBtn.setAttribute('aria-label', 'Save Offline');
  }
};

const updateSavedCountIndicator = () => {
  const count = Object.keys(state.data.savedArticles).length;
  const badge = document.getElementById('saved-badge');
  if (badge) {
    badge.textContent = `${count} Saved`;
  }
};

// ==================== DATA PERSISTENCE ====================
const loadData = () => {
  try {
    const saved = localStorage.getItem(CONFIG.storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.savedArticles) {
        state.data.savedArticles = parsed.savedArticles;
      }
    }
  } catch (e) {
    console.error('[Storage] Load error:', e);
  }
  updateSavedCountIndicator();
};

const saveData = () => {
  try {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.data));
  } catch (e) {
    console.error('[Storage] Save error:', e);
  }
  updateSavedCountIndicator();
  renderRecentSavedGrid();
};

// ==================== ACTIONS ====================
const toggleSaveArticle = () => {
  if (!state.currentArticle) return;
  const title = state.currentArticle.title;

  if (state.data.savedArticles[title]) {
    delete state.data.savedArticles[title];
    showToast('Removed from offline cache', 'info');
  } else {
    state.data.savedArticles[title] = {
      title: state.currentArticle.title,
      description: state.currentArticle.description,
      extract: state.currentArticle.extract,
      fullHtml: state.currentArticle.fullHtml,
      thumbnail: state.currentArticle.thumbnail,
      content_urls: state.currentArticle.content_urls
    };
    showToast('Saved for offline reading!', 'success');
  }
  saveData();
  updateSaveButtonUI(title);
};

const clearAllSaved = () => {
  if (confirm('Clear all saved articles?')) {
    state.data.savedArticles = {};
    saveData();
    renderSavedList();
    showToast('All saved articles cleared', 'info');
    focusFirst(screens.saved);
  }
};

// ==================== UI STATE HELPERS ====================
const setLoading = (isLoading, text) => {
  state.isLoading = isLoading;
  const spinner = document.getElementById('loading');
  const loadingTextEl = document.getElementById('loading-text');
  if (spinner) {
    if (text && loadingTextEl) loadingTextEl.textContent = text;
    spinner.classList.toggle('hidden', !isLoading);
  }
};

const setError = (message) => {
  state.error = message;
  const errorEl = document.getElementById('error');
  const msgEl = document.getElementById('error-message');
  if (errorEl && msgEl) {
    msgEl.textContent = message;
    errorEl.classList.remove('hidden');
    focusFirst(errorEl);
  }
};

const clearError = () => {
  state.error = null;
  const errorEl = document.getElementById('error');
  if (errorEl) errorEl.classList.add('hidden');
};

const showToast = (message, type) => {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  if (state.toastTimeout) {
    clearTimeout(state.toastTimeout);
  }

  toast.textContent = message;
  toast.className = `toast${type ? ' ' + type : ''}`;
  toast.offsetHeight; // trigger reflow
  toast.classList.add('visible');

  state.toastTimeout = setTimeout(() => {
    toast.classList.remove('visible');
    state.toastTimeout = null;
  }, 3000);
};

// ==================== ACTION ROUTING ====================
const handleAction = (action, element) => {
  switch (action) {
    case 'back':
      navigateBack();
      break;
    case 'go-to-home':
      state.screenHistory = [];
      navigateTo('home', { addToHistory: false });
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
    case 'quick-search': {
      const term = element.dataset.term;
      navigateTo('search');
      searchWikipedia(term);
      break;
    }
    case 'view-article': {
      const title = element.dataset.title;
      fetchArticleSummary(title);
      break;
    }
    case 'toggle-save':
      toggleSaveArticle();
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
};

// ==================== SCREEN ENTER LIFECYCLE ====================
const onScreenEnter = (screenId) => {
  if (screenId === 'home') {
    updateSavedCountIndicator();
    renderRecentSavedGrid();
  } else if (screenId === 'saved') {
    renderSavedList();
  }
};

// ==================== EVENT LISTENERS ====================
const setupEvents = () => {
  document.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) handleAction(actionEl.dataset.action, actionEl);
  });

  document.addEventListener('keydown', (e) => {
    const isInput = document.activeElement &&
      (document.activeElement.tagName === 'INPUT' ||
       document.activeElement.tagName === 'TEXTAREA');
    
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
          const submitAction = document.activeElement.dataset.submitAction;
          if (submitAction) handleAction(submitAction, document.activeElement);
        } else if (document.activeElement &&
                   document.activeElement.classList.contains('focusable')) {
          document.activeElement.click();
        }
        e.preventDefault();
        break;
      case 'Escape':
        if (state.currentScreen === 'detail') {
          const detailContainer = screens.detail;
          const backBtn = detailContainer ? detailContainer.querySelector('.back-btn') : null;
          if (backBtn && document.activeElement !== backBtn) {
            backBtn.focus();
          } else {
            navigateBack();
          }
        } else {
          navigateBack();
        }
        e.preventDefault();
        break;
    }
  });
};

// ==================== INITIALIZATION ====================
const init = () => {
  collectScreens();
  setupEvents();
  loadData();

  setTimeout(() => {
    navigateTo('home', { addToHistory: false });
  }, 100);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
