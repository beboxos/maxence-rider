#!/usr/bin/env python3
"""Compose la musique du jeu : un thème par ambiance.

  python tools/compose_music.py           # écrit assets/music/*.mid + src/data/music.js
  python tools/compose_music.py --wav DIR # rend en plus un aperçu WAV de chaque thème (contrôle d'écoute)

Aucune dépendance (numpy seulement pour --wav). Tout est déterministe : une graine par thème.
Le jeu ne lit pas les .mid (il n'a pas de banque de sons) : il joue `src/data/music.js` avec son
propre synthé Web Audio (src/core/music.js). Les .mid servent à écouter, retoucher ou remplacer
les thèmes dans n'importe quel éditeur MIDI.

Grille : 1 pas = une double-croche. 4/4 → 16 pas par mesure ; valse 3/4 → 12 pas.
Événements : [pas, note MIDI, durée en pas, vélocité 0-100]. Batterie : listes de pas par instrument.
"""
import json
import random
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NOTES = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
ACCORDS = {'maj': [0, 4, 7], 'min': [0, 3, 7], 'maj7': [0, 4, 7, 11], 'min7': [0, 3, 7, 10],
           'dom7': [0, 4, 7, 10], 'pow': [0, 7, 12], 'sus': [0, 5, 7]}
GAMMES = {'min': [0, 2, 3, 5, 7, 8, 10], 'dor': [0, 2, 3, 5, 7, 9, 10], 'maj': [0, 2, 4, 5, 7, 9, 11],
          'phr': [0, 1, 3, 5, 7, 8, 10], 'pmin': [0, 3, 5, 7, 10], 'pmaj': [0, 2, 4, 7, 9]}


def n(nom):
    """'A2' → 45."""
    return 12 * (int(nom[-1]) + 1) + NOTES[nom[:-1]]


