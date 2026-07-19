/* ============================================================
   ÉCHIQUIER — logique de l'application
   ============================================================ */

const SYMBOLES = {
  p: "♟", r: "♜", n: "♞", b: "♝", q: "♛", k: "♚",
  P: "♙", R: "♖", N: "♘", B: "♗", Q: "♕", K: "♔",
};

let partie = new Chess();
let modeActuel = "ordinateur";     // ordinateur | local | enligne
let couleurJoueur = "w";           // couleur du joueur humain principal
let caseSelectionnee = null;
let coupsPossibles = [];
let difficulteChoisie = 1;
let themeActuel = "bois";
let derniereCase = { from: null, to: null };

// --- Multijoueur en ligne ---
let codePartieEnLigne = null;
let abonnementRealtime = null;

// --- Moteur IA ---
let moteurWorker = null;
let moteurPret = false;

/* ============================================================
   NAVIGATION ENTRE ÉCRANS
   ============================================================ */
function afficherEcran(id) {
  document.querySelectorAll(".ecran").forEach(e => e.classList.remove("actif"));
  document.getElementById(id).classList.add("actif");
}

document.querySelectorAll("[data-retour]").forEach(btn => {
  btn.addEventListener("click", () => {
    if (abonnementRealtime) { abonnementRealtime.unsubscribe(); abonnementRealtime = null; }
    document.getElementById("superpositionFin").style.display = "none";
    afficherEcran(btn.dataset.retour);
  });
});

document.querySelectorAll(".carte-mode").forEach(carte => {
  carte.addEventListener("click", () => {
    const mode = carte.dataset.mode;
    if (mode === "ordinateur") afficherEcran("ecranReglagesOrdi");
    else if (mode === "local") demarrerPartie("local");
    else if (mode === "enligne") afficherEcran("ecranEnLigne");
  });
});

/* ============================================================
   ACTUS — publications gérées depuis /admin (Decap CMS)
   ============================================================ */
document.getElementById("btnOuvrirActus").addEventListener("click", () => {
  afficherEcran("ecranActus");
  chargerActus();
});

function chargerActus() {
  const conteneur = document.getElementById("listeActus");
  fetch("/content/posts.json", { cache: "no-store" })
    .then(reponse => {
      if (!reponse.ok) throw new Error("introuvable");
      return reponse.json();
    })
    .then(donnees => {
      const publications = (donnees && donnees.posts) || [];
      if (!publications.length) {
        conteneur.innerHTML = '<p class="texte-discret">Aucune publication pour l\'instant.</p>';
        return;
      }
      conteneur.innerHTML = publications
        .slice()
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .map(p => `
          <article class="carte-actu">
            <h3>${echapperHtml(p.title || "")}</h3>
            <p class="actu-date">${formaterDateActu(p.date)}</p>
            <p class="actu-corps">${echapperHtml(p.body || "")}</p>
          </article>
        `)
        .join("");
    })
    .catch(() => {
      conteneur.innerHTML = '<p class="texte-discret">Aucune publication pour l\'instant.</p>';
    });
}

function echapperHtml(texte) {
  const div = document.createElement("div");
  div.textContent = texte;
  return div.innerHTML;
}

