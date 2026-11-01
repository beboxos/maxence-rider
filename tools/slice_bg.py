#!/usr/bin/env python3
"""Découpe des planches de décors (fond vert chroma) en sprites + atlas.

Usage :
  python tools/slice_bg.py probe <image> [<image> ...]   # objets détectés + planche de contrôle (atlas/_probe/)
  python tools/slice_bg.py build <theme>                  # écrit assets/bg/<theme>.png + <theme>.js

Pipeline : détourage du vert #00FF00 (dé-spill des franges JPEG) → objets par composantes
connexes → réduction « box » (alpha prémultiplié) à l'échelle du jeu → quantification de
palette → atlas unique. Outil de développement : Python 3 + Pillow + numpy + scipy
(le jeu, lui, n'a aucune dépendance).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'bg'
CLOSE_ITER = 2        # fermeture morphologique : relie les points de dithering d'un même objet
MIN_AREA = 120        # px² (échelle de la planche) en dessous : bruit JPEG, ignoré
FRAGMENT = 60 * 60    # boîte plus petite que ça et voisine d'un gros objet : fragment, fusionné
SEUIL_ALPHA = 0.5     # après réduction : un pixel est opaque au-delà de ce taux de couverture

# ── Thèmes : planches sources, noms des objets (ordre de lecture), échelle de réduction ──────
# `classe` pilote l'échelle : sky = bandes de skyline, bld = bâtiments, prop = accessoires,
# ciel = lune/nuages, vol = chauves-souris/oiseaux, sol = tuiles de sol.
ECHELLES = {'sky': 0.40, 'bld': 0.22, 'prop': 0.20, 'ciel': 0.22, 'vol': 0.12, 'sol': 0.17}
DOUX = {'lamp.0', 'lamp.1', 'heart.0', 'heart.1'}   # halos de lumière : alpha conservé sur 4 niveaux


def sk(prefix, indices, cls='sky'):
    """Skylines : chaque entrée est une liste d'indices fusionnés en une seule bande."""
    return [{'n': f'{prefix}.{k}', 'i': ix, 'cls': cls} for k, ix in enumerate(indices)]


def bld(noms, indices, cls='bld'):
    return [{'n': n, 'i': i, 'cls': cls} for n, i in zip(noms, indices)]


