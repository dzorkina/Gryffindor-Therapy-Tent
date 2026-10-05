'use strict';

(() => {
  const cards = Array.from({ length: 21 }, (_, i) => `assets/cards/lion-${String(i + 1).padStart(2, '0')}.webp`);
  const byId = (id) => document.getElementById(id);
  const entrance = byId('entrance');
  const tent = byId('tent');
  const enterButton = byId('enter');
  const deck = byId('deck');
  const stage = byId('stage');
  const card = byId('card');
  const front = byId('lion-card');
  const backSide = card.querySelector('.card-back');
  const frontSide = card.querySelector('.card-front');
  const nextButton = byId('next');
  const error = byId('error');
  const status = byId('status');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let state = 'entrance';
  let pile = [];
  let current = null;
  let lastCard = null;

  const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, reduceMotion.matches ? 0 : milliseconds));
  const announce = (text) => { status.textContent = text; };
  const getState = () => ({ state, cardRevealed: state === 'face-up' });

  function refillPile() {
    pile = [...cards];
    for (let i = pile.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pile[i], pile[j]] = [pile[j], pile[i]];
    }
    // A new shuffle must not repeat the card that just left the table.
    if (pile[pile.length - 1] === lastCard) {
      [pile[0], pile[pile.length - 1]] = [pile[pile.length - 1], pile[0]];
    }
  }

  async function loadCard(src) {
    const image = new Image();
    const loaded = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Card image could not load'));
    });
    image.src = src;
    await loaded;
    if (image.decode) await image.decode();
    front.src = src;
    if (front.decode) await front.decode();
  }

  async function enterTent() {
    if (state !== 'entrance') throw new Error('The tent is already open.');
    state = 'opening';
    enterButton.disabled = true;
    entrance.inert = true;
    entrance.classList.add('is-leaving');
    tent.hidden = false;
    // Flush the initial opacity before starting both curtain transitions.
    void tent.offsetWidth;
    document.body.classList.add('entered');
    await pause(1650);
    entrance.hidden = true;
    state = 'ready';
    deck.focus({ preventScroll: true });
    announce('Шатёр открыт. Нажми на колоду, чтобы вытянуть карту.');
    return getState();
  }

  async function dealCard() {
    if (state !== 'ready' && state !== 'face-up') throw new Error('Wait until the current action finishes.');
    const previousState = state;
    state = 'dealing';
    error.hidden = true;
    nextButton.hidden = true;
    nextButton.disabled = true;
    deck.disabled = true;
    card.disabled = true;

    if (previousState === 'face-up') {
      card.classList.add('is-removing');
      await pause(450);
      card.hidden = true;
      card.classList.remove('is-removing', 'is-flipped');
    }

    if (!pile.length) refillPile();
    const chosen = pile.pop();
    try {
      await loadCard(chosen);
    } catch {
      pile.push(chosen);
      card.hidden = true;
      stage.classList.remove('has-card');
      current = null;
      state = 'ready';
      deck.disabled = false;
      error.textContent = 'Карта не загрузилась. Нажми на колоду ещё раз.';
      error.hidden = false;
      deck.focus({ preventScroll: true });
      return getState();
    }

    current = chosen;
    lastCard = chosen;
    card.classList.remove('is-flipped');
    card.setAttribute('aria-label', 'Перевернуть карту');
    backSide.removeAttribute('aria-hidden');
    frontSide.setAttribute('aria-hidden', 'true');
    stage.classList.add('has-card');
    card.hidden = false;
    card.classList.add('is-dealing');
    await pause(700);
    card.classList.remove('is-dealing');
    card.disabled = false;
    state = 'face-down';
    card.focus({ preventScroll: true });
    announce('Карта лежит рубашкой вверх. Нажми на неё, чтобы перевернуть.');
    return getState();
  }

  async function flipCard() {
    if (state !== 'face-down') throw new Error('Draw a face-down card before flipping it.');
    state = 'flipping';
    card.disabled = true;
    card.classList.add('is-flipped');
    await pause(850);
    state = 'face-up';
    backSide.setAttribute('aria-hidden', 'true');
    frontSide.removeAttribute('aria-hidden');
    card.setAttribute('aria-label', 'Открытая карта с изображением льва');
    nextButton.hidden = false;
    nextButton.disabled = false;
    nextButton.focus({ preventScroll: true });
    announce('Карта открыта. Можно вытянуть ещё.');
    return getState();
  }

  enterButton.addEventListener('click', () => { if (state === 'entrance') void enterTent(); });
  deck.addEventListener('click', () => { if (state === 'ready') void dealCard(); });
  card.addEventListener('click', () => { if (state === 'face-down') void flipCard(); });
  nextButton.addEventListener('click', () => { if (state === 'face-up') void dealCard(); });

  // Preload a few faces without revealing them or delaying the entrance.
  const warmImages = cards.slice(0, 3).map((src) => { const image = new Image(); image.src = src; return image; });
  void warmImages;

  // Optional browser agent support: the same actions as the visible buttons.
  const context = document.modelContext;
  if (context?.registerTool) {
    const lifecycle = new AbortController();
    const actions = [
      ['enter_tent', 'Войти в шатёр', 'Open the curtain entrance to the tent.', enterTent],
      ['draw_card', 'Вытянуть карту', 'Draw a random face-down card. Available when the table is empty or after a card is revealed.', dealCard],
      ['flip_card', 'Перевернуть карту', 'Reveal the current face-down lion card.', flipCard],
    ];
    for (const [name, title, description, action] of actions) {
      try {
        Promise.resolve(context.registerTool({
          name, title, description,
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input) {
            if (input === null || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) {
              throw new Error('Expected an empty object.');
            }
            return action();
          },
        }, { signal: lifecycle.signal })).catch(() => {});
      } catch { /* The site also works without browser agent support. */ }
    }
    window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  }
})();
