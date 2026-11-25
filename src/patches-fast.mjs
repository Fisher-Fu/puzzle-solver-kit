// Patches rectangle exact-cover solver for Codex browser use.
// No live-page selectors or drag gestures are assumed before observing the game.
import {isGameResult,confirmGameResult,samePuzzle} from './race-runtime.mjs';

export function normalizePatches(puzzle) {
  const {rows, cols} = puzzle;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > 16 || cols > 16) {
    throw new Error('Expected a rectangular grid up to 16x16');
  }
  if (!Array.isArray(puzzle.clues) || !puzzle.clues.length) throw new Error('Missing clue cells');
  const occupied = new Set();
  const clues = puzzle.clues.map((clue, id) => {
    const {row, col} = clue, area = clue.area ?? null, shape = clue.shape ?? 'any';
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= rows || col >= cols) {
      throw new Error('Clue coordinate outside grid');
    }
    const index = row*cols+col;
    if (occupied.has(index)) throw new Error('Duplicate clue cell');
    occupied.add(index);
    if (area !== null && (!Number.isInteger(area) || area < 1 || area > rows*cols)) throw new Error('Invalid clue area');
    if (!['square','wide','tall','any'].includes(shape)) throw new Error('Unknown shape icon; inspect before solving');
    return {id,row,col,area,shape};
  });
  return {rows, cols, clues};
}

function fitsShape(h, w, shape) {
  return shape === 'any' || (shape === 'square' && h === w) ||
    (shape === 'wide' && w > h) || (shape === 'tall' && h > w);
}

function rectangleMask(top, left, bottom, right, cols) {
  let mask = 0n;
  const strip = (1n << BigInt(right-left+1))-1n;
  for (let r=top;r<=bottom;r++) mask |= strip << BigInt(r*cols+left);
  return mask;
}

export function validatePatchesAnswer(puzzle, rectangles) {
  const {rows,cols,clues} = normalizePatches(puzzle);
  if (!Array.isArray(rectangles) || rectangles.length !== clues.length) return false;
  const coverage=Array(rows*cols).fill(0), seenClues=new Set();
  for(const rect of rectangles){
    const {top,left,bottom,right}=rect;
    if(![top,left,bottom,right].every(Number.isInteger)||top<0||left<0||bottom>=rows||right>=cols||top>bottom||left>right)return false;
    const contained=clues.filter(c=>c.row>=top&&c.row<=bottom&&c.col>=left&&c.col<=right);
    if(contained.length!==1||seenClues.has(contained[0].id))return false;
    const clue=contained[0],h=bottom-top+1,w=right-left+1;
    if((clue.area!==null&&h*w!==clue.area)||!fitsShape(h,w,clue.shape))return false;
    seenClues.add(clue.id);
    for(let r=top;r<=bottom;r++)for(let c=left;c<=right;c++)if(++coverage[r*cols+c]!==1)return false;
  }
  return coverage.every(count=>count===1)&&seenClues.size===clues.length;
}