THEMES = {
    'theme1': {
        'palette': 48,
        'planches': [
            {'fichier': 'atlas/plancheA/Gemini_Generated_Image_dfjg3idfjg3idfjg.jpeg',
             'objets': [{'n': 'sky.%d' % i, 'i': i, 'cls': 'sky'} for i in range(3)]
             + [{'n': n, 'i': 3 + k, 'cls': 'bld'} for k, n in enumerate(
                 ('cafe', 'skateshop', 'market', 'arcade', 'laundry', 'pharmacy',
                  'cornerstore', 'garage', 'kiosk', 'house', 'brick', 'watertower'))]},
            {'fichier': 'atlas/plancheB/Gemini_Generated_Image_3eevc13eevc13eev.jpeg',
             'objets': [{'n': n, 'i': k, 'cls': 'prop'} for k, n in enumerate(
                 ('lamp.0', 'lamp.1', 'busstop', 'pole', 'fence.0', 'fence.1',
                  'wall', 'planter', 'bin', 'bench'))]
             + [{'n': n, 'i': 10 + k, 'cls': c} for k, (n, c) in enumerate(
                 [('cloud.0', 'ciel'), ('cloud.1', 'ciel'), ('moon', 'ciel'),
                  ('cloud.2', 'ciel'), ('cloud.3', 'ciel'),
                  ('bat.0', 'vol'), ('bat.1', 'vol'), ('bat.2', 'vol'),
                  ('cloud.4', 'ciel'), ('cloud.5', 'ciel')])]
             + [{'n': 'tile.%d' % k, 'i': 20 + k, 'cls': 'sol'} for k in range(12)]},
        ],
    },
    # Chantier & lofts. Planche B inutilisable (restes de skyline/bâtiments fantômes) : à régénérer.
    'theme4': {
        'palette': 48,
        'planches': [
            {'fichier': 'atlas/theme4/Gemini_Generated_Image_tgf7mjtgf7mjtgf7.jpeg',
             'objets': sk('sky', [[0], [1, 2, 3, 4, 5, 6, 7], [8, 9]])
             + bld(('frame', 'scaffold', 'factory', 'warehouse', 'cranetower', 'office',
                    'cabin', 'containers', 'workshop', 'silo', 'chimney', 'hoarding'),
                   (11, 12, 13, 14, 15, 10, 16, 18, 19, 20, 21, 23))},
        ],
    },
    # Quartier cyber arcade. Planche B inutilisable (skyline fantôme derrière les props) : à régénérer.
    'theme5': {
        'palette': 48,
        'planches': [
            {'fichier': 'atlas/theme5/Gemini_Generated_Image_r1xc8vr1xc8vr1xc.jpeg',
             'objets': sk('sky', [[0], [1], [2]])
             + bld(('arcade', 'ramen', 'conbini', 'billboard', 'tech', 'tower',
                    'karaoke', 'noodle', 'garage', 'machine', 'vending', 'izakaya'),
                   (4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16))},
        ],
    },
    # Obstacles : échelle fixée par la hitbox (entities.js), pas par la taille de la planche.
    # Les rampes sont dessinées « montant vers la gauche » : flip pour le sens de la course.
    'obstacles': {
        'palette': 64,
        'planches': [
            {'fichier': 'atlas/obstacles/Gemini_Generated_Image_8rqppn8rqppn8rqp.jpeg',
             'objets': [
                 {'n': 'qp.0', 'i': 0, 'e': 0.11, 'flip': True},
                 {'n': 'qp.1', 'i': 5, 'e': 0.11, 'flip': True, 'clip': (0, 0, 4096, 426)},
                 {'n': 'stairs.0', 'i': 1, 'e': 0.10, 'flip': True},
                 {'n': 'stairs.1', 'i': 2, 'e': 0.10, 'flip': True},
                 {'n': 'curb.0', 'i': 3, 'e': 0.179},
                 {'n': 'curb.1', 'i': 4, 'e': 0.177},
                 {'n': 'cone', 'i': 5, 'e': 0.13, 'clip': (560, 426, 710, 4096)},
                 {'n': 'rail.0', 'i': 6, 'e': 0.170, 'top': 0.6},
                 {'n': 'rail.1', 'i': 7, 'e': 0.1345, 'top': 0.6},
                 {'n': 'rail.2', 'i': 8, 'e': 0.149, 'top': 0.6},
                 {'n': 'rail.3', 'i': 9, 'e': 0.140, 'top': 0.7},
                 {'n': 'rail.long', 'i': 10, 'e': 0.141, 'top': 0.6},
                 {'n': 'can.0', 'i': 11, 'e': 0.072}, {'n': 'can.1', 'i': 12, 'e': 0.072},
                 {'n': 'can.2', 'i': 13, 'e': 0.072}, {'n': 'can.3', 'i': 14, 'e': 0.072},
                 {'n': 'coin.0', 'i': 15, 'e': 0.075},
                 {'n': 'coin.1', 'i': 16, 'e': 0.075, 'clip': (1140, 0, 1340, 4096)},
                 {'n': 'coin.2', 'i': 17, 'e': 0.075}, {'n': 'coin.3', 'i': 18, 'e': 0.075},
                 {'n': 'heart.0', 'i': 19, 'e': 0.085}, {'n': 'heart.1', 'i': 20, 'e': 0.085},
                 {'n': 'gap.left', 'i': 21, 'e': 0.106}, {'n': 'gap.right', 'i': 22, 'e': 0.106},
                 {'n': 'gap.pit', 'i': 23, 'e': 0.11}, {'n': 'barrier', 'i': 24, 'e': 0.10},
             ]},
            {'fichier': 'atlas/obstacles/Gemini_Generated_Image_ihokvsihokvsihok.jpeg',
             'objets': [
                 {'n': 'hydrant.0', 'i': 4, 'e': 0.106}, {'n': 'hydrant.1', 'i': 5, 'e': 0.106},
                 {'n': 'bin.0', 'i': 11, 'e': 0.116}, {'n': 'bin.1', 'i': 13, 'e': 0.107},
                 {'n': 'planter', 'i': 15, 'e': 0.088},
                 {'n': 'bench.0', 'i': 16, 'e': 0.105, 'clip': (50, 1715, 540, 4096)},
                 {'n': 'bench.1', 'i': 16, 'e': 0.105, 'clip': (545, 1715, 1060, 4096)},
                 {'n': 'vending.0', 'i': 17, 'e': 0.111}, {'n': 'vending.1', 'i': 18, 'e': 0.111},
                 {'n': 'cabinet', 'i': 19, 'e': 0.105},
                 {'n': 'brick', 'i': 8, 'e': 0.11}, {'n': 'barrier2', 'i': 7, 'e': 0.11},
             ]},
        ],
    },
}


