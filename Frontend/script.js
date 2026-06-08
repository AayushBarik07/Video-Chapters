/**
 * ChapterCut — script.js
 * YouTube Chapter Generator
 * Vanilla JS | ES6+ | No external dependencies
 * ─────────────────────────────────────────────
 */

'use strict';

/*  
   1. CONSTANTS & STATE
  */

/** Chapter label templates keyed by count */
const CHAPTER_TEMPLATES = {
  4: ['Introduction', 'Part One', 'Part Two', 'Conclusion'],
  6: ['Introduction', 'Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4', 'Summary'],
  8: ['Introduction', 'Part 1', 'Part 2', 'Part 3', 'Part 4', 'Part 5', 'Part 6', 'Conclusion'],
};

/** App state — single source of truth */
const state = {
  player: null,          // YouTube IFrame player instance
  videoId: null,         // Current video ID
  duration: 0,           // Video duration in seconds
  chapters: [],          // Array of { name, time, label } objects
  activeChapterIndex: -1,// Index of currently active chapter
  progressInterval: null,// setInterval ID for progress updates
  playerReady: false,    // Has IFrame API fired onReady?
  apiLoaded: false,      // Has YT.Player been constructed?
  pendingVideoId: null,  // Video ID waiting for API to load
};

/*  
   2. DOM REFERENCES
  */

const $ = id => document.getElementById(id);

const dom = {
  heroSection:        $('heroSection'),
  playerSection:      $('playerSection'),
  emptyState:         $('emptyState'),
  urlInput:           $('urlInput'),
  clearBtn:           $('clearBtn'),
  generateBtn:        $('generateBtn'),
  errorMessage:       $('errorMessage'),
  errorText:          $('errorText'),
  videoWrapper:       $('videoWrapper'),
  videoLoading:       $('videoLoading'),
  videoIdLabel:       $('videoIdLabel'),
  progressFill:       $('progressFill'),
  progressThumb:      $('progressThumb'),
  progressTrack:      $('progressTrack'),
  currentTimeLabel:   $('currentTimeLabel'),
  durationLabel:      $('durationLabel'),
  chapterList:        $('chapterList'),
  chapterCountBadge:  $('chapterCountBadge'),
  chapterSearch:      $('chapterSearch'),
  searchClearBtn:     $('searchClearBtn'),
  noResults:          $('noResults'),
  copyBtn:            $('copyBtn'),
  copyToast:          $('copyToast'),
  backBtn:            $('backBtn'),
  themeToggle:        $('themeToggle'),
  themeIcon:          $('themeIcon'),
};

/*  
   3. YOUTUBE URL PARSING
  */

/**
 * Extract a YouTube video ID from various URL formats.
 * Handles:
 *   - https://www.youtube.com/watch?v=VIDEO_ID
 *   - https://youtu.be/VIDEO_ID
 *   - https://www.youtube.com/embed/VIDEO_ID
 *   - https://m.youtube.com/watch?v=VIDEO_ID
 * @param {string} url
 * @returns {string|null} videoId or null if invalid
 */
function extractVideoId(url) {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();

  // Pattern 1: youtu.be/VIDEO_ID
  const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  // Pattern 2: youtube.com/watch?v=VIDEO_ID (plus any query params)
  const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];

  // Pattern 3: youtube.com/embed/VIDEO_ID
  const embedMatch = trimmed.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];

  // Pattern 4: youtube.com/v/VIDEO_ID
  const vMatch = trimmed.match(/\/v\/([a-zA-Z0-9_-]{11})/);
  if (vMatch) return vMatch[1];

  return null;
}

/*  
   4. CHAPTER GENERATION
  */

/**
 * Determine chapter count based on video duration rules:
 *   < 10 min  → 4 chapters
 *   10–30 min → 6 chapters
 *   > 30 min  → 8 chapters
 * @param {number} durationSeconds
 * @returns {number}
 */
function getChapterCount(durationSeconds) {
  const minutes = durationSeconds / 60;
  if (minutes < 10) return 4;
  if (minutes <= 30) return 6;
  return 8;
}

/**
 * Generate chapter objects evenly spread over a video's duration.
 * @param {number} durationSeconds - Total video length in seconds
 * @returns {Array<{name:string, time:number, label:string}>}
 */
