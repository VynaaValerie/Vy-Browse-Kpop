(() => {
  'use strict';

  // STATE
  const state = {
    query: '',
    category: '',
    page: 1,
    hasMore: false,
    loading: false,
    infiniteActive: false,
    trendingTimer: null,
  };

  const AUTOCOMPLETE_SUGGESTIONS = [
    'aespa', 'BTS', 'BLACKPINK', 'NewJeans', 'IVE', 'TWICE', 'EXO',
    'Stray Kids', 'SEVENTEEN', 'NCT Dream', 'LE SSERAFIM', 'Red Velvet',
    'ITZY', 'G-IDLE', 'TXT', 'ENHYPEN', 'Karina', 'Winter', 'Jungkook',
    'V BTS', 'SHINee', 'GOT7', 'Monsta X', 'Weeekly', 'fromis_9',
    'aespa comeback', 'BTS concert', 'BLACKPINK MV', 'Kpop drama 2024',
    'idol fashion', 'Kpop scandal', 'girl group comeback',
  ];

  // ELEMENTS
  const $ = id => document.getElementById(id);
  const searchInput = $('searchInput');
  const clearBtn = $('clearBtn');
  const searchBtn = $('searchBtn');
  const newsGrid = $('newsGrid');
  const trendingTags = $('trendingTags');
  const refreshTrendingBtn = $('refreshTrendingBtn');
  const loadMoreBtn = $('loadMoreBtn');
  const loadMoreContainer = $('loadMoreContainer');
  const resultsCount = $('resultsCount');
  const resultsHeader = $('resultsHeader');
  const autocompleteDropdown = $('autocompleteDropdown');
  const backTop = $('backTop');
  const toastContainer = $('toastContainer');

  // TOAST
  function showToast(msg, duration = 3000) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    toastContainer.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transition = 'opacity 0.3s';
      setTimeout(() => t.remove(), 300);
    }, duration);
  }

  // SKELETON
  function renderSkeletons(count = 6) {
    newsGrid.innerHTML = Array.from({ length: count }, () => `
      <div class="skeleton-card">
        <div class="skeleton skeleton-thumb"></div>
        <div class="skeleton-body">
          <div class="skeleton skeleton-line w-1-4"></div>
          <div class="skeleton skeleton-line tall w-full"></div>
          <div class="skeleton skeleton-line w-3-4"></div>
          <div class="skeleton skeleton-line w-full"></div>
          <div class="skeleton skeleton-line w-1-2"></div>
        </div>
      </div>
    `).join('');
  }

  // CARD
  function categoryColor(cat) {
    const map = {
      'Comeback': '#a855f7',
      'MV': '#ec4899',
      'Drama': '#f59e0b',
      'Idol': '#06b6d4',
      'Concert': '#22c55e',
      'Scandal': '#ef4444',
      'Fashion': '#f97316',
    };
    return map[cat] || '#a855f7';
  }

  function renderCard(article, index) {
    const color = categoryColor(article.category);
    const thumbHtml = article.thumbnail
      ? `<img src="${escHtml(article.thumbnail)}" alt="${escHtml(article.title)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'card-thumb-placeholder\\'><svg width=\\'40\\' height=\\'40\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'rgba(168,85,247,0.3)\\' stroke-width=\\'1.5\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'3\\'/><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'/><polyline points=\\'21,15 16,10 5,21\\'/></svg></div>'" />`
      : `<div class="card-thumb-placeholder"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(168,85,247,0.3)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg></div>`;

    return `
      <article class="news-card" style="animation-delay:${index * 0.06}s" role="article">
        <div class="card-thumb">
          ${thumbHtml}
          <span class="card-category-badge" style="color:${color};border-color:${color}40">${escHtml(article.category)}</span>
        </div>
        <div class="card-body">
          <div class="card-source-row">
            <div class="card-source">
              <div class="source-icon">${escHtml(article.sourceIcon || article.source?.charAt(0) || 'N')}</div>
              ${escHtml(article.source)}
            </div>
            <span class="card-time">${escHtml(article.timeAgo)}</span>
          </div>
          <h3 class="card-title">${escHtml(article.title)}</h3>
          <p class="card-desc">${escHtml(article.description)}</p>
          <div class="card-footer">
            <a href="${escHtml(article.url)}" target="_blank" rel="noopener noreferrer" class="read-more-btn">
              Baca Selengkapnya
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </a>
            <button class="card-share" onclick="shareArticle('${encodeURIComponent(article.url)}','${encodeURIComponent(article.title)}')" title="Copy link">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.shareArticle = function (encodedUrl, encodedTitle) {
    const url = decodeURIComponent(encodedUrl);
    if (navigator.share) {
      navigator.share({ title: decodeURIComponent(encodedTitle), url });
    } else {
      navigator.clipboard.writeText(url).then(() => showToast('Link berhasil disalin!'));
    }
  };

  // FETCH NEWS
  async function fetchNews(append = false) {
    if (state.loading) return;
    state.loading = true;

    if (!append) {
      renderSkeletons(6);
      newsGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const spinner = document.createElement('div');
      spinner.id = 'appendSpinner';
      spinner.style.cssText = 'grid-column:1/-1;display:flex;justify-content:center;padding:2rem;';
      spinner.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2.5" style="animation:spin 0.8s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`;
      newsGrid.appendChild(spinner);
    }

    loadMoreContainer.style.display = 'none';

    try {
      const params = new URLSearchParams();
      if (state.query) params.set('q', state.query);
      if (state.category) params.set('category', state.category);
      params.set('page', state.page);

      const endpoint = state.query || state.category
        ? `/api/search?${params}`
        : `/api/news?${params}`;

      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (!data.success) throw new Error(data.error || 'Failed to load news');

      // Remove spinner if appending
      const spinner = $('appendSpinner');
      if (spinner) spinner.remove();

      if (!append) newsGrid.innerHTML = '';

      if (!data.data || data.data.length === 0) {
        if (!append) {
          newsGrid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1">
              <div class="empty-icon">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v4M11 15h.01"/></svg>
              </div>
              <p class="empty-title">Tidak ada hasil ditemukan</p>
              <p class="empty-desc">Coba kata kunci lain atau pilih kategori di atas.</p>
            </div>
          `;
        }
        state.hasMore = false;
      } else {
        const offset = append ? newsGrid.querySelectorAll('.news-card').length : 0;
        data.data.forEach((article, i) => {
          newsGrid.insertAdjacentHTML('beforeend', renderCard(article, offset + i));
        });
        state.hasMore = data.hasMore;

        const total = data.total || data.data.length;
        const label = state.query ? `untuk "${state.query}"` : state.category ? `di ${state.category}` : '';
        resultsCount.textContent = total ? ` — ${total} artikel ${label}` : '';
      }

      if (state.hasMore) {
        loadMoreContainer.style.display = 'flex';
        setupInfiniteScroll();
      }
    } catch (err) {
      const spinner = $('appendSpinner');
      if (spinner) spinner.remove();
      if (!append) {
        newsGrid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1">
            <div class="empty-icon">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            </div>
            <p class="empty-title">Gagal terhubung</p>
            <p class="empty-desc">${err.message || 'Gagal memuat berita. Coba lagi.'}</p>
          </div>
        `;
      }
      console.error('Fetch error:', err);
    } finally {
      state.loading = false;
    }
  }

  // TRENDING
  async function fetchTrending() {
    refreshTrendingBtn.classList.add('spinning');
    try {
      const res = await fetch('/api/trending');
      const data = await res.json();
      if (!data.success || !data.data) return;

      trendingTags.innerHTML = data.data.map(item => `
        <button class="trending-tag" onclick="searchTrending('${escHtml(item.keyword)}')">
          <span class="tag-rank">#${item.rank}</span>
          ${escHtml(item.keyword)}
          ${item.trend === 'up' ? '<span class="tag-up">&#9650;</span>' : ''}
        </button>
      `).join('');
    } catch (err) {
      trendingTags.innerHTML = '<span style="color:var(--text-muted);font-size:13px;">Gagal memuat trending.</span>';
    } finally {
      refreshTrendingBtn.classList.remove('spinning');
    }
  }

  window.searchTrending = function (kw) {
    searchInput.value = kw;
    state.query = kw;
    state.category = '';
    state.page = 1;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.cat-btn[data-cat=""]').classList.add('active');
    closeAutocomplete();
    fetchNews();
    window.scrollTo({ top: document.querySelector('.categories-bar').offsetTop - 60, behavior: 'smooth' });
  };

  // SEARCH HANDLERS
  function doSearch() {
    const q = searchInput.value.trim();
    state.query = q;
    state.page = 1;
    closeAutocomplete();
    if (q) clearBtn.classList.add('visible');
    else clearBtn.classList.remove('visible');
    fetchNews();
    window.scrollTo({ top: document.querySelector('.categories-bar').offsetTop - 60, behavior: 'smooth' });
  }

  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.query = '';
    state.page = 1;
    clearBtn.classList.remove('visible');
    closeAutocomplete();
    fetchNews();
  });

  searchInput.addEventListener('input', () => {
    const val = searchInput.value.trim();
    clearBtn.classList.toggle('visible', val.length > 0);
    showAutocomplete(val);
  });

  // AUTOCOMPLETE
  function showAutocomplete(val) {
    if (!val || val.length < 2) { closeAutocomplete(); return; }
    const matches = AUTOCOMPLETE_SUGGESTIONS.filter(s =>
      s.toLowerCase().includes(val.toLowerCase())
    ).slice(0, 7);

    if (matches.length === 0) { closeAutocomplete(); return; }

    autocompleteDropdown.innerHTML = matches.map(m => `
      <div class="autocomplete-item" onclick="pickAutocomplete('${escHtml(m)}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        ${highlightMatch(m, val)}
      </div>
    `).join('');
    autocompleteDropdown.classList.add('open');
  }

  function highlightMatch(str, query) {
    const idx = str.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escHtml(str);
    return escHtml(str.slice(0, idx)) +
      `<strong style="color:var(--neon-purple)">${escHtml(str.slice(idx, idx + query.length))}</strong>` +
      escHtml(str.slice(idx + query.length));
  }

  function closeAutocomplete() { autocompleteDropdown.classList.remove('open'); }

  window.pickAutocomplete = function (val) {
    searchInput.value = val;
    closeAutocomplete();
    doSearch();
  };

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrapper')) closeAutocomplete();
  });

  // CATEGORIES
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.category = btn.dataset.cat;
      state.page = 1;
      fetchNews();
    });
  });

  // LOAD MORE
  loadMoreBtn.addEventListener('click', () => {
    state.page++;
    fetchNews(true);
  });

  // INFINITE SCROLL
  let sentinel = null;
  function setupInfiniteScroll() {
    if (state.infiniteActive) return;
    sentinel = $('infiniteScrollSentinel');
    if (!sentinel) return;
    state.infiniteActive = true;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && state.hasMore && !state.loading) {
          state.page++;
          fetchNews(true).then(() => {
            if (!state.hasMore) {
              observer.disconnect();
              state.infiniteActive = false;
            }
          });
        }
      });
    }, { rootMargin: '200px' });
    observer.observe(sentinel);
  }

  // TRENDING REFRESH
  refreshTrendingBtn.addEventListener('click', () => {
    clearInterval(state.trendingTimer);
    fetchTrending();
    startTrendingAutoRefresh();
  });

  function startTrendingAutoRefresh() {
    if (state.trendingTimer) clearInterval(state.trendingTimer);
    state.trendingTimer = setInterval(fetchTrending, 2 * 60 * 1000);
  }

  // BACK TO TOP
  window.addEventListener('scroll', () => {
    backTop.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });

  backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  // INIT
  function init() {
    fetchTrending();
    startTrendingAutoRefresh();
    fetchNews();
  }

  init();
})();
