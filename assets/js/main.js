/* =====================================================
   PERSONAL WEBSITE — MAIN.JS
   Eitan Gerber · e-gerber-technion.github.io
   ===================================================== */

'use strict';

/* ---- Constants ---- */
const THEME_KEY = 'eg-site-theme';

/* =====================================================
   THEME TOGGLE
   ===================================================== */
function getStoredTheme() {
  return localStorage.getItem(THEME_KEY) || 'dark';
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
  localStorage.setItem(THEME_KEY, next);
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
  const page = path.split('/').pop() || 'index.html';

  document.querySelectorAll('.nav-links a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === page || (page === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
}

/* =====================================================
   SCROLL REVEAL (IntersectionObserver)
   ===================================================== */
function initScrollReveal() {
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

  function refreshImages() {
    images = Array.from(document.querySelectorAll('.masonry-item'));
  }

  function openLightbox(index) {
    refreshImages();
    if (!images.length) return;
    currentIndex = index;
    updateLightbox();
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
    closeBtn?.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
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
    if (captionEl) captionEl.textContent = src.alt || '';
  }

  // Bind gallery items (also works for items added after page load)
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

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') navigate(-1);
    if (e.key === 'ArrowRight') navigate(1);
  });
}

/* =====================================================
   COPY EMAIL
   ===================================================== */
function copyEmail() {
  const email = "eitangerber@campus.technion.ac.il";
  const icon = document.getElementById('copy-icon');

  navigator.clipboard.writeText(email).then(() => {
    // Visual feedback
    icon.textContent = '✅';

    // Reset icon after 2 seconds
    setTimeout(() => {
      icon.textContent = '📋';
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy: ', err);
  });
}


/* =====================================================
   INIT
   ===================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initActiveNav();
  initHamburger();
  initScrollReveal();
  initLightbox();
});