function generateChapters(durationSeconds) {
  const count = getChapterCount(durationSeconds);
  const names = CHAPTER_TEMPLATES[count];
  const interval = durationSeconds / (count - 1 || 1);
  const chapters = [];

  for (let i = 0; i < count; i++) {
    // Last chapter snapped slightly before end to avoid edge issues
    const raw = i === count - 1 ? Math.max(0, durationSeconds - 2) : Math.round(i * interval);
    chapters.push({
      name: names[i],
      time: raw,
      label: formatTime(raw),
    });
  }

  return chapters;
}

/*  
   5. TIME UTILITIES
  */

/**
 * Format seconds into M:SS or H:MM:SS string.
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatTime(totalSeconds) {
  const secs   = Math.floor(totalSeconds);
  const h      = Math.floor(secs / 3600);
  const m      = Math.floor((secs % 3600) / 60);
  const s      = secs % 60;

  const mm = String(m).padStart(h ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');

  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Return the index of the chapter currently active given a playback time.
 * @param {number} currentTime
 * @returns {number}
 */
function getActiveChapterIndex(currentTime) {
  let idx = 0;
  for (let i = 0; i < state.chapters.length; i++) {
    if (currentTime >= state.chapters[i].time) {
      idx = i;
    }
  }
  return idx;
}

/*  
   6. UI RENDERING — CHAPTERS
  */

/**
 * Render all chapter cards into the sidebar.
 * Cards are indexed with animation-delay staggering via CSS.
 */
function renderChapters() {
  const { chapters } = state;
  dom.chapterList.innerHTML = '';
  dom.chapterCountBadge.textContent = chapters.length;

  chapters.forEach((ch, idx) => {
    const card = document.createElement('div');
    card.className = 'chapter-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `${ch.name} at ${ch.label}`);
    card.dataset.index = idx;
    card.dataset.time  = ch.time;

    card.innerHTML = `
      <div class="chapter-index">${idx + 1}</div>
      <div class="chapter-info">
        <div class="chapter-name">${escapeHtml(ch.name)}</div>
        <div class="chapter-ts">${ch.label}</div>
      </div>
      <div class="chapter-playing" aria-hidden="true">
        <div class="play-dot"></div>
        <div class="play-dot"></div>
        <div class="play-dot"></div>
      </div>`;

    // Click → seek
    card.addEventListener('click', () => seekToChapter(idx));

    // Keyboard → seek (Enter/Space)
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        seekToChapter(idx);
      }
    });

    dom.chapterList.appendChild(card);
  });
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Highlight the active chapter card & auto-scroll it into view.
 * @param {number} idx
 */
function setActiveChapter(idx) {
  if (idx === state.activeChapterIndex) return; // No change
  state.activeChapterIndex = idx;

  const cards = dom.chapterList.querySelectorAll('.chapter-card');
  cards.forEach((card, i) => {
    if (i === idx) {
      card.classList.add('active');
      // Auto-scroll this chapter into the visible sidebar area
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      card.classList.remove('active');
    }
  });
}

/*  
   7. CHAPTER SEARCH FILTER
  */

/**
 * Filter chapter cards based on the search input value.
 * Hides non-matching cards; shows "no results" if none match.
 */
function filterChapters() {
  const query = dom.chapterSearch.value.trim().toLowerCase();
  const cards = dom.chapterList.querySelectorAll('.chapter-card');
  let visibleCount = 0;

  cards.forEach(card => {
    const name = card.querySelector('.chapter-name').textContent.toLowerCase();
    const ts   = card.querySelector('.chapter-ts').textContent.toLowerCase();
    const match = name.includes(query) || ts.includes(query);
    card.style.display = match ? '' : 'none';
    if (match) visibleCount++;
  });

  dom.noResults.hidden = visibleCount > 0;

  // Show/hide clear button for search
  dom.searchClearBtn.hidden = query.length === 0;
}

/*  
   8. PLAYER CONTROLS
  */

/**
 * Seek the YouTube player to a chapter's timestamp.
 * @param {number} chapterIdx
 */
function seekToChapter(chapterIdx) {
  const ch = state.chapters[chapterIdx];
  if (!ch || !state.player) return;

  try {
    state.player.seekTo(ch.time, true);
    state.player.playVideo();
    setActiveChapter(chapterIdx);
  } catch (err) {
    console.warn('seekTo failed:', err);
  }
}

