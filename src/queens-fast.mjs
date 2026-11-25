// LinkedIn Queens preparation for the Codex browser runtime.
// Load this file BEFORE entering a timed puzzle. All DOM evaluation is read-only.
// A browser binding is deliberately required: its selectors must first be observed
// in the live Queens page, rather than guessed before the game is opened.
import {isGameResult,confirmGameResult,samePuzzle} from './race-runtime.mjs';

export function normalizeQueens(puzzle) {
  const {n, regions} = puzzle;
  if (!Number.isInteger(n) || n < 4 || n > 16 || !Array.isArray(regions) || regions.length !== n*n) {
    throw new Error('Expected a square Queens board, size 4 to 16');
  }
  const keys = [...new Set(regions)];
  if (keys.length !== n || keys.some(key => key === null || key === undefined || typeof key === 'object')) {
    throw new Error('The number of visible colored regions must equal the board size');
  }
  const regionIds = regions.map(key => keys.indexOf(key));
  const fixed = [...(puzzle.fixedQueens ?? [])];
  const forbidden = new Set(puzzle.forbidden ?? []);
  const validIndex = i => Number.isInteger(i) && i >= 0 && i < n*n;
  if (fixed.some(i => !validIndex(i)) || [...forbidden].some(i => !validIndex(i))) throw new Error('Invalid cell index');
  return {n, regionIds, fixed, forbidden};
}

export function validQueensAnswer(puzzle, answer) {
  const {n, regionIds, fixed, forbidden} = normalizeQueens(puzzle);
  if (!Array.isArray(answer) || answer.length !== n) return false;
  const columns = new Set(), usedRegions = new Set();
  for (let r = 0; r < n; r++) {
    const c = answer[r];
    if (!Number.isInteger(c) || c < 0 || c >= n) return false;
    const i = r*n+c;
    if (columns.has(c) || usedRegions.has(regionIds[i]) || forbidden.has(i)) return false;
    // Only touching diagonals are forbidden. Distant diagonals ARE allowed.
    if (r > 0 && Math.abs(c-answer[r-1]) <= 1) return false;
    columns.add(c); usedRegions.add(regionIds[i]);
  }
  return fixed.every(i => answer[Math.floor(i/n)] === i%n);
}

export function solveQueens(puzzle) {
  const {n, regionIds, fixed, forbidden} = normalizeQueens(puzzle);
  const fixedByRow = new Map();
  for (const index of fixed) {
    const r = Math.floor(index/n), c = index%n;
    if (fixedByRow.has(r) && fixedByRow.get(r) !== c) throw new Error('No valid solution');
    fixedByRow.set(r, c);
  }
  const rowChoices = Array.from({length: n}, (_, r) => Array.from({length: n}, (_, c) => c)
    .filter(c => !forbidden.has(r*n+c) && (!fixedByRow.has(r) || fixedByRow.get(r) === c)));
  const answer = Array(n).fill(-1), solutions = [];
  let nodes = 0;
  function search(usedColumns, usedRegions, placed) {
    if (solutions.length >= 2) return;
    nodes++;
    if (placed === n) { solutions.push([...answer]); return; }
    let selectedRow = -1, selectedChoices = null;
    const remainingColumnPossibilities = new Set(), remainingRegionPossibilities = new Set();
    for (let r = 0; r < n; r++) {
      if (answer[r] !== -1) continue;
      const choices = rowChoices[r].filter(c => {
        const region = regionIds[r*n+c];
        return !(usedColumns & (1 << c)) && !(usedRegions & (1 << region)) &&
          (r === 0 || answer[r-1] === -1 || Math.abs(c-answer[r-1]) > 1) &&
          (r === n-1 || answer[r+1] === -1 || Math.abs(c-answer[r+1]) > 1);
      });
      if (!choices.length) return;
      for (const c of choices) {
        remainingColumnPossibilities.add(c);
        remainingRegionPossibilities.add(regionIds[r*n+c]);
      }
      if (!selectedChoices || choices.length < selectedChoices.length) {
        selectedRow = r; selectedChoices = choices;
      }
    }
    if (remainingColumnPossibilities.size < n-placed || remainingRegionPossibilities.size < n-placed) return;
    for (const c of selectedChoices) {
      answer[selectedRow] = c;
      search(usedColumns | (1 << c), usedRegions | (1 << regionIds[selectedRow*n+c]), placed+1);
      answer[selectedRow] = -1;
      if (solutions.length >= 2) break;
    }
  }
  search(0, 0, 0);
  if (solutions.length !== 1) throw new Error(solutions.length ? 'Puzzle is ambiguous; inspect region mapping' : 'No valid solution');
  if (!validQueensAnswer(puzzle, solutions[0])) throw new Error('Answer validation failed');
  return {columns: solutions[0], queenIndices: solutions[0].map((c, r) => r*n+c), nodes};
}

