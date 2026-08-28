# Statut · Nexium Client

Page de statut publique du Nexium Client, sur le modele de status.anthropic.com.

## Ce qui se met a jour, et quand

Trois sources, trois rythmes. C est voulu : la fraicheur ne doit dependre de rien de lent.

| Ce qu on voit | D ou ca vient | Delai |
|---|---|---|
| Etat des services | La page les interroge **elle-meme**, dans ton navigateur | a chaque ouverture, puis toutes les 45 s |
| Alertes en cours | Supabase, lu en direct par la page **et** par le client | immediat |
| Historique 90 jours | La surveillance GitHub Actions | toutes les 15 min, au mieux |

**La page ne depend pas de GitHub Actions pour etre a jour.** Les taches planifiees de GitHub
sont du best-effort : souvent retardees de 20 min, parfois sautees. Elles servent ici a
constituer l historique, pas a dire l etat courant. La page fait ses propres requetes (`HEAD`
la plupart du temps, donc sans telecharger les gros fichiers) et affiche des latences reelles.

## Fichiers

```
services.json                        LA liste des services — lue par la sonde ET par la page
index.html                           la page, avec ses propres sondes
scripts/probe.mjs                    la surveillance : sondes de fond + historique
.github/workflows/surveillance.yml   toutes les 15 min
status.json                          etat courant, sert de repli
history.json                         90 jours par service
incidents/*.json                     incidents ecrits a la main
```

`services.json` est la source de verite unique. Ajouter un service se fait la, une seule fois :
la page et la surveillance le prennent en compte toutes les deux.

## Ce que la surveillance verifie en plus de la page

Le navigateur se contente d un `HEAD`. La surveillance, elle, telecharge et inspecte :

- **`client`** : taille, numero de version, au moins 20 modules, **et la somme de controle
  `.nxsum` qui doit correspondre au fichier**. C est le meme controle que le portillon de mise
  a jour installe chez les utilisateurs : une publication cassee est vue ici avant que le parc
  ne la refuse.
- **`blocklist`** : au moins 1000 lignes, **et aucun domaine Discord legitime dedans**. Une
  seule ligne de trop dans ce fichier couperait tout le monde de Discord.

## Declarer un incident

Deux voies, qui aboutissent au meme endroit.

**Depuis le client** — page Nexium Admins, reservee a l equipe. L alerte part dans Supabase et
apparait aussitot sur cette page **et** en bandeau dans le client de chaque utilisateur. C est
la voie normale.

**Par un fichier** — pour un incident passe, ou pour documenter longuement. Ajoute un
`incidents/<date>-<sujet>.json` :

```json
{
  "id": "2026-09-04-envoi-messages",
  "composant": "client",
  "titre": "Titre court, ce que l utilisateur constate",
  "gravite": "mineur | majeur | critique | maintenance",
  "etat": "enquete | identifie | surveille | resolu",
  "debut": "2026-09-04T14:00:00Z",
  "fin": null,
  "versionsTouchees": "v153",
  "correctif": "v154",
  "resume": "Une ou deux phrases : ce qui ne marche pas, pour qui.",
  "maj": [
    { "a": "2026-09-04T14:05:00Z", "etat": "enquete", "texte": "Ce qu on sait, ce qu on cherche." }
  ]
}
```

`fin: null` **et** `etat` different de `resolu` = incident en cours, affiche en haut de page.
Renseigner `fin` le bascule dans l historique. Pas d accents, comme dans le CHANGELOG du client.

## En local

```bash
node scripts/probe.mjs
npx http-server . -p 4180 -c-1
```

## Les limites, dites franchement

La sonde verifie que les services **repondent** et que leur contenu est **coherent**. Elle ne
sait pas qu un client plante a l ouverture d un salon : aucune requete n echoue dans ce cas.
Pour ca, il faut ouvrir une alerte a la main depuis la page Nexium Admins.
