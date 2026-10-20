/* =====================================================
   PERSONAL WEBSITE — MAIN.JS
   Eitan Gerber · e-gerber-technion.github.io
   ===================================================== */

'use strict';

/* ---- Constants ---- */
const THEME_KEY = 'eg-site-theme';
let copyTimeout = null;

/* =====================================================
   THEME TOGGLE
   ===================================================== */
function getStoredTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  } catch (e) {
    return 'dark';
  }
}

function setStoredTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (e) {
    // Storage restricted or unavailable
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.querySelector('.theme-toggle');
  if (btn) {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  setStoredTheme(next);
  applyTheme(next);
}

function initTheme() {
  applyTheme(getStoredTheme());
  document.querySelector('.theme-toggle')?.addEventListener('click', toggleTheme);
}

/* =====================================================
   HAMBURGER MENU
   ===================================================== */
function initHamburger() {
  const hamburger = document.querySelector('.hamburger');
  const navLinks = document.querySelector('.nav-links');
  if (!hamburger || !navLinks) return;

  hamburger.addEventListener('click', () => {
    const isOpen = hamburger.classList.toggle('active');
    navLinks.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-expanded', String(isOpen));
  });

  // Close when a link is clicked
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      navLinks.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!hamburger.contains(e.target) && !navLinks.contains(e.target)) {
      hamburger.classList.remove('active');
      navLinks.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    }
  });
}

/* =====================================================
   ACTIVE NAV LINK
   ===================================================== */
function initActiveNav() {
  const path = window.location.pathname;
  const rawPage = path.split('/').pop() || '';
  const page = (rawPage.replace(/\.html$/, '') || 'index');

  document.querySelectorAll('.nav-links a').forEach(link => {
    const href = link.getAttribute('href') || '';
    const linkPage = (href.split('/').pop() || '').replace(/\.html$/, '') || 'index';
    if (linkPage === page) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });
}

/* =====================================================
   SCROLL REVEAL (IntersectionObserver)
   ===================================================== */
function initScrollReveal() {
  if (
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
    typeof IntersectionObserver === 'undefined'
  ) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.08,
    rootMargin: '0px 0px -36px 0px',
  });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

/* =====================================================
   LIGHTBOX
   ===================================================== */
function initLightbox() {
  const lightbox = document.getElementById('lightbox');
  if (!lightbox) return;

  const imgEl = document.getElementById('lightbox-img');
  const captionEl = document.getElementById('lightbox-caption');
  const closeBtn = document.getElementById('lightbox-close');
  const prevBtn = document.getElementById('lightbox-prev');
  const nextBtn = document.getElementById('lightbox-next');

  let images = [];
  let currentIndex = 0;
  let lastFocusedElement = null;

  function refreshImages() {
    images = Array.from(document.querySelectorAll('.masonry-item'));
    images.forEach(item => {
      if (!item.hasAttribute('tabindex')) {
        item.setAttribute('tabindex', '0');
      }
      if (!item.hasAttribute('role')) {
        item.setAttribute('role', 'button');
      }
    });
  }

  function openLightbox(index) {
    refreshImages();
    if (!images.length) return;
    lastFocusedElement = document.activeElement;
    currentIndex = index;
    updateLightbox();
    lightbox.classList.add('active');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    closeBtn?.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    lastFocusedElement?.focus();
  }

  function navigate(dir) {
    currentIndex = (currentIndex + dir + images.length) % images.length;
    updateLightbox();
  }

  function updateLightbox() {
    const item = images[currentIndex];
    const src = item.querySelector('img');
    if (!src || !imgEl) return;
    imgEl.src = src.src;
    imgEl.alt = src.alt;
    const captionSpan = item.querySelector('.masonry-caption');
    const captionText = captionSpan ? captionSpan.textContent.replace(/\s+/g, ' ').trim() : (src.alt || '');
    if (captionEl) captionEl.textContent = captionText;
  }

  // Bind gallery items
  refreshImages();

  document.addEventListener('click', (e) => {
    const item = e.target.closest('.masonry-item');
    if (!item) return;
    refreshImages();
    const idx = images.indexOf(item);
    if (idx !== -1) openLightbox(idx);
  });

  closeBtn?.addEventListener('click', closeLightbox);
  prevBtn?.addEventListener('click', () => navigate(-1));
  nextBtn?.addEventListener('click', () => navigate(1));

  // Click outside image to close
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  // Keyboard navigation & opening
  document.addEventListener('keydown', (e) => {
    if (lightbox.classList.contains('active')) {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
      return;
    }

    const item = e.target.closest('.masonry-item');
    if (item && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      refreshImages();
      const idx = images.indexOf(item);
      if (idx !== -1) openLightbox(idx);
    }
  });
}

/* =====================================================
   COPY EMAIL
   ===================================================== */
function copyEmail() {
  const emailEl = document.getElementById('email-text');
  const email = emailEl ? emailEl.textContent.trim() : "eitangerber@campus.technion.ac.il";
  const icon = document.getElementById('copy-icon');
  if (!icon) return;

  const onSuccess = () => {
    icon.textContent = '✅';
    if (copyTimeout) clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => {
      icon.textContent = '📋';
      copyTimeout = null;
    }, 2000);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(email)
      .then(onSuccess)
      .catch((err) => {
        console.error('Failed to copy: ', err);
      });
  } else {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = email;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      onSuccess();
    } catch (err) {
      console.error('Fallback copy failed: ', err);
    }
  }
}

function initCopyEmail() {
  document.querySelector('.copy-btn')?.addEventListener('click', copyEmail);
}

/* =====================================================
   FOOTER YEAR
   ===================================================== */
function initFooterYear() {
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

/* =====================================================
   INIT
   ===================================================== */
document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('js-enabled');
  initTheme();
  initActiveNav();
  initHamburger();
  initScrollReveal();
  initLightbox();
  initCopyEmail();
  initFooterYear();
});
