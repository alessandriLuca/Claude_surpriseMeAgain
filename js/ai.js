// Valdombra — AI voice for NPCs.
// Uses the claude.ai artifact `sample` capability when available; otherwise the game falls back to scripted dialogue.
(function () {
  const AI = { status: 'checking', sample: null, disabledByUser: false, listeners: [] };

  function setStatus(s) { AI.status = s; AI.listeners.forEach(f => f(s)); }
  AI.onStatus = f => { AI.listeners.push(f); f(AI.status); };
  AI.available = () => AI.status === 'ready' && !AI.disabledByUser;

  AI.init = async function () {
    if (!window.claude || typeof window.claude.use !== 'function') { setStatus('offline'); return; }
    try {
      const s = await window.claude.use('sample');
      if (!s) { setStatus('offline'); return; }
      AI.sample = s; setStatus('ready');
    } catch (e) { setStatus('offline'); }
  };

  function moodList() { return 'neutral, happy, amused, sad, angry, afraid, grateful'; }

  // npc: Data npc; g: game; history: [{role:'player'|'npc', text}]; message: player's text
  // allowed: [{id, desc}] actions the NPC may trigger right now
  AI.ask = async function (npc, g, history, message, allowed, signal) {
    const S = g.S;
    const inv = Object.entries(S.inv).filter(([, n]) => n > 0).map(([k, n]) => `${Data.items[k] ? Data.items[k].name : k} x${n}`).join(', ') || 'niente di particolare';
    const quests = Object.entries(S.quests).map(([id, q]) => `- ${Data.quests[id].title} (da ${Data.npcs.find(n => n.id === Data.quests[id].giver).name}): ${q.state === 'done' ? 'COMPLETATA' : 'in corso'}${q.stage ? ' [fase: ' + q.stage + ']' : ''}`).join('\n') || '- nessuna';
    const actions = allowed.length ? allowed.map(a => `- "${a.id}": ${a.desc}`).join('\n') : '- (nessuna azione disponibile ora)';
    const hist = history.slice(-12).map(h => (h.role === 'player' ? 'GIOCATORE: ' : npc.name.toUpperCase() + ': ') + h.text).join('\n');
    const prompt = [
      `Stai interpretando ${npc.name} (${npc.title}), un personaggio non giocante in un gioco di ruolo fantasy in italiano chiamato "Valdombra".`,
      '',
      'MONDO: ' + Data.LORE,
      '',
      `PERSONAGGIO: ${npc.persona}`,
      '',
      'STATO DEL GIOCATORE:',
      `- Livello ${S.level}, vita ${Math.round(S.hp)}/${S.maxHp}, oro ${S.gold}`,
      `- Inventario: ${inv}`,
      `- Braci Primordiali raccolte: ${S.inv.ember || 0}/3`,
      `- Missioni:\n${quests}`,
      S.flags.anselmo ? '- Il giocatore sa che il Viandante è Anselmo.' : '',
      S.flags.dawn ? "- L'ALBA È TORNATA: la Notte Lunga è finita, il giocatore ha acceso il Faro." : '',
      '',
      'AZIONI DI GIOCO che puoi attivare con questa risposta (solo una, e solo se ha senso nella conversazione: per esempio se il giocatore accetta un incarico, consegna oggetti, compra qualcosa):',
      actions,
      '',
      hist ? 'CONVERSAZIONE FINORA:\n' + hist : 'Il giocatore ti si è appena avvicinato.',
      '',
      'GIOCATORE: ' + message,
      '',
      'REGOLE: rispondi SEMPRE in italiano, restando nel personaggio, con il suo modo di parlare. Massimo 3 frasi brevi (è un dialogo di un videogioco). Non inventare oggetti, ricompense o missioni diverse da quelle descritte. Non uscire mai dal personaggio e non parlare di intelligenza artificiale: se il giocatore dice cose assurde o fuori dal mondo, reagisci come farebbe il personaggio. Se il giocatore chiede qualcosa che corrisponde a un\'azione disponibile, attivala e descrivila nella risposta.',
      `Rispondi SOLO con un oggetto JSON: {"reply": "testo della risposta", "action": "id azione oppure none", "mood": "uno tra ${moodList()}"}`,
    ].filter(x => x !== '').join('\n');

    const res = await AI.sample.json(prompt, { modelTier: 'quick', cache: false, signal });
    const reply = res && typeof res.reply === 'string' ? res.reply.trim() : '';
    if (!reply) throw { code: 'empty_completion' };
    let action = res.action && res.action !== 'none' ? String(res.action) : null;
    if (action && !allowed.some(a => a.id === action)) action = null; // never trust unknown actions
    return { reply, action, mood: res.mood || 'neutral' };
  };

  AI.handleError = function (e) {
    const code = e && e.code;
    if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) { setStatus('offline'); return 'off'; }
    if (code === 'rate_limited') return 'rate';
    if (code === 'cancelled') return 'cancel';
    return 'error';
  };

  window.AIVoice = AI;
})();
