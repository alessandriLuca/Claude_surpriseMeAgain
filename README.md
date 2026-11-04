# Valdombra

Action-RPG fantasy in terza persona, single-player, che gira nel browser. È fatto in Three.js e tutto è generato da codice: terreno, modelli, musica ed effetti sonori. Non ci sono asset esterni.

Da quaranta giorni il sole non sorge su Valdombra. Per riportare l'alba devi:

1. recuperare le tre **Braci Primordiali** dai guardiani corrotti: Zannagrigia nel Bosco, il Cavaliere Senza Nome nelle Rovine, il Golem del Lago;
2. riaccendere la **Lanterna Antica**;
3. accendere il **Faro** sul colle.

## Combattimento

- **Lampo d'attacco**: quando un nemico carica il colpo, sopra di lui compare un lampo.
  - **Giallo**: si può parare. Alza lo scudo (tasto destro) proprio all'impatto e fai una **parata perfetta**: il nemico resta **stordito** e prende danni critici doppi, e il tempo rallenta per un attimo.
  - **Rosso**: imparabile (schianti del Golem, affondi pesanti del Cavaliere, assalti di Zannagrigia). Va schivato.
- **Blocco**: tenendo premuto il tasto destro lo scudo assorbe una parte del danno e consuma stamina. Se la stamina finisce, la guardia si rompe.
- **Colpo di scudo** (`F`, oppure clic sinistro mentre blocchi): stordisce i nemici normali e rompe la guardia del Cavaliere.
- **Proiettili**: le sfere dei fuochi fatui, parate al momento giusto, tornano indietro.
- **Combo di spada** da 3 colpi, critici, **Vortice** (abilità), **Palla di fuoco** (`Q`).
- **Stamina**: la consumano attacchi, corsa, schivate e blocchi.

## Loot

Nemici, boss e scrigni lasciano **spade, spadoni, asce, sciabole e scudi** (di assi, rotondi, a goccia, a torre). Le rarità sono cinque: Comune, Non comune, Rara, Epica, Leggendaria. Ogni oggetto ha bonus casuali: danno, velocità, furto vita, fuoco, critico, vita, stamina, finestra di parata, stordimento, spine.

Ogni boss lascia un oggetto leggendario unico. Gli oggetti si equipaggiano dalla Borsa (`I`) e cambiano l'aspetto del personaggio. Quelli che non servono si smantellano per ottenere ferro e oro. Bruno, il fabbro, rinforza l'arma in cambio di minerale di ferro.

## Movimento e abilità

- **Doppio salto** fin dall'inizio, poi triplo salto e **planata** col mantello (tieni premuto Spazio).
- **Rampino** (`G` o tasto centrale del mouse):
  - si aggancia a terreno, muri, alberi, rocce e alle tue costruzioni;
  - i nemici piccoli vengono tirati verso di te e storditi;
  - sui boss ti lancia addosso a loro.
- Ogni livello dà 1 **punto abilità** (`K`): planata, triplo salto, rampino esperto, maestro della parata, colpo di scudo pesante, vortice, palla di fuoco esplosiva, vigore, resistenza, mietitore.

## Raccolta e costruzione

