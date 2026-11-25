import {isGameResult} from './race-runtime.mjs';

export const sumbreakBoard = '[data-numo-rows][data-numo-columns]';

const isNumber = value => Number.isSafeInteger(value) && value > 0;
const isOperator = value => typeof value === 'string' &&
  /^[×+][1-9]\d*$/.test(value) && isNumber(Number(value.slice(1)));

function mergeValue(first, second) {
  if (isNumber(first) && first === second) return first * 2;
  const [number, operator] = isNumber(first) ? [first, second] : [second, first];
  if (!isNumber(number) || !isOperator(operator)) return null;
  const operand = Number(operator.slice(1));
  return operator.startsWith('×') ? number * operand : number + operand;
}

export function solveSumbreak({rows, columns, cells}, {maxStates = 200_000} = {}) {
  if (!Number.isInteger(rows) || !Number.isInteger(columns) ||
      rows < 1 || columns < 1 || rows * columns !== cells.length ||
      cells.some(value => value !== 0 && !isNumber(value) && !isOperator(value))) {
    throw new Error('Invalid Sumbreak board');
  }

  const board = [...cells];
  const neighbors = board.map((_, index) => [
    index >= columns ? index - columns : -1,
    index + columns < board.length ? index + columns : -1,
    index % columns > 0 ? index - 1 : -1,
    index % columns < columns - 1 ? index + 1 : -1,
  ].filter(next => next >= 0));
  const deadEnds = new Set();
  const moves = [];
  let visited = 0;

  function tryPair(first, second, remaining) {
    const firstValue = board[first], secondValue = board[second];
    const result = mergeValue(firstValue, secondValue);
    if (!isNumber(result)) return false;

    for (const [from, to] of [[first, second], [second, first]]) {
      moves.push({from, to, value: board[from]});
      board[from] = 0;
      board[to] = result;
      if (search(remaining - 1)) return true;
      moves.pop();
      board[first] = firstValue;
      board[second] = secondValue;
    }
    return false;
  }

  function search(remaining) {
    if (remaining === 1) return board.some(isNumber);
    const key = board.join(',');
    if (deadEnds.has(key)) return false;
    if (++visited > maxStates) throw new Error('Sumbreak search limit reached');

    if (board.some(isOperator)) {
      // A wildcard can change which numbers can be paired. Try every
      // adjacent pair, keeping the two possible destinations distinct.
      for (let index = 0; index < board.length; index++) {
        if (!board[index]) continue;
        for (const partner of neighbors[index]) {
          if (partner > index && tryPair(index, partner, remaining)) return true;
        }
      }
    } else {
      // With numbers alone the smallest tile must merge with an existing
      // equal neighbor. Its eventual merge can precede disjoint moves.
      let smallest = Infinity;
      let pivot = -1;
      let partners = [];
      for (let index = 0; index < board.length; index++) {
        const value = board[index];
        if (!value || value > smallest) continue;
        const equalNeighbors = neighbors[index].filter(next => board[next] === value);
        if (value < smallest || equalNeighbors.length < partners.length) {
          smallest = value;
          pivot = index;
          partners = equalNeighbors;
        }
      }
      for (const partner of partners) {
        if (tryPair(pivot, partner, remaining)) return true;
      }
    }
    deadEnds.add(key);
    return false;
  }

  const remaining = board.filter(Boolean).length;
  if (!remaining || !search(remaining)) return null;
  return {moves, finalValue: board.find(Boolean), visited};
}

async function readBoard(tab) {
  const snapshot = await tab.playwright.locator(sumbreakBoard).evaluate(board => ({
    rows: Number(board.getAttribute('data-numo-rows')),
    columns: Number(board.getAttribute('data-numo-columns')),
    tiles: Array.from(board.querySelectorAll('[data-numo-index] > button[data-numo-kind]'))
      .filter(tile => tile.getBoundingClientRect().width > 0)
      .map(tile => {
        const rect = tile.getBoundingClientRect();
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;
        const viewport = tile.ownerDocument.documentElement;
        return {
          index: Number(tile.parentElement.getAttribute('data-numo-index')),
          label: tile.getAttribute('aria-label'),
          selected: tile.getAttribute('aria-pressed') === 'true',
          disabled: tile.getAttribute('aria-disabled') === 'true' || tile.hasAttribute('disabled'),
          center: x >= 0 && y >= 0 && x < viewport.clientWidth && y < viewport.clientHeight
            ? [x, y] : null,
        };
      }),
  }));
  const {rows, columns, tiles} = snapshot;
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1 ||
      rows * columns > 100 || !tiles.length) throw new Error('Sumbreak board has not loaded');
  const cells = Array(rows * columns).fill(0);
  let selected = null;
  for (const tile of tiles) {
    const match = /^(.*?), row (\d+), column (\d+)$/.exec(tile.label);
    const row = Number(match?.[2]);
    const column = Number(match?.[3]);
    if (!match || row < 1 || row > rows || column < 1 || column > columns ||
        tile.index !== (row - 1) * columns + column - 1 ||
        tile.index < 0 || tile.index >= cells.length || cells[tile.index]) {
      throw new Error('Unrecognized Sumbreak tile');
    }
    const label = match[1];
    const plain = /^Number ([\d,]+)$/.exec(label);
    const multiply = /^Multiply by ([\d,]+)$/.exec(label);
    const add = /^Add ([\d,]+)$/.exec(label);
    const digits = (plain?.[1] ?? multiply?.[1] ?? add?.[1])?.replaceAll(',', '');
    const value = multiply ? `×${digits}` : add ? `+${digits}` : Number(digits);
    if (!isNumber(value) && !isOperator(value)) throw new Error(`Unrecognized Sumbreak tile: ${label}`);
    cells[tile.index] = value;
    if (tile.selected) selected = tile.index;
  }
  return {rows, columns, cells, tiles, selected};
}

