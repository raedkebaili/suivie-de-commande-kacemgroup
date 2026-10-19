-- Données éphémères : exclues des sauvegardes, une entrée par utilisateur/onglet.
CREATE TABLE IF NOT EXISTS user_presence (
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);
