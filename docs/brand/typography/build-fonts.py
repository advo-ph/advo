# Rebuild: python3 docs/brand/typography/build-fonts.py docs/brand/typography apps/web/public/fonts  (needs potrace, fontTools, brotli)
import sys, re, subprocess, os, numpy as np
from PIL import Image
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

def segment(mask, rows_expected):
    rowsum = mask.sum(1) > 0
    bands, inb = [], False
    for y, v in enumerate(rowsum):
        if v and not inb: s, inb = y, True
        if not v and inb: bands.append((s, y)); inb = False
    if inb: bands.append((s, len(rowsum)))
    bands = [b for b in bands if b[1]-b[0] > 5]
    assert [len(x) for x in [bands]] and len(bands) == len(rows_expected), bands
    glyphs = []
    for (y0, y1), letters in zip(bands, rows_expected):
        colsum = mask[y0:y1].sum(0) > 0
        boxes, inb = [], False
        for x, v in enumerate(colsum):
            if v and not inb: s, inb = x, True
            if not v and inb: boxes.append((s, x)); inb = False
        if inb: boxes.append((s, len(colsum)))
        boxes = [b for b in boxes if b[1]-b[0] > 2]
        assert len(boxes) == len(letters), (letters, len(boxes), boxes)
        # baseline & cap height per row from glyph bottoms/tops (median)
        tops, bots = [], []
        for x0, x1 in boxes:
            ys = np.where(mask[y0:y1, x0:x1].any(1))[0]
            tops.append(y0+ys[0]); bots.append(y0+ys[-1]+1)
        base = int(np.median(bots)); top = int(np.median(tops))
        for ch, (x0, x1) in zip(letters, boxes):
            glyphs.append((ch, x0, x1, y0, y1, base, top))
    return glyphs

def trace(mask, ch, x0, x1, y0, y1, base, workdir):
    pad = 4
    crop = mask[y0-pad:y1+pad, x0-pad:x1+pad]
    img = Image.fromarray(np.where(crop, 0, 255).astype('uint8')).convert('1')
    pbm = os.path.join(workdir, f'g_{ord(ch)}.pbm'); svg = pbm[:-4]+'.svg'
    img.save(pbm)
    subprocess.run(['potrace', '-b', 'svg', '-a', '1.0', '-O', '0.4', '-t', '4', '-o', svg, pbm], check=True)
    data = open(svg).read()
    H = crop.shape[0]
    ds = re.findall(r' d="([^"]+)"', data)
    # potrace coords: units of 0.1px, y-up from crop bottom
    return ds, H, pad

def build(src, rows, family, out, sb_ratio, thresh=128, upscale=1, space=0.33, kern=False):
    im = Image.open(src).convert('RGBA')
    a = im.split()[3]
    if upscale != 1:
        a = a.resize((a.width*upscale, a.height*upscale), Image.LANCZOS)
    mask = np.array(a) >= thresh
    glyphs = segment(mask, rows)
    caps = [g[5]-g[6] for g in glyphs]
    cap = float(np.median(caps))
    UPM, CAP = 1000, 700
    s = CAP / cap
    workdir = os.path.dirname(out)
    names = ['.notdef', 'space']; cmap = {32: 'space'}; charstrings = {}; metrics = {}
    sb = int(round(cap * sb_ratio * s))
    profiles = {}
    for ch, x0, x1, y0, y1, base, top in glyphs:
        # left/right ink edge per sampled row of the cap height, in font units
        # measured from the glyph origin (sidebearing included)
        lefts, rights = [], []
        for i in range(24):
            yy = int(top + (base - top) * (i + 0.5) / 24)
            xs = np.where(mask[yy, x0:x1])[0]
            if len(xs): lefts.append(sb + xs[0] * s); rights.append(sb + xs[-1] * s)
            else: lefts.append(None); rights.append(None)
        profiles[ch] = (lefts, rights)
        ds, H, pad = trace(mask, ch, x0, x1, y0, y1, base, workdir)
        pen = T2CharStringPen(0, None)
        # px from crop-bottom -> font units; crop bottom = y1+pad; baseline at base
        off_y = (y1 + pad - base) * s
        tp = TransformPen(pen, (0.1*s, 0, 0, 0.1*s, sb - pad*s, -off_y))
        for d in ds: parse_path(d, tp)
        w = int(round((x1-x0)*s)) + 2*sb
        pen.width = w
        name = ch
        charstrings[name] = pen.getCharString()
        metrics[name] = (w, sb)
        names.append(name); cmap[ord(ch)] = name; cmap[ord(ch.lower())] = name
    spw = int(CAP*space)
    for n in ['.notdef', 'space']:
        p = T2CharStringPen(spw, None); charstrings[n] = p.getCharString(); metrics[n] = (spw, 0)
    fb = FontBuilder(UPM, isTTF=False)
    fb.setupGlyphOrder(names); fb.setupCharacterMap(cmap)
    fb.setupCFF(family.replace(' ', ''), {'FullName': family}, charstrings, {})
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=900, descent=-250)
    fb.setupNameTable({'familyName': family, 'styleName': 'Regular'})
    fb.setupOS2(sTypoAscender=900, sTypoDescender=-250, usWinAscent=950, usWinDescent=250, sCapHeight=CAP, sxHeight=CAP)
    fb.setupPost()
    if kern:
        from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
        fea = autokern(profiles, metrics, sb)
        addOpenTypeFeaturesFromString(fb.font, fea)
    fb.font.flavor = 'woff2'
    fb.save(out)
    print(out, len(glyphs), 'glyphs, cap px', cap, 'sb', sb)

OPEN_RIGHT = set("AVWYTLKXPF")
OPEN_LEFT = set("AVWYTJX")

def autokern(profiles, metrics, sb):
    # Optical kerning: the average white space between two letters is pulled
    # toward the space between two straight stems (2 * sb). Diagonal letters
    # like W, V, A, Y then overlap their neighbours' empty corners.
    base = 2 * sb
    lines = []
    for l, (_, rl) in profiles.items():
        adv = metrics[l][0]
        for r, (lr, _) in profiles.items():
            gaps = [adv - a + b for a, b in zip(rl, lr) if a is not None and b is not None]
            if not gaps: continue
            mean_gap, min_gap = sum(gaps) / len(gaps), min(gaps)
            # Only pairs with an open diagonal side get real pull; round and
            # straight pairs keep their even rhythm.
            open_side = l in OPEN_RIGHT or r in OPEN_LEFT
            k = -(mean_gap - base) * (0.55 if open_side else 0.12)
            k = max(k, -(min_gap - base * 0.6))  # strokes never crowd
            k = int(round(min(k, 0)))
            if k <= -12: lines.append(f"  pos {l} {r} {k};")
    return "feature kern {\n" + "\n".join(lines) + "\n} kern;\n"

imgs = sys.argv[1]; outdir = sys.argv[2]
build(f'{imgs}/advo-display-source.png', ['ABCDEFG', 'HIJKLMN', 'OPQRSTU', 'VWXYZ'], 'ADVO Display', f'{outdir}/advo-display.woff2', 0.075, space=0.42, kern=True)
if '--all' in sys.argv: build(f'{imgs}/advo-text-source.png', ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ'], 'ADVO Text', f'{outdir}/advo-text.woff2', 0.07, upscale=4, space=0.36)
