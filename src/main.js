import { createLoop } from './core/loop.js';
import { createInput, Action } from './core/input.js';
import { loadAssets, atlas, menuHeroImage, frame as frameInfo } from './core/assets.js';
import { mulberry32 } from './core/rng.js';
import { createRenderer } from './render/renderer.js';
import { drawFrame, flipPourDirection } from './render/sprite.js';
import { createStateMachine, State } from './game/state.js';
import { createPlayer, RiderState, SAUTS } from './game/player.js';
import { createLevel } from './game/level.js';
import { construireEntites, entitesActives } from './game/entities.js';
import { resoudre, AIMANT_RAIL_PX } from './game/physics.js';
import { createScoring } from './game/scoring.js';
import { createParticleSystem } from './game/particles.js';
import { createCamera } from './game/camera.js';
import { createJuice } from './game/juice.js';
import { createObstacleRenderer } from './render/obstacle-sprites.js';
import { createParallaxRenderer } from './render/parallax.js';
import { createAudio } from './core/audio.js';
import { createStorage } from './core/storage.js';
import { dessinerCurb2D, dessinerRampe2D, dessinerCone2D } from './render/obstacles.js';
import { THEMES, getTheme } from './data/themes.js';
import { saisonCourante, themeForce, dessinerSaison } from './game/saison.js';
import { Family, ENTITIES } from './data/entities.js';

import { getRider, RIDERS } from './data/riders.js';

const DEBUG = new URLSearchParams(location.search).has('debug');

const canvas = document.getElementById('jeu');
const boutonPause = document.getElementById('pause');
const boutonSon = document.getElementById('son');
const chargement = document.getElementById('chargement');
const panne = document.getElementById('panne');

const renderer = createRenderer(canvas);
const { ctx, view } = renderer;

const SOL = 40; // hauteur du sol depuis le bas de l'espace virtuel
const MARGE_VUE = 80; // px hors écran avant de considérer une entité invisible

const player = createPlayer({ rider: 'skate', direction: 1 });
const scoring = createScoring();
const particles = createParticleSystem();
const camera = createCamera();
const juice = createJuice({ reduit: () => storage.settings.reducedFx });
const obstacleSprites = createObstacleRenderer();
const parallax = createParallaxRenderer();
const audio = createAudio();
const storage = createStorage();
const monde = { defilement: 0, prevDefilement: 0 };

// §7 : chaque rider a son propre seuil de déblocage dans RIDERS[id].debloqueA
// (progress.totalScore cumulé sur tous les runs, pas le score d'un seul run).
// Lu depuis riders.js plutôt que dupliqué ici, pour qu'ajouter un 3e rider se
// limite à ce fichier — voir "Ajouter un rider" dans le README.
function debloquerRidersEligibles() {
  for (const rider of Object.values(RIDERS)) {
    if (!storage.riderDebloque(rider.id) && storage.progress.totalScore >= rider.debloqueA) {
      storage.debloquerRider(rider.id);
    }
  }
}

let dernierSautAudio = null;
let dernierComboAudio = 1;

const BONUS_RAMPE = 1.4; // §6.5

// §6.7 : 3 vies, checkpoints tous les 5 chunks, invincibilité 1,2 s au respawn.
const run = {
  vies: 3,
  invincibleJusque: 0, // en secondes de jeu écoulées (tempsTotal)
  tempsTotal: 0,
  seed: (Date.now() % 0xffffffff) >>> 0,
};

let level = null;
let entites = [];
let curseurEntites = 0;

function solY() {
  return view.h - SOL;
}

/** §11 : retour haptique, désactivable dans les réglages. navigator.vibrate
 * est ignoré silencieusement là où il n'existe pas (desktop, iOS Safari). */
function vibrer(motif) {
  if (!storage.settings.haptics) return;
  try { navigator.vibrate?.(motif); } catch {}
}

function nouvelleSeed() {
  return (Date.now() % 0xffffffff) >>> 0;
}

function demarrerRun(seed = nouvelleSeed(), { obstacles = true, rider = 'skate', direction = 1 } = {}) {
  run.seed = seed;
  run.vies = 3;
  run.tempsTotal = 0;
  run.invincibleJusque = 1.8; // Invincibilité clignotante de 1.8s dès le départ de la run

  scoring.perdreCombo();
  scoring.etat.score = 0;
  scoring.etat.meilleurCombo = 1;
  particles.reinitGrind();
  camera.reset();
  juice.reset();
  audio.setMusicTheme?.(getTheme(1).id); // chaque ambiance a son thème (tools/compose_music.py) ; `?.` : modules en cache d'âges mixtes
  audio.startMusic();

  player.stats = getRider(rider);
  player.direction = direction;

  level = createLevel({ rng: mulberry32(seed) });
  level.assurerJusque(0);
  entites = obstacles ? construireEntites(level.placés) : [];
  curseurEntites = 0;

  player.poser(Math.round(view.w * 0.3), solY());
  player.tempsCourse = 0;
  player.distance = 0;
  player.bonusRampe = 1;
  monde.defilement = 0;
  monde.prevDefilement = 0;
}

/** Repositionne le rider au dernier checkpoint franchi, invincibilité brève. */
function respawn() {
  const cible = level.dernierCheckpointFranchi(monde.defilement);
  monde.defilement = cible;
  monde.prevDefilement = cible;
  player.poser(Math.round(view.w * 0.3), solY());
  player.bonusRampe = 1;
  run.invincibleJusque = run.tempsTotal + 1.8;
  curseurEntites = 0;
  camera.reset();
}

function labelTrick(trickType) {
  if (player.stats.id === 'roller') {
    if (trickType === 'boost') return 'BOOST';
    if (trickType === 'flip') return 'HEELFLIP';
    return 'OLLIE';
  }
  if (trickType === 'boost') return 'NO-COMPLY';
  if (trickType === 'flip') return 'KICKFLIP';
  return 'OLLIE';
}

function enregistrerTrickReussi() {
  if (!player.dernierSautReussi) return;
  const trickType = player.dernierSautReussi;
  player.dernierSautReussi = null;
  const defSaut = SAUTS[trickType];
  if (!defSaut) return;

  const label = labelTrick(trickType);
  const points = Math.round(defSaut.points * player.stats.pointsTrick);
  const perfect = !!player.perfectLandingDernier;
  scoring.enregistrerTrick(label, points, player.x, player.y - 25, { perfect });
  audio.sfx.land(perfect);
  vibrer(12); // §11 : trick réussi

  if (perfect) {
    camera.shake(3, 0.15);
    juice.hitStop(0.03);
    juice.gerbe(player.x, player.y, { n: 10, force: 110, dirX: -player.direction, gravite: 0.6 });
    for (let k = 0; k < 3; k++) particles.etincelle(player.x, player.y, player.direction);
  } else {
    particles.poussiere(player.x, player.y, player.direction);
  }
}