/**
 * Start polling playback position every 500ms.
 * Updates progress bar, time labels, and active chapter highlight.
 */
function startProgressTracking() {
  stopProgressTracking(); // Clear any existing interval

  state.progressInterval = setInterval(() => {
    if (!state.player || !state.playerReady) return;

    try {
      const current  = state.player.getCurrentTime() || 0;
      const duration = state.player.getDuration()    || state.duration;

      // Guard against bad values
      if (!duration || isNaN(duration)) return;

      const pct = Math.min((current / duration) * 100, 100);

      // Update progress fill & thumb
      dom.progressFill.style.width = `${pct}%`;
      dom.progressThumb.style.left = `${pct}%`;
      dom.progressTrack.setAttribute('aria-valuenow', Math.round(pct));

      // Update time labels
      dom.currentTimeLabel.textContent = formatTime(current);
      dom.durationLabel.textContent    = formatTime(duration);

      // Active chapter highlight
      const activeIdx = getActiveChapterIndex(current);
      setActiveChapter(activeIdx);
    } catch (err) {
      // Player may not be fully initialised yet
    }
  }, 500);
}

/** Stop progress tracking interval. */
function stopProgressTracking() {
  if (state.progressInterval) {
    clearInterval(state.progressInterval);
    state.progressInterval = null;
  }
}

/*  
   9. YOUTUBE IFRAME API
  */

/**
 * Called automatically by the YouTube IFrame API once it loads.
 * If a video ID was already submitted, creates the player immediately.
 */
window.onYouTubeIframeAPIReady = function () {
  state.apiLoaded = true;
  if (state.pendingVideoId) {
    createPlayer(state.pendingVideoId);
    state.pendingVideoId = null;
  }
};

/**
 * Create or reload the YouTube player with a given video ID.
 * @param {string} videoId
 */
function createPlayer(videoId) {
  // Show loading overlay
  dom.videoLoading.classList.remove('hidden');
  state.playerReady = false;

  // Destroy any previous player instance to avoid DOM conflicts
  if (state.player) {
    try {
      stopProgressTracking();
      state.player.destroy();
    } catch (_) {}
    state.player = null;
  }

  // Recreate the player target div (YT.Player replaces it entirely)
  const oldDiv = document.getElementById('ytPlayer');
  if (oldDiv) {
    const newDiv = document.createElement('div');
    newDiv.id = 'ytPlayer';
    oldDiv.replaceWith(newDiv);
  }

  state.player = new YT.Player('ytPlayer', {
    videoId,
    playerVars: {
      autoplay:       0,
      modestbranding: 1,
      rel:            0,
      playsinline:    1,
    },
    events: {
      onReady:       onPlayerReady,
      onStateChange: onPlayerStateChange,
      onError:       onPlayerError,
    },
  });
}

/**
 * YouTube IFrame API: player is ready.
 * Reads duration, generates chapters, hides loader.
 * @param {Event} event
 */
function onPlayerReady(event) {
  state.playerReady = true;

  // Hide loading overlay with a slight delay so it feels intentional
  setTimeout(() => {
    dom.videoLoading.classList.add('hidden');
  }, 400);

  // Get duration (may be 0 for some live streams — guard below)
  const rawDuration = event.target.getDuration();
  state.duration = rawDuration > 0 ? rawDuration : 600; // Default 10 min fallback

  dom.durationLabel.textContent = formatTime(state.duration);

  // Generate & render chapters
  state.chapters = generateChapters(state.duration);
  renderChapters();
  startProgressTracking();
}

/**
 * YouTube IFrame API: player state changed.
 * We use this to restart progress tracking on play.
 * @param {Event} event
 */
function onPlayerStateChange(event) {
  const { YT: YTRef } = window;
  if (!YTRef) return;

  if (event.data === YTRef.PlayerState.PLAYING) {
    startProgressTracking();
  }
}

/**
 * YouTube IFrame API: an error occurred.
 * Codes: 2=bad videoId, 5=HTML5 error, 100=not found, 101/150=embedding disabled.
 * @param {Event} event
 */
function onPlayerError(event) {
  const codes = {
    2:   'Invalid video ID.',
    5:   'HTML5 player error.',
    100: 'Video not found or private.',
    101: 'Video owner has disabled embedding.',
    150: 'Video owner has disabled embedding.',
  };
  const msg = codes[event.data] || 'Video unavailable. Try another URL.';
  showError(msg);

  // Hide loading, go back to hero
  dom.videoLoading.classList.add('hidden');
  resetToHero();
}

