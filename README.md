# paulmneves

Personal academic homepage for [paulmneves.com](https://paulmneves.com), deployed as a static site on GitHub Pages.

## Site structure

```
.
├── index.html              # Home page
├── research.html           # Research overview
├── publications.html       # Full publication list
├── CNAME                   # Custom domain (paulmneves.com)
├── css/
│   └── site.css            # Shared styles
├── js/
│   └── site.js             # Shared scripts (footer year)
├── files/
│   └── Paul_Neves_CV.pdf   # CV (add your PDF here)
├── media/
│   ├── animation.mp4       # Hero loop video (optional)
│   └── research/           # Research page figures (replace SVG placeholders)
└── tools/
    └── neutron-energy-wavelength.html
```

## Adding assets

- **CV:** Place `Paul_Neves_CV.pdf` in `files/` (linked from the home page).
- **Hero video:** Add `media/animation.mp4` and uncomment the `<video>` block in `index.html`.

## Local preview

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).
