// Décor de saison : Halloween, du 27/10 au 04/11 (4 jours avant et après la fête), à l'heure de Paris.
// Léger par construction : une teinte, quelques citrouilles et chauves-souris qui flottent. Rien ne touche
// à la physique, aux sprites ni au HUD. `?theme=halloween` force le décor pour le prévisualiser,
// `?theme=aucun` le coupe.

const DEBUT_HALLOWEEN = '10-27';
const FIN_HALLOWEEN = '11-04';

/** Jour MM-JJ à Paris pour un instant donné. */
export function jourParis(date) {
  const parts = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', month: '2-digit', day: '2-digit',
  }).format(date);
  return parts; // « 10-27 »
}

/** Nom de la saison en cours ('halloween') ou null. `forcee` vient de l'adresse (?theme=…). */
export function saisonCourante(date = new Date(), forcee = null) {
  if (forcee) return forcee === 'halloween' ? 'halloween' : null;
  const jour = jourParis(date);
  return jour >= DEBUT_HALLOWEEN && jour <= FIN_HALLOWEEN ? 'halloween' : null;
}

/** Valeur de ?theme=… dans l'adresse, sans planter hors navigateur (tests). */
export function themeForce() {
  try {
    return new URLSearchParams(globalThis.location.search).get('theme');
  } catch (_) {
    return null;
  }
}

// Petite valeur pseudo-aléatoire stable : la position des décors ne demande aucune mémoire
const frac = (x) => x - Math.floor(x);
const bruit = (i) => frac(Math.sin(i * 127.1 + 311.7) * 43758.5453);

const DECORS = ['🎃', '🦇', '🦇', '👻', '🎃', '🦇', '🕸️', '🎃'];

/**
 * Dessine le décor de saison par-dessus le ciel (à appeler juste après le parallax).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{w:number,h:number}} view
 * @param {number} t temps en secondes (animation)
 * @param {string|null} saison
 */
export function dessinerSaison(ctx, view, t, saison) {
  if (saison !== 'halloween') return;
  ctx.save();
  // Teinte : lueur orange en haut, violet profond en bas
  const g = ctx.createLinearGradient(0, 0, 0, view.h);
  g.addColorStop(0, 'rgba(255, 120, 20, 0.20)');
  g.addColorStop(1, 'rgba(110, 20, 140, 0.16)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.w, view.h);
  // Décors qui dérivent lentement, assez discrets pour ne jamais gêner la lecture des obstacles
  const taille = Math.max(14, Math.round(view.h * 0.07));
  ctx.globalAlpha = 0.32;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${taille}px sans-serif`;
  for (let i = 0; i < DECORS.length; i++) {
    const vitesse = 0.02 + bruit(i + 1) * 0.03;
    const x = frac(bruit(i + 5) - t * vitesse) * (view.w + taille * 2) - taille;
    const y = (0.08 + bruit(i + 9) * 0.38) * view.h + Math.sin(t * 1.3 + i * 2) * taille * 0.4;
    ctx.fillText(DECORS[i], x, y);
  }
  ctx.restore();
}