// Pass only cell elements selected from the observed live page. Region and state
// extraction settings must be confirmed against that page before this is used.
export function readQueensDom(elements, config) {
  const n = Math.sqrt(elements.length);
  if (!Number.isInteger(n) || n < 4 || n > 16) throw new Error('Unexpected Queens cell count');
  const items = elements.map(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) throw new Error('Hidden cell');
    return {el, x: rect.x+rect.width/2, y: rect.y+rect.height/2, w: rect.width, h: rect.height};
  });
  // Establish order from visible grid coordinates, independent of DOM source order.
  items.sort((a, b) => a.y-b.y || a.x-b.x);
  for (let r = 0; r < n; r++) {
    const row = items.slice(r*n, (r+1)*n).sort((a, b) => a.x-b.x);
    if (row.some(cell => Math.abs(cell.y-row[0].y) > row[0].h*0.25)) throw new Error('Unclear row layout');
    items.splice(r*n, n, ...row);
  }
  const cells = items.map(({el}, index) => {
    const regionEl = config.regionElementSelector ? el.querySelector(config.regionElementSelector) : el;
    if (!regionEl) throw new Error('Region element missing');
    let region;
    if (config.regionAttribute) region = regionEl.getAttribute(config.regionAttribute);
    else if (config.useComputedBackground) {
      region = regionEl.ownerDocument.defaultView.getComputedStyle(regionEl).backgroundColor;
      if (['transparent', 'rgba(0, 0, 0, 0)'].includes(region)) throw new Error('Transparent cell background');
    } else throw new Error('Confirm a visible region attribute or background before reading');
    if (region === null || region === '') throw new Error('Region missing');
    let state;
    if (config.stateAttribute) state = el.getAttribute(config.stateAttribute);
    else {
      const labels = [el.getAttribute('aria-label'), ...[...el.querySelectorAll('[aria-label]')]
        .map(node => node.getAttribute('aria-label'))].filter(Boolean);
      const mapped = labels.filter(label => Object.prototype.hasOwnProperty.call(config.stateMap, label));
      const states = [...new Set(mapped.map(label => config.stateMap[label]))];
      if (states.length !== 1) throw new Error(`Unclear cell state at ${index}; inspect labels`);
      state = mapped[0];
    }
    if (!Object.prototype.hasOwnProperty.call(config.stateMap, state)) throw new Error(`Unknown state at ${index}`);
    const mappedState = config.stateMap[state];
    if (!['empty', 'mark', 'queen'].includes(mappedState)) throw new Error('Invalid state mapping');
    // IDs are not assumed; a confirmed per-cell locator can also be supplied later.
    return {index, region, state: mappedState, id: el.id || null};
  });
  if (new Set(cells.map(c => c.region)).size !== n) throw new Error('Wrong region count; inspect colors');
  return {n, regions: cells.map(c => c.region), cells};
}

export function planQueens(board, solution) {
  if (!validQueensAnswer(board, solution.columns)) throw new Error('Invalid answer');
  if (!Array.isArray(board.cells) || board.cells.length !== board.n*board.n) throw new Error('Cell states required');
  const desired = new Set(solution.queenIndices), plan = [];
  if (board.cells.some((cell, i) => cell.index !== i || !['empty', 'mark', 'queen'].includes(cell.state))) throw new Error('Invalid cell states');
  // Existing wrong queens can make auto-X marks change during input. Stop instead
  // of producing a stale sequence; the caller can inspect and correct explicitly.
  if (board.cells.some(cell => cell.state === 'queen' && !desired.has(cell.index))) {
    throw new Error('An existing queen conflicts with the solution; inspect before filling');
  }
  for (const index of solution.queenIndices) {
    const cell = board.cells[index];
    if (cell.state !== 'queen') plan.push({index, clicks: cell.state === 'mark' ? 1 : 2});
  }
  return plan;
}

