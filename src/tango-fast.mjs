// For the Codex browser runtime. All page evaluation is read-only.
// Load before entering a fresh puzzle, then call runTango(linkedin, {dryRun:false}).
import {isGameResult,confirmGameResult} from './race-runtime.mjs';

export function readTangoDom(elements) {
  const ordered = [...elements].sort((a, b) => Number(a.dataset.cellIdx) - Number(b.dataset.cellIdx));
  const n = Math.sqrt(ordered.length);
  if (!Number.isInteger(n) || n < 4 || n > 10 || n % 2) throw new Error('Unsupported grid size');
  const rectangles = ordered.map(el => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) throw new Error('Grid is not visible');
    return {x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height};
  });
  const edges = [];
  const cells = ordered.map((el, i) => {
    if (Number(el.dataset.cellIdx) !== i) throw new Error('Unexpected cell order');
    const images = [...el.querySelectorAll('svg[aria-label]')];
    const labels = images.map(image => image.getAttribute('aria-label'));
    const symbol = labels.find(label => ['Sun', 'Moon', 'Empty'].includes(label));
    if (!symbol) throw new Error(`Unknown symbol in cell ${i}`);
    for (const image of images) {
      const label = image.getAttribute('aria-label');
      if (!['Cross', 'Equal'].includes(label)) continue;
      const r = image.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      const neighbors = [i - n, i + n];
      if (i % n > 0) neighbors.push(i - 1);
      if (i % n < n - 1) neighbors.push(i + 1);
      const candidates = neighbors.filter(j => j >= 0 && j < n * n).map(j => ({
        j,
        distance: Math.hypot(x - (rectangles[i].x + rectangles[j].x) / 2,
          y - (rectangles[i].y + rectangles[j].y) / 2),
      })).sort((a, b) => a.distance - b.distance);
      if (!candidates.length || candidates[0].distance > Math.min(rectangles[i].w, rectangles[i].h) * 0.3) {
        throw new Error(`Unclear relation direction in cell ${i}`);
      }
      edges.push({a: i, b: candidates[0].j, equal: label === 'Equal'});
    }
    const fixed = el.getAttribute('aria-disabled') === 'true';
    if (fixed && symbol === 'Empty') throw new Error('Empty fixed cell');
    return {index: i, fixed, value: symbol === 'Sun' ? 1 : symbol === 'Moon' ? 0 : null};
  });
  return {n, cells, edges};
}

const patternCache = new Map();
export function prepareTango(n = 6) {
  if (patternCache.has(n)) return patternCache.get(n);
  if (!Number.isInteger(n) || n < 4 || n > 10 || n % 2) throw new Error('Unsupported grid size');
  const patterns = [];
  for (let bits = 0; bits < 2 ** n; bits++) {
    const row = Array.from({length: n}, (_, c) => (bits >> c) & 1);
    if (row.reduce((sum, value) => sum + value, 0) !== n / 2) continue;
    if (row.some((v, c) => c > 1 && v === row[c - 1] && v === row[c - 2])) continue;
    patterns.push(row);
  }
  patternCache.set(n, patterns);
  return patterns;
}

export function solveTango(puzzle) {
  const {n, cells, edges} = puzzle;
  if (cells.length !== n * n || cells.some((c, i) => c.index !== i || ![null, 0, 1].includes(c.value))) {
    throw new Error('Malformed grid');
  }
  for (const {a, b, equal} of edges) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n*n || b >= n*n ||
      typeof equal !== 'boolean' || !(Math.abs(a-b) === n || (Math.abs(a-b) === 1 && Math.floor(a/n) === Math.floor(b/n)))) {
      throw new Error('Malformed relation');
    }
  }
  const candidates = Array.from({length: n}, (_, r) => prepareTango(n).filter(row =>
    row.every((v, c) => !cells[r*n+c].fixed || cells[r*n+c].value === v)));
  const edgesAtRow = Array.from({length: n}, () => []);
  for (const edge of edges) edgesAtRow[Math.floor(Math.max(edge.a, edge.b) / n)].push(edge);
  const board = [], totals = Array(n).fill(0), solutions = [];
  function search(r) {
    if (solutions.length >= 2) return;
    if (r === n) { solutions.push([...board]); return; }
    for (const row of candidates[r]) {
      if (row.some((v, c) => totals[c] + v > n/2 || totals[c] + v + n-r-1 < n/2 ||
        (r > 1 && v === board[(r-1)*n+c] && v === board[(r-2)*n+c]))) continue;
      board.push(...row);
      if (!edgesAtRow[r].some(({a, b, equal}) => (board[a] === board[b]) !== equal)) {
        row.forEach((v, c) => { totals[c] += v; });
        search(r+1);
        row.forEach((v, c) => { totals[c] -= v; });
      }
      board.length = r*n;
      if (solutions.length >= 2) break;
    }
  }
  search(0);
  if (solutions.length !== 1) throw new Error(solutions.length ? 'Puzzle is ambiguous; stop and inspect' : 'No valid solution; stop and inspect');
  return solutions[0];
}