# ── Thèmes ───────────────────────────────────────────────────────────────────────────────
# prog : un accord par mesure (racine, qualité, octave de basse). rythmes : pas des notes de mélodie.
THEMES = {
    # 1 · Skatepark & Avenue — pop-punk synthé, La dorien
    'skatepark': dict(
        titre='Avenue', bpm=132, spb=16, swing=0.0, graine=11, tonique='A', gamme='dor',
        prog=[('A', 'min'), ('A', 'min'), ('F', 'maj'), ('G', 'maj'),
              ('A', 'min'), ('F', 'maj'), ('G', 'maj'), ('E', 'dom7')],
        basse=[(0, 'r', 2), (2, 'r', 2), (4, 'r', 2), (6, '5', 2), (8, 'r', 2), (10, 'r', 2), (12, '8', 2), (14, '5', 2)],
        arp=[0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 1, 2, 1], arp_oct=12,
        rythme_lead=[(0, 2), (2, 1), (3, 1), (4, 2), (7, 1), (8, 2), (10, 2), (12, 2), (14, 1)],
        batterie=dict(k=[0, 6, 8, 10], s=[4, 12], h=[0, 2, 4, 6, 8, 10, 12, 14], o=[14], t=[]),
        lead_reg=('A4', 'E6'), stab=[],
    ),
    # 0 · Menu — ambiance calme, La mineur (pentatonique), pour l'écran titre, les scores et les réglages
    'menu': dict(
        titre='Menu', bpm=96, spb=16, swing=0.08, graine=7, tonique='A', gamme='pmin',
        prog=[('A', 'min7'), ('F', 'maj7'), ('C', 'maj'), ('G', 'maj'),
              ('A', 'min7'), ('F', 'maj7'), ('D', 'min7'), ('E', 'dom7')],
        basse=[(0, 'r', 8), (8, '5', 8)],
        arp=[0, 2, 1, 3, 2, 1, 3, 2], arp_oct=12, arp_pas=2,
        rythme_lead=[(0, 6), (8, 4), (12, 4)],
        batterie=dict(k=[0, 8], s=[], h=[4, 12], o=[], t=[]),
        lead_reg=('E4', 'A5'), stab=[], pad=True,
    ),
    # 2 · Maisons — lofi chaleureux, Do majeur, swing
    'maisons': dict(
        titre='Quartier', bpm=92, spb=16, swing=0.17, graine=23, tonique='C', gamme='pmaj',
        prog=[('C', 'maj7'), ('A', 'min7'), ('D', 'min7'), ('G', 'dom7'),
              ('C', 'maj7'), ('E', 'min7'), ('F', 'maj7'), ('G', 'dom7')],
        basse=[(0, 'r', 6), (6, '5', 2), (8, 'r', 4), (12, '5', 2), (14, '8', 2)],
        arp=[0, 2, 1, 3, 2, 3, 1, 2, 0, 2, 1, 3, 2, 3, 1, 2], arp_oct=12, arp_pas=2,
        rythme_lead=[(0, 3), (4, 2), (8, 4), (13, 2)],
        batterie=dict(k=[0, 10], s=[8], h=[0, 2, 4, 6, 8, 10, 12, 14], o=[], t=[]),
        lead_reg=('E4', 'A5'), stab=[],
    ),
    # 3 · Campus — valse pour clavecin, Ré majeur, 3/4
    'ecole': dict(
        titre='Campus', bpm=112, spb=12, swing=0.0, graine=37, tonique='D', gamme='maj',
        prog=[('D', 'maj'), ('B', 'min'), ('G', 'maj'), ('A', 'dom7'),
              ('D', 'maj'), ('B', 'min'), ('E', 'min'), ('A', 'dom7')],
        basse=[(0, 'r', 4), (6, '5', 2)],
        arp=[], arp_oct=12,
        rythme_lead=[(0, 4), (4, 2), (6, 2), (8, 2), (10, 2)],
        batterie=dict(k=[0], s=[], h=[4, 8], o=[], t=[]),
        lead_reg=('D5', 'A6'), stab=[4, 8],
    ),
    # 4 · Chantier — riff industriel, Mi phrygien
    'chantier': dict(
        titre='Chantier', bpm=138, spb=16, swing=0.0, graine=41, tonique='E', gamme='phr',
        prog=[('E', 'pow'), ('E', 'pow'), ('C', 'pow'), ('E', 'pow'),
              ('E', 'pow'), ('G', 'pow'), ('F', 'pow'), ('B', 'pow')],
        basse=[(0, 'r', 1), (1, 'r', 1), (3, 'r', 1), (4, 'r', 1), (6, '5', 1), (8, 'r', 1), (9, 'r', 1), (11, 'r', 1),
               (12, 'r', 1), (14, '5', 1)],
        arp=[], arp_oct=12,
        rythme_lead=[(0, 3), (4, 2), (8, 3), (12, 2)],
        batterie=dict(k=[0, 3, 8, 10], s=[4, 12], h=[0, 2, 4, 6, 8, 10, 12, 14], o=[6, 14], t=[]),
        lead_reg=('E3', 'E5'), stab=[0, 6, 10],
    ),
    # 5 · Cyber Arcade — synthwave, Fa# mineur
    'cyber': dict(
        titre='Cyber', bpm=150, spb=16, swing=0.0, graine=53, tonique='F#', gamme='min',
        prog=[('F#', 'min'), ('D', 'maj'), ('A', 'maj'), ('E', 'maj'),
              ('F#', 'min'), ('D', 'maj'), ('A', 'maj'), ('C#', 'dom7')],
        basse=[(0, 'r', 2), (2, 'r', 2), (4, 'r', 2), (6, 'r', 2), (8, 'r', 2), (10, 'r', 2), (12, 'r', 2), (14, 'r', 2)],
        arp=[0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3], arp_oct=12,
        rythme_lead=[(0, 6), (6, 2), (8, 6), (14, 2)],
        batterie=dict(k=[0, 4, 8, 12], s=[4, 12], h=[2, 6, 10, 14], o=[], t=[], c=[4, 12]),
        lead_reg=('F#4', 'C#6'), stab=[], pad=True,
    ),
}