function majCollisions(scrollAvant, scrollApres) {
  if (run.tempsTotal < run.invincibleJusque) return; // §6.7 : invincibilité au respawn

  const { actives, indexSuivant } = entitesActives(entites, curseurEntites, monde.defilement, 600);
  curseurEntites = indexSuivant;

  for (const entite of actives) {
    const resultat = resoudre(entite, player, solY(), scrollAvant, scrollApres);

    if (resultat === 'crash') {
      player.crasher();
      scoring.perdreCombo();
      particles.reinitGrind();
      camera.shake(8, 0.35); // §10 : shake d'impact
      juice.hitStop(0.07);
      juice.flash('#ffffff', 0.45);
      juice.gerbe(player.x, player.y - 10, { n: 22, force: 170, couleurs: ['#ffffff', '#ff5c3a', '#ffc93c'] });
      audio.sfx.crash();
      vibrer([40, 30, 40]); // §11 : crash
      return;
    }

    if (resultat === 'corner') {
      // Corner correction : on remonte les pieds sur le sommet, sans crash.
      player.y = solY() - (entite.elevation || 0) - entite.hitbox.h;
      player.vy = 0;
      continue;
    }

    if (resultat === 'clear') {
      if ((entite.family === Family.LOW || entite.family === Family.HIGH || entite.family === Family.GAP || entite.family === Family.RAIL) && !entite.cleared) {
        entite.cleared = true;
        player.ajouterBoost(1.0, 0.25); // +25% de vitesse pendant 1s par obstacle sauté (s'accumule !)
        scoring.enregistrerTrick('JUMP OVER', 50, player.x, player.y - 22, { perfect: false });
        audio.sfx.combo(2);
        for (let k = 0; k < 2; k++) particles.etincelle(player.x, player.y, player.direction);
      }
    }

    if (resultat === 'ramp') {
      // Décollage auto une seule fois par rampe, seulement quand le rider est
      // vraiment posé dessus (un survol aérien ne doit pas re-déclencher un saut).
      //
      // Le bonus n'est posé QUE dans ce cas, consommé dans la même frame par
      // declencherSautRampe(). Le laisser traîner pour un rider déjà en l'air
      // créait un bonus fantôme : appliqué en silence au prochain saut
      // volontaire du joueur, parfois une ou deux secondes plus tard, sans
      // rapport apparent avec la rampe — trajectoire surprise, atterrissage
      // raté, crash (retour testeur du 17/08).
      if (!entite.rampeDeclenchee && player.auSol) {
        entite.rampeDeclenchee = true;
        player.bonusRampe = BONUS_RAMPE;
        player.declencherSautRampe();
        scoring.enregistrerTrick('RAMPE !', 30, player.x, player.y - 22, { perfect: false });
        audio.sfx.combo(2);
        for (let k = 0; k < 3; k++) particles.etincelle(player.x, player.y, player.direction);
      }
    }

    if (resultat === 'grind') {
      enregistrerTrickReussi();
      player.entrerGrind(entite, solY());
      particles.etincelle(player.x, player.y, player.direction);
      audio.sfx.grindTick();
    }

    if (resultat === 'collect') {
      entite.collected = true;
      const cx = screenXDe(entite.worldX, monde.defilement);
      const cy = solY() - (entite.elevation || 0);

      if (entite.type === 'life_cross') {
        run.vies = Math.min(5, run.vies + 1);
        scoring.afficherBandeau('+1 VIE ! 💚', cx, cy - 25, '#2ed573');
        audio.sfx.coin();
        for (let k = 0; k < 6; k++) particles.etincelle(player.x, player.y, player.direction);
      } else {
        scoring.ramasserCollectible(cx, cy);
        audio.sfx.coin();
        juice.gerbe(cx, cy, { n: 5, force: 70, couleurs: ['#ffc93c', '#ffffff'], gravite: 0.4 });

        if (entite.chunkInstance) {
          entite.chunkInstance.coinsRamasses++;
          if (
            entite.chunkInstance.coinsRamasses === entite.chunkInstance.totalCoins
            && entite.chunkInstance.totalCoins > 0
            && !entite.chunkInstance.cleanLineAccordee
          ) {
            entite.chunkInstance.cleanLineAccordee = true;
            scoring.cleanLine(player.x, player.y - 30);
            audio.sfx.cleanLine();
          }
        }
      }
    }
  }
}

function majJeu(dt) {
  // Hit-stop : la simulation (et l'input) attendent, éclats et flash continuent.
  if (juice.gele(dt)) { juice.update(dt); return; }

  input.update();

  run.tempsTotal += dt;
  monde.prevDefilement = monde.defilement;

  const scrollAvant = monde.defilement;
  player.update(dt, { input, solY: solY() });

  if (player.state !== RiderState.CRASH) {
    monde.defilement += player.vitesse * dt;
  }
  player.x = Math.round(view.w * 0.3);
  player.prevX = player.x;

  level.assurerJusque(monde.defilement);
  if (entites.length < level.placés.reduce((n, p) => n + p.chunk.entities.length, 0)) {
    entites = construireEntites(level.placés);
  }

  // Changement de niveau tous les 10 000 points & gain d'une vie
  const distM = Math.floor(player.distance / 10);
  const scoreTotal = scoring.scoreTotal(distM);
  const palierCalcule = Math.min(5, Math.floor(scoreTotal / 10000) + 1);
  if (level && palierCalcule > level.palier) {
    level.palier = palierCalcule;
    player.niveauPalier = palierCalcule;
    run.vies = Math.min(5, run.vies + 1); // +1 vie gagnée tous les 10 000 points !
    const themeNiveau = getTheme(palierCalcule);
    audio.setMusicTheme?.(themeNiveau.id); // bascule à la fin de la mesure en cours
    scoring.afficherBandeau(`⚡ NIVEAU ${palierCalcule} : ${themeNiveau.nom.toUpperCase()} ! +1 VIE 💚`, player.x, player.y - 45, '#2ed573');
    audio.sfx.cleanLine();
    camera.shake(5, 0.3);
    juice.flash('#2ed573', 0.3);
    juice.gerbe(player.x, player.y - 12, { n: 24, force: 150, couleurs: ['#2ed573', '#ffffff', '#4ed4c4'], gravite: 0.5 });
    for (let k = 0; k < 8; k++) particles.etincelle(player.x, player.y, player.direction);
  } else if (level) {
    player.niveauPalier = level.palier;
  }

  // Déclenchement son de saut
  if (player.state === RiderState.AIR && player.sautEnCours && player.sautEnCours !== dernierSautAudio) {
    dernierSautAudio = player.sautEnCours;
    audio.sfx.jump(player.sautEnCours);
  } else if (player.state !== RiderState.AIR) {
    dernierSautAudio = null;
  }

  // §6.4 : Atterrissage d'un trick au sol
  if (player.state === RiderState.LAND) {
    enregistrerTrickReussi();
  }

  // §6.4 : Actions continues (Grind & Manual)
  if (player.state === RiderState.GRIND) {
    scoring.grinding(dt);
    particles.etincellesDeGrind(dt, player.x, player.y, player.direction);
    if (Math.floor(run.tempsTotal * 15) % 2 === 0) {
      audio.sfx.grindTick();
    }

    // Détection de fin naturelle de rail
    if (player.grindEntite) {
      const ex = screenXDe(player.grindEntite.worldX, monde.defilement);
      const demiW = (player.grindEntite.hitbox?.w || 12) / 2;
      const entiteMin = ex - demiW;
      const entiteMax = ex + demiW;
      const riderMin = player.x - 14 / 2;
      const riderMax = player.x + 14 / 2;
      // Même marge que l'aimant à rail (physics.js) : un rail attrapé de justesse ne lâche pas aussitôt.
      const encoreDessus = riderMax > entiteMin - AIMANT_RAIL_PX && riderMin < entiteMax + AIMANT_RAIL_PX;
      if (!encoreDessus) {
        const chute = (player.grindEntite.elevation || 0) > 0 || (solY() - player.grindY) > 2;
        player.sortirGrind({ chute });
        scoring.finGrind();
        particles.reinitGrind();
      }
    }
  } else if (player.state === RiderState.MANUAL) {
    scoring.manualing(dt);
  }

  // Déclenchement son de combo
  if (scoring.etat.multiplicateur > dernierComboAudio) {
    audio.sfx.combo(scoring.etat.multiplicateur);
  }
  dernierComboAudio = scoring.etat.multiplicateur;

  scoring.update(dt);
  particles.update(dt);
  juice.update(dt);
  camera.update(dt, player.y);

  if (player.state === RiderState.CRASH) {
    if (player.crashTermine) {
      run.vies--;
      if (run.vies <= 0) jeu.go(State.GAMEOVER);
      else respawn();
    }
  } else {
    majCollisions(scrollAvant, monde.defilement);
  }

  if (input.consume(Action.TOGGLE_MUTE)) basculerSon();
  if (input.consume(Action.RESTART)) demarrerRun();
}