export function planTango(puzzle, answer) {
  if (answer.length !== puzzle.cells.length || answer.some(v => ![0, 1].includes(v))) throw new Error('Malformed answer');
  const plan = [];
  for (const cell of puzzle.cells) {
    const target = answer[cell.index];
    if (cell.fixed) {
      if (cell.value !== target) throw new Error('Answer conflicts with a fixed cell');
      continue;
    }
    // Observed cycle: Empty -> Sun -> Moon -> Empty.
    const currentStage = cell.value === null ? 0 : cell.value === 1 ? 1 : 2;
    const targetStage = target === 1 ? 1 : 2;
    const clicks = (targetStage - currentStage + 3) % 3;
    if (clicks) plan.push({index: cell.index, clicks});
  }
  return plan;
}

export function readTangoProgressDom(elements){
  if(!elements.length)return null;
  return [...elements].map(el=>{
    const labels=[...el.querySelectorAll('svg[aria-label]')].map(e=>e.getAttribute('aria-label'));
    const symbol=labels.find(label=>['Sun','Moon','Empty'].includes(label));
    if(!symbol)throw new Error('Unrecognized Tango cell');
    return {index:Number(el.dataset.cellIdx),fixed:el.getAttribute('aria-disabled')==='true',
      value:symbol==='Sun'?1:symbol==='Moon'?0:null};
  }).sort((a,b)=>a.index-b.index);
}

export async function runTango(tab, {dryRun = true, twoClickMode = 'auto',repair=true} = {}) {
  if (!['auto', 'single', 'double'].includes(twoClickMode)) throw new Error('Unknown two-click mode');
  const started = performance.now();
  const puzzle = await tab.playwright.locator('[id^="tango-cell-"][data-cell-idx]').evaluateAll(readTangoDom);
  const readAt = performance.now();
  const answer = solveTango(puzzle);
  const plan = planTango(puzzle, answer);
  const solvedAt = performance.now();
  let inputCalls=0,repairCells=0,probeReads=0;
  let effectiveTwoClickMode=twoClickMode==='double'?'double':'single';
  let doubleClickProbe=twoClickMode==='auto'?'not-needed':'disabled';
  async function readProgress(){
    const cells=await tab.playwright.locator('[id^="tango-cell-"][data-cell-idx]').evaluateAll(readTangoProgressDom);
    if(cells&&(cells.length!==puzzle.cells.length||cells.some((c,i)=>c.index!==i||c.fixed!==puzzle.cells[i].fixed||c.fixed&&c.value!==puzzle.cells[i].value)))throw new Error('Tango board changed during input');
    return cells;
  }
  async function fill(steps,mode=effectiveTwoClickMode){
    for (const step of steps) {
      const cell = tab.playwright.locator(`#tango-cell-${step.index}`);
      if (step.clicks === 2 && mode === 'double'){await cell.dblclick();inputCalls++;}
      else for (let j = 0; j < step.clicks; j++){await cell.click();inputCalls++;}
    }
  }
  if(!dryRun){
    let pending=plan;
    // Test one required two-click transition before applying double-clicks to
    // the rest. Read actual symbols; never infer support from another game.
    const probe=twoClickMode==='auto'?plan.find(step=>step.clicks===2):null;
    if(probe){
      await tab.playwright.locator(`#tango-cell-${probe.index}`).dblclick();inputCalls++;
      const cells=await readProgress();probeReads++;
      if(cells){
        const changedElsewhere=cells.some((c,i)=>i!==probe.index&&c.value!==puzzle.cells[i].value);
        if(changedElsewhere)throw new Error('Unexpected Tango changes during double-click probe');
        const supported=cells[probe.index].value===answer[probe.index];
        doubleClickProbe=supported?'verified':'fallback';
        effectiveTwoClickMode=supported?'double':'single';
        pending=planTango({...puzzle,cells},answer);
      }else{
        // The last required transition may navigate directly to the results.
        doubleClickProbe='board-gone';pending=[];
      }
    }
    await fill(pending);
  }
  const filledAt = performance.now();
  let state=null,complete=false;
  if(!dryRun){
    state=await tab.getAXState();
    if(repair&&!isGameResult(state,'tango')){
      const cells=await readProgress();
      if(cells){
        const pending=planTango({...puzzle,cells},answer);repairCells=pending.length;
        // Repair always uses the already verified single-click cycle.
        if(pending.length){await fill(pending,'single');state=await tab.getAXState();}
      }
    }
    ({state,complete}=await confirmGameResult(tab,'tango',state));
  }
  return {
    dryRun, puzzle, answer, plan, state,complete,inputCalls,repairCells,
    doubleClickProbe,effectiveTwoClickMode,probeReads,
    timingsMs: {read: readAt-started, solveAndPlan: solvedAt-readAt, input: filledAt-solvedAt,verifyAndRepair:performance.now()-filledAt},
    clicks: plan.reduce((sum, step) => sum+step.clicks, 0),
  };
}

// Warm up pattern generation before starting a timed puzzle.
prepareTango(6);