def charger(path):
    """RGBA détouré : le vert de fond devient transparent, les franges sont dé-spillées."""
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.int32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    vert = g - np.maximum(r, b)                      # « verdeur » : ~255 sur le fond
    cle = vert > 110                                 # fond sûr
    anneau = ndimage.binary_dilation(cle, iterations=2) & ~cle
    spill = anneau & (vert > 25)                     # pixels mêlés de vert par le JPEG
    rgb[..., 1] = np.where(spill, np.minimum(g, np.maximum(r, b) + 8), g)
    alpha = np.where(cle, 0, 255).astype(np.uint8)
    alpha = np.where(anneau & (vert > 60), 128, alpha).astype(np.uint8)
    return np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), alpha])


def lignes_de_sol(masque):
    """Rangées fines (≤ 8 px) qui traversent la planche : trait de sol tracé sous chaque rangée.
    Il relie tous les objets entre eux et fausse la segmentation : on l'écarte."""
    frac = masque.mean(axis=1) > 0.5
    lignes = np.zeros_like(frac)
    y = 0
    while y < len(frac):
        if frac[y]:
            y2 = y
            while y2 < len(frac) and frac[y2]:
                y2 += 1
            if y2 - y <= 8:
                lignes[y:y2] = True
            y = y2
        else:
            y += 1
    return lignes


def scinder_liens_fins(etiq):
    """Un objet plus large que la moitié de la planche est sans doute plusieurs objets reliés
    par un trait fin : une ouverture verticale (14 px) coupe ces liens."""
    larg = etiq.shape[1]
    suivant = int(etiq.max()) + 1
    for i, sl in enumerate(ndimage.find_objects(etiq), start=1):
        if sl is None or (sl[1].stop - sl[1].start) <= larg * 0.5:
            continue
        zone = (etiq[sl] == i)
        ouvert = ndimage.binary_opening(zone, structure=np.ones((14, 1)))
        sous, n = ndimage.label(ndimage.binary_closing(ouvert, structure=np.ones((3, 3)), iterations=2))
        if n <= 1:
            continue
        dist, (iy, ix) = ndimage.distance_transform_edt(sous == 0, return_indices=True)
        sous = np.where((sous == 0) & zone & (dist <= 6), sous[iy, ix], sous)
        bloc = etiq[sl]
        bloc[zone] = 0
        for k in range(1, n + 1):
            bloc[sous == k] = suivant
            suivant += 1
    return etiq


def etiqueter(masque):
    sol = lignes_de_sol(masque)
    sans_sol = masque & ~sol[:, None]
    ferme = ndimage.binary_closing(sans_sol, structure=np.ones((3, 3)), iterations=CLOSE_ITER)
    etiq, _ = ndimage.label(ferme)
    dist, (iy, ix) = ndimage.distance_transform_edt(etiq == 0, return_indices=True)
    etiq = np.where((etiq == 0) & masque & (dist <= 6) & ~sol[:, None], etiq[iy, ix], etiq)
    for y in np.where(sol)[0]:                       # le trait de sol revient aux objets qu'il porte
        for k in range(1, 5):
            if y - k >= 0 and not sol[y - k]:
                haut = etiq[y - k]
                etiq[y] = np.where((etiq[y] == 0) & masque[y] & (haut > 0), haut, etiq[y])
                break
    return scinder_liens_fins(etiq)


def fin(it):
    """Fil électrique, lettre d'enseigne… : très mince, ou presque vide dans sa boîte."""
    x0, y0, x1, y1 = it['box']
    return min(x1 - x0, y1 - y0) < 24 or it['px'] < 0.12 * (x1 - x0) * (y1 - y0)


def proches(a, b, marge=40):
    if fin(a) or fin(b):
        marge = 120
    a, b = a['box'], b['box']
    return not (a[2] + marge < b[0] or b[2] + marge < a[0] or a[3] + marge < b[1] or b[3] + marge < a[1])