- Colpisci **alberi** (legno; con l'ascia si fa prima), **rocce** (pietra), **vene di minerale** (ferro) e **cristalli**.
- Con `B` entri in **modalità costruzione**. Ci sono **pavimenti, muri di legno e di pietra, rampe, torce e fuochi da campo**, tutti agganciati a una griglia, impilabili e calpestabili.
  - Clic sinistro: piazza.
  - Tasto destro: rimuovi (recuperi metà del materiale).
  - `R`: ruota.
- **Scava** e **Riempi** modificano il terreno: puoi fare buche, fossati e collinette.
- Il **fuoco da campo** diventa il tuo punto di rinascita, e starci vicino ti cura.

## NPC con l'AI

Al villaggio vivono 7 personaggi con una personalità propria. Quando l'AI è disponibile, scrivi quello che vuoi e loro rispondono restando nel ruolo. Possono anche attivare azioni di gioco (missioni, ricompense, vendite), ma solo quelle che il gioco permette in quel momento. Senza AI usano dialoghi scritti e il gioco si completa lo stesso.

L'AI viene cercata in quest'ordine:

1. la capability `sample` di claude.ai, se il gioco è aperto come Artifact;
2. l'endpoint `/api/npc` del sito, cioè una Cloudflare Pages Function con la tua chiave API Anthropic;
3. se nessuna delle due è disponibile, i dialoghi scritti.

## Comandi

| Azione | Tasto |
|---|---|
| Muoversi / correre | `W A S D` / `Shift` |
| Salto, doppio salto, planata | `Spazio` |
| Attacco (combo da 3) | clic sinistro |
| Para / blocca | tasto destro (tieni premuto) |
| Colpo di scudo | `F` |
| Schivata | `Ctrl` o `C` |
| Rampino | `G` o tasto centrale |
| Palla di fuoco / Vortice | `Q` / `R` |
| Costruzione | `B`, poi `1`-`8` o rotella, `R` ruota |
| Parla / usa | `E` |
| Pozione | `1` |
| Borsa, abilità, diario, mappa | `I`, `K`, `J`, `M` |
| Pausa | `Esc` |

## Pubblicazione su Cloudflare Pages

Il gioco statico è in `public/`. L'endpoint AI è in `functions/api/npc.js`. Il workflow `.github/workflows/deploy.yml` pubblica su Cloudflare Pages a ogni push su `main` o sui branch `claude/**`.

1. Su Cloudflare, crea un API token con il permesso **Account → Cloudflare Pages → Edit** e copia il tuo **Account ID**.
2. Nel repo GitHub, vai su **Settings → Secrets and variables → Actions** e aggiungi:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `ANTHROPIC_API_KEY` (facoltativa: senza, gli NPC usano i dialoghi scritti)
3. Fai un push, oppure lancia il workflow a mano da **Actions**. Il progetto `valdombra` viene creato da solo, e il sito finisce su `https://valdombra.pages.dev`; i branch diversi da `main` ricevono un URL di anteprima.

In alternativa, dalla dashboard di Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**, scegli questo repo, lascia vuoto il comando di build e imposta `public` come cartella di output. Poi aggiungi `ANTHROPIC_API_KEY` come secret nelle impostazioni del progetto.

Variabili facoltative per l'endpoint AI:

- `NPC_MODEL`: modello da usare. Predefinito `claude-opus-5-5`; per risposte più economiche e veloci puoi mettere, per esempio, `claude-haiku-5-5`.
- `NPC_EFFORT`: predefinito `low`.
- `ALLOWED_ORIGINS`: altri domini autorizzati a chiamare l'endpoint, oltre al sito stesso.

> L'endpoint `/api/npc` è pubblico e usa la tua chiave: chiunque giochi sul sito consuma il tuo credito API. Imposta un limite di spesa nella Console Anthropic, ed eventualmente una regola di rate limiting su Cloudflare.

## Avvio in locale

```bash
npm install
```

```bash
npx wrangler pages dev public
```

Questo avvia gioco e funzione AI insieme. Per la chiave in locale crea un file `.dev.vars` con `ANTHROPIC_API_KEY=...`. Per il solo gioco basta `python3 -m http.server` dentro `public/`, oppure aprire `public/index.html` direttamente.

## Struttura

```
public/index.html     interfaccia, stile, avvio
public/js/util.js     RNG, rumore procedurale, helper, storage
public/js/audio.js    audio sintetizzato con WebAudio
public/js/world.js    terreno (scavabile), cielo, vegetazione e risorse, villaggio, rovine, lago, faro, collisioni
public/js/models.js   personaggi e creature low-poly con animazione procedurale
public/js/loot.js     generatore di armi e scudi (rarità, bonus) e loro modelli 3D
public/js/build.js    costruzioni a griglia, superfici calpestabili, collisioni, anteprima di piazzamento
public/js/data.js     lore, NPC (personalità e dialoghi scritti), missioni, nemici
public/js/ai.js       voce AI degli NPC (artifact claude.ai, poi /api/npc, poi copione)
public/js/game.js     giocatore, combattimento, rampino, raccolta, costruzione, IA nemici, dialoghi, HUD, salvataggi
functions/api/npc.js  Cloudflare Pages Function che chiama l'API Anthropic
```