export function solvePatches(puzzle,{timeBudgetMs=2000,maxNodes=1000000}={}) {
  const started=performance.now(),{rows,cols,clues}=normalizePatches(puzzle),count=rows*cols;
  const knownArea=clues.reduce((sum,clue)=>sum+(clue.area??0),0);
  if(knownArea>count||(clues.every(clue=>clue.area!==null)&&knownArea!==count))throw new Error('No valid rectangle partition: area mismatch');
  const byClue=clues.map(()=>[]),byCell=Array.from({length:count},()=>[]),candidates=[];
  const prefix=Array.from({length:rows+1},()=>Array(cols+1).fill(0));
  for(const clue of clues)prefix[clue.row+1][clue.col+1]=1;
  for(let r=1;r<=rows;r++)for(let c=1;c<=cols;c++)prefix[r][c]+=prefix[r-1][c]+prefix[r][c-1]-prefix[r-1][c-1];
  function clueCount(t,l,b,r){return prefix[b+1][r+1]-prefix[t][r+1]-prefix[b+1][l]+prefix[t][l];}
  for(const clue of clues){
    for(let h=1;h<=rows;h++)for(let w=1;w<=cols;w++){
      if((clue.area!==null&&h*w!==clue.area)||!fitsShape(h,w,clue.shape))continue;
      for(let top=Math.max(0,clue.row-h+1);top<=Math.min(clue.row,rows-h);top++){
        for(let left=Math.max(0,clue.col-w+1);left<=Math.min(clue.col,cols-w);left++){
          const bottom=top+h-1,right=left+w-1;
          if(clueCount(top,left,bottom,right)!==1)continue;
          const candidate={id:candidates.length,clueId:clue.id,top,left,bottom,right,
            mask:rectangleMask(top,left,bottom,right,cols),clueBit:1n<<BigInt(clue.id)};
          candidates.push(candidate);byClue[clue.id].push(candidate.id);
          for(let r=top;r<=bottom;r++)for(let c=left;c<=right;c++)byCell[r*cols+c].push(candidate.id);
        }
      }
    }
  }
  const allCells=(1n<<BigInt(count))-1n,allClues=(1n<<BigInt(clues.length))-1n;
  const cellBits=Array.from({length:count},(_,i)=>1n<<BigInt(i));
  const chosen=[],solutions=[],failed=new Set();let nodes=0;
  const compatible=(id,used,usedClues)=>!(candidates[id].mask&used)&&!(candidates[id].clueBit&usedClues);
  function search(used,usedClues){
    if(solutions.length>=2)return;
    nodes++;
    if(nodes>maxNodes||(nodes%128===1&&performance.now()-started>timeBudgetMs))throw new Error('Search limit reached; no input performed');
    if(used===allCells){if(usedClues===allClues)solutions.push([...chosen]);return;}
    const key=used.toString(16);
    if(failed.has(key))return;
    let options=null;
    function consider(ids){
      const legal=ids.filter(id=>compatible(id,used,usedClues));
      if(!options||legal.length<options.length)options=legal;
    }
    for(let i=0;i<clues.length;i++)if(!(usedClues&(1n<<BigInt(i)))){
      consider(byClue[i]);if(!options.length)return;
    }
    for(let i=0;i<count;i++)if(!(used&cellBits[i])){
      consider(byCell[i]);if(!options.length)return;
      if(options.length===1)break;
    }
    const before=solutions.length;
    for(const id of options){
      const rect=candidates[id];chosen.push(id);
      search(used|rect.mask,usedClues|rect.clueBit);chosen.pop();
      if(solutions.length>=2)break;
    }
    if(solutions.length===before)failed.add(key);
  }
  search(0n,0n);
  if(solutions.length!==1)throw new Error(solutions.length?'Puzzle is ambiguous; inspect clues':'No valid rectangle partition; inspect clues');
  const rectangles=solutions[0].map(id=>{
    const {clueId,top,left,bottom,right}=candidates[id];return {clueId,top,left,bottom,right};
  }).sort((a,b)=>a.clueId-b.clueId);
  if(!validatePatchesAnswer(puzzle,rectangles))throw new Error('Independent coverage validation failed');
  return {rectangles,candidateCount:candidates.length,nodes,solveMs:performance.now()-started};
}

export function planPatches(puzzle,solution){
  if(!validatePatchesAnswer(puzzle,solution.rectangles))throw new Error('Invalid patch solution');
  return solution.rectangles.map(rect=>({...rect,
    startIndex:rect.top*puzzle.cols+rect.left,endIndex:rect.bottom*puzzle.cols+rect.right,
    singleton:rect.top===rect.bottom&&rect.left===rect.right}));
}

// The actual clue labels, icons and input gesture must be observed once before
// binding. readBoard reads only visible DOM; drawPatch uses documented browser UI
// actions (e.g. a verified corner-to-corner drag), never page-state injection.
export async function runPatches(tab,binding,{dryRun=true,...solverOptions}={}){
  const started=performance.now();
  const puzzle=await binding.readBoard(tab);
  const readAt=performance.now();
  const solution=solvePatches(puzzle,solverOptions),plan=planPatches(puzzle,solution);
  const solvedAt=performance.now();
  if(!dryRun){
    if(binding.gesturesVerified!==true)throw new Error('Confirm drag and singleton gestures before filling');
    for(const patch of plan)await binding.drawPatch(tab,patch,puzzle);
  }
  const filledAt=performance.now();
  const state=!dryRun&&plan.length?await tab.getAXState():null;
  return {dryRun,puzzle,solution,plan,state,patchCount:plan.length,
    timingsMs:{read:readAt-started,solveAndPlan:solvedAt-readAt,input:filledAt-solvedAt}};
}