def objets(rgba):
    """Objets de la planche : [{'box': (x0,y0,x1,y1), 'labels': {…}}], rangées puis gauche→droite."""
    masque = rgba[..., 3] > 0
    etiq = etiqueter(masque)
    items = []
    for i, sl in enumerate(ndimage.find_objects(etiq), start=1):
        if sl is None or int((etiq[sl] == i).sum()) < MIN_AREA:
            continue
        items.append({'box': (sl[1].start, sl[0].start, sl[1].stop, sl[0].stop), 'labels': {i},
                      'px': int((etiq[sl] == i).sum())})
    # Les fragments (rambarde détachée, lettre d'enseigne…) rejoignent l'objet voisin le plus gros.
    change = True
    while change:
        change = False
        for p in sorted(items, key=lambda it: (it['box'][2] - it['box'][0]) * (it['box'][3] - it['box'][1])):
            aire = (p['box'][2] - p['box'][0]) * (p['box'][3] - p['box'][1])
            if aire >= FRAGMENT and not fin(p):
                continue
            voisins = [o for o in items if o is not p and proches(p, o)
                       and (o['box'][2] - o['box'][0]) * (o['box'][3] - o['box'][1]) > aire]
            if not voisins:
                continue
            o = max(voisins, key=lambda o: (o['box'][2] - o['box'][0]) * (o['box'][3] - o['box'][1]))
            o['box'] = (min(o['box'][0], p['box'][0]), min(o['box'][1], p['box'][1]),
                        max(o['box'][2], p['box'][2]), max(o['box'][3], p['box'][3]))
            o['labels'] |= p['labels']
            o['px'] += p['px']
            items.remove(p)
            change = True
            break
    items.sort(key=lambda it: it['box'][3])
    rangees, courante = [], []
    for it in items:
        if courante and it['box'][3] - courante[-1]['box'][3] > 40:
            rangees.append(courante)
            courante = []
        courante.append(it)
    if courante:
        rangees.append(courante)
    return [sorted(r, key=lambda it: it['box'][0]) for r in rangees], etiq


def decouper(rgba, etiq, item):
    x0, y0, x1, y1 = item['box']
    rec = rgba[y0:y1, x0:x1].copy()
    garde = np.isin(etiq[y0:y1, x0:x1], list(item['labels']))
    rec[..., 3] = np.where(garde, rec[..., 3], 0)
    return rec


def reduire(rgba, facteur=None, taille=None, doux=False):
    """Réduction « box » avec alpha prémultiplié ; l'alpha est binarisé ensuite
    (ou conservé sur 4 niveaux pour les halos de lumière : `doux`)."""
    h, w = rgba.shape[:2]
    nw, nh = taille if taille else (max(1, round(w * facteur)), max(1, round(h * facteur)))
    a = rgba[..., 3].astype(np.float32) / 255.0
    plans = [rgba[..., c].astype(np.float32) * a for c in range(3)] + [a]
    red = [np.asarray(Image.fromarray(p, mode='F').resize((nw, nh), Image.BOX)) for p in plans]
    alpha = red[3]
    rgb = np.stack(red[:3], axis=-1) / np.maximum(alpha[..., None], 1e-4)
    if doux:
        a8 = (np.round(alpha * 3) / 3 * 255).astype(np.uint8)
    else:
        a8 = np.where(alpha >= SEUIL_ALPHA, 255, 0).astype(np.uint8)
    return np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), a8])