// ── Rendu ────────────────────────────────────────────────────────────────────

function screenXDe(worldX, scroll) {
  return player.x + player.direction * (worldX - scroll);
}

/** Canette de soda / collectible procédural pixel art (§6.6). */
function dessinerCollectible(cx, cy) {
  const bob = Math.sin(run.tempsTotal * 6 + cx * 0.05) * 1.5;
  const y = Math.round(cy + bob);
  const x = Math.round(cx);
  ctx.fillStyle = '#ffc93c';
  ctx.fillRect(x - 4, y - 5, 8, 10);
  ctx.fillStyle = '#4ed4c4';
  ctx.fillRect(x - 4, y - 2, 8, 4);
  ctx.fillStyle = '#f2f0e6';
  ctx.fillRect(x - 3, y - 5, 6, 1);
  ctx.fillStyle = '#12131a';
  ctx.fillRect(x - 4, y + 4, 8, 1);
}

function dessinerBonusVie(x, y) {
  const t = performance.now() / 1000;
  const bob = Math.sin(t * 5 + x * 0.05) * 3;
  const cy = Math.round(y + bob);
  const cx = Math.round(x);
  const pulse = Math.sin(t * 8) * 0.2 + 0.8;

  ctx.save();
  // Halo vert
  ctx.fillStyle = `rgba(46, 213, 115, ${0.35 * pulse})`;
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.fill();

  // Disque vert extérieur (15×15)
  ctx.fillStyle = '#2ed573';
  ctx.beginPath();
  ctx.arc(cx, cy, 7.5, 0, Math.PI * 2);
  ctx.fill();

  // Disque blanc intérieur
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
  ctx.fill();

  // Croix verte type pharmacie (✚)
  ctx.fillStyle = '#2ed573';
  ctx.fillRect(cx - 1.5, cy - 4, 3, 8);
  ctx.fillRect(cx - 4, cy - 1.5, 8, 3);
  ctx.restore();
}

function dessinerEntites(sol, scroll, theme) {
  const { actives } = entitesActives(entites, 0, scroll, view.w / 2 + MARGE_VUE);
  for (const entite of actives) {
    const x = screenXDe(entite.worldX, scroll);
    if (x < -MARGE_VUE || x > view.w + MARGE_VUE) continue;

    if (entite.family === Family.GAP) {
      continue; // Les gaps sont gérés par le renderer de sol/parallaxe
    }

    // Sprites de l'atlas d'obstacles ; repli sur le rendu procédural tant qu'il n'est pas chargé.
    if (entite.family !== Family.COLLECTIBLE || !entite.collected) {
      if (obstacleSprites.dessiner(ctx, entite, x, sol, player.direction, run.tempsTotal)) {
        if (DEBUG && entite.hitbox) {
          const sommet = sol - (entite.elevation || 0) - entite.hitbox.h;
          ctx.strokeStyle = 'rgba(255,92,58,0.8)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x - entite.hitbox.w / 2 + 0.5, sommet + 0.5, entite.hitbox.w - 1, entite.hitbox.h - 1);
        }
        continue;
      }
    } else {
      continue;
    }

    if (entite.family === Family.COLLECTIBLE) {
      if (!entite.collected) {
        if (entite.type === 'life_cross') {
          dessinerBonusVie(x, sol - (entite.elevation || 0));
        } else {
          dessinerCollectible(x, sol - (entite.elevation || 0));
        }
      }
      continue;
    }

    // Rendu 2D profil pur pour les obstacles clés
    if (entite.type === 'curb') {
      dessinerCurb2D(ctx, x, sol - (entite.elevation || 0), player.direction, theme);
      continue;
    }
    if (entite.type === 'cone') {
      dessinerCone2D(ctx, x, sol - (entite.elevation || 0), theme);
      continue;
    }
    if (entite.type === 'quarterpipe') {
      dessinerRampe2D(ctx, x, sol - (entite.elevation || 0), player.direction, theme);
      continue;
    }

    const info = frameInfo(entite.frame);
    if (!info) continue;
    drawFrame(ctx, entite.frame, x, sol - entite.elevation, {
      flip: flipPourDirection(player.direction),
    });

    if (DEBUG) {
      const bas = sol - entite.elevation;
      const sommet = bas - entite.hitbox.h;
      ctx.strokeStyle = entite.family === Family.RAMP ? 'rgba(78,212,196,0.8)' : 'rgba(255,92,58,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - entite.hitbox.w / 2 + 0.5, sommet + 0.5, entite.hitbox.w - 1, entite.hitbox.h - 1);
    }
  }
}

function dessinerParticules() {
  particles.pool.forEachActive((p) => {
    const key = particles.frameKey(p);
    if (!key) return;
    drawFrame(ctx, key, p.x, p.y, {
      flip: flipPourDirection(p.direction),
    });
  });
}

