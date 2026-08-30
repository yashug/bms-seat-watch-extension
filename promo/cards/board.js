/**
 * Draws the cinema board: the film being watched, and your cinemas with one of
 * them open. Shared by all three release cards so a change to the story cannot
 * land on one size and not the others.
 */
function drawBoard(el, { film = 'Ramba Oorvasi Menaka', cinemas } = {}) {
  const rows = cinemas || [
    { name: 'ALLU Cinemas: Kokapet', open: true },
    { name: 'AMB Cinemas: Gachibowli', open: false },
    { name: 'PVR: Preston, Gachibowli', open: false },
  ];
  el.innerHTML =
    `<div class="board__film"><span>${film}</span><span class="board__bell">🔔</span></div>` +
    rows.map((c) => `<div class="board__row${c.open ? ' is-open' : ''}">
        <span class="board__name">${c.name}</span>
        <span class="board__state${c.open ? ' is-open' : ''}">${c.open ? 'Book now' : 'not yet'}</span>
      </div>`).join('');
}
