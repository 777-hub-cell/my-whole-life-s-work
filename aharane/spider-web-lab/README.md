# Aharane Splash Screen Preview

A single-purpose splash screen concept, replacing the earlier animation gallery.

## Motion intent
- The mark draws on once and settles in about **1.2 seconds**.
- No looping, spinning, particle simulation, canvas, video, JavaScript timer or external font dependency.
- The final mark remains still until the host app continues.
- `prefers-reduced-motion: reduce` displays the finished mark immediately.
- The artwork is lightweight SVG with CSS-only animation, designed to avoid frame-timing and canvas redraw glitches.

This is still an isolated preview. It does not change the Android launcher icons, Android app theme, PWA manifest, or production app startup flow.