function formaterDateActu(date) {
  if (!date) return "";
  try {
    return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

/* ============================================================
   FOND ANIMÉ DU MENU (tour du cavalier illuminé)
   ============================================================ */
function construireFondAnime() {
  const fond = document.getElementById("fondAnime");
  fond.innerHTML = "";
  for (let i = 0; i < 64; i++) {
    const d = document.createElement("div");
    d.className = "case";
    fond.appendChild(d);
  }
  const cases = fond.children;
  // Parcours simplifié de type "cavalier" qui s'illumine cellule par cellule
  const parcours = genererParcoursCavalier();
  let i = 0;
  setInterval(() => {
    Array.from(cases).forEach(c => c.classList.remove("allumee"));
    const pos = parcours[i % parcours.length];
    cases[pos].classList.add("allumee");
    const pos2 = parcours[(i + 3) % parcours.length];
    cases[pos2].classList.add("allumee");
    i++;
  }, 550);
}
function genererParcoursCavalier() {
  // Suite pseudo-aléatoire mais fixe de cases 0-63, assez pour un effet fluide
  const suite = [];
  let x = 0, y = 0;
  const mouvements = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
  const vus = new Set();
  for (let n = 0; n < 40; n++) {
    suite.push(y * 8 + x);
    vus.add(`${x},${y}`);
    let deplace = false;
    for (const [dx, dy] of mouvements.sort(() => Math.random() - 0.5)) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && !vus.has(`${nx},${ny}`)) {
        x = nx; y = ny; deplace = true; break;
      }
    }
    if (!deplace) { x = Math.floor(Math.random()*8); y = Math.floor(Math.random()*8); }
  }
  return suite;
}
construireFondAnime();

/* ============================================================
   RÉGLAGES "CONTRE L'ORDINATEUR"
   ============================================================ */
document.getElementById("choixDifficulte").addEventListener("click", e => {
  const btn = e.target.closest(".seg-btn");
  if (!btn) return;
  document.querySelectorAll("#choixDifficulte .seg-btn").forEach(b => b.classList.remove("actif"));
  btn.classList.add("actif");
  difficulteChoisie = parseInt(btn.dataset.niveau, 10);
});
document.querySelectorAll('[data-couleur]').forEach(btn => {
  btn.addEventListener("click", () => {
    btn.parentElement.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("actif"));
    btn.classList.add("actif");
    couleurJoueur = btn.dataset.couleur === "blanc" ? "w" : "b";
  });
});
document.getElementById("btnLancerOrdi").addEventListener("click", () => demarrerPartie("ordinateur"));

/* ============================================================
   DÉMARRER UNE PARTIE
   ============================================================ */
function demarrerPartie(mode) {
  modeActuel = mode;
  partie = new Chess();
  caseSelectionnee = null;
  coupsPossibles = [];
  derniereCase = { from: null, to: null };
  document.getElementById("historiqueCoups").innerHTML = "";
  document.getElementById("capturesHaut").textContent = "";
  document.getElementById("capturesBas").textContent = "";
  afficherEcran("ecranJeu");
  appliquerTheme(themeActuel);
  dessinerPlateau();
  majStatutPartie();

  if (mode === "ordinateur") {
    initialiserMoteur();
    document.getElementById("nomJoueurHaut").textContent = "Ordinateur";
    document.getElementById("nomJoueurBas").textContent = "Toi";
    if (couleurJoueur === "b") jouerCoupOrdinateur();
  } else if (mode === "local") {
    document.getElementById("nomJoueurHaut").textContent = "Joueur 2";
    document.getElementById("nomJoueurBas").textContent = "Joueur 1";
  } else if (mode === "enligne") {
    document.getElementById("nomJoueurHaut").textContent = "Adversaire";
    document.getElementById("nomJoueurBas").textContent = "Toi";
  }
}

/* ============================================================
   DESSIN DU PLATEAU
   ============================================================ */
