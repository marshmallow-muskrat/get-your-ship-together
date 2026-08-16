# Source images

Full-resolution PNG masters for the two large UI images. These are **not** published:
`public/` is copied verbatim into `dist/`, so anything left there ships on every deploy.

The runtime serves WebP re-encodes instead, which are ~85% smaller at an SSIM of
0.99 against these masters — visually identical at the sizes they are displayed.

| Master | Published as | Size |
| --- | --- | ---: |
| `crew-portrait-sheet.png` (2.4 MB) | `public/hero-cards/crew-portrait-sheet.webp` | 0.40 MB |
| `hero-select-space.png` (1.9 MB) | `public/backgrounds/hero-select-space.webp` | 0.22 MB |

Re-encode after editing a master:

```bash
ffmpeg -i assets/source-images/crew-portrait-sheet.png \
  -c:v libwebp -quality 94 -compression_level 6 \
  public/hero-cards/crew-portrait-sheet.webp -y
```

Keep the portrait sheet's pixel dimensions unchanged — `app.css` addresses it as a
sprite sheet by background-position, so a resize would move every hero's face.
