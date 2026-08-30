/* Draws the miniature hall the cards share.
 *
 * It is generated rather than hand-marked up because the three cards want the same hall at
 * three sizes, and because the matched block has to sit in a plausible place — middle of a
 * middle block, a few rows off the screen — which is fiddly to keep consistent by hand.
 *
 * The layout mirrors what the popup actually draws: three seating blocks with real aisles
 * between them, taken seats present but recessive, free seats in slate, and one run of
 * adjacent free seats in green with a band tying them together.
 *
 * Deterministic: the same seed gives the same hall every render, so re-running the build
 * doesn't quietly change every card.
 */
function drawHall(el, opts) {
  const {
    rows = 9,
    blocks = [4, 12, 4],   // seats per seating block, aisles between
    seat = 10,             // seat side, px
    gap = 3,               // half-gutter between seats, px
    aisle = 18,            // aisle width, px
    match = { row: 5, block: 1, from: 4, len: 4 },  // the run that fired the alert
    freeRate = 0.14,
    seed = 20260806,
  } = opts || {};

  // xorshift — any small deterministic PRNG would do; this one needs no state beyond an int.
  let s = seed;
  const rand = () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };

  el.style.setProperty('--seat', seat + 'px');
  el.style.setProperty('--gap', gap + 'px');
  el.style.setProperty('--aisle', aisle + 'px');

  const pitch = seat + gap * 2;
  const wrap = document.createElement('div');
  wrap.className = 'rows';

  for (let r = 0; r < rows; r++) {
    const row = document.createElement('div');
    row.className = 'row';

    blocks.forEach((count, b) => {
      const blk = document.createElement('div');
      blk.className = 'blk';

      for (let c = 0; c < count; c++) {
        const cell = document.createElement('div');
        cell.className = 'seat';

        const inMatch = r === match.row && b === match.block &&
                        c >= match.from && c < match.from + match.len;

        // Rows nearer the screen (the bottom, as BookMyShow draws it) sell last, so they
        // hold more free seats. Without the gradient the hall reads as noise.
        const nearScreen = r / (rows - 1);
        if (inMatch) cell.classList.add('open');
        else if (rand() < freeRate + nearScreen * 0.18) cell.classList.add('free');

        blk.appendChild(cell);
      }
      row.appendChild(blk);
    });

    if (r === match.row) {
      // Offset of the matched run from the row's left edge: every preceding block's seats,
      // plus its aisle, plus the seats before the run inside its own block.
      let x = 0;
      for (let b = 0; b < match.block; b++) x += blocks[b] * pitch + aisle;
      x += match.from * pitch;

      const band = document.createElement('div');
      band.className = 'band';
      band.style.left = (x + gap - 3) + 'px';
      band.style.width = (match.len * pitch - gap * 2 + 6) + 'px';
      band.style.top = '-3px';
      band.style.height = (pitch + 6) + 'px';
      row.appendChild(band);
    }

    wrap.appendChild(row);
  }

  el.appendChild(wrap);

  const screen = document.createElement('div');
  screen.className = 'screen';
  screen.innerHTML = '<div class="beam"></div><span>SCREEN</span>';
  el.appendChild(screen);
}