function dessinerPlateau() {
  const plateau = document.getElementById("plateau");
  plateau.innerHTML = "";
  const position = partie.board(); // tableau 8x8, rang 8 -> rang 1

  // Le joueur humain voit toujours ses pièces en bas
  const inverser = (modeActuel === "ordinateur" || modeActuel === "enligne") && couleurJoueur === "b";

  for (let rangee = 0; rangee < 8; rangee++) {
    for (let col = 0; col < 8; col++) {
      const r = inverser ? 7 - rangee : rangee;
      const c = inverser ? 7 - col : col;
      const carre = position[r][c];
      const fichier = "abcdefgh"[c];
      const rang = 8 - r;
      const nomCase = `${fichier}${rang}`;

      const div = document.createElement("div");
      div.className = "case-plateau " + ((r + c) % 2 === 0 ? "claire" : "sombre");
      div.dataset.case = nomCase;

      if (carre) {
        const symbole = carre.color === "w" ? carre.type.toUpperCase() : carre.type;
        div.innerHTML = `<span class="case-piece">${SYMBOLES[symbole]}</span>`;
      }
      if (nomCase === caseSelectionnee) div.classList.add("selectionnee");
      if (coupsPossibles.includes(nomCase)) div.classList.add("coup-possible");
      if (nomCase === derniereCase.from || nomCase === derniereCase.to) div.classList.add("dernier-coup");

      div.addEventListener("click", () => gererClicCase(nomCase));
      plateau.appendChild(div);
    }
  }
}

/* ============================================================
   INTERACTION : SÉLECTION ET DÉPLACEMENT
   ============================================================ */
function gererClicCase(nomCase) {
  if (partieVerrouillee()) return;

  if (caseSelectionnee) {
    if (coupsPossibles.includes(nomCase)) {
      jouerCoup(caseSelectionnee, nomCase);
      caseSelectionnee = null;
      coupsPossibles = [];
      dessinerPlateau();
      return;
    }
    caseSelectionnee = null;
    coupsPossibles = [];
  }

  const piece = partie.get(nomCase);
  if (piece && piece.color === partie.turn() && couleurAutoriseeAJouer()) {
    caseSelectionnee = nomCase;
    coupsPossibles = partie.moves({ square: nomCase, verbose: true }).map(m => m.to);
  }
  dessinerPlateau();
}

function couleurAutoriseeAJouer() {
  if (modeActuel === "local") return true;
  if (modeActuel === "ordinateur") return partie.turn() === couleurJoueur;
  if (modeActuel === "enligne") return partie.turn() === couleurJoueur;
  return true;
}

function partieVerrouillee() {
  return partie.game_over() || document.getElementById("superpositionFin").style.display !== "none";
}

function jouerCoup(from, to) {
  const coupsLegaux = partie.moves({ square: from, verbose: true });
  const infosCoup = coupsLegaux.find(m => m.to === to);
  const promotion = infosCoup && infosCoup.flags.includes("p") ? "q" : undefined;

  const resultat = partie.move({ from, to, promotion });
  if (!resultat) return;

  derniereCase = { from, to };
  majCapturesEtHistorique(resultat);
  majStatutPartie();
  dessinerPlateau();
  verifierFinDePartie();

  if (modeActuel === "ordinateur" && !partie.game_over() && partie.turn() !== couleurJoueur) {
    setTimeout(jouerCoupOrdinateur, 350);
  }
  if (modeActuel === "enligne") {
    envoyerCoupEnLigne();
  }
}

function majCapturesEtHistorique(resultat) {
  if (resultat.captured) {
    const zone = resultat.color === "w" ? "capturesHaut" : "capturesBas";
    const symbole = resultat.color === "w" ? resultat.captured : resultat.captured.toUpperCase();
    document.getElementById(zone).textContent += SYMBOLES[symbole] + " ";
  }
  const historique = document.getElementById("historiqueCoups");
  const li = document.createElement("li");
  li.textContent = resultat.san;
  historique.appendChild(li);
  historique.scrollTop = historique.scrollHeight;
}

function majStatutPartie() {
  const statut = document.getElementById("statutPartie");
  if (partie.in_checkmate()) { statut.textContent = "Échec et mat"; return; }
  if (partie.in_draw() || partie.in_stalemate()) { statut.textContent = "Partie nulle"; return; }
  const trait = partie.turn() === "w" ? "Trait aux blancs" : "Trait aux noirs";
  statut.textContent = partie.in_check() ? trait + " — échec !" : trait;
}