/*  
   10. FORM HANDLING & VALIDATION
  */

/**
 * Handle "Generate Chapters" button click / form submit.
 */
function handleGenerate() {
  const raw = dom.urlInput.value.trim();

  // Empty check
  if (!raw) {
    showError('Please paste a YouTube URL first.');
    dom.urlInput.focus();
    return;
  }

  const videoId = extractVideoId(raw);

  if (!videoId) {
    showError('That doesn\'t look like a valid YouTube URL. Try: youtube.com/watch?v=... or youtu.be/...');
    dom.urlInput.focus();
    return;
  }

  // Clear any previous error
  hideError();

  // Transition UI to player view
  loadVideo(videoId);
}

/**
 * Transition from the hero view to the player view and load the video.
 * @param {string} videoId
 */
function loadVideo(videoId) {
  state.videoId   = videoId;
  state.activeChapterIndex = -1;

  // Update meta label
  dom.videoIdLabel.textContent = `ID: ${videoId}`;

  // Reset progress
  dom.progressFill.style.width = '0%';
  dom.progressThumb.style.left = '0%';
  dom.currentTimeLabel.textContent = '0:00';
  dom.durationLabel.textContent = '—:——';

  // Reset chapters
  dom.chapterList.innerHTML = '';
  dom.chapterCountBadge.textContent = '0';
  dom.chapterSearch.value = '';
  dom.searchClearBtn.hidden = true;
  dom.noResults.hidden = true;

  // Swap sections
  dom.heroSection.setAttribute('hidden', '');
  dom.emptyState.setAttribute('hidden', '');
  dom.playerSection.removeAttribute('hidden');

  // Scroll to top nicely
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Initialise player
  if (state.apiLoaded) {
    createPlayer(videoId);
  } else {
    // API not loaded yet — store as pending
    state.pendingVideoId = videoId;
  }
}

/** Reset UI back to the hero/landing page. */
function resetToHero() {
  stopProgressTracking();

  if (state.player) {
    try { state.player.stopVideo(); } catch (_) {}
  }

  dom.playerSection.setAttribute('hidden', '');
  dom.emptyState.removeAttribute('hidden');
  dom.heroSection.removeAttribute('hidden');

  // Clear input
  dom.urlInput.value = '';
  dom.clearBtn.hidden = true;
  hideError();

  state.videoId     = null;
  state.duration    = 0;
  state.chapters    = [];
  state.activeChapterIndex = -1;
}

/*  
   11. ERROR HELPERS
  */

function showError(message) {
  dom.errorText.textContent = message;
  dom.errorMessage.removeAttribute('hidden');
  // Re-trigger animation by removing and re-adding element
  dom.errorMessage.classList.remove('error-animate');
  void dom.errorMessage.offsetWidth; // Force reflow
  dom.errorMessage.classList.add('error-animate');
}

function hideError() {
  dom.errorMessage.setAttribute('hidden', '');
}

/*  
   12. COPY TIMESTAMPS
  */

/**
 * Copy all chapter timestamps to the clipboard in a clean format:
 *   0:00 Introduction
 *   5:00 Chapter 1
 *   ...
 */
function copyTimestamps() {
  if (!state.chapters.length) return;

  const text = state.chapters
    .map(ch => `${ch.label} ${ch.name}`)
    .join('\n');

  navigator.clipboard.writeText(text)
    .then(() => {
      // Show toast
      dom.copyToast.classList.add('visible');
      setTimeout(() => dom.copyToast.classList.remove('visible'), 2200);
    })
    .catch(() => {
      // Fallback for browsers without clipboard API
      const el = document.createElement('textarea');
      el.value = text;
      el.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      dom.copyToast.classList.add('visible');
      setTimeout(() => dom.copyToast.classList.remove('visible'), 2200);
    });
}

/*  
   13. DARK / LIGHT THEME TOGGLE
  */

/** Toggle between dark and light theme. Persists to localStorage. */
function toggleTheme() {
  const html    = document.documentElement;
  const current = html.getAttribute('data-theme') || 'dark';
  const next    = current === 'dark' ? 'light' : 'dark';

  html.setAttribute('data-theme', next);
  dom.themeIcon.textContent = next === 'dark' ? '☀' : '☾';

  try { localStorage.setItem('chaptercut-theme', next); } catch (_) {}
}

