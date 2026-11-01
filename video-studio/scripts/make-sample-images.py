"""Draw 4 synthetic "product photos" (a serum bottle) for demos and render tests.

Run: python3 scripts/make-sample-images.py  ->  public/samples/product-{1..4}.jpg
They are clearly fake on purpose; replace with real uploads in the app.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "public" / "samples"
S = 1000


def gradient(top, bottom):
    img = Image.new("RGB", (S, S), top)
    d = ImageDraw.Draw(img)
    for y in range(S):
        t = y / (S - 1)
        d.line([(0, y), (S, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)))
    return img


def shadow(img, box, blur=30, alpha=90):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(box, fill=(0, 0, 0, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    img.paste(layer, (0, 0), layer)


def bottle(img, cx, base_y, scale=1.0, liquid=(255, 170, 40)):
    d = ImageDraw.Draw(img, "RGBA")
    w, h = int(240 * scale), int(420 * scale)
    x0, y0 = cx - w // 2, base_y - h
    shadow(img, (x0 - 30, base_y - 30, x0 + w + 30, base_y + 40))
    d = ImageDraw.Draw(img, "RGBA")
    d.rounded_rectangle((x0, y0, x0 + w, base_y), radius=int(46 * scale), fill=(255, 196, 92, 235), outline=(200, 120, 20), width=4)
    d.rounded_rectangle((x0 + 14, y0 + int(110 * scale), x0 + w - 14, base_y - 14), radius=int(34 * scale), fill=liquid + (200,))
    # label
    d.rounded_rectangle((x0 + 30, y0 + int(170 * scale), x0 + w - 30, y0 + int(330 * scale)), radius=14, fill=(255, 255, 255, 235))
    d.text((x0 + 48, y0 + int(190 * scale)), "VIT C", fill=(230, 110, 20))
    d.rectangle((x0 + 48, y0 + int(230 * scale), x0 + w - 48, y0 + int(240 * scale)), fill=(240, 160, 60))
    d.rectangle((x0 + 48, y0 + int(256 * scale), x0 + w - 90, y0 + int(264 * scale)), fill=(250, 200, 140))
    # collar + dropper bulb
    cw = int(110 * scale)
    d.rectangle((cx - cw // 2, y0 - int(50 * scale), cx + cw // 2, y0 + 6), fill=(245, 245, 245), outline=(180, 180, 180), width=3)
    bw = int(80 * scale)
    d.rounded_rectangle((cx - bw // 2, y0 - int(170 * scale), cx + bw // 2, y0 - int(46 * scale)), radius=int(38 * scale), fill=(40, 40, 46))
    # highlight
    d.rounded_rectangle((x0 + 18, y0 + 20, x0 + 40, base_y - 60), radius=10, fill=(255, 255, 255, 90))


def box(img, x0, y0, w, h):
    shadow(img, (x0 - 20, y0 + h - 30, x0 + w + 30, y0 + h + 40))
    d = ImageDraw.Draw(img, "RGBA")
    d.rectangle((x0, y0, x0 + w, y0 + h), fill=(255, 250, 240), outline=(230, 200, 160), width=4)
    d.rectangle((x0, y0 + h * 0.62, x0 + w, y0 + h * 0.78), fill=(250, 150, 40))
    d.text((x0 + 26, y0 + 30), "VITAMIN C SERUM 30ml", fill=(200, 100, 20))


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    a = gradient((255, 244, 228), (255, 214, 170))
    bottle(a, 500, 860, 1.25)
    a.save(OUT / "product-1.jpg", quality=90)

    b = gradient((236, 244, 255), (200, 220, 245))
    box(b, 470, 380, 360, 480)
    bottle(b, 330, 880, 1.05)
    b.save(OUT / "product-2.jpg", quality=90)

    c = gradient((255, 236, 210), (255, 204, 150))
    d = ImageDraw.Draw(c, "RGBA")
    for i, (x, y, r) in enumerate([(380, 520, 170), (640, 420, 110), (650, 680, 140)]):
        d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 168, 40, 210 - i * 30))
        d.ellipse((x - r * 0.4, y - r * 0.7, x - r * 0.05, y - r * 0.35), fill=(255, 255, 255, 140))
    c.save(OUT / "product-3.jpg", quality=90)

    e = gradient((228, 245, 232), (180, 222, 196))
    d = ImageDraw.Draw(e, "RGBA")
    for x, y, rot in [(160, 260, 0), (820, 220, 1), (140, 760, 1), (860, 780, 0)]:
        d.ellipse((x - 120, y - 50, x + 120, y + 50) if rot else (x - 50, y - 120, x + 50, y + 120), fill=(70, 150, 90, 200))
    d.ellipse((380, 760, 620, 840), fill=(255, 255, 255, 160))
    bottle(e, 500, 820, 1.1, liquid=(255, 150, 30))
    e.save(OUT / "product-4.jpg", quality=90)

    print("wrote", sorted(p.name for p in OUT.glob("product-*.jpg")))


if __name__ == "__main__":
    main()