function verifierFinDePartie() {
  if (!partie.game_over()) return;
  let titre = "Partie terminée", detail = "";
  if (partie.in_checkmate()) {
    const gagnant = partie.turn() === "w" ? "Les noirs" : "Les blancs";
    titre = "Échec et mat";
    detail = `${gagnant} remportent la partie.`;
  } else if (partie.in_stalemate()) {
    titre = "Pat"; detail = "Aucun coup légal possible — partie nulle.";
  } else if (partie.insufficient_material && partie.insufficient_material()) {
    titre = "Partie nulle"; detail = "Matériel insuffisant pour mater.";
  } else if (partie.in_draw()) {
    titre = "Partie nulle"; detail = "Répétition ou règle des 50 coups.";
  }
  document.getElementById("finTitre").textContent = titre;
  document.getElementById("finDetail").textContent = detail;
  document.getElementById("superpositionFin").style.display = "flex";
}
document.getElementById("btnRejouer").addEventListener("click", () => {
  document.getElementById("superpositionFin").style.display = "none";
  demarrerPartie(modeActuel);
});

/* ============================================================
   MOTEUR IA (Stockfish, via Web Worker chargé depuis un CDN)
   ============================================================ */
function initialiserMoteur() {
  if (moteurWorker) return;
  fetch("https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js")
    .then(r => r.text())
    .then(code => {
      const blob = new Blob([code], { type: "application/javascript" });
      moteurWorker = new Worker(URL.createObjectURL(blob));
      moteurWorker.postMessage("uci");
      moteurWorker.onmessage = gererMessageMoteur;
      moteurPret = true;
    })
    .catch(() => {
      // Pas de connexion possible : on retombe sur une IA locale simplifiée
      moteurWorker = null;
      moteurPret = false;
    });
}

const PARAMS_DIFFICULTE = {
  1: { skill: 2, depth: 4 },
  2: { skill: 8, depth: 8 },
  3: { skill: 14, depth: 12 },
  4: { skill: 20, depth: 16 },
};

let resolutionCoupIA = null;

function gererMessageMoteur(e) {
  const ligne = e.data;
  if (typeof ligne !== "string") return;
  if (ligne.startsWith("bestmove") && resolutionCoupIA) {
    const coup = ligne.split(" ")[1];
    resolutionCoupIA(coup);
    resolutionCoupIA = null;
  }
}

function jouerCoupOrdinateur() {
  if (partie.game_over()) return;
  if (moteurWorker && moteurPret) {
    const { skill, depth } = PARAMS_DIFFICULTE[difficulteChoisie];
    moteurWorker.postMessage(`setoption name Skill Level value ${skill}`);
    moteurWorker.postMessage(`position fen ${partie.fen()}`);
    resolutionCoupIA = (coupUci) => {
      const from = coupUci.slice(0, 2), to = coupUci.slice(2, 4);
      jouerCoup(from, to);
    };
    moteurWorker.postMessage(`go depth ${depth}`);
  } else {
    // Repli hors-ligne : coup aléatoire pondéré (capture > développement > aléatoire)
    const coups = partie.moves({ verbose: true });
    if (!coups.length) return;
    const captures = coups.filter(c => c.flags.includes("c"));
    const choix = (captures.length ? captures : coups)[Math.floor(Math.random() * (captures.length ? captures.length : coups.length))];
    jouerCoup(choix.from, choix.to);
  }
}

/* ============================================================
   THÈMES DE PLATEAU
   ============================================================ */
