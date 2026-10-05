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
  const turner = byId('card-turner');
  const backSide = card.querySelector('.card-back');
  const frontSide = card.querySelector('.card-front');
  const nextButton = byId('next');
  const error = byId('error');
  const status = byId('status');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let state = 'entrance';
  let pile = [];
  let lastCard = null;
  let keyboardInput = false;

  const announce = (text) => { status.textContent = text; };
  const getState = () => ({ state, cardRevealed: state === 'face-up' });
  const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const focusForKeyboard = (element) => { if (keyboardInput) element.focus({ preventScroll: true }); };
  document.addEventListener('keydown', () => { keyboardInput = true; });
  document.addEventListener('pointerdown', () => { keyboardInput = false; }, { passive: true });

  async function motion(element, frames, duration, easing = 'ease-in-out', finalStyles = {}) {
    if (!element.animate) {
      const lastFrame = frames[frames.length - 1];
      Object.assign(element.style, lastFrame, finalStyles);
      return;
    }
    const animation = element.animate(frames, { duration, easing, fill: 'both' });
    try { await animation.finished; } catch { /* A canceled animation still reaches a usable state. */ }
    Object.assign(element.style, finalStyles);
    animation.cancel();
  }

  function sizeDeck() {
    if (tent.hidden) return;
    const width = parseFloat(getComputedStyle(deck).width);
    const cardWidth = parseFloat(getComputedStyle(card).width);
    if (width > 0) stage.style.setProperty('--deck-scale', String(Math.min(2.2, cardWidth / width)));
  }
  if (window.ResizeObserver) new ResizeObserver(sizeDeck).observe(stage);
  else window.addEventListener('resize', sizeDeck, { passive: true });

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
    window.scrollTo(0, 0);
    sizeDeck();
    await nextPaint();
    const limited = reduceMotion.matches;
    document.body.classList.toggle('motion-limited', limited);
    document.body.classList.add('entered');
    const curtainMotion = limited
      ? motion(document.querySelector('.curtains'), [{ opacity: 1 }, { opacity: 0 }], 650)
      : Promise.all([
        motion(document.querySelector('.curtain-left'), [{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(-89%,0,0)' }], 1650, 'cubic-bezier(.42,0,.2,1)'),
        motion(document.querySelector('.curtain-right'), [{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(89%,0,0)' }], 1650, 'cubic-bezier(.42,0,.2,1)'),
      ]);
    await Promise.all([
      curtainMotion,
      motion(entrance, [{ opacity: 1 }, { opacity: 0 }], 400, 'ease-in-out', { opacity: '0' }),
      motion(tent, [{ opacity: 0 }, { opacity: 1 }], limited ? 650 : 1100),
    ]);
    entrance.hidden = true;
    state = 'ready';
    focusForKeyboard(deck);
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
      const frames = reduceMotion.matches
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ opacity: 1, transform: 'translate3d(0,0,0)' }, { opacity: 0, transform: 'translate3d(0,-10px,0)' }];
      await motion(card, frames, 350, 'ease-in-out', { opacity: '0' });
      card.hidden = true;
      card.classList.remove('is-flipped');
      card.style.opacity = '';
    }

    if (!pile.length) refillPile();
    const chosen = pile.pop();
    try {
      await loadCard(chosen);
    } catch {
      pile.push(chosen);
      card.hidden = true;
      stage.classList.remove('has-card');
      state = 'ready';
      deck.disabled = false;
      error.textContent = 'Карта не загрузилась. Нажми на колоду ещё раз.';
      error.hidden = false;
      focusForKeyboard(deck);
      return getState();
    }

    lastCard = chosen;
    card.classList.remove('is-flipped');
    card.setAttribute('aria-label', 'Перевернуть карту');
    backSide.removeAttribute('aria-hidden');
    frontSide.setAttribute('aria-hidden', 'true');
    // Move the deck once, using only a transform. Both card slots already exist.
    if (!stage.classList.contains('has-card')) {
      const start = getComputedStyle(deck).transform;
      if (reduceMotion.matches) {
        await motion(deck, [{ opacity: 1 }, { opacity: 0 }], 180, 'ease-in', { opacity: '0' });
        stage.classList.add('has-card');
        await motion(deck, [{ opacity: 0 }, { opacity: 1 }], 260, 'ease-out', { opacity: '' });
      } else {
        stage.classList.add('has-card');
        await motion(deck, [{ transform: start }, { transform: 'translate3d(0,0,0) rotate(-7deg)' }], 650, 'cubic-bezier(.42,0,.2,1)');
      }
    }
    card.hidden = false;
    const dealFrames = reduceMotion.matches
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translate3d(-28px,0,0)' }, { opacity: 1, transform: 'translate3d(0,0,0)' }];
    await motion(card, dealFrames, reduceMotion.matches ? 320 : 650, 'cubic-bezier(.42,0,.2,1)');
    card.disabled = false;
    state = 'face-down';
    focusForKeyboard(card);
    announce('Карта лежит рубашкой вверх. Нажми на неё, чтобы перевернуть.');
    return getState();
  }

  async function flipCard() {
    if (state !== 'face-down') throw new Error('Draw a face-down card before flipping it.');
    state = 'flipping';
    card.disabled = true;
    if (reduceMotion.matches) {
      await motion(turner, [{ opacity: 1 }, { opacity: 0 }], 180, 'ease-in', { opacity: '0' });
      card.classList.add('is-flipped');
      await motion(turner, [{ opacity: 0 }, { opacity: 1 }], 280, 'ease-out', { opacity: '' });
    } else {
      // Swap faces at the narrowest point: no nested 3D layers or reverse flip.
      await motion(turner, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], 360, 'ease-in', { transform: 'scaleX(0)' });
      card.classList.add('is-flipped');
      await motion(turner, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], 440, 'ease-out', { transform: '' });
    }
    state = 'face-up';
    backSide.setAttribute('aria-hidden', 'true');
    frontSide.removeAttribute('aria-hidden');
    card.setAttribute('aria-label', 'Открытая карта с изображением льва');
    nextButton.hidden = false;
    nextButton.disabled = false;
    focusForKeyboard(nextButton);
    await motion(nextButton, [{ opacity: 0 }, { opacity: 1 }], 250);
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