function dessinerBandeaux() {
  scoring.bandeaux.forEachActive((b) => {
    const { y, alpha } = scoring.etatBandeau(b);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillStyle = b.couleur;
    ctx.font = 'bold 8px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.texte, b.x, y);
    ctx.restore();
  });
}

function dessinerHUD(theme) {
  const distM = Math.floor(player.distance / 10);
  const scoreTotal = scoring.scoreTotal(distM);

  // Score en haut à droite
  ctx.fillStyle = '#f2f0e6';
  ctx.font = 'bold 9px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`${scoreTotal} PTS`, view.w - 8, 8);

  // Distance et Thème
  ctx.fillStyle = '#8a8d9e';
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'left';
  const hudY = DEBUG ? view.h - 14 : 8;
  ctx.fillText(`${distM} m · ${theme.nom}`, 8, hudY);

  // Vies en haut à gauche
  ctx.fillStyle = '#2ed573';
  ctx.font = 'bold 8px ui-monospace, monospace';
  ctx.textAlign = 'left';
  let coeurs = '';
  for (let i = 0; i < run.vies; i++) coeurs += '💚 ';
  ctx.fillText(coeurs.trim(), 8, 22);

  // Multiplicateur / Combo actif au centre-haut
  if (scoring.etat.multiplicateur > 1 || scoring.etat.enAttente > 0) {
    ctx.save();
    ctx.fillStyle = scoring.etat.multiplicateur >= 10 ? '#ff5c3a' : (scoring.etat.grace ? '#4ed4c4' : '#ffc93c');
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const comboTexte = `COMBO ×${scoring.etat.multiplicateur}`;
    ctx.fillText(comboTexte, view.w / 2, 8);

    if (scoring.etat.enAttente > 0) {
      ctx.font = '7px ui-monospace, monospace';
      ctx.fillStyle = '#f2f0e6';
      ctx.fillText(`+${scoring.etat.enAttente}`, view.w / 2, 20);
    }
    ctx.restore();
  }
}

// Décor de saison (Halloween du 27/10 au 04/11), décidé une fois au lancement
const SAISON = saisonCourante(new Date(), themeForce());

function dessinerJeu(alpha) {
  const y = player.prevY + (player.y - player.prevY) * alpha;
  const scroll = monde.prevDefilement + (monde.defilement - monde.prevDefilement) * alpha;
  const sol = solY();
  const theme = getTheme(level?.palier || 1);
  const cam = camera.getOffset(player.vitesse, player.direction);

  ctx.save();
  // Application du screen shake et du suivi vertical sur le monde (le HUD reste stable)
  ctx.translate(Math.round(cam.shakeX), Math.round(cam.shakeY + cam.suiviY));

  // Gaps actifs pour le trou dans le sol
  const { actives } = entitesActives(entites, 0, scroll, view.w);
  const gaps = actives.filter((e) => e.family === Family.GAP);

  // Parallaxe 3 couches (§14)
  parallax.render(ctx, view, theme, sol, scroll, player.direction, gaps);
  dessinerSaison(ctx, view, performance.now() / 1000, SAISON);

  dessinerEntites(sol, scroll, theme);

  const invincible = run.tempsTotal < run.invincibleJusque;
  const visible = !invincible || Math.floor(run.tempsTotal * 12) % 2 === 0;
  if (visible) {
    drawFrame(ctx, player.frameKey(), player.x, y, {
      flip: flipPourDirection(player.direction),
      scaleY: player.squash,
    });
  }

  // Traînées de vitesse cyan pendant le boost après grind
  if (player.boostGrindTimer > 0) {
    const alphaBoost = Math.min(1, player.boostGrindTimer);
    ctx.save();
    ctx.strokeStyle = `rgba(78, 212, 196, ${0.6 * alphaBoost})`;
    ctx.lineWidth = 1.5;
    const dir = player.direction;
    for (let k = 0; k < 3; k++) {
      const ly = y - 8 - k * 8;
      const lx = player.x - dir * (14 + k * 5);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx - dir * 16, ly);
      ctx.stroke();
    }
    ctx.restore();
  }

  dessinerParticules();
  juice.dessinerEclats(ctx);
  dessinerBandeaux();

  if (DEBUG) {
    ctx.fillStyle = 'rgba(255,201,60,0.9)';
    ctx.fillRect(player.x - 3, Math.round(y), 7, 1);
    ctx.fillRect(player.x, Math.round(y) - 3, 1, 7);
  }

  ctx.restore();

  juice.dessinerFlash(ctx, view);
  dessinerHUD(theme);
}

// ── Records & Persistance (§12) ───────────────────────────────────────────────

/** §12 : les classements sont séparés par orientation — non comparables. */
function orientationActuelle() {
  return view.portrait ? 'portrait' : 'landscape';
}

function meilleurScoreActuel() {
  const liste = storage.meilleursScores(orientationActuelle(), 'endless');
  return liste.length ? liste[0].score : 0;
}

/** Enregistre le résultat d'un run terminé : classement, stats, cumul (§7, §12). */
function enregistrerFinDeRun(score, distM) {
  const etaitRecord = score > meilleurScoreActuel();
  storage.ajouterScore(orientationActuelle(), 'endless', {
    score, distance: distM, combo: scoring.etat.meilleurCombo,
    rider: player.stats.id, date: new Date().toISOString().slice(0, 10), seed: run.seed,
  });
  storage.enregistrerStats({ crash: true, combo: scoring.etat.meilleurCombo, distance: distM });
  storage.ajouterScoreCumule(score);
  debloquerRidersEligibles();
  return etaitRecord;
}

let selectedRider = (storage.settings.rider === 'roller' && storage.riderDebloque('roller'))
  ? 'roller' : 'skate';
let nouveauRecordPartie = false;
let confirmationEffacement = false;

// §16 : toute action doit être accessible au clavier, pas seulement à la
// souris/au tactile — les « boutons » du menu et des réglages sont dessinés
// dans le canvas, pas de vrais éléments DOM focusables, donc la navigation et
// la surbrillance du focus sont ré-implémentées ici plutôt qu'héritées du
// navigateur.
const ITEMS_MENU = ['skate', 'roller', 'commencer', 'scores', 'reglages'];
let curseurMenu = 2; // démarre sur COMMENCER : Entrée directe = jouer, comme avant
let curseurReglages = 0;

function activerItemMenu(item) {
  if (item === 'skate') { selectedRider = 'skate'; storage.setSetting('rider', 'skate'); audio.ensureResumed(); audio.sfx.coin(); return; }
  if (item === 'roller') {
    audio.ensureResumed();
    if (storage.riderDebloque('roller')) { selectedRider = 'roller'; storage.setSetting('rider', 'roller'); audio.sfx.coin(); }
    else audio.sfx.crash();
    return;
  }
  if (item === 'commencer') { lancerPartie(); return; }
  if (item === 'scores') { audio.ensureResumed(); jeu.go(State.SCORES); return; }
  if (item === 'reglages') { audio.ensureResumed(); jeu.go(State.SETTINGS); return; }
}