async function playMoves(tab, board, moves, clickTile, inputMode) {
  let current = board;
  let retries = 0;
  let coordinateMoves = 0;
  const expected = [...board.cells];
  const sameCells = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);

  for (const [index, {from, to}] of moves.entries()) {
    const source = expected[from], target = expected[to];
    const after = [...expected];
    after[from] = 0;
    after[to] = mergeValue(source, target);
    const lastMove = index === moves.length - 1;
    let merged = false;
    let usedCoordinates = false;
    for (let attempt = 0; attempt < 3 && inputMode === 'auto' && typeof tab.click === 'function'; attempt++) {
      const center = i => current.tiles.find(tile => tile.index === i)?.center;
      if (current.selected !== null && current.selected !== from) break;
      if (!center(from) || !center(to) || current.tiles.some(tile =>
        (tile.index === from || (current.selected === from && tile.index === to)) && tile.disabled)) break;

      try {
        if (current.selected !== from) await tab.click(center(from));
        await tab.click(center(to));
        usedCoordinates = true;
      } catch {
        // A coordinate action can be unavailable on a DOM-only tab.
      }

      try {
        current = await readBoard(tab);
      } catch (error) {
        if (lastMove && (await tab.url()).includes('/games/sumbreak/results/')) {
          return {coordinateMoves: coordinateMoves + Number(usedCoordinates), retries};
        }
        throw error;
      }
      if (sameCells(current.cells, after)) {
        coordinateMoves++;
        merged = true;
        break;
      }
      if (!sameCells(current.cells, expected)) throw new Error('Sumbreak board changed during input');
      if (!usedCoordinates) break;
      retries++;
    }

    if (!merged) {
      if (current.selected !== from) {
        if (current.selected !== null) await clickTile(board, current.selected, current.cells[current.selected]);
        await clickTile(board, from, source);
      }
      await clickTile(board, to, target);
      if (!lastMove && inputMode === 'auto' && typeof tab.click === 'function') {
        current = await readBoard(tab);
        if (!sameCells(current.cells, after)) throw new Error('Sumbreak click did not apply the planned merge');
      } else {
        current = {...current, selected: null};
      }
    }
    expected[from] = 0;
    expected[to] = after[to];
  }
  return {coordinateMoves, retries};
}

export async function runSumbreak(tab, {dryRun = true, inputMode = 'auto'} = {}) {
  const tileAt = (board, index, value) => {
    const row = Math.floor(index / board.columns) + 1;
    const column = index % board.columns + 1;
    // Both the value and position are checked before each click. A missed
    // merge cannot silently apply an obsolete plan to a changed board.
    const selector = `${sumbreakBoard} [data-numo-index="${index}"] > button[data-numo-kind]`;
    const operand = isOperator(value) ? Number(value.slice(1)) : value;
    const amounts = new Set([String(operand), operand.toLocaleString('en-US')]);
    const labels = [...amounts].map(amount => {
      if (isNumber(value)) return `Number ${amount}`;
      if (value.startsWith('×')) return `Multiply by ${amount}`;
      return `Add ${amount}`;
    });
    return tab.playwright.locator(labels.map(label =>
      `${selector}[aria-label="${label}, row ${row}, column ${column}"]`
    ).join(', '));
  };
  const clickTile = (board, index, value) => tileAt(board, index, value).click({timeout: 1500});

  let state = await tab.getAXState();
  if (isGameResult(state, 'sumbreak')) return {complete: true, alreadyCompleted: true, state};
  let board = await readBoard(tab);
  const instruction = /Merge row (\d+), column (\d+) into row (\d+), column (\d+)\./;
  let guide = instruction.exec(state);
  while (guide && !dryRun) {
    const indexAt = (row, column) => (Number(row) - 1) * board.columns + (Number(column) - 1);
    const from = indexAt(guide[1], guide[2]);
    const to = indexAt(guide[3], guide[4]);
    if (board.selected !== from) await tileAt(board, from, board.cells[from]).click({timeout: 1500});
    await tileAt(board, to, board.cells[to]).click({timeout: 1500});
    state = await tab.getAXState();
    if (isGameResult(state, 'sumbreak')) return {complete: true, state};
    const next = await readBoard(tab);
    if (next.cells.filter(Boolean).length >= board.cells.filter(Boolean).length)
      throw new Error('Sumbreak tutorial merge was not applied');
    board = next;
    guide = instruction.exec(state);
  }

  const solution = solveSumbreak(board);
  if (!solution) throw new Error('No Sumbreak solution found for the visible board');
  if (dryRun) return {complete: false, dryRun, board, solution};

  const inputStart = performance.now();
  const input = await playMoves(tab, board, solution.moves, clickTile, inputMode);
  input.elapsedMs = Math.round(performance.now() - inputStart);

  let latest = await tab.getAXState();
  if (!isGameResult(latest, 'sumbreak')) {
    try {
      await tab.playwright.waitForURL('**/games/sumbreak/results/**', {waitUntil: 'commit', timeout: 8000});
    } catch {}
    latest = await tab.getAXState();
  }
  return {complete: isGameResult(latest, 'sumbreak'), state: latest, board, solution, input};
}
