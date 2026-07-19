# Configurer le multijoueur en ligne (Supabase)

Le mode "Jouer en ligne" a besoin de Supabase (gratuit) pour faire circuler les coups en temps réel entre deux joueurs. Voici les étapes, dans l'ordre.

## 1. Créer un compte et un projet
- Va sur [supabase.com](https://supabase.com) → **Start your project** → connecte-toi avec GitHub
- **New project** → donne-lui un nom (ex : `echiquier`), choisis un mot de passe de base de données (garde-le de côté), choisis la région la plus proche de toi
- Attends 1-2 minutes que le projet soit prêt

## 2. Créer la table qui stocke les parties
- Dans le menu de gauche : **SQL Editor** → **New query**
- Colle ce code, puis clique **Run** :

```sql
create table games (
  code text primary key,
  fen text not null,
  turn text not null default 'w',
  white_joined boolean default false,
  black_joined boolean default false,
  last_move text,
  updated_at timestamp with time zone default now()
);

alter table games enable row level security;

create policy "Lecture publique" on games for select using (true);
create policy "Ecriture publique" on games for insert with check (true);
create policy "Mise a jour publique" on games for update using (true);
```

*(Ces règles rendent les parties lisibles/modifiables par n'importe qui connaissant le code à 4 caractères — c'est volontaire et suffisant pour un jeu entre amis ; il n'y a pas de données sensibles.)*

## 3. Activer le Realtime sur cette table
- Toujours dans Supabase : **Database → Replication** (ou **Table Editor → games → icône Realtime** selon la version de l'interface)
- Active le Realtime pour la table `games`

## 4. Récupérer tes clés d'API
- **Settings → API**
- Copie **Project URL**
- Copie la clé **anon public**

## 5. Colle-les dans le code
Ouvre le fichier `supabase-config.js` du site et remplace :
```js
const SUPABASE_URL = "COLLE_TON_URL_SUPABASE_ICI";
const SUPABASE_ANON_KEY = "COLLE_TA_CLE_PUBLIQUE_ICI";
```
par tes vraies valeurs, puis pousse ce changement sur GitHub (Netlify redéploiera automatiquement).

## 6. Tester
- Ouvre ton site sur deux appareils différents (ou un onglet normal + un onglet en navigation privée)
- Sur le premier : "Jouer en ligne" → "Créer une partie" → note le code à 4 caractères
- Sur le second : "Jouer en ligne" → colle le code → "Rejoindre"
- Joue un coup sur l'un des deux écrans : il doit apparaître automatiquement sur l'autre en quelques secondes
