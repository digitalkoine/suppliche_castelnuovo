# Sito web (statico) – DB Suppliche

Questa cartella è un **sito statico** (HTML/CSS/JS) che fa query sul database SQLite **direttamente nel browser** usando `sql.js`.
Non serve un server applicativo: basta pubblicare la cartella su GitHub Pages / Netlify / qualsiasi hosting statico.

Per aprire https://digitalkoine.github.io/suppliche_castelnuovo/ 

## Struttura
- `index.html`
- `assets/style.css`
- `assets/app.js`
- `data/suppliche.sqlite` (database)

## Nota importante
Per motivi di sicurezza, molti browser bloccano `fetch()` quando apri i file in locale con `file://`.
Quindi:

### Opzione A — server locale (per test)
Dentro la cartella, avvia:
```bash
python -m http.server 8000
```
Poi apri:
`http://127.0.0.1:8000`

### Opzione B — GitHub Pages (pubblicazione)
1. Crea un repository su GitHub (es. `suppliche-site`)
2. Carica **tutti** i file di questa cartella (mantieni le sottocartelle)
3. Vai in **Settings → Pages**
4. Source: *Deploy from a branch*
5. Branch: `main` / folder: `/root`
6. Salva: GitHub ti dà l’URL pubblico del sito.

## Personalizzazioni possibili
- Aggiungere **tutti** i “tag” (tutte le colonne booleane) come filtri
- Aggiungere grafici/contatori (esiti per anno, top professioni, ecc.)
- Aggiungere esportazione risultati (CSV)