def quantifier(sprites, couleurs=48):
    """Palette commune à tous les sprites (sans dithering) : traits nets, atlas léger."""
    pixels = np.concatenate([s[..., :3][s[..., 3] > 0] for s in sprites])
    pal = Image.fromarray(pixels.reshape(-1, 1, 3)).quantize(
        colors=couleurs, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    sortie = []
    for s in sprites:
        q = np.asarray(Image.fromarray(s[..., :3]).quantize(palette=pal, dither=Image.Dither.NONE).convert('RGB'))
        sortie.append(np.dstack([q, s[..., 3]]))
    return sortie


def planche_controle(rgba, rangees, chemin):
    fond = Image.new('RGB', (rgba.shape[1], rgba.shape[0]), (24, 24, 32))
    fond.paste(Image.fromarray(rgba), mask=Image.fromarray(rgba[..., 3]))
    d = ImageDraw.Draw(fond)
    n = 0
    for rangee in rangees:
        for it in rangee:
            x0, y0, x1, y1 = it['box']
            d.rectangle([x0, y0, x1, y1], outline=(255, 60, 120), width=3)
            d.text((x0 + 6, y0 + 4), str(n), fill=(255, 255, 0), font_size=36) if hasattr(d, 'font') else d.text((x0 + 6, y0 + 4), str(n), fill=(255, 255, 0))
            n += 1
    fond.thumbnail((1600, 1600))
    fond.save(chemin)


def cmd_probe(chemins):
    tmp = ROOT / 'atlas' / '_probe'
    tmp.mkdir(exist_ok=True)
    for chemin in chemins:
        rgba = charger(chemin)
        rangees, _ = objets(rgba)
        print(f'\n== {chemin}')
        n = 0
        for rangee in rangees:
            print(' | '.join(f'#{n + k} {it["box"][2]-it["box"][0]}x{it["box"][3]-it["box"][1]}@{it["box"][0]},{it["box"][1]}'
                             for k, it in enumerate(rangee)))
            n += len(rangee)
        sortie = tmp / (Path(chemin).stem[-8:] + '.png')
        planche_controle(rgba, rangees, sortie)
        print('controle ->', sortie)


def cmd_build(nom):
    cfg = THEMES[nom]
    noms, sprites = [], []
    for pl in cfg['planches']:
        rgba = charger(ROOT / pl['fichier'])
        rangees, etiq = objets(rgba)
        liste = [it for r in rangees for it in r]
        for sp in pl['objets']:
            idx = sp['i'] if isinstance(sp['i'], list) else [sp['i']]
            if max(idx) >= len(liste):
                raise SystemExit(f"{pl['fichier']} : {len(liste)} objets, indice {max(idx)} demandé "
                                 f"(lancer `probe` et corriger la configuration)")
            groupe = [liste[k] for k in idx]
            box = (min(g['box'][0] for g in groupe), min(g['box'][1] for g in groupe),
                   max(g['box'][2] for g in groupe), max(g['box'][3] for g in groupe))
            item = {'box': box, 'labels': set().union(*[g['labels'] for g in groupe])}
            rec = decouper(rgba, etiq, item)
            if 'clip' in sp:                       # rognage en coordonnées de la planche
                cx0, cy0, cx1, cy1 = sp['clip']
                x0, y0 = box[0], box[1]
                rec[:max(0, cy0 - y0), :, 3] = 0
                rec[max(0, cy1 - y0):, :, 3] = 0
                rec[:, :max(0, cx0 - x0), 3] = 0
                rec[:, max(0, cx1 - x0):, 3] = 0
                ys, xs = np.where(rec[..., 3] > 0)
                rec = rec[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            if 'top' in sp:                        # haut seulement (rails : barre + amorces de pieds)
                ys, _ = np.where(rec[..., 3] > 0)
                haut = ys.min() + int((ys.max() - ys.min() + 1) * sp['top'])
                rec = rec[:haut]
            if sp.get('flip'):
                rec = rec[:, ::-1].copy()
            e = sp['e'] if 'e' in sp else ECHELLES[sp['cls']]
            sprites.append(reduire(rec, facteur=e, doux=sp['n'] in DOUX))
            noms.append(sp['n'])
    sprites = quantifier(sprites, cfg.get('palette', 48))
    LARG = 1024
    x = y = h_ligne = 0
    pos = []
    for sp_ in sprites:
        h, w = sp_.shape[:2]
        if x + w > LARG:
            x, y, h_ligne = 0, y + h_ligne + 1, 0
        pos.append((x, y))
        x += w + 1
        h_ligne = max(h_ligne, h)
    haut = y + h_ligne
    atlas = np.zeros((haut, LARG, 4), np.uint8)
    frames = {}
    for n, sp_, (px, py) in zip(noms, sprites, pos):
        h, w = sp_.shape[:2]
        atlas[py:py + h, px:px + w] = sp_
        frames[n] = {'x': px, 'y': py, 'w': w, 'h': h}
    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(atlas).save(OUT / f'{nom}.png', optimize=True)
    (OUT / f'{nom}.js').write_text(
        '// Généré par tools/slice_bg.py — ne pas éditer à la main.\n'
        f'export default {json.dumps({"sheet": f"bg/{nom}.png", "frames": frames}, indent=1)};\n',
        encoding='utf-8')
    print(f'{nom}: {len(frames)} sprites, texture {LARG}x{haut}')
    for n, f in frames.items():
        print(f'  {n}: {f["w"]}x{f["h"]}')


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == 'probe':
        cmd_probe(sys.argv[2:])
    elif len(sys.argv) == 3 and sys.argv[1] == 'build':
        cmd_build(sys.argv[2])
    else:
        print(__doc__)
