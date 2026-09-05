"""Deterministic SVG product mock-up images.

Used for synthetic rows and as a fallback whenever a real product image is missing or fails to load.
The look is derived from the item id (hue) and the title (a line icon for the product type).
"""
from __future__ import annotations

import hashlib

# (keyword, lucide-style stroke paths drawn in a 24x24 box)
ICONS: list[tuple[str, str]] = [
    ("earbud", '<path d="M8 3a4 4 0 0 0-4 4v7a3 3 0 0 0 6 0V7a4 4 0 0 0-2-4Z"/><path d="M16 3a4 4 0 0 1 4 4v7a3 3 0 0 1-6 0V7a4 4 0 0 1 2-4Z"/><path d="M8 3v3M16 3v3"/>'),
    ("blender", '<path d="M8 3h8l-1 11H9L8 3Z"/><path d="M7 14h10v3H7z"/><path d="M9 17v4h6v-4"/><path d="M10 7h4"/>'),
    ("serum", '<path d="M10 2h4v4h-4z"/><path d="M9 6h6v3a3 3 0 0 1 0 0v10a3 3 0 0 1-3 3 3 3 0 0 1-3-3V6Z"/><path d="M12 10v6"/>'),
    ("tripod", '<circle cx="12" cy="6" r="3"/><path d="M12 9v4"/><path d="M12 13l-6 9M12 13l6 9M12 13v9"/>'),
    ("charger", '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M12 7l-2 5h4l-2 5"/>'),
    ("lamp", '<path d="M8 2h8l4 10H4L8 2Z"/><path d="M12 12v6"/><path d="M8 22h8"/><path d="M12 18v4"/>'),
    ("organizer", '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M3 12h18M12 7v14"/><path d="M8 7V4h8v3"/>'),
    ("kettle", '<path d="M6 8h11a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3Z"/><path d="M6 16v4h11v-4"/><path d="M9 8V5h5v3"/><path d="M20 12h2"/>'),
    ("mat", '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 7v10M11 7v10M15 7v10"/>'),
    ("brush", '<path d="M14 3l7 7-9 9-7-7 9-9Z"/><path d="M5 12l-2 2a3 3 0 0 0 4 4l2-2"/>'),
    ("", '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8Z"/><path d="M3 8l9 5 9-5M12 13v8"/>'),  # generic box
]


def _icon_for(title: str) -> str:
    t = (title or "").lower()
    for key, path in ICONS:
        if key and key in t:
            return path
    return ICONS[-1][1]


def render(item_id: int, title: str = "") -> str:
    h = int(hashlib.md5(str(item_id).encode()).hexdigest()[:6], 16)
    hue = h % 360
    hue2 = (hue + 28) % 360
    label = (title or f"Item {item_id}").strip()
    if len(label) > 22:
        label = label[:21] + "…"
    label = label.replace("&", "&amp;").replace("<", "&lt;")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320" role="img" aria-label="{label}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl({hue} 70% 92%)"/><stop offset="1" stop-color="hsl({hue2} 65% 80%)"/></linearGradient></defs>
<rect width="320" height="320" fill="url(#g)"/>
<circle cx="160" cy="140" r="82" fill="hsl({hue} 60% 97% / 0.75)"/>
<g transform="translate(112 92) scale(4)" fill="none" stroke="hsl({hue} 55% 32%)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">{_icon_for(title)}</g>
<text x="160" y="262" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="17" font-weight="600" fill="hsl({hue} 45% 28%)">{label}</text>
<text x="160" y="286" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="12" fill="hsl({hue} 30% 45%)">mock-up · #{item_id}</text>
</svg>'''