function lancerPartie() {
  demarrerRun(nouvelleSeed(), { rider: selectedRider });
  jeu.go(State.PLAY);
}

/** §12 : options affichées/pilotées par l'écran RÉGLAGES. */
function optionsReglages() {
  return [
    { cle: 'sound', label: 'Effets sonores', actif: !audio.isMuted() },
    { cle: 'music', label: 'Musique', actif: storage.settings.music },
    { cle: 'haptics', label: 'Vibrations', actif: storage.settings.haptics },
    { cle: 'reducedFx', label: 'Réduire les effets', actif: storage.settings.reducedFx },
  ];
}

/** Bascule un réglage par sa clé — un seul point d'entrée pour le clic et le clavier. */
function basculerReglage(cle) {
  if (cle === 'sound') { basculerSon(); return; }
  if (cle === 'music') {
    const actif = !storage.settings.music;
    storage.setSetting('music', actif);
    if (actif && jeu.is(State.PLAY)) audio.startMusic(); else audio.stopMusic();
    return;
  }
  storage.setSetting(cle, !storage.settings[cle]);
}

// ── Écrans ───────────────────────────────────────────────────────────────────

const jeu = createStateMachine(State.BOOT, {
  [State.MENU]: {
    enter: () => { input.clear(); audio.stopMusic(); },
    update: (dt) => {
      input.update();
      monde.defilement += 50 * dt;
      if (input.consume(Action.MENU_DOWN)) {
        curseurMenu = (curseurMenu + 1) % ITEMS_MENU.length;
      }
      if (input.consume(Action.MENU_UP)) {
        curseurMenu = (curseurMenu - 1 + ITEMS_MENU.length) % ITEMS_MENU.length;
      }
      if (input.consume(Action.CONFIRM)) {
        activerItemMenu(ITEMS_MENU[curseurMenu]);
      }
    },
    render: () => {
      const theme = getTheme(1);
      parallax.render(ctx, view, theme, solY(), monde.defilement, 1, []);
      dessinerSaison(ctx, view, performance.now() / 1000, SAISON);

      // Voile sombre
      ctx.fillStyle = 'rgba(12, 14, 22, 0.82)';
      ctx.fillRect(0, 0, view.w, view.h);

      ctx.save();
      const hero = menuHeroImage();
      const t = performance.now() / 1000;
      const floatY = Math.sin(t * 2.5) * 3;

      // ── CARTE HÉROS MAXENCE (GAUCHE) ──
      const cardW = 126;
      const cardH = 164;
      const cardX = 24;
      const cardY = Math.round(36 + floatY);

      // Fond de carte sombre
      ctx.fillStyle = '#10131e';
      ctx.fillRect(cardX, cardY, cardW, cardH);
      ctx.fillStyle = '#181d2e';
      ctx.fillRect(cardX + 2, cardY + 2, cardW - 4, cardH - 4);

      // Bordure néon cyan
      ctx.strokeStyle = '#4ed4c4';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1);

      // Illustration de Maxence
      if (hero && hero.complete && hero.naturalWidth > 0) {
        ctx.drawImage(hero, cardX + 5, cardY + 5, cardW - 10, cardH - 30);
      } else {
        ctx.fillStyle = '#4ed4c4';
        ctx.font = 'bold 24px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🛹', cardX + cardW / 2, cardY + cardH / 2 - 10);
      }

      // Badge sous le portrait
      ctx.fillStyle = '#ffc93c';
      ctx.fillRect(cardX + 4, cardY + cardH - 22, cardW - 8, 16);
      ctx.fillStyle = '#12131a';
      ctx.font = 'bold 8px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡ MAXENCE RIDER', cardX + cardW / 2, cardY + cardH - 14);

      // ── TITRE ET BOUTONS (DROITE) ──
      const rightX = 310;

      // Ombre néon orange
      ctx.fillStyle = '#ff5c3a';
      ctx.font = 'bold 20px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('MAXENCE RIDER', rightX + 2, 34 + floatY + 2);

      // Titre cyan
      ctx.fillStyle = '#4ed4c4';
      ctx.fillText('MAXENCE RIDER', rightX, 34 + floatY);

      // Sous-titre
      ctx.fillStyle = '#ffc93c';
      ctx.font = 'bold 8px ui-monospace, monospace';
      ctx.fillText('ARCADE 2D ACTION · SKATE & ROLLER', rightX, 52 + floatY);

      // Record
      const record = meilleurScoreActuel();
      if (record > 0) {
        ctx.fillStyle = '#f2f0e6';
        ctx.font = '8px ui-monospace, monospace';
        ctx.fillText(`🏆 RECORD : ${record} PTS`, rightX, 68);
      }

      // Sélecteur de Rider (boutons tactiles larges)
      const rw = 100, rh = 28;
      const rx1 = Math.round(rightX - rw - 8);
      const rx2 = Math.round(rightX + 8);
      const ry = 86;
      const rollerDebloque = storage.riderDebloque('roller');

      // Bouton Skate
      ctx.fillStyle = selectedRider === 'skate' ? '#4ed4c4' : '#242838';
      ctx.fillRect(rx1, ry, rw, rh);
      ctx.fillStyle = selectedRider === 'skate' ? '#10131e' : '#141724';
      ctx.fillRect(rx1 + 2, ry + 2, rw - 4, rh - 4);
      ctx.fillStyle = selectedRider === 'skate' ? '#4ed4c4' : '#8a8d9e';
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.fillText('🛹 SKATE', rx1 + rw / 2, ry + rh / 2);

      // Bouton Roller — §7 : verrouillé tant que 25 000 pts cumulés pas atteints.
      ctx.fillStyle = !rollerDebloque ? '#1a1c26' : (selectedRider === 'roller' ? '#4ed4c4' : '#242838');
      ctx.fillRect(rx2, ry, rw, rh);
      ctx.fillStyle = !rollerDebloque ? '#141520' : (selectedRider === 'roller' ? '#10131e' : '#141724');
      ctx.fillRect(rx2 + 2, ry + 2, rw - 4, rh - 4);
      ctx.fillStyle = !rollerDebloque ? '#4a4d5e' : (selectedRider === 'roller' ? '#4ed4c4' : '#8a8d9e');
      ctx.font = 'bold 9px ui-monospace, monospace';
      if (rollerDebloque) {
        ctx.fillText('🛼 ROLLER', rx2 + rw / 2, ry + rh / 2);
      } else {
        ctx.fillText('🔒 ROLLER', rx2 + rw / 2, ry + rh / 2 - 5);
        ctx.font = '6px ui-monospace, monospace';
        const manque = Math.max(0, RIDERS.roller.debloqueA - storage.progress.totalScore);
        ctx.fillText(`${manque} pts restants`, rx2 + rw / 2, ry + rh / 2 + 7);
      }

      // Gros Bouton Jouer
      const bw = 216, bh = 32;
      const bx = Math.round(rightX - bw / 2);
      const by = 126;
      const pulse = Math.sin(t * 6) > 0 ? '#ff5c3a' : '#ffc93c';
      ctx.fillStyle = pulse;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#12131a';
      ctx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
      ctx.fillStyle = '#f2f0e6';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillText('▶  COMMENCER LA PARTIE', rightX, by + bh / 2);

      // Accès Scores / Réglages — petits boutons secondaires sous COMMENCER.
      const sw = 104, sh = 20, sy = by + bh + 8;
      const sx1 = Math.round(rightX - sw - 4);
      const sx2 = Math.round(rightX + 4);
      ctx.fillStyle = '#1c1f2c';
      ctx.fillRect(sx1, sy, sw, sh);
      ctx.fillRect(sx2, sy, sw, sh);
      ctx.strokeStyle = '#4ed4c4';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx1 + 0.5, sy + 0.5, sw - 1, sh - 1);
      ctx.strokeRect(sx2 + 0.5, sy + 0.5, sw - 1, sh - 1);
      ctx.fillStyle = '#f2f0e6';
      ctx.font = '7px ui-monospace, monospace';
      ctx.fillText('🏆 SCORES', sx1 + sw / 2, sy + sh / 2);
      ctx.fillText('⚙ RÉGLAGES', sx2 + sw / 2, sy + sh / 2);

      // §16 : focus clavier visible — ces boutons sont dessinés dans le canvas,
      // pas de vrais éléments DOM, donc pas de :focus-visible natif à hériter.
      const zonesMenu = {
        skate: [rx1 - 2, ry - 2, rw + 4, rh + 4],
        roller: [rx2 - 2, ry - 2, rw + 4, rh + 4],
        commencer: [bx - 2, by - 2, bw + 4, bh + 4],
        scores: [sx1 - 2, sy - 2, sw + 4, sh + 4],
        reglages: [sx2 - 2, sy - 2, sw + 4, sh + 4],
      };
      const [fx, fy, fw, fh] = zonesMenu[ITEMS_MENU[curseurMenu]];
      ctx.strokeStyle = '#ffc93c';
      ctx.lineWidth = 2;
      ctx.strokeRect(fx + 1, fy + 1, fw - 2, fh - 2);

      // Contrôles
      ctx.fillStyle = '#8a8d9e';
      ctx.font = '7px ui-monospace, monospace';
      ctx.fillText('ESPACE : SAUT / FLIP   ·   BAS : MANUAL   ·   GRINDS SUR RAILS', rightX, view.h - 22);
      ctx.fillText('TOUCHEZ OU APPUYEZ SUR ESPACE POUR JOUER', rightX, view.h - 10);

      ctx.restore();
    },
  },
  [State.PLAY]: {
    enter: () => { input.clear(); audio.startMusic(); },
    update: majJeu,
    render: dessinerJeu,
  },
  [State.PAUSE]: {
    enter: () => { input.clear(); audio.stopMusic(); },
    update: () => { input.update(); },
    render: (alpha) => {
      dessinerJeu(alpha);
      ctx.fillStyle = 'rgba(18,19,26,0.72)';
      ctx.fillRect(0, 0, view.w, view.h);
      texteCentre('PAUSE', view.h / 2 - 4, '#f2f0e6');
      texteCentre('Reprendre : Échap, P, ou le bouton', view.h / 2 + 10, '#8a8d9e');
    },
  },
  [State.GAMEOVER]: {
    enter: () => {
      input.clear();
      audio.stopMusic();
      const distM = Math.floor(player.distance / 10);
      const total = scoring.scoreTotal(distM);
      nouveauRecordPartie = enregistrerFinDeRun(total, distM);
    },
    update: () => {
      input.update();
      if (input.consume(Action.RESTART) || input.consume(Action.CONFIRM)) {
        lancerPartie();
      }
      if (input.consume(Action.PAUSE)) {
        jeu.go(State.MENU);
      }
    },
    render: (alpha) => {
      dessinerJeu(alpha);
      ctx.fillStyle = 'rgba(18,19,26,0.85)';
      ctx.fillRect(0, 0, view.w, view.h);

      if (nouveauRecordPartie) {
        texteCentre('🏆 NOUVEAU RECORD !', view.h / 2 - 36, '#ffc93c');
      }
      texteCentre('PARTIE TERMINÉE', view.h / 2 - 20, '#ff5c3a');

      const distM = Math.floor(player.distance / 10);
      const scoreTotal = scoring.scoreTotal(distM);
      texteCentre(`Score : ${scoreTotal} pts`, view.h / 2 - 6, '#f2f0e6');
      texteCentre(`Distance : ${distM} m · Record : ${meilleurScoreActuel()} pts`, view.h / 2 + 6, '#8a8d9e');

      // Boutons interactifs : Rejouer & Menu Principal / Choix Rider
      const bw1 = 96, bw2 = 136, bh = 24;
      const bx1 = Math.round(view.w / 2 - bw1 - 6);
      const bx2 = Math.round(view.w / 2 + 6);
      const by = Math.round(view.h / 2 + 18);

      // Bouton 1 : ↺ REJOUER
      ctx.fillStyle = '#ff5c3a';
      ctx.fillRect(bx1, by, bw1, bh);
      ctx.fillStyle = '#12131a';
      ctx.fillRect(bx1 + 1, by + 1, bw1 - 2, bh - 2);
      ctx.fillStyle = '#ff5c3a';
      ctx.font = 'bold 8px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('↺  REJOUER', bx1 + bw1 / 2, by + bh / 2);

      // Bouton 2 : 🏠 MENU / RIDER
      ctx.fillStyle = '#4ed4c4';
      ctx.fillRect(bx2, by, bw2, bh);
      ctx.fillStyle = '#12131a';
      ctx.fillRect(bx2 + 1, by + 1, bw2 - 2, bh - 2);
      ctx.fillStyle = '#4ed4c4';
      ctx.font = 'bold 8px ui-monospace, monospace';
      ctx.fillText('🏠  MENU / RIDER', bx2 + bw2 / 2, by + bh / 2);

      // Raccourcis
      ctx.fillStyle = '#8a8d9e';
      ctx.font = '7px ui-monospace, monospace';
      ctx.fillText('R : REJOUER   ·   ÉCHAP : RETOUR AU MENU', view.w / 2, view.h / 2 + 54);
    },
  },
  [State.SCORES]: {
    enter: () => { input.clear(); },
    update: () => {
      input.update();
      if (input.consume(Action.PAUSE) || input.consume(Action.RESTART)) jeu.go(State.MENU);
    },
    render: () => {
      ctx.fillStyle = '#12131a';
      ctx.fillRect(0, 0, view.w, view.h);
      texteCentre('🏆 MEILLEURS SCORES', 20, '#ffc93c');
      ctx.fillStyle = '#8a8d9e';
      ctx.font = '7px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(view.portrait ? 'PORTRAIT' : 'PAYSAGE', view.w / 2, 32);

      const scores = storage.meilleursScores(orientationActuelle(), 'endless');
      if (scores.length === 0) {
        // §10 : un écran vide invite à agir, jamais un silence.
        texteCentre('Aucun run enregistré. Fais-en un.', view.h / 2, '#8a8d9e');
      } else {
        const y0 = 46;
        scores.slice(0, 10).forEach((s, i) => {
          const y = y0 + i * 14;
          ctx.textAlign = 'left';
          ctx.fillStyle = i === 0 ? '#ffc93c' : '#f2f0e6';
          ctx.font = 'bold 8px ui-monospace, monospace';
          ctx.fillText(`${i + 1}.`, 30, y);
          ctx.fillText(`${s.score} pts`, 54, y);
          ctx.fillStyle = '#8a8d9e';
          ctx.font = '7px ui-monospace, monospace';
          ctx.textAlign = 'right';
          ctx.fillText(`${s.rider === 'roller' ? '🛼' : '🛹'} ×${s.combo}  ${s.distance}m  ${s.date}`, view.w - 30, y);
        });
      }

      texteCentre('ÉCHAP OU R : RETOUR', view.h - 14, '#8a8d9e');
    },
  },
  [State.SETTINGS]: {
    enter: () => { input.clear(); confirmationEffacement = false; curseurReglages = 0; },
    update: () => {
      input.update();
      if (input.consume(Action.PAUSE)) { jeu.go(State.MENU); return; }
      const total = optionsReglages().length + 1; // + « Effacer mes données »
      if (input.consume(Action.MENU_DOWN)) curseurReglages = (curseurReglages + 1) % total;
      if (input.consume(Action.MENU_UP)) curseurReglages = (curseurReglages - 1 + total) % total;
      if (input.consume(Action.CONFIRM)) {
        const items = optionsReglages();
        if (curseurReglages < items.length) {
          basculerReglage(items[curseurReglages].cle);
        } else if (confirmationEffacement) {
          storage.effacerTout();
          confirmationEffacement = false;
          audio.sfx.crash();
        } else {
          confirmationEffacement = true;
          audio.sfx.coin();
        }
      }
    },
    render: () => {
      ctx.fillStyle = '#12131a';
      ctx.fillRect(0, 0, view.w, view.h);
      texteCentre('⚙ RÉGLAGES', 20, '#4ed4c4');

      const items = optionsReglages();
      items.forEach((it, i) => {
        const y = 46 + i * 22;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#f2f0e6';
        ctx.font = '8px ui-monospace, monospace';
        ctx.textBaseline = 'middle';
        ctx.fillText(it.label, 24, y);

        ctx.textAlign = 'right';
        ctx.fillStyle = it.actif ? '#4ed4c4' : '#4a4d5e';
        ctx.font = 'bold 8px ui-monospace, monospace';
        ctx.fillText(it.actif ? 'ACTIVÉ' : 'COUPÉ', view.w - 24, y);

        // §16 : focus clavier visible, ré-implémenté (canvas, pas de DOM ici).
        if (curseurReglages === i) {
          ctx.strokeStyle = '#ffc93c';
          ctx.lineWidth = 2;
          ctx.strokeRect(12, y - 9, view.w - 24, 18);
        }
      });

      const yEffacer = 46 + items.length * 22 + 10;
      ctx.textAlign = 'center';
      ctx.fillStyle = confirmationEffacement ? '#ff5c3a' : '#8a8d9e';
      ctx.font = 'bold 8px ui-monospace, monospace';
      ctx.fillText(
        confirmationEffacement ? 'SÛR ? TOUCHER ENCORE POUR CONFIRMER' : '🗑 EFFACER MES DONNÉES',
        view.w / 2, yEffacer,
      );
      if (curseurReglages === items.length) {
        ctx.strokeStyle = '#ffc93c';
        ctx.lineWidth = 2;
        ctx.strokeRect(view.w / 2 - 100, yEffacer - 9, 200, 18);
      }

      texteCentre('↑↓ NAVIGUER · ENTRÉE VALIDER · ÉCHAP : RETOUR', view.h - 14, '#8a8d9e');
    },
  },
});

