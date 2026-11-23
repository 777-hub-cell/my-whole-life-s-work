# VISTORA — Visual design and Android quality standard

**Design reference:** `reference/Vistora.prototype.html`  
**Application:** Native Android with Kotlin and Jetpack Compose. The HTML file is the visual specification, not the runtime.

## Design direction

VISTORA should feel like a carefully art-directed entertainment journal: editorial, intimate, calm, and content-led. It should not look like a generic dashboard, a generated SaaS template, or a default Material demo.

The original prototype owns the brand and composition. Native Android should translate its visual rules into accessible Android controls without inventing a new identity.

## Do

- Keep the ink-black canvas (`#101114`), quiet charcoal surfaces (`#202126` / `#222329`), and restrained burgundy/dusty-rose accents.
- Use an editorial serif for page titles and section headings, with a clean sans-serif for labels, controls, metadata, and long-form reading.
- Use a consistent spacing rhythm: 4, 8, 12, 16, 24, and 32 dp. Keep page gutters, card padding, and section gaps aligned.
- Create hierarchy with typography, placement, whitespace, and occasional accent colour. The most important content should be the most visually prominent.
- Let posters and user-created content carry the visual weight. Preserve poster proportions and crop images deliberately.
- Use a surface only when it groups related content or provides a clear interaction boundary. Empty states, title editors, and settings groups can have surfaces; ordinary text sections should generally sit on the page.
- Keep the Home category tiles in a two-column grid, with the icon above the serif label and a quiet supporting caption.
- Keep navigation familiar and consistent. On compact phones, use the original five-destination bottom navigation with a restrained active-state background.
- Preserve the prototype's distinctive page hierarchy: wordmark and editorial headline on Home; a compact, poster-led Library; artwork-led Discover shelves; concise Stats; and a useful More/Settings area.
- Make custom controls easy to touch. Aim for at least 48 dp targets and keep typography in scalable `sp` units.
- Support narrow phones and larger windows without clipped labels, distorted posters, or awkwardly stretched cards.
- Use meaningful empty states. A blank library must look intentional and must not contain invented viewing history or fake personal statistics.

## Do not

- Do not add an oversized logo tile when the reference uses a simple wordmark.
- Do not replace the reference's headline, category hierarchy, or navigation with a new hero layout.
- Do not put every section, row, control, and label inside a separate rounded card.
- Do not add decorative gradient glows, neon accents, oversized badges, or random colourful surfaces.
- Do not use generic dashboard patterns such as a large welcome banner, metric-card wall, or repeated action buttons when the content does not call for them.
- Do not introduce arbitrary icon styles, emoji, inconsistent corner radii, or multiple unrelated type scales.
- Do not shrink text, clip labels, or force one-line layouts just to fit a narrow device.
- Do not make colour the only way to communicate status.
- Do not insert sample items into the user's actual library. Discovery previews must remain clearly separate from saved titles.
- Do not change the visual language during routine feature work without comparing against the HTML reference.

## Screen-specific rules

### Home
- Plain VISTORA wordmark with search and notifications actions.
- Headline: “What you’ve watched, and what’s next.”
- “Find something to watch” with a small Open Discover action.
- Four category tiles: Movies, K-Dramas, Anime, and TV Series. The icon sits above the title.
- One My Watchlist shelf; show a restrained empty message when it has no items.
- No streaming hero, player, or Continue Watching feature.

### Library
- Large serif page title, compact search and filter actions.
- Poster grid defaults to two columns and can be changed to two through five.
- Combined filters belong in the filter sheet; do not crowd the header with a permanent filter-chip wall.
- Show a status label on each poster and keep Add Title easy to reach.
- Empty state should be a clear invitation, not a dashboard of extra controls.

### Discover
- Search and category filters at the top.
- Use featured editorial picks and horizontally browsable poster shelves in preview mode.
- Live search results should be compact and easy to scan.
- Preview titles are recommendations only; never write them into the user's library unless the user taps Add.

### Title details and notes
- Treat the poster and title as the focal point.
- Keep status, rating, synopsis, progress, dates, and notes clearly grouped.
- Keep overall thoughts separate from episode-specific notes.
- Do not show episode progress or episode notes for films.

### Stats and More
- Stats should prioritise four meaningful summary figures, then simple status/type/rating visualisations.
- More should surface library totals and My Notes first, followed by appearance, catalogue, backup, and privacy/data settings.
- Avoid unnecessary descriptions and nested card-on-card layouts.

## Native Android quality checks

Before a release:
1. Build the debug APK and run unit tests, Room instrumentation tests, and Android lint.
2. Capture screenshots at a compact phone viewport and inspect Home, Library, Add Title, Discover, Title Details, Stats, and More.
3. Compare the screenshots with the original HTML prototype at the same viewport width.
4. Check for clipped text, uneven spacing, image distortion, misaligned baselines, overlap with system bars, and controls that are hard to reach.
5. Check touch targets (48 dp minimum), TalkBack labels, contrast, and enlarged system font settings.
6. Verify that offline library workflows still work without catalogue access.

## Research basis

- Android Developers, [Core app quality guidelines](https://developer.android.com/docs/quality-guidelines/core-app-quality): visual quality, line length, navigation, and accessibility checks.
- Android Developers, [Adaptive app quality guidelines](https://developer.android.com/develop/adaptive-apps/quality-guidelines/core-app-quality): responsive layouts, clear graphics, touch targets, and contextual menus.
- Android Developers, [Accessibility for Android apps](https://developer.android.com/guide/topics/ui/accessibility/apps): large, simple controls and 48 dp touch targets.
- Android Developers, [Material 3 design and theming](https://developer.android.com/codelabs/m3-design-theming): intentional colour hierarchy and a readable scalable type system.
- Nielsen Norman Group, [Good Visual Design, Explained](https://www.nngroup.com/articles/good-visual-design/): grid alignment, typographic hierarchy, strategic colour, and useful imagery.
- Nielsen Norman Group, [Aesthetic and Minimalist Design](https://www.nngroup.com/articles/aesthetic-minimalist-design/): prioritise relevant information and remove interface noise.

These references guide implementation quality; they do not override VISTORA's approved visual reference.
