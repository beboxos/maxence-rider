// Particules : poussière et étincelles (§5, §14).
//
// Poolées (core/pool.js) : en combo actif, poussée + atterrissages + grind +
// perfect landing peuvent en émettre plusieurs par seconde — zéro allocation
// après le chargement.
//
// fx.dust : à la poussée (un cycle de roulé complet) et à tout atterrissage.
// fx.spark : en continu pendant un grind, et en gerbe au perfect landing (§6.4).
// Le brief ne détaille pas la cadence exacte de « poussée » ni « en continu
// pendant le grind » au-delà de la table du §5 ; les intervalles ci-dessous
// sont un choix raisonnable, documenté ici plutôt que dans le brief.

import { createPool } from '../core/pool.js';
import { anim as animInfo } from '../core/assets.js';

const TAILLE_POOL = 48;
const INTERVALLE_GRIND = 0.09; // étincelles pendant un grind, en continu

function creerParticule() {
  return { type: '', x: 0, y: 0, tempsAnim: 0, direction: 1 };
}

export function createParticleSystem() {
  const pool = createPool(creerParticule, TAILLE_POOL);
  let depuisEtincelleGrind = 0;

  function emettre(type, x, y, direction = 1) {
    const p = pool.acquire();
    if (!p) return; // pool saturé : particule silencieusement perdue, pas de crash
    p.type = type;
    p.x = x;
    p.y = y;
    p.tempsAnim = 0;
    p.direction = direction;
  }

  function poussiere(x, y, direction) { emettre('fx.dust', x, y, direction); }
  function etincelle(x, y, direction) { emettre('fx.spark', x, y, direction); }

  /** À appeler chaque frame tant que le rider grinde : cadence l'émission. */
  function etincellesDeGrind(dt, x, y, direction) {
    depuisEtincelleGrind += dt;
    if (depuisEtincelleGrind >= INTERVALLE_GRIND) {
      depuisEtincelleGrind = 0;
      etincelle(x, y, direction);
    }
  }

  function reinitGrind() { depuisEtincelleGrind = 0; }

  function update(dt) {
    pool.forEachActive((p) => {
      p.tempsAnim += dt;
      const anim = animInfo(p.type);
      const duree = anim ? anim.frames.length / anim.fps : 0;
      if (p.tempsAnim >= duree) pool.release(p);
    });
  }

  /** Clé de frame à dessiner pour une particule, ou null si son anim est vide. */
  function frameKey(p) {
    const anim = animInfo(p.type);
    if (!anim) return null;
    const i = Math.min(anim.frames.length - 1, Math.floor(p.tempsAnim * anim.fps));
    return anim.frames[i];
  }

  return { poussiere, etincelle, etincellesDeGrind, reinitGrind, update, frameKey, pool };
}