function texteCentre(texte, y, couleur) {
  ctx.fillStyle = couleur;
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texte, view.w / 2, y);
}

function basculerPause() {
  if (jeu.is(State.PLAY)) jeu.go(State.PAUSE);
  else if (jeu.is(State.PAUSE)) jeu.go(State.PLAY);
  else return;
  boutonPause.textContent = jeu.is(State.PAUSE) ? '▶' : 'II';
  boutonPause.setAttribute('aria-label', jeu.is(State.PAUSE) ? 'Reprendre' : 'Pause');
}

function basculerSon() {
  const mute = audio.toggleMute();
  if (boutonSon) {
    boutonSon.textContent = mute ? '🔇' : '🔊';
    boutonSon.setAttribute('aria-label', mute ? 'Activer le son' : 'Couper le son');
  }
}

const input = createInput(canvas, { onPause: basculerPause });
boutonPause.addEventListener('click', basculerPause);
if (boutonSon) {
  boutonSon.textContent = audio.isMuted() ? '🔇' : '🔊';
  boutonSon.addEventListener('click', (e) => {
    e.stopPropagation();
    basculerSon();
  });
}

canvas.addEventListener('pointerdown', () => {
  audio.ensureResumed();
});

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect
    ? canvas.getBoundingClientRect()
    : { left: 0, top: 0, width: canvas.width || 960, height: canvas.height || 540 };
  const clientX = e.clientX ?? (rect.left + rect.width / 2);
  const clientY = e.clientY ?? (rect.top + rect.height / 2);
  const scaleX = view.w / (rect.width || 1);
  const scaleY = view.h / (rect.height || 1);
  const cx = (clientX - rect.left) * scaleX;
  const cy = (clientY - rect.top) * scaleY;
  const centreX = view.w / 2;

  if (jeu.is(State.MENU)) {
    const rightX = 310;
    const rw = 100, rh = 28, ry = 86;
    const rx1 = Math.round(rightX - rw - 8);
    const rx2 = Math.round(rightX + 8);

    // Un clic garde le curseur clavier synchronisé : après un clic sur
    // SCORES puis retour au menu, Entrée doit rejouer ce même item, pas
    // celui qu'on avait sélectionné au clavier avant.
    const clicItem = (item) => { curseurMenu = ITEMS_MENU.indexOf(item); activerItemMenu(item); };

    // Clic / Touch sur Bouton Skate
    if (cx >= rx1 - 15 && cx <= rx1 + rw + 8 && cy >= ry - 8 && cy <= ry + rh + 8) {
      clicItem('skate');
      return;
    }
    // Clic / Touch sur Bouton Roller — verrouillé tant que non débloqué (§7).
    if (cx >= rx2 - 8 && cx <= rx2 + rw + 15 && cy >= ry - 8 && cy <= ry + rh + 8) {
      clicItem('roller');
      return;
    }
    // Clic / Touch sur COMMENCER
    const bw = 216, bh = 32, by = 126;
    if (cx >= rightX - bw / 2 - 14 && cx <= rightX + bw / 2 + 14 && cy >= by - 6 && cy <= by + bh + 4) {
      clicItem('commencer');
      return;
    }
    // Boutons secondaires SCORES / RÉGLAGES, juste sous COMMENCER.
    const sw = 104, sh = 20, sy = by + bh + 8;
    const sx1 = Math.round(rightX - sw - 4);
    const sx2 = Math.round(rightX + 4);
    if (cx >= sx1 && cx <= sx1 + sw && cy >= sy && cy <= sy + sh) {
      clicItem('scores');
      return;
    }
    if (cx >= sx2 && cx <= sx2 + sw && cy >= sy && cy <= sy + sh) {
      clicItem('reglages');
      return;
    }
    if (cy > sy + sh + 10) {
      clicItem('commencer');
    }
  } else if (jeu.is(State.SCORES)) {
    jeu.go(State.MENU);
  } else if (jeu.is(State.SETTINGS)) {
    const items = optionsReglages();
    let clique = false;
    items.forEach((it, i) => {
      const y = 46 + i * 22;
      if (cy >= y - 10 && cy <= y + 10) { curseurReglages = i; basculerReglage(it.cle); clique = true; }
    });
    if (!clique) {
      const yEffacer = 46 + items.length * 22 + 10;
      if (cy >= yEffacer - 10 && cy <= yEffacer + 10) {
        curseurReglages = items.length;
        if (confirmationEffacement) {
          storage.effacerTout();
          confirmationEffacement = false;
          audio.sfx.crash();
        } else {
          confirmationEffacement = true;
          audio.sfx.coin();
        }
        clique = true;
      }
    }
    if (!clique && cy > view.h - 24) jeu.go(State.MENU);
  } else if (jeu.is(State.GAMEOVER)) {
    const bw1 = 96, bw2 = 136, bh = 24;
    const bx1 = Math.round(centreX - bw1 - 6);
    const bx2 = Math.round(centreX + 6);
    const by = Math.round(view.h / 2 + 18);

    // Clic sur "↺ REJOUER"
    if (cx >= bx1 - 8 && cx <= bx1 + bw1 + 4 && cy >= by - 6 && cy <= by + bh + 6) {
      lancerPartie();
      return;
    }
    // Clic sur "🏠 MENU / RIDER" ou ailleurs sur l'écran
    jeu.go(State.MENU);
  }
});