// Binding is built from the observed page once: {cellSelector, domConfig,
// cellLocator(index, board)}. Never invent live-page selectors before observation.
export async function runQueens(tab, binding, {dryRun = true} = {}) {
  const start = performance.now();
  const board = await tab.playwright.locator(binding.cellSelector).evaluateAll(readQueensDom, binding.domConfig);
  const readAt = performance.now();
  const solution = solveQueens(board);
  const plan = planQueens(board, solution);
  const solvedAt = performance.now();
  if (!dryRun) {
    for (const step of plan) {
      const cell = binding.cellLocator(step.index, board);
      for (let i = 0; i < step.clicks; i++) await cell.click();
    }
  }
  const filledAt = performance.now();
  const state = !dryRun && plan.length ? await tab.getAXState() : null;
  return {dryRun, board, solution, plan, state,
    clicks: plan.reduce((sum, step) => sum+step.clicks, 0),
    timingsMs: {read: readAt-start, solveAndPlan: solvedAt-readAt, input: filledAt-solvedAt}};
}

// Live adapter verified on LinkedIn Queens #898. Accessible cell labels expose
// both color and coordinates, so neither screenshot analysis nor CSS color
// inspection is needed. Keep the original DOM index for subsequent locators.
export function readLinkedInQueensDom(elements) {
  if(!elements.length)return null;
  const n = Math.sqrt(elements.length);
  if (!Number.isInteger(n) || n < 4 || n > 16) throw new Error('Unexpected Queens grid');
  const cells = Array(n*n);
  elements.forEach((el, domIndex) => {
    const label = el.getAttribute('aria-label') ?? '';
    const match = label.match(/^(Empty cell|Cross|Queen) of color (.+), row (\d+), column (\d+)$/);
    if (!match) throw new Error('Cell labels changed; inspect before filling');
    const r = Number(match[3])-1, c = Number(match[4])-1, index = r*n+c;
    if (r < 0 || c < 0 || r >= n || c >= n || cells[index]) throw new Error('Invalid cell coordinates');
    cells[index] = {index, domIndex, region: match[2],
      state: match[1] === 'Queen' ? 'queen' : match[1] === 'Cross' ? 'mark' : 'empty'};
  });
  if (Array.from({length:n*n}, (_,i) => cells[i]).some(cell => !cell)) throw new Error('Incomplete grid');
  if (new Set(cells.map(cell => cell.region)).size !== n) throw new Error('Unexpected region count');
  return {n, regions: cells.map(cell => cell.region), cells};
}

export async function runLinkedInQueens(tab, {dryRun = true,repair=true} = {}) {
  const started = performance.now();
  const cellButtons = tab.playwright.locator('#queens-game-board').getByRole('button');
  const board = await cellButtons.evaluateAll(readLinkedInQueensDom);
  if(!board)throw new Error('Queens board is not visible');
  const readAt = performance.now();
  const solution = solveQueens(board);
  const plan = planQueens(board, solution);
  const solvedAt = performance.now();
  let inputCalls=0,repairCells=0;
  async function fill(steps,current){
    // Double-click placement was verified on #898. Correct solution queens
    // cannot auto-mark another solution position, so this plan remains valid.
    for (const step of steps) {
      const cell = cellButtons.nth(current.cells[step.index].domIndex);
      if (step.clicks === 2) await cell.dblclick();
      else await cell.click();
      inputCalls++;
    }
  }
  if(!dryRun)await fill(plan,board);
  const filledAt = performance.now();
  let state=null,complete=false;
  if(!dryRun){
    state=await tab.getAXState();
    if(repair&&!isGameResult(state,'queens')){
      const current=await cellButtons.evaluateAll(readLinkedInQueensDom);
      if(current){
        if(!samePuzzle(current.regions,board.regions))throw new Error('Queens regions changed during input');
        const pending=planQueens(current,solution);repairCells=pending.length;
        if(pending.length){await fill(pending,current);state=await tab.getAXState();}
      }
    }
    ({state,complete}=await confirmGameResult(tab,'queens',state));
  }
  return {dryRun, board, solution, plan, state,complete,inputCalls,repairCells,
    placementCalls: plan.length,
    timingsMs: {read: readAt-started, solveAndPlan: solvedAt-readAt, input: filledAt-solvedAt,verifyAndRepair:performance.now()-filledAt}};
}
