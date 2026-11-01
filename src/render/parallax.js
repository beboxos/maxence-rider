// Rendu du décor et de la parallaxe 3 couches (§9, §14).
//
// 5 thèmes graphiques complets avec bâtiments et décors spécifiques :
// 1. Le Skatepark & Avenue (Cyan & Bleu Nuit)
// 2. Pâté de Maisons & Résidences (Briques & Toits chauds)
// 3. Le Campus & L'École (Façade scolaire, horloges, cloches & Pourpre)
// 4. Le Chantier & Lofts (Échafaudages, grues, béton & Ambre de sécurité)
// 5. Le Quartier Cyber Arcade (Mégastructures néon & Nuit étoilée)

import { drawFrame, flipPourDirection } from './sprite.js';
import { frame as frameInfo } from '../core/assets.js';
import { createDecorRenderer } from './decor.js';
import { createObstacleRenderer } from './obstacle-sprites.js';

const LARGEUR_BATIMENT_SKYLINE = 36;
const ESPACEMENT_BATIMENT_MOYEN = 80;

export function createParallaxRenderer() {
  const decor = createDecorRenderer();
  const obstacles = createObstacleRenderer();

  // 1. Étoiles fixes déterministes
  const etoiles = [];
  for (let i = 0; i < 50; i++) {
    etoiles.push({
      x: (i * 37 + 13) % 480,
      y: (i * 23 + 7) % 130,
      taille: (i % 4 === 0) ? 2 : 1,
      brillance: 0.35 + ((i % 5) * 0.13),
    });
  }

  // 2. Skyline lointaine (gratte-ciels et toitures)
  const skyline = [];
  for (let i = 0; i < 60; i++) {
    const h = 45 + ((i * 19 + 7) % 60); // 45 à 105 px
    const fenetres = [];
    const etages = Math.floor((h - 12) / 8);
    for (let e = 0; e < etages; e++) {
      for (let col = 0; col < 3; col++) {
        if ((i * 5 + e * 3 + col) % 3 !== 0) {
          fenetres.push({
            dx: 5 + col * 9,
            dy: 6 + e * 8,
            allumee: ((i * 11 + e * 7 + col) % 4 === 0),
          });
        }
      }
    }
    skyline.push({ h, fenetres });
  }

  // 3. Immeubles de la couche moyenne
  const batimentsMoyens = [];
  for (let i = 0; i < 40; i++) {
    const type = i % 5;
    const w = 56 + ((i * 13) % 24); // 56 à 80 px
    const h = 55 + ((i * 17) % 35); // 55 à 90 px
    batimentsMoyens.push({ type, w, h, propIdx: i % 4 });
  }

  function dessinerCiel(ctx, view, theme, scroll, direction) {
    if (typeof ctx.createLinearGradient === 'function') {
      const grad = ctx.createLinearGradient(0, 0, 0, view.h);
      grad.addColorStop(0, theme.cielHaut);
      grad.addColorStop(0.6, theme.cielBas);
      grad.addColorStop(1, theme.solFond);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = theme.cielBas;
    }
    ctx.fillRect(0, 0, view.w, view.h);

    // Étoiles scintillantes
    if (theme.etoiles) {
      ctx.fillStyle = '#f2f0e6';
      const decalageEtoiles = ((scroll * 0.04 * direction) % view.w + view.w) % view.w;
      for (const e of etoiles) {
        const ex = (e.x - decalageEtoiles + view.w) % view.w;
        if (e.y < view.h * 0.5) {
          ctx.globalAlpha = e.brillance;
          ctx.fillRect(Math.round(ex), Math.round(e.y), e.taille, e.taille);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  function dessinerSkylineLointaine(ctx, view, theme, solY, scroll, direction) {
    const vitesseSkyline = 0.12;
    const scrollSkyline = scroll * vitesseSkyline;
    const debut = Math.floor((scrollSkyline - view.w) / LARGEUR_BATIMENT_SKYLINE);
    const fin = Math.ceil((scrollSkyline + view.w * 2) / LARGEUR_BATIMENT_SKYLINE);

    for (let i = debut; i <= fin; i++) {
      const idx = Math.abs(i) % skyline.length;
      const b = skyline[idx];
      const mondeX = i * LARGEUR_BATIMENT_SKYLINE;
      const ecranX = Math.round(view.w * 0.3 + direction * (mondeX - scrollSkyline));

      if (ecranX < -LARGEUR_BATIMENT_SKYLINE || ecranX > view.w + LARGEUR_BATIMENT_SKYLINE) continue;

      const sommetY = solY - b.h;

      // Silhouette sombre
      ctx.fillStyle = theme.id === 'maisons' ? '#1c120c' : (theme.id === 'chantier' ? '#18120c' : '#10121c');
      ctx.fillRect(ecranX, sommetY, LARGEUR_BATIMENT_SKYLINE - 2, b.h);

      // Grues industrielles dans le ciel pour le chantier
      if (theme.id === 'chantier' && i % 4 === 0) {
        ctx.fillStyle = '#ff9f1a';
        ctx.fillRect(ecranX + 10, sommetY - 22, 2, 22);
        ctx.fillRect(ecranX - 10, sommetY - 22, 35, 2);
        ctx.fillRect(ecranX + 20, sommetY - 22, 1, 12);
      } else if (b.h > 70) {
        // Antennes lumineuses
        ctx.fillStyle = theme.accent || '#4ed4c4';
        ctx.fillRect(ecranX + Math.floor(LARGEUR_BATIMENT_SKYLINE / 2) - 1, sommetY - 6, 2, 6);
        ctx.fillStyle = '#f2f0e6';
        ctx.fillRect(ecranX + Math.floor(LARGEUR_BATIMENT_SKYLINE / 2) - 1, sommetY - 7, 2, 1);
      }

      // Fenêtres éclairées
      for (const f of b.fenetres) {
        if (f.allumee) {
          ctx.fillStyle = (i % 2 === 0) ? theme.accent : '#f2f0e6';
          ctx.globalAlpha = 0.75;
          ctx.fillRect(ecranX + f.dx, sommetY + f.dy, 4, 3);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  function dessinerBatimentMoyen(ctx, type, ecranX, sommetY, w, h, solY, i, theme) {
    const accent = theme.accent || '#4ed4c4';

    if (theme.id === 'ecole') {
      // 🏫 Bâtiment d'école / Campus avec horloge centrale et cloche
      ctx.fillStyle = '#3c2648';
      ctx.fillRect(ecranX, sommetY, w, h);
      ctx.fillStyle = '#2a1634';
      ctx.fillRect(ecranX, sommetY, w, 3);

      // Fronton triangulaire d'école
      ctx.fillStyle = '#e056fd';
      ctx.fillRect(ecranX + Math.floor(w / 2) - 12, sommetY - 6, 24, 6);

      // Horloge de l'école (🕒 15:30)
      const hx = ecranX + Math.floor(w / 2);
      const hy = sommetY + 10;
      ctx.fillStyle = '#f2f0e6';
      ctx.fillRect(hx - 5, hy - 5, 10, 10);
      ctx.fillStyle = '#140c1a';
      ctx.fillRect(hx - 4, hy - 4, 8, 8);
      ctx.fillStyle = '#e056fd';
      ctx.fillRect(hx, hy - 3, 1, 4); // aiguille
      ctx.fillRect(hx, hy, 3, 1);

      // Grandes fenêtres d'école
      for (let r = 0; r < Math.floor((h - 26) / 14); r++) {
        for (let c = 0; c < Math.floor((w - 12) / 14); c++) {
          const fx = ecranX + 8 + c * 14;
          const fy = sommetY + 22 + r * 14;
          ctx.fillStyle = (i + r + c) % 3 === 0 ? '#ffc93c' : '#1e1026';
          ctx.fillRect(fx, fy, 8, 9);
          ctx.fillStyle = '#e056fd';
          ctx.fillRect(fx + 3, fy, 1, 9);
        }
      }
      return;
    }

    if (theme.id === 'chantier') {
      // 🏗️ Bâtiment industriel & Échafaudages de chantier
      ctx.fillStyle = '#2c221a';
      ctx.fillRect(ecranX, sommetY, w, h);

      // Échafaudages en métal jaune
      ctx.fillStyle = '#ff9f1a';
      ctx.fillRect(ecranX + 4, sommetY, 2, h);
      ctx.fillRect(ecranX + w - 6, sommetY, 2, h);
      for (let r = sommetY + 12; r < solY; r += 14) {
        ctx.fillRect(ecranX + 4, r, w - 10, 2);
      }

      // Palissade de chantier au sol avec bande de sécurité
      const palH = 14;
      ctx.fillStyle = '#1e1610';
      ctx.fillRect(ecranX + 2, solY - palH, w - 4, palH);
      for (let s = 4; s < w - 6; s += 8) {
        ctx.fillStyle = (Math.floor(s / 8) % 2 === 0) ? '#ff9f1a' : '#120e0a';
        ctx.fillRect(ecranX + s, solY - palH + 2, 6, palH - 4);
      }
      return;
    }

    if (theme.id === 'maisons') {
      // 🏡 Maison de ville chaleureuse en briques avec perron et toit mansardé
      ctx.fillStyle = '#6b3220';
      ctx.fillRect(ecranX, sommetY, w, h);
      ctx.fillStyle = '#4c1e10';
      ctx.fillRect(ecranX, sommetY, w, 4);

      // Fenêtres avec encadrements
      for (let r = 0; r < Math.floor((h - 22) / 14); r++) {
        for (let c = 0; c < Math.floor((w - 12) / 16); c++) {
          const fx = ecranX + 8 + c * 16;
          const fy = sommetY + 8 + r * 14;
          ctx.fillStyle = '#ffc93c';
          ctx.fillRect(fx, fy, 8, 9);
          ctx.fillStyle = '#3c180e';
          ctx.fillRect(fx + 3, fy, 1, 9);
          ctx.fillRect(fx, fy + 4, 8, 1);
        }
      }

      // Porte d'entrée avec perron
      ctx.fillStyle = '#2a1208';
      ctx.fillRect(ecranX + Math.floor(w / 2) - 6, solY - 18, 12, 18);
      ctx.fillStyle = '#ffc93c';
      ctx.fillRect(ecranX + Math.floor(w / 2) + 2, solY - 10, 2, 2);
      return;
    }

    // Themes Skatepark (1) et Cyber (5)
    if (type === 0) {
      // Immeuble d'habitation moderne avec corniches
      ctx.fillStyle = theme.id === 'cyber' ? '#180816' : '#22283a';
      ctx.fillRect(ecranX, sommetY, w, h);
      ctx.fillStyle = accent;
      ctx.fillRect(ecranX, sommetY, w, 2);

      const nbCols = Math.max(2, Math.floor((w - 12) / 14));
      const nbLignes = Math.max(2, Math.floor((h - 16) / 14));
      for (let r = 0; r < nbLignes; r++) {
        for (let c = 0; c < nbCols; c++) {
          const fx = ecranX + 8 + c * 14;
          const fy = sommetY + 8 + r * 14;
          const allumee = (i * 7 + r * 3 + c) % 3 !== 0;
          ctx.fillStyle = allumee ? accent : '#0e1018';
          ctx.fillRect(fx, fy, 7, 8);
        }
      }
    } else if (type === 1) {
      // Boutique / Store avec vitrine
      ctx.fillStyle = '#1c202e';
      ctx.fillRect(ecranX, sommetY, w, h);
      ctx.fillStyle = '#141620';
      ctx.fillRect(ecranX, sommetY, w, 3);

      const vitrineW = w - 12;
      const vitrineH = 24;
      const vitrineX = ecranX + 6;
      const vitrineY = solY - vitrineH - 4;
      ctx.fillStyle = '#121e28';
      ctx.fillRect(vitrineX, vitrineY, vitrineW, vitrineH);
      ctx.fillStyle = accent;
      ctx.fillRect(vitrineX, vitrineY, vitrineW, 1);

      // Store rayé
      const auventH = 6;
      const auventY = vitrineY - auventH;
      for (let s = 0; s < vitrineW; s += 6) {
        ctx.fillStyle = (Math.floor(s / 6) % 2 === 0) ? accent : '#f2f0e6';
        ctx.fillRect(vitrineX + s, auventY, Math.min(6, vitrineW - s), auventH);
      }
    } else if (type === 2) {
      // Skate shop / Enseigne néon
      ctx.fillStyle = '#242838';
      ctx.fillRect(ecranX, sommetY, w, h);

      ctx.fillStyle = accent;
      ctx.fillRect(ecranX + 6, sommetY + 8, w - 12, 8);
      ctx.fillStyle = '#f2f0e6';
      ctx.fillRect(ecranX + 8, sommetY + 10, w - 16, 4);

      // Tags néon
      ctx.fillStyle = accent;
      ctx.fillRect(ecranX + 8, solY - 20, 16, 8);
      ctx.fillStyle = '#ff5c3a';
      ctx.fillRect(ecranX + 20, solY - 24, 18, 10);
    } else {
      // Façade loft avec grilles de fenêtres
      ctx.fillStyle = '#1a1e2a';
      ctx.fillRect(ecranX, sommetY, w, h);
      ctx.fillStyle = accent;
      ctx.fillRect(ecranX, sommetY, w, 2);

      for (let r = 0; r < Math.floor((h - 18) / 13); r++) {
        for (let c = 0; c < Math.floor((w - 10) / 13); c++) {
          const fx = ecranX + 6 + c * 13;
          const fy = sommetY + 8 + r * 13;
          const active = (i * 3 + r * 2 + c) % 4 === 0;
          ctx.fillStyle = active ? accent : '#0e121a';
          ctx.fillRect(fx, fy, 7, 7);
        }
      }
    }
  }

  function dessinerCoucheMoyenne(ctx, view, theme, solY, scroll, direction) {
    const vitesseCouche = 0.45;
    const scrollCouche = scroll * vitesseCouche;
    const debut = Math.floor((scrollCouche - view.w) / ESPACEMENT_BATIMENT_MOYEN);
    const fin = Math.ceil((scrollCouche + view.w * 2) / ESPACEMENT_BATIMENT_MOYEN);

    for (let i = debut; i <= fin; i++) {
      const idx = Math.abs(i) % batimentsMoyens.length;
      const b = batimentsMoyens[idx];
      const mondeX = i * ESPACEMENT_BATIMENT_MOYEN;
      const ecranX = Math.round(view.w * 0.3 + direction * (mondeX - scrollCouche));

      if (ecranX < -b.w || ecranX > view.w + b.w) continue;

      const sommetY = solY - b.h;

      // 1. Façade de bâtiment
      dessinerBatimentMoyen(ctx, b.type, ecranX, sommetY, b.w, b.h, solY, i, theme);

      // 2. Sprite de décor urbain réel
      if (theme.murs && theme.murs.length > 0) {
        const propKey = theme.murs[Math.abs(i * 3 + b.propIdx) % theme.murs.length];
        if (frameInfo(propKey)) {
          const propX = ecranX + b.w + 6;
          if (propX > -40 && propX < view.w + 40) {
            ctx.save();
            ctx.globalAlpha = 0.95;
            drawFrame(ctx, propKey, propX, solY, {
              flip: flipPourDirection(direction),
            });
            ctx.restore();
          }
        }
      }
    }
  }

  function dessinerSolEtPremierPlan(ctx, view, theme, solY, scroll, direction, entitesGaps = []) {
    // 1. Sol bitumé sous la ligne de ride
    ctx.fillStyle = theme.solFond;
    ctx.fillRect(0, solY, view.w, view.h - solY);

    // 2. Texture de chaussée et trottoir
    const ESPACEMENT_LIGNES_SOL = 70;
    const debutMarquages = Math.floor((scroll - view.w) / ESPACEMENT_LIGNES_SOL);
    const finMarquages = Math.ceil((scroll + view.w * 2) / ESPACEMENT_LIGNES_SOL);

    for (let i = debutMarquages; i <= finMarquages; i++) {
      const mondeX = i * ESPACEMENT_LIGNES_SOL;
      const ecranX = Math.round(view.w * 0.3 + direction * (mondeX - scroll));

      if (ecranX < -40 || ecranX > view.w + 40) continue;

      // Joints de bitume verticaux
      ctx.fillStyle = '#0a0c12';
      ctx.fillRect(ecranX, solY + 1, 1, view.h - solY);

      // Trait de marquage routier
      if (i % 2 === 0) {
        ctx.fillStyle = theme.accent || '#f2f0e6';
        ctx.globalAlpha = 0.40;
        ctx.fillRect(ecranX + 12, solY + 8, 24, 2);
        ctx.globalAlpha = 1;
      }
    }

    // 3. Ligne néon lumineuse de sol
    ctx.fillStyle = theme.solLigne;
    ctx.fillRect(0, solY, view.w, 1);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(0, solY + 1, view.w, 1);
    ctx.globalAlpha = 1;

    // 4. Découpe nette des trous (GAPS)
    for (const gap of entitesGaps) {
      const gapX = Math.round(view.w * 0.3 + direction * (gap.worldX - scroll));
      const w = gap.hitbox.w || 60;
      const g0 = Math.round(gapX - w / 2);
      if (!obstacles.dessinerTrou(ctx, view, solY, g0, g0 + w, direction)) {
        ctx.fillStyle = '#06070a';
        ctx.fillRect(g0, solY, w, view.h - solY);
      }
    }
  }

  function render(ctx, view, theme, solY, scroll, direction, entitesGaps = []) {
    dessinerCiel(ctx, view, theme, scroll, direction);
    // Ambiances avec atlas de décors : sprites ; sinon rendu procédural d'origine.
    if (!decor.render(ctx, view, theme, solY, scroll, direction)) {
      dessinerSkylineLointaine(ctx, view, theme, solY, scroll, direction);
      dessinerCoucheMoyenne(ctx, view, theme, solY, scroll, direction);
    }
    dessinerSolEtPremierPlan(ctx, view, theme, solY, scroll, direction, entitesGaps);
  }

  return { render };
}
