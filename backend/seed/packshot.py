"""Draws product pack illustrations as SVG. Stand-ins for photography in the demo; no external service."""
from xml.sax.saxutils import escape

FONT = "Segoe UI, Helvetica, Arial, sans-serif"


def _mix(hex_color: str, factor: float) -> str:
    """factor < 1 darkens, > 1 lightens (toward white)."""
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    if factor <= 1:
        r, g, b = (int(c * factor) for c in (r, g, b))
    else:
        t = factor - 1
        r, g, b = (int(c + (255 - c) * t) for c in (r, g, b))
    return f"#{max(0, min(255, r)):02x}{max(0, min(255, g)):02x}{max(0, min(255, b)):02x}"


def _wrap(name: str, max_chars: int = 15) -> list[str]:
    words, lines, cur = name.split(), [], ""
    for w in words:
        if cur and len(cur) + 1 + len(w) > max_chars:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    return lines[:3]


def _label(x, y, w, h, brand, name, size, color, accent, back):
    if back:
        bars = "".join(
            f'<rect x="{x + 18}" y="{y + 46 + i * 24}" width="{w - 36 - (i % 3) * 28}" height="9" rx="4" fill="#cfd6dd"/>' for i in range(5)
        )
        barcode = "".join(f'<rect x="{x + 18 + i * 6}" y="{y + h - 54}" width="{2 + (i % 3)}" height="36" fill="#222"/>' for i in range((w - 36) // 6))
        return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="#ffffff"/>'
                f'<text x="{x + 18}" y="{y + 30}" font-family="{FONT}" font-size="17" font-weight="700" fill="#33414e">Nutrition (sample)</text>{bars}{barcode}')
    lines = _wrap(name)
    dark = _mix(color, 0.45)
    # centre the name block in the space below the brand line
    start = y + 48 + max(0, (h - 58 - len(lines) * 34) / 2) + 26
    text = "".join(
        f'<text x="{x + w / 2}" y="{start + i * 34}" text-anchor="middle" font-family="{FONT}" '
        f'font-size="30" font-weight="800" fill="{dark}">{escape(t)}</text>' for i, t in enumerate(lines))
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{accent}"/>'
            f'<text x="{x + w / 2}" y="{y + 34}" text-anchor="middle" font-family="{FONT}" font-size="22" font-weight="900" letter-spacing="4" fill="{dark}">{escape(brand.upper())}</text>'
            f'{text}'
            f'<g><circle cx="{x + w - 30}" cy="{y + h - 30}" r="30" fill="{color}"/>'
            f'<text x="{x + w - 30}" y="{y + h - 25}" text-anchor="middle" font-family="{FONT}" font-size="16" font-weight="800" fill="#fff">{escape(size)}</text></g>')


def _pack(pack, color, accent, brand, name, size, back):
    dark = _mix(color, 0.7)
    shadow = '<ellipse cx="400" cy="676" rx="210" ry="26" fill="#000" opacity="0.12"/>'
    if pack == "bar":
        zig = lambda x0, d: "".join(f'<polygon points="{x0},{300 + i * 20} {x0 + d * 24},{310 + i * 20} {x0},{320 + i * 20}" fill="{dark}"/>' for i in range(10))
        body = (f'<rect x="130" y="300" width="540" height="200" rx="10" fill="{color}"/>{zig(130, -1)}{zig(670, 1)}'
                f'<path d="M130 300 H670 V330 Q400 360 130 330 Z" fill="#fff" opacity="0.14"/>')
        return shadow.replace('cy="676"', 'cy="530"') + body + _label(160, 330, 480, 140, brand, name, size, color, accent, back)
    if pack == "pouch":
        body = (f'<path d="M232 150 Q196 400 218 640 Q400 684 582 640 Q604 400 568 150 Z" fill="{color}"/>'
                f'<rect x="232" y="132" width="336" height="44" rx="6" fill="{dark}"/>'
                + "".join(f'<rect x="240" y="{140 + i * 9}" width="320" height="3" fill="#fff" opacity="0.25"/>' for i in range(4))
                + f'<path d="M232 176 Q214 400 226 620 L262 626 Q252 400 270 176 Z" fill="#fff" opacity="0.14"/>')
        return shadow + body + _label(262, 270, 276, 270, brand, name, size, color, accent, back)
    if pack == "can":
        body = (f'<rect x="250" y="200" width="300" height="440" fill="{color}"/>'
                f'<ellipse cx="400" cy="640" rx="150" ry="34" fill="{dark}"/>'
                f'<ellipse cx="400" cy="200" rx="150" ry="34" fill="#cfd5db"/><ellipse cx="400" cy="200" rx="128" ry="26" fill="#e7ebef"/>'
                f'<rect x="268" y="200" width="26" height="440" fill="#fff" opacity="0.16"/>')
        return shadow + body + _label(262, 290, 276, 250, brand, name, size, color, accent, back)
    if pack == "bottle":
        body = (f'<rect x="362" y="86" width="76" height="54" rx="9" fill="{dark}"/>'
                f'<rect x="368" y="140" width="64" height="78" fill="{_mix(color, 1.4)}"/>'
                f'<path d="M368 214 Q290 240 290 310 V610 Q290 656 336 656 H464 Q510 656 510 610 V310 Q510 240 432 214 Z" fill="{color}"/>'
                f'<path d="M306 300 V600 Q306 624 326 628 L326 300 Z" fill="#fff" opacity="0.2"/>')
        return shadow + body + _label(300, 340, 200, 250, brand, name, size, color, accent, back).replace('font-size="30"', 'font-size="25"')
    # box
    body = (f'<polygon points="210,170 550,170 610,200 270,200" fill="{_mix(color, 1.25)}"/>'
            f'<rect x="210" y="170" width="340" height="470" fill="{color}"/>'
            f'<polygon points="550,170 610,200 610,670 550,640" fill="{dark}"/>')
    return shadow.replace('cy="676"', 'cy="670"') + body + _label(230, 260, 300, 310, brand, name, size, color, accent, back)


def render_svg(pack: str, color: str, accent: str, brand: str, name: str, size: str, kind: str = "front", bg_white: bool = True, width: int = 800) -> str:
    """kind: front | back | lifestyle."""
    if kind == "lifestyle":
        bg = (f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{_mix(accent, 1.15)}"/><stop offset="1" stop-color="{_mix(color, 1.6)}"/></linearGradient></defs>'
              f'<rect width="800" height="800" fill="url(#g)"/><circle cx="130" cy="150" r="150" fill="#fff" opacity="0.25"/><circle cx="700" cy="680" r="190" fill="#fff" opacity="0.2"/>'
              f'<text x="40" y="760" font-family="{FONT}" font-size="26" font-weight="700" fill="{_mix(color, 0.5)}" opacity="0.8">Everyday moments</text>')
        art = f'<g transform="rotate(-6 400 400) translate(60 40) scale(0.84)">{_pack(pack, color, accent, brand, name, size, False)}</g>'
    else:
        if bg_white:
            bg = '<rect width="800" height="800" fill="#ffffff"/>'
        else:
            bg = ('<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfe5ec"/><stop offset="1" stop-color="#b9c4d0"/></linearGradient></defs>'
                  '<rect width="800" height="800" fill="url(#g)"/>')
        art = _pack(pack, color, accent, brand, name, size, kind == "back")
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{width}" viewBox="0 0 800 800" role="img" '
            f'aria-label="{escape(brand)} {escape(name)} {escape(size)}, {kind} view">{bg}{art}</svg>')