# Jingles : phrases écrites à la main, jouées une seule fois (fin de partie, nouveau record).
def _jingle(titre, bpm, mesures, lead, bass, pad, drums):
    return {'titre': titre, 'bpm': bpm, 'pasParMesure': 16, 'mesures': mesures, 'swing': 0.0, 'unefois': True,
            'lead': [[p, n(m), ln, v] for p, m, ln, v in lead], 'bass': [[p, n(m), ln, v] for p, m, ln, v in bass],
            'arp': [], 'pad': [[p, n(m), ln, v] for p, m, ln, v in pad], 'stab': [],
            'drums': {k: sorted(drums.get(k, [])) for k in ('k', 's', 'h', 'o', 't', 'c')}}


JINGLES = {
    # Fin de partie : phrase descendante en La mineur, qui se résout doucement.
    'gameover': _jingle('Game over', 84, 3,
        lead=[(0, 'E5', 3, 80), (4, 'D5', 3, 78), (8, 'C5', 3, 76), (12, 'B4', 3, 74),
              (16, 'C5', 3, 76), (20, 'A4', 3, 72), (24, 'G4', 3, 70), (28, 'E4', 3, 68), (32, 'A4', 14, 78)],
        bass=[(0, 'A2', 8, 90), (8, 'F2', 8, 88), (16, 'D3', 8, 88), (24, 'E2', 8, 88), (32, 'A2', 14, 90)],
        pad=[(0, 'A3', 16, 40), (0, 'C4', 16, 40), (0, 'E4', 16, 40), (16, 'D4', 16, 40), (16, 'F4', 16, 40),
             (16, 'A4', 16, 40), (32, 'A3', 16, 42), (32, 'C4', 16, 42), (32, 'E4', 16, 42)],
        drums={}),
    # Nouveau record : fanfare ascendante en Do majeur.
    'record': _jingle('Record', 124, 3,
        lead=[(0, 'G4', 2, 85), (2, 'C5', 2, 85), (4, 'E5', 2, 85), (6, 'G5', 4, 90), (10, 'E5', 2, 80), (12, 'G5', 4, 90),
              (16, 'A5', 2, 85), (18, 'G5', 2, 82), (20, 'E5', 2, 82), (22, 'F5', 2, 82), (24, 'D5', 2, 80), (26, 'G5', 6, 88),
              (32, 'C6', 14, 95)],
        bass=[(0, 'C3', 8, 90), (8, 'C3', 8, 88), (16, 'F2', 8, 90), (24, 'G2', 8, 90), (32, 'C3', 14, 92)],
        pad=[(0, 'C4', 16, 45), (0, 'E4', 16, 45), (0, 'G4', 16, 45), (16, 'F4', 16, 45), (16, 'A4', 16, 45),
             (16, 'C5', 16, 45), (32, 'C4', 16, 48), (32, 'E4', 16, 48), (32, 'G4', 16, 48), (32, 'C5', 16, 48)],
        drums={'k': [0, 8, 16, 24, 32], 's': [12, 28, 36], 'h': [0, 4, 8, 12, 16, 20, 24, 28, 32], 'c': [36]}),
}


def accord(racine, qualite, octave):
    base = n(f'{racine}{octave}')
    return [base + i for i in ACCORDS[qualite]]


def gamme_notes(tonique, nom, bas, haut):
    """Toutes les notes de la gamme entre `bas` et `haut` (MIDI)."""
    t = NOTES[tonique]
    return [m for m in range(bas, haut + 1) if (m - t) % 12 in GAMMES[nom]]


def plus_proche(m, candidats):
    return min(candidats, key=lambda c: abs(c - m))


def composer_theme(cfg):
    """Boucle de 16 mesures : la progression est jouée deux fois, avec une mélodie nouvelle la seconde fois."""
    a = composer_passe(cfg, cfg['graine'])
    b = composer_passe(cfg, cfg['graine'] + 101)
    total = a['pasParMesure'] * a['mesures']
    res = dict(a, mesures=a['mesures'] * 2)
    for k in ('lead', 'bass', 'arp', 'pad', 'stab'):
        res[k] = a[k] + [[e[0] + total] + e[1:] for e in b[k]]
    res['drums'] = {k: a['drums'][k] + [p + total for p in b['drums'][k]] for k in a['drums']}
    return res


