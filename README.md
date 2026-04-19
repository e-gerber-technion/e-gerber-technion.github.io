# Eitan Gerber — Personal Website

> Hosted at **[e-gerber-technion.github.io](https://e-gerber-technion.github.io)**
> Built with plain HTML, CSS, and vanilla JavaScript — no build tools, no dependencies.

---

## Directory Structure

```
/
├── index.html              ← Home / About
├── research.html           ← Research posters & abstracts
├── photography.html        ← Photo gallery
├── contact.html            ← Links / social profiles
│
└── assets/
    ├── css/
    │   └── style.css       ← Full design system (dark + light themes)
    ├── js/
    │   └── main.js         ← Theme toggle, nav, scroll animations, lightbox
    └── images/
        ├── avatar.jpg          ← Your profile photo (drop in when ready)
        ├── photography/        ← Gallery photos go here
        └── research/
            ├── posters/        ← Poster PDFs (e.g. poster-my-work-2025.pdf)
            └── abstracts/      ← Abstract PDFs (e.g. abstract-my-work-2025.pdf)
```

---

## Editing Guide

### Add your profile photo
Drop `avatar.jpg` (or `.png`, `.webp`) into `assets/images/`.
Then in `index.html`, replace:
```html
<div class="avatar-placeholder" aria-hidden="true">EG</div>
```
with:
```html
<img src="assets/images/avatar.jpg" alt="Eitan Gerber" />
```

### Add your CV
1. Place `cv.pdf` in `assets/`
2. In `index.html`, uncomment the CV button block (look for `<!-- TO ADD YOUR CV` in the hero section)

### Add a research entry
1. Drop your PDFs into `assets/research/posters/` and `assets/research/abstracts/`
2. In `research.html`, copy an existing `<article class="research-card">` block
3. Update the title, authors, venue, year, abstract, tags, and `href` values
4. See detailed instructions in the HTML comment at the top of the research grid

### Add a photo to the gallery
1. Drop your photo (JPEG or WebP, ≤ 2000px on longest side) into `assets/images/photography/`
2. In `photography.html`, add a new item inside `<div class="masonry-grid">`:
```html
<div class="masonry-item" id="photo-1">
  <img
    src="assets/images/photography/your-photo.jpg"
    alt="Caption shown in lightbox"
    loading="lazy"
    decoding="async"
  />
  <div class="masonry-overlay" aria-hidden="true">
    <span class="masonry-caption">Caption shown on hover</span>
  </div>
</div>
```
3. Remove (or comment out) the `.empty-state` div once you have photos

### Update contact links
In `contact.html`, find each `<a class="link-card">` and replace `href="#"` with your actual profile URL.
Look for `<!-- PLACEHOLDER` comments that flag exactly what to change.

---

## Deploying to GitHub Pages

1. Create a new public repository named **exactly** `e-gerber-technion.github.io`
2. Push all files from this folder to the `main` branch:
   ```bash
   git init
   git remote add origin https://github.com/e-gerber-technion/e-gerber-technion.github.io.git
   git add .
   git commit -m "Initial commit"
   git push -u origin main
   ```
3. In the repository on GitHub, go to **Settings → Pages**
4. Under *Source*, select **Deploy from a branch** → `main` → `/ (root)`
5. Click **Save** — the site will be live at `https://e-gerber-technion.github.io` within ~60 seconds

> **Custom domain (optional):** If you buy a domain later, add a `CNAME` file to the repo root containing only your domain (e.g. `eitangerber.dev`), then configure the DNS CNAME record at your registrar to point to `e-gerber-technion.github.io`.

---

## Theme

- **Default:** Dark mode
- **Toggle:** ☀️/🌙 button in the navbar — preference is saved to `localStorage`

## License

All site code: MIT.
Photography and written content: All rights reserved © Eitan Gerber.