// Live labels and corner-to-corner drags verified on LinkedIn Patches #212.
export function readLinkedInPatchesDom(elements){
  if(!elements.length)return null;
  const raw=elements.map(el=>{
    const label=el.getAttribute('aria-label')??'';
    const match=label.match(/^Row (\d+), column (\d+)(.*)$/);
    if(!match)throw new Error('Unexpected Patches cell label');
    const rect=el.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)throw new Error('Hidden Patches cell');
    const root=el.ownerDocument.documentElement;
    return {row:+match[1]-1,col:+match[2]-1,suffix:match[3],
      x:rect.x+rect.width/2,y:rect.y+rect.height/2,
      inViewport:rect.x>=0&&rect.y>=0&&rect.right<=root.clientWidth&&rect.bottom<=root.clientHeight};
  });
  if(!raw.length)throw new Error('Patches board not found');
  const rows=1+Math.max(...raw.map(c=>c.row)),cols=1+Math.max(...raw.map(c=>c.col)),cells=Array(rows*cols),clues=[];
  let hasDrawnRegions=false;
  for(const cell of raw){
    const index=cell.row*cols+cell.col;
    if(cell.row<0||cell.col<0||cells[index])throw new Error('Invalid Patches coordinates');
    const drawn=cell.suffix.match(/in region with clue at row (\d+), column (\d+)/);
    cells[index]={...cell,index,regionAnchor:drawn?(Number(drawn[1])-1)*cols+Number(drawn[2])-1:
      cell.suffix.includes('in drawn region')?index:null};
    if(/in (?:drawn )?region/.test(cell.suffix))hasDrawnRegions=true;
    if(!cell.suffix||cell.suffix.startsWith(', in region'))continue;
    const clue=cell.suffix.match(/^, (freeform|wide rectangle|tall rectangle|square) clue(?:, (\d+) cells?)?(?:, in drawn region)?$/);
    if(!clue)throw new Error('Clue label changed; inspect icon and number');
    clues.push({row:cell.row,col:cell.col,area:clue[2]?+clue[2]:null,
      shape:({'freeform':'any','wide rectangle':'wide','tall rectangle':'tall','square':'square'})[clue[1]]});
  }
  if(Array.from({length:rows*cols},(_,i)=>cells[i]).some(c=>!c))throw new Error('Incomplete Patches grid');
  clues.sort((a,b)=>a.row*cols+a.col-b.row*cols-b.col);
  return {rows,cols,clues,cells,hasDrawnRegions};
}

export function pendingPatches(puzzle,solution){
  const plan=planPatches(puzzle,solution),pending=[];
  for(const patch of plan){
    const clue=puzzle.clues[patch.clueId],anchor=clue.row*puzzle.cols+clue.col,owners=[];
    for(let r=patch.top;r<=patch.bottom;r++)for(let c=patch.left;c<=patch.right;c++)owners.push(puzzle.cells[r*puzzle.cols+c].regionAnchor??null);
    if(owners.every(owner=>owner===anchor))continue;
    if(owners.every(owner=>owner===null)){pending.push(patch);continue;}
    throw new Error('An existing Patches region conflicts with the answer; stop before redrawing');
  }
  return pending;
}

export async function runLinkedInPatches(tab,{dryRun=true,singletonGesture=null,repair=true,...solverOptions}={}){
  const started=performance.now();
  const puzzle=await tab.playwright.getByRole('button',{name:/^Row \d+, column \d+/}).evaluateAll(readLinkedInPatchesDom);
  if(!puzzle)throw new Error('Patches board is not visible');
  const readAt=performance.now(),solution=solvePatches(puzzle,solverOptions),plan=pendingPatches(puzzle,solution);
  const solvedAt=performance.now();
  let dragCalls=0,repairPatches=0;
  async function draw(steps,current){
    if(current.cells.some(cell=>!cell.inViewport))throw new Error('Whole board must be visible before drawing');
    if(steps.some(p=>p.singleton)&&typeof singletonGesture!=='function')throw new Error('Singleton gesture has not been verified');
    if(!steps.length)return;
    // A single fresh screenshot establishes the coordinate view before the batch.
    await tab.getScreenshot();
    for(const patch of steps){
      if(patch.singleton){await singletonGesture(tab,patch,current);continue;}
      const a=current.cells[patch.startIndex],b=current.cells[patch.endIndex];
      await tab.drag([a.x,a.y],[b.x,b.y]);
      dragCalls++;
    }
  }
  if(!dryRun)await draw(plan,puzzle);
  const filledAt=performance.now();let state=null,complete=false;
  if(!dryRun){
    state=await tab.getAXState();
    if(repair&&!isGameResult(state,'patches')){
      const current=await tab.playwright.getByRole('button',{name:/^Row \d+, column \d+/}).evaluateAll(readLinkedInPatchesDom);
      if(current){
        if(current.rows!==puzzle.rows||current.cols!==puzzle.cols||!samePuzzle(current.clues,puzzle.clues))throw new Error('Patches clues changed during input');
        const pending=pendingPatches(current,solution);repairPatches=pending.length;
        if(pending.length){await draw(pending,current);state=await tab.getAXState();}
      }
    }
    ({state,complete}=await confirmGameResult(tab,'patches',state));
  }
  return {dryRun,puzzle,solution,plan,state,complete,dragCalls,repairPatches,patchCount:plan.length,
    timingsMs:{read:readAt-started,solveAndPlan:solvedAt-readAt,input:filledAt-solvedAt,verifyAndRepair:performance.now()-filledAt}};
}