def composer_passe(cfg, graine):
    rng = random.Random(graine)
    spb, nb = cfg['spb'], len(cfg['prog'])
    total = spb * nb
    ech = gamme_notes(cfg['tonique'], cfg['gamme'], n(cfg['lead_reg'][0]), n(cfg['lead_reg'][1]))
    out = {'lead': [], 'bass': [], 'arp': [], 'pad': [], 'stab': []}

    # --- Mélodie : 2 mesures de motif, répétées avec cadence, puis une section B -----------------
    def tones_mesure(i):
        r, q = cfg['prog'][i]
        notes = []
        for o in range(2, 7):
            notes += accord(r, q, o)
        return [m for m in notes if n(cfg['lead_reg'][0]) <= m <= n(cfg['lead_reg'][1])]

    def ecrire_motif(i0, ancre):
        """Compose la mélodie des mesures i0 et i0+1 ; renvoie [(mesure, pas, durée, note)]."""
        evts, prec = [], ancre
        for dm in range(2):
            i = i0 + dm
            forts = tones_mesure(i)
            for (p, ln) in cfg['rythme_lead']:
                if p % 4 == 0:
                    cible = plus_proche(prec + rng.choice([-4, -2, 0, 2, 3, 5]), forts)
                else:
                    k = ech.index(plus_proche(prec, ech)) + rng.choice([-2, -1, -1, 1, 1, 2])
                    cible = ech[max(0, min(len(ech) - 1, k))]
                evts.append((i, p, ln, cible))
                prec = cible
        return evts, prec

    ancre = ech[len(ech) // 2]
    motif_a, fin_a = ecrire_motif(0, ancre)
    motif_b, fin_b = ecrire_motif(4, fin_a)
    moitie = nb // 2

    def rejouer(motif, decal, cadence=False):
        res = []
        for (i, p, ln, m) in motif:
            ni = i + decal
            m2 = plus_proche(m, tones_mesure(ni)) if p % 4 == 0 else m
            res.append((ni, p, ln, m2))
        if cadence and res:                      # la dernière note retombe sur la tonique de l'accord
            i, p, ln, _ = res[-1]
            r, q = cfg['prog'][i]
            res[-1] = (i, p, ln, plus_proche(n(f'{r}4'), tones_mesure(i)))
        return res

    mel = motif_a + rejouer(motif_a, 2, cadence=False) + motif_b + rejouer(motif_b, 2, cadence=True)
    # Respiration : une mesure sur quatre perd sa dernière note (la mélodie « souffle »).
    for (i, p, ln, m) in mel:
        if i % 4 == 3 and (p, ln) == cfg['rythme_lead'][-1] and cfg['id'] not in ('chantier',):
            continue
        out['lead'].append([i * spb + p, m, ln, 78])

    # --- Basse, arpège, nappe, stabs ---------------------------------------------------------
    for i, (r, q) in enumerate(cfg['prog']):
        ch_bas = accord(r, q, 2 if r not in ('E', 'F', 'F#', 'G', 'G#') else 1)
        racine = ch_bas[0]
        quinte = ch_bas[2] if len(ch_bas) > 2 else racine + 7
        for (p, qui, ln) in cfg['basse']:
            note = {'r': racine, '5': quinte, '8': racine + 12}[qui]
            out['bass'].append([i * spb + p, note, ln, 88])
        notes_arp = accord(r, q, 4)
        if cfg['arp']:
            pas_arp = cfg.get('arp_pas', 1)
            for k in range(0, spb, pas_arp):
                idx = cfg['arp'][(k // pas_arp) % len(cfg['arp'])] % len(notes_arp)
                out['arp'].append([i * spb + k, notes_arp[idx] + (12 if idx >= 3 else 0), pas_arp, 46])
        if cfg.get('pad'):
            for m in accord(r, q, 3):
                out['pad'].append([i * spb, m + 12, spb, 40])
        for p in cfg['stab']:
            for m in accord(r, 'min' if q == 'pow' else q, 4)[:3]:
                out['stab'].append([i * spb + p, m, 2, 62])

    # --- Batterie, avec un roulement de caisse claire en fin de boucle -------------------------
    dr = {k: [] for k in ('k', 's', 'h', 'o', 't', 'c')}
    for i in range(nb):
        for inst, pas in cfg['batterie'].items():
            dr[inst] += [i * spb + p for p in pas]
    if cfg['spb'] == 16:
        dr['s'] += [total - 4, total - 3, total - 2, total - 1]
    dr['k'] = sorted(set(dr['k']))
    return {'titre': cfg['titre'], 'bpm': cfg['bpm'], 'pasParMesure': spb, 'mesures': nb, 'swing': cfg['swing'],
            'lead': sorted(out['lead']), 'bass': sorted(out['bass']), 'arp': sorted(out['arp']),
            'pad': sorted(out['pad']), 'stab': sorted(out['stab']),
            'drums': {k: sorted(set(v)) for k, v in dr.items()}}


# ── Export MIDI (SMF type 1, sans dépendance) ───────────────────────────────────────────────
PPQ = 480


def vlq(v):
    out = [v & 0x7F]
    v >>= 7
    while v:
        out.append((v & 0x7F) | 0x80)
        v >>= 7
    return bytes(reversed(out))


def piste(evts):
    """evts : [(tick, octets)] → chunk MTrk."""
    evts = sorted(evts, key=lambda e: e[0])
    data, dernier = b'', 0
    for t, b in evts:
        data += vlq(t - dernier) + b
        dernier = t
    data += vlq(0) + b'\xff\x2f\x00'
    return b'MTrk' + struct.pack('>I', len(data)) + data


def exporter_mid(theme, chemin):
    pas = PPQ // 4
    spb = theme['pasParMesure']
    pistes = []
    tempo = int(60_000_000 / theme['bpm'])
    meta = [(0, b'\xff\x51\x03' + tempo.to_bytes(3, 'big')),
            (0, b'\xff\x58\x04' + bytes([spb // 4, 2, 24, 8])),
            (0, b'\xff\x03' + bytes([len(theme['titre'])]) + theme['titre'].encode('ascii', 'replace'))]
    pistes.append(piste(meta))
    for nom, canal, prog in (('lead', 0, 80), ('bass', 1, 38), ('arp', 2, 81), ('pad', 3, 89), ('stab', 4, 62)):
        if not theme[nom]:
            continue
        ev = [(0, bytes([0xC0 | canal, prog]))]
        for (p, m, ln, v) in theme[nom]:
            vel = max(1, min(127, int(v * 1.27)))
            ev.append((p * pas, bytes([0x90 | canal, m, vel])))
            ev.append(((p + ln) * pas - 4, bytes([0x80 | canal, m, 0])))
        pistes.append(piste(ev))
    notes_batt = {'k': 36, 's': 38, 'h': 42, 'o': 46, 't': 45, 'c': 39}
    ev = []
    for inst, liste in theme['drums'].items():
        for p in liste:
            ev.append((p * pas, bytes([0x99, notes_batt[inst], 100])))
            ev.append((p * pas + 60, bytes([0x89, notes_batt[inst], 0])))
    if ev:
        pistes.append(piste(ev))
    entete = b'MThd' + struct.pack('>IHHH', 6, 1, len(pistes), PPQ)
    chemin.write_bytes(entete + b''.join(pistes))


# ── Aperçu WAV (contrôle d'écoute) ─────────────────────────────────────────────────────────
def rendre_wav(theme, chemin, boucles=2):
    import wave

    import numpy as np
    sr = 44100
    duree_pas = 60.0 / theme['bpm'] / 4
    total = theme['pasParMesure'] * theme['mesures']
    n_ech = int(sr * duree_pas * total * boucles) + sr
    buf = np.zeros(n_ech, np.float32)

    def hz(m):
        return 440.0 * 2 ** ((m - 69) / 12)

    def osc(f, dur, forme):
        t = np.arange(int(sr * dur)) / sr
        ph = (f * t) % 1.0
        if forme == 'sq':
            return np.where(ph < 0.5, 1.0, -1.0)
        if forme == 'saw':
            return 2 * ph - 1
        if forme == 'tri':
            return 2 * np.abs(2 * ph - 1) - 1
        return np.sin(2 * np.pi * f * t)

    def poser(t0, sig):
        i0 = int(t0 * sr)
        buf[i0:i0 + len(sig)] += sig[:max(0, len(buf) - i0)]

    def t_pas(p):
        sw = theme['swing'] * duree_pas if p % 2 == 1 else 0
        return p * duree_pas + sw

    formes = {'lead': ('sq', 0.15), 'bass': ('tri', 0.32), 'arp': ('saw', 0.07), 'pad': ('saw', 0.045), 'stab': ('sq', 0.09)}
    if theme['titre'] in ('Campus',):
        formes['lead'] = ('sq', 0.12)
    rng = np.random.default_rng(1)
    for b in range(boucles):
        dec = b * total * duree_pas
        for nom, (forme, g) in formes.items():
            for (p, m, ln, v) in theme[nom]:
                dur = ln * duree_pas * (1.0 if nom in ('pad',) else 1.4)
                sig = osc(hz(m), dur, forme)
                env = np.exp(-np.linspace(0, 4 if nom != 'pad' else 0.8, len(sig)))
                poser(dec + t_pas(p), (sig * env * g * v / 100).astype(np.float32))
        for inst, liste in theme['drums'].items():
            for p in liste:
                if inst == 'k':
                    t = np.arange(int(sr * 0.12)) / sr
                    sig = np.sin(2 * np.pi * (140 * np.exp(-t * 35) + 35) * t) * np.exp(-t * 30) * 0.5
                else:
                    ln = {'s': 0.12, 'h': 0.04, 'o': 0.14, 't': 0.12, 'c': 0.12}[inst]
                    bruit = rng.uniform(-1, 1, int(sr * ln))
                    gg = {'s': 0.22, 'h': 0.08, 'o': 0.11, 't': 0.15, 'c': 0.2}[inst]
                    sig = bruit * np.exp(-np.linspace(0, 6, len(bruit))) * gg
                poser(dec + t_pas(p), sig.astype(np.float32))
    pic = float(np.max(np.abs(buf)))
    buf = buf / max(pic, 1e-6) * 0.7
    with wave.open(str(chemin), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((buf * 32767).astype(np.int16).tobytes())
    return pic


def main():
    dossier_wav = Path(sys.argv[sys.argv.index('--wav') + 1]) if '--wav' in sys.argv else None
    (ROOT / 'assets' / 'music').mkdir(parents=True, exist_ok=True)
    tous = {}
    for ident, cfg in THEMES.items():
        cfg = dict(cfg, id=ident)
        theme = composer_theme(cfg)
        tous[ident] = theme
        exporter_mid(theme, ROOT / 'assets' / 'music' / f'{ident}.mid')
        nb = sum(len(theme[k]) for k in ('lead', 'bass', 'arp', 'pad', 'stab'))
        print(f'{ident:9s} {theme["titre"]:9s} {theme["bpm"]} BPM  {theme["mesures"]} mesures  {nb} notes'
              f'  durée de boucle {theme["mesures"] * theme["pasParMesure"] * 15 / theme["bpm"]:.1f}s')
        if dossier_wav:
            dossier_wav.mkdir(parents=True, exist_ok=True)
            pic = rendre_wav(theme, dossier_wav / f'{ident}.wav')
            print(f'   aperçu → {dossier_wav / (ident + ".wav")} (crête brute {pic:.2f})')
    for ident, theme in JINGLES.items():
        tous[ident] = theme
        exporter_mid(theme, ROOT / 'assets' / 'music' / f'{ident}.mid')
        print(f'{ident:9s} {theme["titre"]:9s} {theme["bpm"]} BPM  jingle de {theme["mesures"]} mesures')
        if dossier_wav:
            rendre_wav(theme, dossier_wav / f'{ident}.wav', boucles=1)
    js = ('// Généré par tools/compose_music.py — ne pas éditer à la main (relancer le script).\n'
          'export default ' + json.dumps(tous, separators=(',', ':'), ensure_ascii=False) + ';\n')
    (ROOT / 'src' / 'data' / 'music.js').write_text(js, encoding='utf-8')
    print(f'src/data/music.js : {len(js) / 1024:.1f} Ko')


if __name__ == '__main__':
    main()
