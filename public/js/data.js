// Valdombra — content: lore, NPCs (persona + scripted dialogue), quests, items, enemies.
(function () {
  const D = {};

  D.LORE = [
    'Valdombra è un piccolo villaggio di montagna circondato da una palizzata, al centro di una valle con un bosco, un lago e antiche rovine.',
    'Da quaranta giorni il sole non sorge: è la "Notte Lunga". Il cielo resta buio, le creature della notte si fanno audaci.',
    'Al centro della piazza c\'è la Lanterna Antica, spenta. La leggenda dice che solo tre Braci Primordiali possono riaccenderla, e che la sua fiamma va portata al Faro sul colle a nord-est per richiamare l\'alba.',
    'Le tre Braci sono custodite da guardiani corrotti: Zannagrigia, il lupo alfa del Bosco Sussurrante (nord-ovest); il Cavaliere Senza Nome, nelle Rovine di Aurelia (est); il Golem del Lago, nella sua tana sulla riva ovest del Lago delle Nebbie (sud-ovest).',
    'Nel bosco crescono le Erbe Lunari, che brillano di luce azzurra. Gli scheletri delle rovine portano frammenti di Ferro Antico. I lupi infestano i sentieri.',
    'Il protagonista è un viandante con spada, scudo, lanterna e un rampino da polso, arrivato a Valdombra da poco. Gli abitanti lo chiamano "forestiero". Sa parare i colpi al momento giusto, tagliare alberi, spaccare rocce e minerali, scavare la terra e costruire capanni, muri, rampe, torce e fuochi da campo.',
  ].join(' ');

  // ------------------------------------------------------------ items
  D.items = {
    potion: { name: 'Pozione di Elda', desc: 'Ripristina 60 punti vita. Tasto 1.', icon: '⚗' },
    herb: { name: 'Erba Lunare', desc: 'Pianta luminosa del bosco. Elda ne ha bisogno.', icon: '✿' },
    iron: { name: 'Ferro Antico', desc: 'Frammento di armatura delle rovine. Bruno lo cerca.', icon: '⚒' },
    pendant: { name: 'Ciondolo di Mira', desc: 'Un ciondolo d\'argento a forma di luna.', icon: '☾' },
    fish: { name: 'Pesce d\'Argento', desc: 'Un pesce raro del Lago delle Nebbie. Puzza.', icon: '✦' },
    ember: { name: 'Brace Primordiale', desc: 'Calda come un cuore. Ne servono tre.', icon: '✺' },
  };

  // ------------------------------------------------------------ quests
  D.quests = {
    main: { title: 'La Lanterna Spenta', giver: 'tobia' },
    herbs: { title: 'Erbe per Elda', giver: 'elda', need: 5 },
    iron: { title: 'Ferro per la forgia', giver: 'bruno', need: 3 },
    pendant: { title: 'Il ciondolo perduto', giver: 'mira' },
    wolves: { title: 'Sentieri sicuri', giver: 'sera', need: 6 },
    fish: { title: 'Il capriccio del gatto', giver: 'ottone' },
  };

  D.questText = function (id, g) {
    const q = g.S.quests[id] || {};
    const inv = g.S.inv;
    switch (id) {
      case 'main':
        if (q.stage === 'faro') return 'La Lanterna arde di nuovo. Porta la fiamma al Faro sul Colle (nord-est) e accendilo.';
        if (q.state === 'done') return 'L\'alba è tornata su Valdombra.';
        return `Recupera le tre Braci Primordiali dai guardiani (${inv.ember || 0}/3): Zannagrigia nel Bosco (NO), il Cavaliere nelle Rovine (E), il Golem nella sua tana al Lago (SO). Poi torna da Fra' Tobia.`;
      case 'herbs': return q.state === 'done' ? 'Elda ha le sue erbe.' : `Raccogli Erbe Lunari nel bosco e sulle rive del lago (${Math.min(inv.herb || 0, 5)}/5).`;
      case 'iron': return q.state === 'done' ? 'Bruno ha forgiato la tua lama.' : `Raccogli Ferro Antico dagli scheletri delle Rovine (${Math.min(inv.iron || 0, 3)}/3).`;
      case 'pendant': return q.state === 'done' ? 'Mira ha il suo ciondolo.' : (inv.pendant ? 'Riporta il ciondolo a Mira.' : 'Mira ha perso il ciondolo nel bosco, vicino a un grande albero caduto a ovest del sentiero.');
      case 'wolves': return q.state === 'done' ? 'I sentieri sono più sicuri.' : `Abbatti lupi lungo i sentieri (${Math.min(q.progress || 0, 6)}/6).`;
      case 'fish': return q.state === 'done' ? 'Ottone è (quasi) soddisfatto.' : (inv.fish ? 'Porta il Pesce d\'Argento a Ottone.' : 'Pesca un Pesce d\'Argento dal pontile del Lago delle Nebbie (premi E sul pontile).');
    }
    return '';
  };

  // ------------------------------------------------------------ enemies
  D.enemies = {
    wolf: { name: 'Lupo d\'ombra', hp: 40, dmg: 9, speed: 5.4, range: 1.8, aggro: 16, xp: 18, gold: [2, 6], cooldown: 1.3, windup: 0.35, radius: 0.7 },
    skeleton: { name: 'Scheletro', hp: 60, dmg: 13, speed: 3.0, range: 2.0, aggro: 14, xp: 26, gold: [4, 10], cooldown: 1.6, windup: 0.55, radius: 0.5, drop: 'iron' },
    wisp: { name: 'Fuoco Fatuo', hp: 30, dmg: 10, speed: 3.4, range: 12, aggro: 18, xp: 22, gold: [3, 8], cooldown: 2.4, windup: 0.6, radius: 0.5, ranged: true, fly: true },
    alpha: { name: 'Zannagrigia', hp: 320, dmg: 18, speed: 6.2, range: 2.6, aggro: 20, xp: 160, gold: [40, 50], cooldown: 1.1, windup: 0.45, radius: 1.3, boss: true, drop: 'ember' },
    knight: { name: 'Cavaliere Senza Nome', hp: 480, dmg: 24, speed: 3.6, range: 3.0, aggro: 18, xp: 220, gold: [60, 70], cooldown: 1.5, windup: 0.7, radius: 0.9, boss: true, drop: 'ember' },
    golem: { name: 'Golem del Lago', hp: 700, dmg: 32, speed: 2.6, range: 4.2, aggro: 20, xp: 320, gold: [80, 100], cooldown: 2.2, windup: 0.9, radius: 2.0, boss: true, drop: 'ember', slam: true },
  };

  D.spawns = [
    // forest wolves & wisps
    ...[[-80, -60], [-95, -85], [-120, -75], [-130, -110], [-100, -125], [-70, -100], [-140, -90], [-60, -45]].map(([x, z]) => ({ type: 'wolf', x, z })),
    ...[[-115, -95], [-90, -110], [-135, -130]].map(([x, z]) => ({ type: 'wisp', x, z })),
    // road wolves
    ...[[60, -70], [-30, 55], [70, 20]].map(([x, z]) => ({ type: 'wolf', x, z })),
    // ruins skeletons
    ...[[105, 30], [115, 42], [128, 28], [135, 40], [100, 45], [122, 20]].map(([x, z]) => ({ type: 'skeleton', x, z })),
    { type: 'wisp', x: 140, z: 30 },
    // lake wisps
    ...[[-60, 110], [-120, 60], [-130, 140], [-80, 140]].map(([x, z]) => ({ type: 'wisp', x, z })),
    ...[[-140, 80], [-50, 90]].map(([x, z]) => ({ type: 'wolf', x, z })),
    // bosses
    { type: 'alpha', x: -128, z: -112, boss: true },
    { type: 'knight', x: 134, z: 35, boss: true },
    { type: 'golem', x: -160, z: 112, boss: true },
  ];

  D.herbSpots = [[-90, -70], [-118, -82], [-104, -118], [-138, -98], [-75, -112], [-125, -60], [-60, 85], [-125, 70], [-140, 130], [-90, 135], [-150, -125]];
  D.pendantSpot = [-142, -64];
  D.chests = [
    { x: -150, z: -140, gold: 45, potion: 1 },
    { x: 148, z: 50, gold: 60, potion: 1 },
    { x: -40, z: 150, gold: 35, potion: 2 },
    { x: 150, z: -90, gold: 50, potion: 1 },
    { x: 20, z: 120, gold: 30, potion: 1 },
  ];

  // ------------------------------------------------------------ NPCs
  // Each topic: { id, label, cond(g) -> bool, reply: string | string[] | fn(g) -> string, action?: string }
  // `action` is executed by the game when the topic is chosen (offline) or when the AI returns it (online).
  const has = (g, k, n = 1) => (g.S.inv[k] || 0) >= n;
  const qs = (g, id) => (g.S.quests[id] || {}).state || 'none';

  D.npcs = [
    {
      id: 'tobia', name: 'Fra\' Tobia', title: 'Custode della Lanterna', x: -10, z: -10,
      look: { skin: 0xd0a080, cloth: 0x4a3a5a, cloth2: 0x3a2a3a, hair: 0xd8d8d8, beard: 0xe0e0e0, robe: true, staff: true },
      persona: 'Monaco anziano, gentile, lento nel parlare, ama le metafore sulla luce e il buio. Custodisce la Lanterna Antica e si sente in colpa perché non è riuscito a impedire la Notte Lunga. Si rivolge al giocatore chiamandolo "figliolo" o "figliola" (o semplicemente "viandante" se non sa). Conosce le leggende delle tre Braci e del Faro. Non sa chi abbia causato la Notte Lunga, ma sospetta che il vecchio guardiano del Faro, scomparso anni fa, sappia qualcosa.',
      greet: g => {
        const q = g.S.quests.main || {};
        if (q.state === 'done') return 'Guarda, figliolo... il sole. Avevo dimenticato quanto fosse caldo.';
        if (q.stage === 'faro') return 'La Lanterna arde! Ora corri al Faro sul colle, prima che la fiamma si stanchi.';
        if (has(g, 'ember', 3)) return 'Sento il calore da qui... hai le tre Braci! Presto, mettiamole nella Lanterna.';
        if (q.state === 'active') return `Ogni Brace è un passo verso l'alba. Ne hai ${g.S.inv.ember || 0} su tre.`;
        return 'Benvenuto a Valdombra, viandante. Perdona il buio: è da quaranta giorni che il sole ci ha dimenticati.';
      },
      topics: [
        { id: 'who', label: 'Chi sei?', reply: 'Sono Tobia, l\'ultimo dei frati della cappella. Da quarant\'anni accudisco la Lanterna Antica. Da quaranta giorni accudisco solo il suo silenzio.' },
        { id: 'night', label: 'Cos\'è la Notte Lunga?', reply: ['Una mattina il sole semplicemente non è sorto. Le stelle sono rimaste lì, come chiodi su una porta chiusa.', 'Il buio non è solo assenza di luce, figliolo. È qualcosa che ha fame. Da quando è arrivato, le bestie del bosco hanno occhi nuovi.'] },
        { id: 'main_accept', label: 'Come posso aiutare?', cond: g => qs(g, 'main') === 'none', action: 'main_accept', reply: 'La leggenda dice che tre Braci Primordiali possono riaccendere la Lanterna. Le custodiscono tre guardiani corrotti: il lupo Zannagrigia nel Bosco, il Cavaliere Senza Nome nelle Rovine, e il Golem del Lago. Portamele, e la luce tornerà.' },
        { id: 'where', label: 'Dove trovo i guardiani?', cond: g => qs(g, 'main') === 'active' && !has(g, 'ember', 3), reply: 'Il Bosco Sussurrante è a nord-ovest, segui il sentiero. Le Rovine di Aurelia sono a est, oltre il ponte di pietra che non c\'è più. Il Golem dorme nella sua tana sulla riva ovest del lago, a sud-ovest. Va\' prima nel bosco: è il guardiano meno crudele.' },
        { id: 'main_deliver', label: 'Ho le tre Braci.', cond: g => qs(g, 'main') === 'active' && !g.S.quests.main.stage && has(g, 'ember', 3), action: 'main_deliver', reply: 'Per tutti i santi... mettile qui, una alla volta. Guarda! La Lanterna respira! Ora porta questa fiamma al Faro sul colle a nord-est. Solo lui può chiamare l\'alba oltre le montagne.' },
        { id: 'bless', label: 'Benedicimi, frate.', cond: g => g.S.hp < g.S.maxHp, action: 'bless', reply: 'Che la luce ti ricucia le ferite. Non è magia, figliolo: è solo un vecchio che ci crede ancora.' },
        { id: 'keeper', label: 'Chi era il guardiano del Faro?', reply: 'Si chiamava Anselmo. Teneva acceso il Faro ogni notte, per trent\'anni. Poi un giorno è sparito, e il Faro si è spento. Poco dopo... la Notte Lunga. Non credo alle coincidenze.' },
      ],
    },
    {
      id: 'elda', name: 'Elda', title: 'Erborista', x: -17, z: 19,
      look: { skin: 0xc89878, cloth: 0x3a5a3a, cloth2: 0x2a3a2a, hair: 0x8a8a8a, longHair: true, basket: true, apron: 0x6a5a3a },
      persona: 'Erborista sulla sessantina, sarcastica, pungente, odia gli sciocchi ma ha un cuore d\'oro che nasconde bene. Parla per frecciatine e proverbi inventati. Vende pozioni curative a 15 monete d\'oro l\'una (solo se il giocatore ha l\'oro). Le servono 5 Erbe Lunari per preparare le pozioni per tutto il villaggio. Non sopporta Ottone il gatto ("quella pelliccia con la lingua lunga"). Sotto sotto è preoccupata per Mira.',
      greet: g => {
        if (qs(g, 'herbs') === 'active' && has(g, 'herb', 5)) return 'Ma guarda, brillano fin da qui. Le hai trovate, eh?';
        if (qs(g, 'herbs') === 'done') return 'Il mio cliente preferito. Cioè, l\'unico che paga.';
        return 'Se sei qui per chiacchierare, ho già un gatto che lo fa. Se sei qui per comprare, ti ascolto.';
      },
      topics: [
        { id: 'who', label: 'Chi sei?', reply: 'Elda. Erbe, decotti, unguenti, e consigli non richiesti. Questi ultimi sono gratis, purtroppo per te.' },
        { id: 'herbs_accept', label: 'Ti serve qualcosa?', cond: g => qs(g, 'herbs') === 'none', action: 'herbs_accept', reply: 'Mi servono cinque Erbe Lunari. Crescono nel bosco e sulle rive del lago, brillano d\'azzurro, non puoi sbagliare. Anche se tu, a occhio, potresti. Portamele e ti preparo pozioni a sufficienza per non farti ammazzare subito.' },
        { id: 'herbs_complete', label: 'Ecco le Erbe Lunari.', cond: g => qs(g, 'herbs') === 'active' && has(g, 'herb', 5), action: 'herbs_complete', reply: 'Cinque, intere, nemmeno schiacciate. Sono quasi impressionata. Tieni, tre pozioni. E da ora te le vendo a metà prezzo... no, scherzo, a prezzo pieno. Ma con affetto.' },
        { id: 'buy_potion', label: 'Comprare una pozione (15 oro)', cond: g => g.S.gold >= 15, action: 'buy_potion', reply: ['Quindici monete. Non fare quella faccia, le erbe non crescono sugli alberi. Cioè sì, ma non è quello il punto.', 'Bevila tutta d\'un fiato. Il sapore è parte della cura.'] },
        { id: 'cat', label: 'Cosa pensi di Ottone?', reply: 'Quella pelliccia con la lingua lunga? Si siede sul pozzo e giudica tutti. Il fatto che spesso abbia ragione non lo rende meno insopportabile.' },
        { id: 'mira', label: 'E Mira?', reply: 'Quella bambina va nel bosco come se fosse il cortile di casa. Un giorno le succede qualcosa e io... beh, io le dirò che gliel\'avevo detto. Ecco.' },
      ],
    },
    {
      id: 'bruno', name: 'Bruno', title: 'Fabbro', x: 15, z: 9,
      look: { skin: 0xb88060, cloth: 0x5a3a2a, cloth2: 0x2a2420, hair: 0x1a1a1a, beard: 0x2a1a10, apron: 0x3a2a1a, hammer: true, scale: 1.12 },
      persona: 'Fabbro grosso e burbero, parla pochissimo, frasi corte, a volte risponde solo con "Mh." Ha un debole per il lavoro ben fatto e per sua figlia Mira (è il papà di Mira, ma lo dice solo se gli si chiede della famiglia). Per riforgiare la spada del giocatore gli servono 3 frammenti di Ferro Antico dagli scheletri delle Rovine. Rispetta chi combatte con onore. Detesta i chiacchieroni.',
      greet: g => {
        if (qs(g, 'iron') === 'active' && has(g, 'iron', 3)) return 'Quello è Ferro Antico. Dammelo.';
        if (qs(g, 'iron') === 'done') return 'La lama tiene? Bene.';
        return 'Mh.';
      },
      topics: [
        { id: 'who', label: 'Chi sei?', reply: 'Bruno. Fabbro.' },
        { id: 'iron_accept', label: 'Puoi migliorare la mia spada?', cond: g => qs(g, 'iron') === 'none', action: 'iron_accept', reply: 'Con questo ferro? No. Serve Ferro Antico. Tre pezzi. Gli scheletri delle Rovine ne sono pieni. Rompili. Portamelo.' },
        { id: 'iron_complete', label: 'Ecco il Ferro Antico.', cond: g => qs(g, 'iron') === 'active' && has(g, 'iron', 3), action: 'iron_complete', reply: 'Mh. Buono. ...Ecco. Una spada lunga, fatta come si deve. Taglia anche le ombre. Non ringraziarmi. Usala.' },
        { id: 'forge_upgrade', label: 'Rinforza la mia arma (3 minerale di ferro, 40 oro)', cond: g => (g.S.res.iron || 0) >= 3 && g.S.gold >= 40, action: 'forge_upgrade', reply: ['*clang* *clang* ...Fatto. Più pesante. Più cattiva.', 'Mh. Il minerale è buono. La lama adesso morde.'] },
        { id: 'family', label: 'Hai famiglia?', reply: 'Una figlia. Mira. Troppo curiosa. Come sua madre. ...Se la vedi nel bosco, riportala a casa.' },
        { id: 'night', label: 'Che ne pensi della Notte Lunga?', reply: 'Il fuoco della forgia non si spegne. Il resto non mi interessa.' },
      ],
    },
    {
      id: 'mira', name: 'Mira', title: 'Figlia del fabbro', x: 5, z: 7,
      look: { skin: 0xe8b898, cloth: 0xa04a4a, cloth2: 0x4a3a3a, hair: 0xa05a20, longHair: true, scale: 0.68 },
      persona: 'Bambina di nove anni, curiosissima, parla velocissima, fa mille domande al giocatore (sulla spada, sui posti visti, se ha mai visto un drago). Coraggiosa fino all\'incoscienza. Ha perso il suo ciondolo d\'argento a forma di luna nel Bosco Sussurrante, vicino a un grande albero caduto a ovest del sentiero; era della sua mamma, che non c\'è più. È la figlia di Bruno il fabbro. Crede che Ottone il gatto sia un principe stregato.',
      greet: g => {
        if (qs(g, 'pendant') === 'active' && has(g, 'pendant')) return 'Quello... QUELLO È IL MIO CIONDOLO! L\'hai trovato davvero?!';
        if (qs(g, 'pendant') === 'done') return 'Ciao eroe! Guarda, lo porto sempre! Hai ucciso un drago oggi?';
        return 'Ciao! Sei tu il forestiero? Hai una spada vera? Posso toccarla? No? Va bene. Hai visto mai un drago?';
      },
      topics: [
        { id: 'who', label: 'Chi sei?', reply: 'Sono Mira! Ho nove anni e tre quarti. Il mio papà è Bruno, quello grosso che fa "mh". Io invece parlo tanto, dice Elda. Troppo, dice Elda.' },
        { id: 'pendant_accept', label: 'Sembri triste...', cond: g => qs(g, 'pendant') === 'none', action: 'pendant_accept', reply: 'Ho perso il ciondolo della mia mamma... è d\'argento, a forma di luna. Ero nel bosco, vicino al grande albero caduto, a ovest del sentiero, e poi è arrivato un lupo e io sono scappata e... non dirlo a papà. Lo ritrovi tu?' },
        { id: 'pendant_complete', label: 'Ecco il tuo ciondolo.', cond: g => qs(g, 'pendant') === 'active' && has(g, 'pendant'), action: 'pendant_complete', reply: 'GRAZIE GRAZIE GRAZIE! Tieni, questo è il mio portafortuna, un sassolino magico: ti fa avere più vita, giuro! Ed ecco anche i miei risparmi. Tutti. Quasi tutti.' },
        { id: 'cat', label: 'Il gatto parla davvero?', reply: 'Ottone? Certo che parla! È un principe stregato, ne sono sicura. Però non vuole ammetterlo. Dice che i principi sono "sopravvalutati".' },
        { id: 'dragon', label: 'Non ho mai visto un drago.', reply: 'Ohhh. Peccato. Però se lo vedi mi chiami, va bene? Io ti aiuto. So lanciare i sassi fortissimo.' },
      ],
    },
    {
      id: 'sera', name: 'Capitana Sera', title: 'Guardia del villaggio', x: -2, z: -36,
      look: { skin: 0xc89070, cloth: 0x5a5a6a, cloth2: 0x3a3a44, hair: 0x2a1a10, helmet: 0x7a7a84, spear: true, cape: 0x2a3a6a },
      persona: 'Capitana della guardia, trentacinque anni, pragmatica, diretta, ironia secca da soldato. Sorveglia il cancello nord. Ha solo tre uomini e i lupi d\'ombra attaccano i sentieri: chiede al giocatore di abbatterne sei in cambio di 60 monete. Rispetta i fatti, non le parole. Non si fida dei forestieri all\'inizio, ma cambia idea quando vede risultati. Non crede alle leggende delle Braci, ma ammette che "qualcosa" deve pur funzionare.',
      greet: g => {
        if (qs(g, 'wolves') === 'active' && (g.S.quests.wolves.progress || 0) >= 6) return 'Ho sentito gli ululati smettere. Sei stato tu?';
        if (qs(g, 'wolves') === 'done') return 'Forestiero. I miei uomini ti chiamano "lo spazzino dei lupi". È un complimento.';
        return 'Fermo lì, forestiero. Nome, motivo della visita, e se porti guai: dimmelo subito, che faccio prima.';
      },
      topics: [
        { id: 'who', label: 'Chi sei?', reply: 'Capitana Sera, Guardia di Valdombra. Guardia composta da me, tre ragazzi e un cane che dorme. Il cane è il più affidabile.' },
        { id: 'wolves_accept', label: 'Hai bisogno di una mano?', cond: g => qs(g, 'wolves') === 'none', action: 'wolves_accept', reply: 'Ci sono lupi d\'ombra su tutti i sentieri. Abbattine sei e ti pago sessanta monete. Non è eroico, ma è onesto.' },
        { id: 'wolves_complete', label: 'Ho abbattuto i lupi.', cond: g => qs(g, 'wolves') === 'active' && (g.S.quests.wolves.progress || 0) >= 6, action: 'wolves_complete', reply: 'Sei. Li ho contati dalle mura. Ecco le tue sessanta monete e... prendi anche questo spallaccio. Non te lo regalo: te lo presto per sempre.' },
        { id: 'legend', label: 'Credi alla leggenda delle Braci?', reply: 'Credo alle cose che posso infilzare. Ma il sole non sorge da quaranta giorni, quindi... va bene, sono aperta a nuove idee.' },
        { id: 'tips', label: 'Consigli per combattere?', reply: 'Quando un nemico carica il colpo vedi un lampo. Giallo: alza lo scudo (tasto destro) proprio mentre colpisce e lo stordisci. Rosso: quello non si para, rotola via (Ctrl o C). E i fuochi fatui? Para le loro sfere al momento giusto e gliele rimandi indietro.' },
      ],
    },
    {
      id: 'ottone', name: 'Ottone', title: 'Gatto (parlante)', x: 8, z: -8, cat: true,
      persona: 'Gatto rosso tigrato che parla. Altezzoso, filosofico, pigro, sarcastico, si considera superiore agli umani ("bipedi"). Sta sempre sul bordo del pozzo. Fa osservazioni sorprendentemente sagge camuffate da lamentele. Vuole un Pesce d\'Argento del Lago delle Nebbie (si pesca dal pontile); in cambio insegnerà il "Passo Felpato" (corri più veloce). Sa molte cose del villaggio perché "i gatti ascoltano, gli umani parlano". Sa che il vecchio guardiano del Faro, Anselmo, non è morto: "ha solo cambiato mantello".',
      greet: g => {
        if (qs(g, 'fish') === 'active' && has(g, 'fish')) return 'Sento odore di Pesce d\'Argento. Non muoverti. Sto decidendo se amarti.';
        if (qs(g, 'fish') === 'done') return 'Ah, il bipede utile. Puoi accarezzarmi. Una volta. Con rispetto.';
        return 'Un altro bipede. Parla pure, ma sappi che ti sto ascoltando solo per noia.';
      },
      topics: [
        { id: 'who', label: 'Un gatto che parla?!', reply: 'Un bipede che ascolta. Ognuno ha i suoi difetti. Mi chiamo Ottone. No, non sono un principe stregato, dillo a quella bambina.' },
        { id: 'fish_accept', label: 'Vuoi qualcosa?', cond: g => qs(g, 'fish') === 'none', action: 'fish_accept', reply: 'Voglio molte cose. Oggi, però, voglio un Pesce d\'Argento del Lago delle Nebbie. Si pesca dal pontile. In cambio ti insegnerò il Passo Felpato: correrai quasi come un gatto. Quasi.' },
        { id: 'fish_complete', label: 'Ecco il tuo pesce.', cond: g => qs(g, 'fish') === 'active' && has(g, 'fish'), action: 'fish_complete', reply: 'Mmmh. Accettabile. Ascolta bene: il segreto del Passo Felpato è smettere di pensare ai piedi. Fatto. Ora corri più veloce. Ora vattene, devo mangiare con dignità.' },
        { id: 'secret', label: 'Sai qualcosa del Faro?', reply: 'Il vecchio Anselmo, il guardiano. Tutti dicono che è morto. I gatti sanno che ha solo cambiato mantello. Va\' al crocevia e guarda bene chi si scalda al fuoco.' },
        { id: 'wisdom', label: 'Un consiglio, gatto?', reply: ['Il buio fa paura solo a chi crede di doverlo vincere. I gatti ci vedono benissimo.', 'Dormi quando puoi, mangia quando puoi, e non fidarti di chi ti offre carezze senza pesce.'] },
      ],
    },
    {
      id: 'viandante', name: 'Il Viandante', title: 'Straniero al crocevia', x: 49, z: -36,
      look: { skin: 0xb89880, cloth: 0x3a3a3a, cloth2: 0x2a2a2a, hood: 0x2a2a30, cape: 0x24242a, staff: true },
      persona: 'Uomo misterioso incappucciato seduto al fuoco del Crocevia. Parla per enigmi, voce stanca. In realtà è Anselmo, il vecchio guardiano del Faro: anni fa si addormentò di guardia e lasciò spegnere il Faro; per vergogna fuggì e da allora il buio è cresciuto. Non rivela subito la sua identità: lo ammette solo se il giocatore lo incalza, se ha già parlato con Ottone, o se il giocatore ha già acceso la Lanterna. Dà consigli preziosi sui guardiani: Zannagrigia è veloce ma si stanca, il Cavaliere para i colpi frontali (meglio la magia, tasto Q), il Golem colpisce il terreno (allontanati quando alza le braccia).',
      greet: g => {
        const q = g.S.quests.main || {};
        if (q.state === 'done') return 'L\'hai fatto. Il Faro brilla... e io posso finalmente riposare.';
        if (q.stage === 'faro') return 'La fiamma ti segue come un cane fedele. Il Faro ti aspetta. Ti aspettava da tanto.';
        return 'Siediti, se vuoi. Il fuoco è di tutti. Le domande, invece, costano.';
      },
      topics: [
        { id: 'who', label: 'Chi sei?', reply: g => (g.S.flags.anselmo ? 'Lo sai già. Anselmo. Un guardiano che ha chiuso gli occhi una notte di troppo.' : 'Uno che ha camminato tanto per tornare al punto di partenza. Chiamami Viandante.') },
        { id: 'reveal', label: 'Sei tu Anselmo, il guardiano del Faro?', cond: g => !g.S.flags.anselmo, action: 'reveal', reply: '...Il gatto, vero? Quel gatto sa sempre tutto. Sì. Sono Anselmo. Una notte mi addormentai di guardia e il Faro si spense. Il buio ha trovato la strada. Per vergogna sono fuggito. Ora tocca a te finire ciò che io non ho saputo fare.' },
        { id: 'alpha', label: 'Come batto Zannagrigia?', reply: 'Il lupo grigio è veloce, ma impaziente. Dopo ogni assalto si ferma a respirare: è lì che devi colpire.' },
        { id: 'knight', label: 'E il Cavaliere Senza Nome?', reply: 'Era un uomo d\'onore, un tempo. Para i colpi di spada che vengono da davanti. Il fuoco, invece, non sa pararlo. Usa la magia (tasto Q).' },
        { id: 'golem', label: 'E il Golem del Lago?', reply: 'Quando alza le braccia, la terra trema. Allontanati, o rotola via. Poi torna e colpisci la sua schiena di pietra.' },
      ],
    },
  ];

  D.barks = {
    tobia: ['La luce tornerà...', 'Pazienza, figliolo.'],
    elda: ['Non calpestare la salvia!', 'Mh, un altro cliente.'],
    bruno: ['Mh.', '*clang* *clang*'],
    mira: ['Ciao forestiero!', 'Hai visto un drago?'],
    sera: ['Occhi aperti.', 'Tutto tranquillo. Per ora.'],
    ottone: ['Miao. Cioè, buonasera.', '*sbadiglia*'],
    viandante: ['Il fuoco è caldo...', 'Siediti, se vuoi.'],
  };

  window.Data = D;
})();
