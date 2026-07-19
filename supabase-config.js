/* ============================================================
   CONFIGURATION SUPABASE (multijoueur en ligne)
   ------------------------------------------------------------
   1. Crée un compte gratuit sur https://supabase.com
   2. Crée un nouveau projet
   3. Dans le projet : Settings → API
      - copie "Project URL"      → colle-le dans SUPABASE_URL
      - copie "anon public key"  → colle-le dans SUPABASE_ANON_KEY
   4. Suis SUPABASE-SETUP.md pour créer la table "games" et
      activer le Realtime dessus (indispensable pour que les
      coups s'affichent en direct chez l'adversaire).
   ============================================================ */

const SUPABASE_URL = "COLLE_TON_URL_SUPABASE_ICI";
const SUPABASE_ANON_KEY = "COLLE_TA_CLE_PUBLIQUE_ICI";

const supabaseClient =
  SUPABASE_URL.startsWith("http") && window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;