/** Load saved theme preference from localStorage. */
function loadSavedTheme() {
  try {
    const saved = localStorage.getItem('chaptercut-theme');
    if (saved && (saved === 'light' || saved === 'dark')) {
      document.documentElement.setAttribute('data-theme', saved);
      dom.themeIcon.textContent = saved === 'dark' ? '☀' : '☾';
    }
  } catch (_) {}
}

/*  
   14. PROGRESS BAR CLICK-TO-SEEK
  */

/**
 * Allow clicking on the progress bar to seek to that position.
 * @param {MouseEvent} e
 */
function onProgressClick(e) {
  if (!state.player || !state.playerReady || !state.duration) return;

  const rect    = dom.progressTrack.getBoundingClientRect();
  const clickX  = e.clientX - rect.left;
  const pct     = Math.max(0, Math.min(clickX / rect.width, 1));
  const seekTo  = pct * state.duration;

  try {
    state.player.seekTo(seekTo, true);
  } catch (_) {}
}

/*  
   15. EVENT LISTENERS
  */

function bindEvents() {
  // ── Generate button ──
  dom.generateBtn.addEventListener('click', handleGenerate);

  // ── Enter key in URL input ──
  dom.urlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleGenerate();
  });

  // ── Show / hide clear button as user types ──
  dom.urlInput.addEventListener('input', () => {
    dom.clearBtn.hidden = dom.urlInput.value.length === 0;
    if (dom.errorMessage.offsetParent !== null) hideError();
  });

  // ── Clear URL input ──
  dom.clearBtn.addEventListener('click', () => {
    dom.urlInput.value = '';
    dom.clearBtn.hidden = true;
    dom.urlInput.focus();
    hideError();
  });

  // ── Back button ──
  dom.backBtn.addEventListener('click', resetToHero);

  // ── Chapter search ──
  dom.chapterSearch.addEventListener('input', filterChapters);

  dom.searchClearBtn.addEventListener('click', () => {
    dom.chapterSearch.value = '';
    dom.searchClearBtn.hidden = true;
    filterChapters();
    dom.chapterSearch.focus();
  });

  // ── Copy timestamps ──
  // dom.copyBtn.addEventListener('click', copyTimestamps);

  // ── Theme toggle ──
  dom.themeToggle.addEventListener('click', toggleTheme);

  // ── Progress bar click-to-seek ──
  dom.progressTrack.addEventListener('click', onProgressClick);
}

/*  
   16. SCROLL ANIMATIONS (Intersection Observer)
  */

/**
 * Observe elements with [data-animate] class and add 'in-view'
 * when they scroll into the viewport — lightweight scroll animation.
 * (Primarily for the chapter cards in mobile view.)
 */
function initScrollAnimations() {
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target); // Fire once
        }
      });
    },
    { threshold: 0.12 }
  );

  document.querySelectorAll('[data-animate]').forEach(el => {
    observer.observe(el);
  });
}

/*  
   17. INITIALISATION
  */

function init() {
  loadSavedTheme();
  bindEvents();
  initScrollAnimations();

  // Auto-focus URL input on load for fast UX
  setTimeout(() => {
    dom.urlInput.focus();
  }, 600);

  console.log(
    '%cChapterCut ⬡',
    'color:#eab308;font-size:16px;font-weight:bold;font-family:monospace',
    '— YouTube Chapter Generator loaded.'
  );
}

// Kick off once the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/*  
   18. FEATURED VIDEO CAROUSEL
   ───────────────────────────────────────────────────────────
   Self-contained module. Reads from the HTML carousel markup.
   Clicking a card calls loadVideo() — all existing chapter
   generation, progress tracking, search, copy, theme, etc.
   remain completely untouched.
  */

