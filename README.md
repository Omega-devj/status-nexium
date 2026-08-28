# Statut · Nexium Client

Page de statut publique du Nexium Client, sur le modele de status.anthropic.com.
Site statique servi par GitHub Pages, alimente par une surveillance GitHub Actions.

## Comment ca marche

```
.github/workflows/surveillance.yml   toutes les 5 min, lance la sonde et publie le resultat
scripts/probe.mjs                    interroge chaque service et ecrit status.json + history.json
status.json                          etat courant — lu par la page ET par le client Nexium
history.json                         90 jours d historique par service
incidents/*.json                     incidents ecrits a la main
index.html                           la page
```

`status.json` est la source de verite unique : la page web et le bandeau du client lisent
le meme fichier. Il n y a rien d autre a synchroniser.

## Services surveilles

| Cle | Service | Ce qui est verifie |
|---|---|---|
| `client` | Mise a jour du client | HTTP 200, taille, numero de version, au moins 20 modules, **et la somme de controle `.nxsum` qui doit correspondre** |
| `blocklist` | Protection des liens | HTTP 200, au moins 1000 lignes, **et aucun domaine Discord legitime dedans** |
| `banlist` | Liste de bannissement | HTTP 200, taille plausible |
| `changelog` | Notes de version | HTTP 200, fichier non vide |
| `musique` | Bibliotheque musicale | HTTP 200 |
| `sponsor` | Partenariats | HTTP 200 |
| `signalements` | Signalements | la fonction Supabase repond |
| `communaute` | Renseignement communautaire | la fonction Supabase repond |

Les deux controles en gras sont les plus utiles : ils attrapent une **publication cassee**,
c est-a-dire le cas ou le fichier repond bien mais ou son contenu ne passerait pas le
portillon de mise a jour installe chez les utilisateurs.

Un service est `degrade` au-dela de 8 s de reponse, `panne` s il ne repond pas en 20 s.

## Declarer un incident a la main

Une panne qui ne casse aucune sonde reste invisible — c est exactement le cas du bug de
plantage du 28 aout 2026. Pour ceux-la, ajoute un fichier dans `incidents/` :

```json
{
  "id": "2026-09-04-envoi-messages",
  "composant": "client",
  "titre": "Titre court, ce que l utilisateur constate",
  "gravite": "mineur | majeur | critique",
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

Regles :
- `fin: null` **et** `etat` different de `resolu` = incident en cours, affiche en haut de page
  et dans le bandeau du client. Renseigner `fin` le fait basculer dans l historique.
- Ajoute une entree dans `maj` a chaque avancee, du plus ancien au plus recent.
- Pas d accents dans les textes, comme dans le CHANGELOG du client.

Le commit declenche le workflow, la page se met a jour en une minute.

## Faire tourner la sonde en local

```bash
node scripts/probe.mjs
npx http-server . -p 4180 -c-1
```

## Ce que la sonde ne voit pas

Elle verifie que les services **repondent** et que leur contenu est **coherent**. Elle ne
sait pas qu un client plante a l ouverture d un salon : pour ca, il faut un incident manuel.
C est une limite assumee, pas un oubli.
