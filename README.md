# Valdombra

Action-RPG fantasy in terza persona, single-player, che gira nel browser. È fatto in Three.js e tutto è generato da codice: terreno, modelli, musica ed effetti sonori. Non ci sono asset esterni.

Da quaranta giorni il sole non sorge su Valdombra. Per riportare l'alba devi:

1. recuperare le tre **Braci Primordiali** dai guardiani corrotti: Zannagrigia nel Bosco Sussurrante, il Cavaliere Senza Nome nelle Rovine di Aurelia, il Golem del Lago;
2. riaccendere la **Lanterna Antica** in piazza;
3. portare la fiamma al **Faro** sul colle e accenderlo.

## NPC con l'AI

Al villaggio vivono sette personaggi, ognuno con la sua personalità: Fra' Tobia, Elda l'erborista, Bruno il fabbro, sua figlia Mira, la Capitana Sera, Ottone il gatto parlante e un misterioso Viandante.

- **Con l'AI disponibile** (pagina aperta come Artifact su claude.ai): scrivi quello che vuoi e il personaggio risponde restando nel ruolo. Conosce il mondo, le tue missioni e il tuo inventario, e può anche attivare azioni di gioco (accettare una missione, ricevere oggetti, venderti pozioni). Il gioco però controlla ogni azione: l'AI non può inventarsi ricompense.
- **Senza AI** (file aperto in locale, AI rifiutata o non disponibile): gli stessi personaggi usano dialoghi già scritti, con scelte numerate. Il gioco si completa al 100% anche così. Se una chiamata all'AI fallisce durante una conversazione, il dialogo passa da solo al copione.

Le voci AI si possono spegnere dal menu di pausa.

## Comandi

| Azione | Tasto |
|---|---|
| Muoversi / correre | `W A S D` / `Shift` |
| Guardarsi intorno | mouse (clic sulla scena per bloccarlo) |
| Attacco con la spada (combo da 3) | clic sinistro |
| Palla di fuoco (15 mana) | `Q` |
| Schivata | `Ctrl` o `C` |
| Salto | `Spazio` |
| Parlare / usare | `E` |
| Pozione | `1` |
| Diario, borsa, mappa | `J`, `I`, `M` |
| Pausa | `Esc` |

## Missioni secondarie

- **Erbe per Elda**: 5 Erbe Lunari. Ricompensa: pozioni.
- **Ferro per la forgia** (Bruno): 3 Ferro Antico dagli scheletri. Ricompensa: spada potenziata.
- **Il ciondolo perduto** (Mira). Ricompensa: vita massima in più.
- **Sentieri sicuri** (Sera): 6 lupi. Ricompensa: oro e armatura.
- **Il capriccio del gatto** (Ottone): un pesce pescato dal pontile. Ricompensa: velocità.
- Il Viandante nasconde un segreto sul Faro.

Il salvataggio è automatico, nel `localStorage` del browser.

## Avvio in locale

Gli script sono normali file JS, non moduli. Puoi aprire `index.html` direttamente, oppure servire la cartella:

```bash
python3 -m http.server 8000
```

e aprire `http://localhost:8000`. Serve la connessione a internet, perché Three.js r128 viene caricato da cdnjs.

## Struttura

```
index.html      interfaccia, stile, avvio
js/util.js      RNG, rumore procedurale, helper, storage
js/audio.js     audio sintetizzato con WebAudio (sfx, ambiente, musica generativa)
js/world.js     terreno, cielo, vegetazione, villaggio, rovine, lago, faro, collisioni
js/models.js    personaggi e creature low-poly con animazione procedurale
js/data.js      lore, NPC (personalità e dialoghi scritti), missioni, nemici
js/ai.js        voce AI degli NPC (capability `sample` degli Artifact di claude.ai)
js/game.js      giocatore, telecamera, combattimento, IA dei nemici, dialoghi, HUD, salvataggi
```