document.getElementById("btnThemePlateau").addEventListener("click", () => {
  document.getElementById("superpositionTheme").style.display = "flex";
});
document.getElementById("btnFermerTheme").addEventListener("click", () => {
  document.getElementById("superpositionTheme").style.display = "none";
});
document.querySelectorAll(".vignette-theme").forEach(btn => {
  btn.addEventListener("click", () => {
    appliquerTheme(btn.dataset.theme);
    document.getElementById("superpositionTheme").style.display = "none";
  });
});
function appliquerTheme(theme) {
  themeActuel = theme;
  const plateau = document.getElementById("plateau");
  plateau.className = "plateau theme-" + theme;
  document.querySelectorAll(".vignette-theme").forEach(v => v.classList.toggle("actif", v.dataset.theme === theme));
  try { localStorage.setItem("echecs_theme", theme); } catch (e) {}
}
try {
  const themeSauve = localStorage.getItem("echecs_theme");
  if (themeSauve) themeActuel = themeSauve;
} catch (e) {}

/* ============================================================
   MULTIJOUEUR EN LIGNE (Supabase)
   ============================================================ */
document.getElementById("etatConnexion").textContent = supabaseClient
  ? ""
  : "Le mode en ligne nécessite d'avoir configuré Supabase (voir SUPABASE-SETUP.md).";

document.getElementById("btnCreerPartie").addEventListener("click", async () => {
  if (!supabaseClient) return afficherMessageEnLigne("Configuration Supabase manquante.");
  const code = genererCodePartie();
  const nouvellePartie = new Chess();
  const { error } = await supabaseClient.from("games").insert({
    code, fen: nouvellePartie.fen(), turn: "w",
    white_joined: true, black_joined: false, last_move: null,
  });
  if (error) return afficherMessageEnLigne("Impossible de créer la partie.");
  codePartieEnLigne = code;
  couleurJoueur = "w";
  document.getElementById("codePartieAffiche").textContent = code;
  document.getElementById("codePartieZone").style.display = "block";
  attendreAdversaire(code);
});

document.getElementById("btnRejoindrePartie").addEventListener("click", async () => {
  if (!supabaseClient) return afficherMessageEnLigne("Configuration Supabase manquante.");
  const code = document.getElementById("champCodeRejoindre").value.trim().toUpperCase();
  if (code.length !== 4) return afficherMessageEnLigne("Le code doit faire 4 caractères.");
  const { data, error } = await supabaseClient.from("games").select("*").eq("code", code).single();
  if (error || !data) return afficherMessageEnLigne("Partie introuvable.");
  await supabaseClient.from("games").update({ black_joined: true }).eq("code", code);
  codePartieEnLigne = code;
  couleurJoueur = "b";
  partie = new Chess(data.fen);
  demarrerPartie("enligne");
  ecouterPartieEnLigne(code);
});

function afficherMessageEnLigne(texte) {
  document.getElementById("messageEnLigne").textContent = texte;
}
function genererCodePartie() {
  const car = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += car[Math.floor(Math.random() * car.length)];
  return code;
}

function attendreAdversaire(code) {
  abonnementRealtime = supabaseClient
    .channel(`partie-${code}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games", filter: `code=eq.${code}` },
      payload => {
        if (payload.new.black_joined && document.getElementById("ecranEnLigne").classList.contains("actif")) {
          demarrerPartie("enligne");
          ecouterPartieEnLigne(code);
        }
      })
    .subscribe();
}

function ecouterPartieEnLigne(code) {
  if (abonnementRealtime) abonnementRealtime.unsubscribe();
  abonnementRealtime = supabaseClient
    .channel(`coups-${code}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games", filter: `code=eq.${code}` },
      payload => {
        const nouvelleFen = payload.new.fen;
        if (nouvelleFen && nouvelleFen !== partie.fen()) {
          partie.load(nouvelleFen);
          derniereCase = payload.new.last_move ? JSON.parse(payload.new.last_move) : derniereCase;
          dessinerPlateau();
          majStatutPartie();
          verifierFinDePartie();
        }
      })
    .subscribe();
}

async function envoyerCoupEnLigne() {
  if (!supabaseClient || !codePartieEnLigne) return;
  await supabaseClient.from("games").update({
    fen: partie.fen(),
    turn: partie.turn(),
    last_move: JSON.stringify(derniereCase),
  }).eq("code", codePartieEnLigne);
}