(function initCarousel() {
  /* ── DOM refs (local to this IIFE) ── */
  const track    = document.getElementById('carouselTrack');
  const prevBtn  = document.getElementById('carouselPrev');
  const nextBtn  = document.getElementById('carouselNext');
  const dotsWrap = document.getElementById('carouselDots');

  // Guard: if markup is missing, bail silently
  if (!track || !prevBtn || !nextBtn || !dotsWrap) return;

  const slides = Array.from(track.querySelectorAll('.carousel-slide'));
  const dots   = Array.from(dotsWrap.querySelectorAll('.carousel-dot'));
  const total  = slides.length;

  /** Currently displayed slide index (0-based) */
  let current = 0;

  /** Auto-advance interval ID */
  let autoTimer = null;

  /* ── Core: move track to a given slide index ── */
  function goTo(idx) {
    // Wrap around
    current = (idx + total) % total;

    // Translate the track
    track.style.transform = `translateX(-${current * 100}%)`;

    // Update dot states
    dots.forEach((dot, i) => {
      const isActive = i === current;
      dot.classList.toggle('active', isActive);
      dot.setAttribute('aria-selected', String(isActive));
    });
  }

  /* ── Advance one slide forward ── */
  function goNext() { goTo(current + 1); }

  /* ── Retreat one slide backward ── */
  function goPrev() { goTo(current - 1); }

  /* ── Auto-advance every 5 seconds ── */
  function startAuto() {
    stopAuto();
    autoTimer = setInterval(goNext, 5000);
  }

  function stopAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  }

  /* ── Pause auto-advance while the user hovers ── */
  track.addEventListener('mouseenter', stopAuto);
  track.addEventListener('mouseleave', startAuto);
  track.addEventListener('focusin',    stopAuto);
  track.addEventListener('focusout',   startAuto);

  /* ── Arrow buttons ── */
  prevBtn.addEventListener('click', () => { goPrev(); startAuto(); });
  nextBtn.addEventListener('click', () => { goNext(); startAuto(); });

  /* ── Dot buttons ── */
  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      goTo(Number(dot.dataset.slide));
      startAuto();
    });
  });

  /* ── Touch / swipe support ── */
  let touchStartX = 0;
  let touchDeltaX = 0;

  track.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchDeltaX = 0;
    stopAuto();
  }, { passive: true });

  track.addEventListener('touchmove', e => {
    touchDeltaX = e.touches[0].clientX - touchStartX;
  }, { passive: true });

  track.addEventListener('touchend', () => {
    // Require at least 40px swipe to register
    if (touchDeltaX < -40) goNext();
    else if (touchDeltaX > 40) goPrev();
    startAuto();
  });

  /* ── Keyboard navigation (left / right arrow) ── */
  document.addEventListener('keydown', e => {
    // Only act when the carousel is on-screen (hero visible)
    const heroSection = document.getElementById('heroSection');
    if (heroSection && heroSection.hasAttribute('hidden')) return;

    if (e.key === 'ArrowLeft')  { goPrev(); startAuto(); }
    if (e.key === 'ArrowRight') { goNext(); startAuto(); }
  });

  /* ── Card click → load the video via existing loadVideo() ── */
  slides.forEach(slide => {
    const card    = slide.querySelector('.carousel-card');
    const videoId = card && card.dataset.videoid;
    if (!card || !videoId) return;

    card.addEventListener('click', () => {
      // loadVideo() is defined in the main script scope above —
      // it handles IFrame API init, chapter generation, UI swap, etc.
      loadVideo(videoId);
    });

    // Keyboard: Enter / Space on the card button (already a <button> so
    // Enter fires click natively, but Space needs explicit handling)
    card.addEventListener('keydown', e => {
      if (e.key === ' ') { e.preventDefault(); loadVideo(videoId); }
    });
  });

  /* ── Initial render + start auto-advance ── */
  goTo(0);
  startAuto();

  console.log(
    '%cChapterCut ⬡',
    'color:#eab308;font-size:14px;font-weight:bold;font-family:monospace',
    `— Carousel initialised with ${total} slides.`
  );

})(); // end carousel IIFE

// Like/ Dislike
const likeBtn =
    document.getElementById("likeBtn");

const dislikeBtn =
    document.getElementById("dislikeBtn");

let liked = false;
let disliked = false;

/* LIKE */

likeBtn.addEventListener("click", () => {

    liked = !liked;

    if(liked){

        disliked = false;

        dislikeBtn.classList.remove(
            "dislike-active"
        );
    }

    likeBtn.classList.toggle(
        "like-active",
        liked
    );
});

/* DISLIKE */

dislikeBtn.addEventListener("click", () => {

    disliked = !disliked;

    if(disliked){

        liked = false;

        likeBtn.classList.remove(
            "like-active"
        );
    }

    dislikeBtn.classList.toggle(
        "dislike-active",
        disliked
    );
});