// ── Orientation et redimensionnement ─────────────────────────────────────────

function surRedimensionnement() {
  const ancienSol = solY();
  renderer.resize();
  const nouveauSol = solY();
  if (nouveauSol !== ancienSol) {
    const hauteur = ancienSol - player.y;
    player.y = nouveauSol - hauteur;
    player.prevY = player.y;
  }
  player.x = player.prevX = Math.round(view.w * 0.3);
}

window.addEventListener('resize', surRedimensionnement);
window.addEventListener('orientationchange', surRedimensionnement);
window.visualViewport?.addEventListener('resize', surRedimensionnement);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && jeu.is(State.PLAY)) basculerPause();
});

// ── Boucle ───────────────────────────────────────────────────────────────────

// §12 : « en cas d'échec, basculer sur un store mémoire et afficher une fois »
// — storage.js gère déjà le fallback et logge en console, mais un console.warn
// n'est jamais vu par le joueur. Affiché ici, par-dessus n'importe quel écran,
// pendant les premières secondes plutôt que dans un bandeau de trick de 700 ms
// (§6.6) — un avertissement système mérite d'être lisible plus longtemps.
const DUREE_AVERTISSEMENT_STORAGE = 4;
const avertissementStorageJusque = storage.disponible
  ? 0
  : performance.now() / 1000 + DUREE_AVERTISSEMENT_STORAGE;

function dessinerAvertissementStorage() {
  if (performance.now() / 1000 >= avertissementStorageJusque) return;
  ctx.fillStyle = 'rgba(255, 92, 58, 0.92)';
  ctx.fillRect(0, 0, view.w, 16);
  ctx.fillStyle = '#12131a';
  ctx.font = 'bold 7px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚠ Les scores ne seront pas conservés sur cet appareil.', view.w / 2, 8);
}

const boucle = createLoop({
  update: (dt) => jeu.update(dt),
  render: (alpha) => {
    renderer.begin();
    jeu.render(alpha);
    dessinerAvertissementStorage();
    if (DEBUG) dessinerDebug();
    renderer.end();
  },
});

function dessinerDebug() {
  const distM = Math.floor(player.distance / 10);
  const lignes = [
    `${boucle.stats.fps} fps · ${boucle.stats.updates} maj`,
    `${view.w}x${view.h} x${view.scale} ${view.portrait ? 'portrait' : 'paysage'}`,
    `${player.state} ${player.frameKey()}`,
    `v ${player.vitesse.toFixed(0)} px/s · ${distM} m`,
    `score ${scoring.scoreTotal(distM)} (combo x${scoring.etat.multiplicateur} +${scoring.etat.enAttente})`,
    `palier ${level?.palier ?? '-'} · vies ${run.vies} · cp ${level?.checkpoints.length ?? 0}`,
    `entités ${entites.length} · pool part: ${particles.pool.count}/${particles.pool.capacite}`,
    player.state === RiderState.AIR ? `vol ${player.tempsVol.toFixed(2)}s` : '',
  ].filter(Boolean);
  ctx.font = '6px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(18,19,26,0.7)';
  ctx.fillRect(2, 2, 160, lignes.length * 8 + 4);
  ctx.fillStyle = '#ffc93c';
  lignes.forEach((l, i) => ctx.fillText(l, 5, 6 + i * 8));
}

// ── Démarrage ────────────────────────────────────────────────────────────────

if (DEBUG) {
  window.__maxence = {
    player, monde, view, jeu, boucle, input, atlas, run, scoring, particles, camera, parallax, audio, storage,
    Action, State, RiderState, Family, ENTITIES, SAUTS, THEMES, getTheme, solY,
    get level() { return level; },
    get entites() { return entites; },
    get selectedRider() { return selectedRider; },
    demarrerRun, respawn,
  };
}

loadAssets()
  .then(() => {
    chargement.hidden = true;
    demarrerRun();
    jeu.go(State.MENU);
    boucle.start();
  })
  .catch((err) => {
    chargement.hidden = true;
    panne.hidden = false;
    panne.textContent = `Chargement impossible : ${err.message}`;
    console.error(err);
  });
