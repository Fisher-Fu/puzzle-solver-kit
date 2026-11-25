import {confirmExtraResult} from './extra-runtime.mjs';
export function readWendDom(container){
  const grid=container.querySelector('[data-testid="interactive-grid"]');
  if(!grid)throw new Error('Wend grid missing');
  const elements=[...grid.querySelectorAll(':scope > [data-cell-idx]')];
  const cells=elements.map(el=>{const r=el.getBoundingClientRect();return {index:Number(el.getAttribute('data-cell-idx')),
    letter:el.textContent.trim(),hole:el.getAttribute('data-cell-is-hole')==='true',x:r.x,y:r.y};}).sort((a,b)=>a.index-b.index);
  const cols=cells.filter(c=>Math.abs(c.y-cells[0].y)<2).length,rows=cells.length/cols;
  const slots=[...container.querySelectorAll('[data-testid^="wend-word-list-slots-"]')].map(el=>({length:el.children.length,word:el.parentElement.getAttribute('data-locked')==='true'?el.textContent.trim():''}));
  if(!Number.isInteger(rows)||cells.some((c,i)=>c.index!==i||!c.hole&&!/^[A-Z]$/.test(c.letter))||!slots.length)throw new Error('Invalid Wend board');
  return {rows,cols,cells,lengths:slots.map(s=>s.length),found:slots.map(s=>s.word).filter(Boolean)};
}
export function findWendCandidates(puzzle,words){
  const lengths=new Set(puzzle.lengths),max=Math.max(...lengths),trie={};
  for(let word of words){word=word.trim().toUpperCase();if(!/^[A-Z]+$/.test(word)||!lengths.has(word.length))continue;
    let node=trie;for(const ch of word)node=node[ch]??=( {} );node.word=word;
  }
  const {cols,rows,cells}=puzzle,graph=cells.map(c=>{
    const i=c.index,r=Math.floor(i/cols),col=i%cols;
    return [r>0?i-cols:-1,col>0?i-1:-1,r<rows-1?i+cols:-1,col<cols-1?i+1:-1].filter(j=>j>=0&&!cells[j].hole);
  });
  const candidates=[],path=[],seen=new Set();
  function walk(at,node,mask){
    node=node[cells[at].letter];if(!node)return;
    mask|=1n<<BigInt(at);path.push(at);
    if(node.word){const key=node.word+':'+mask;if(!seen.has(key)){seen.add(key);candidates.push({word:node.word,path:[...path],mask});}}
    if(path.length<max)for(const j of graph[at])if(!(mask&(1n<<BigInt(j))))walk(j,node,mask);
    path.pop();
  }
  for(const c of cells)if(!c.hole)walk(c.index,trie,0n);
  return candidates;
}
export function solveWend(puzzle,words,{maxNodes=1000000,maxSolutions=8,allowAmbiguous=false}={}){
  if(!Number.isInteger(maxSolutions)||maxSolutions<2||maxSolutions>32)throw new Error('Invalid Wend cover limit');
  const candidates=findWendCandidates(puzzle,words),counts=new Map();
  for(const n of puzzle.lengths)counts.set(n,(counts.get(n)??0)+1);
  const open=puzzle.cells.filter(c=>!c.hole),all=open.reduce((m,c)=>m|(1n<<BigInt(c.index)),0n);
  if(open.length!==puzzle.lengths.reduce((a,b)=>a+b,0))throw new Error('Wend word lengths do not cover grid');
  const byCell=puzzle.cells.map(c=>candidates.filter(p=>p.path.includes(c.index))),solutions=[],picked=[];let nodes=0;
  function search(used){
    if(++nodes>maxNodes)throw new Error('Wend search limit');
    if(solutions.length>=maxSolutions)return;
    if(used===all){if(picked.length===puzzle.lengths.length)solutions.push([...picked]);return;}
    let options=null;
    for(const c of open)if(!(used&(1n<<BigInt(c.index)))){
      const available=byCell[c.index].filter(p=>!(p.mask&used)&&counts.get(p.word.length)>0&&!picked.some(q=>q.word===p.word));
      if(!available.length)return;if(!options||available.length<options.length)options=available;
    }
    for(const p of options){counts.set(p.word.length,counts.get(p.word.length)-1);picked.push(p);search(used|p.mask);picked.pop();counts.set(p.word.length,counts.get(p.word.length)+1);}
  }
  search(0n);
  if(solutions.length!==1){
    if(allowAmbiguous)return {needsReasoning:true,stage:solutions.length?'vocabulary':'vocabulary-expand',
      choices:solutions.map(cover=>cover.map(({word,path})=>({word,path}))),choicesTruncated:solutions.length>=maxSolutions,candidateCount:candidates.length,nodes};
    throw new Error(solutions.length?'Multiple Wend covers; refine dictionary candidates':'No Wend cover; expand vocabulary candidates');
  }
  return {words:solutions[0].map(({word,path})=>({word,path})),candidateCount:candidates.length,nodes};
}
export async function readWend(tab){return tab.playwright.getByTestId('game-board-container').evaluate(readWendDom);}
export function planWendWordOrder(puzzle,entries,{startIndex=0}={}){
  if(!Number.isInteger(startIndex)||!puzzle.cells[startIndex]||puzzle.cells[startIndex].hole)throw new Error('Invalid Wend starting focus');
  if(entries.length>12)throw new Error('Too many Wend words for exact navigation planning');
  if(!entries.length)return {words:[],navigationKeys:0,originalNavigationKeys:0};
  const {cols,rows,cells}=puzzle;
  const graph=cells.map(c=>{const i=c.index,r=Math.floor(i/cols),col=i%cols;return [r>0?i-cols:-1,col>0?i-1:-1,r<rows-1?i+cols:-1,col<cols-1?i+1:-1].filter(j=>j>=0&&!cells[j].hole);});
  const distance=new Map();
  for(const origin of new Set([startIndex,...entries.map(e=>e.path.at(-1))])){
    const d=Array(cells.length).fill(Infinity),queue=[origin];d[origin]=0;
    for(let k=0;k<queue.length;k++)for(const j of graph[queue[k]])if(d[j]===Infinity){d[j]=d[queue[k]]+1;queue.push(j);}
    distance.set(origin,d);
  }
  const leg=(a,b)=>distance.get(a)[b];
  const cost=order=>order.reduce((sum,id,i)=>sum+leg(i?entries[order[i-1]].path.at(-1):startIndex,entries[id].path[0]),0);
  const memo=new Map(),all=(1<<entries.length)-1;
  function search(mask,last){
    if(mask===all)return {cost:0,order:[]};
    const key=mask+':'+last;if(memo.has(key))return memo.get(key);
    let best={cost:Infinity,order:[]};
    for(let i=0;i<entries.length;i++)if(!(mask&(1<<i))){
      const tail=search(mask|(1<<i),i),next=leg(last<0?startIndex:entries[last].path.at(-1),entries[i].path[0])+tail.cost;
      if(next<best.cost)best={cost:next,order:[i,...tail.order]};
    }
    memo.set(key,best);return best;
  }
  const best=search(0,-1);
  if(!Number.isFinite(best.cost))throw new Error('Wend words cannot be reached by the verified keyboard navigation');
  return {words:best.order.map(i=>entries[i]),navigationKeys:best.cost,originalNavigationKeys:cost(entries.map((_,i)=>i))};
}
export async function enterWendWord(tab,puzzle,entry){
  if(entry.path.map(i=>puzzle.cells[i].letter).join('')!==entry.word)throw new Error('Wend word/path mismatch');
  const path=entry.path;
  // DOM focus alone does not update the game's internal roving focus. Move
  // with the documented arrow keys, then start selection with Enter.
  let focus=Number(await tab.playwright.locator('[data-testid="wend-game-board"] [data-cell-focused="true"]').getAttribute('data-cell-idx'));
  const queue=[focus],previous=new Map([[focus,null]]),keys=new Map();
  for(let k=0;k<queue.length&&!previous.has(path[0]);k++){
    const a=queue[k],r=Math.floor(a/puzzle.cols),c=a%puzzle.cols;
    for(const [b,key,valid]of [[a-1,'ArrowLeft',c>0],[a+1,'ArrowRight',c<puzzle.cols-1],[a-puzzle.cols,'ArrowUp',r>0],[a+puzzle.cols,'ArrowDown',r<puzzle.rows-1]])
      if(valid&&!puzzle.cells[b].hole&&!previous.has(b)){previous.set(b,a);keys.set(b,key);queue.push(b);}
  }
  if(!previous.has(path[0]))throw new Error('Wend cannot navigate focus to word start');
  const moves=[];for(let b=path[0];b!==focus;b=previous.get(b))moves.push(keys.get(b));
  for(const key of moves.reverse())await tab.playwright.locator('[data-testid="wend-game-board"] [data-cell-focused="true"]').press(key);
  focus=Number(await tab.playwright.locator('[data-testid="wend-game-board"] [data-cell-focused="true"]').getAttribute('data-cell-idx'));
  if(focus!==path[0])throw new Error('Wend focus did not reach word start');
  await tab.playwright.locator('[data-testid="wend-game-board"] [data-cell-focused="true"]').press('Enter');
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],delta=b-a;
    if(!(Math.abs(delta)===puzzle.cols||Math.abs(delta)===1&&Math.floor(a/puzzle.cols)===Math.floor(b/puzzle.cols)))throw new Error('Wend nonadjacent path');
    const key=delta===1?'ArrowRight':delta===-1?'ArrowLeft':delta===puzzle.cols?'ArrowDown':'ArrowUp';
    await tab.playwright.locator('[data-testid="wend-game-board"] [data-cell-focused="true"]').press(key);
  }
  await tab.playwright.locator('[data-testid="wend-game-board"] [data-cell-focused="true"]').press('Enter');
}
export async function runWend(tab,{dryRun=true,words=[]}={}){
  const puzzle=await readWend(tab),solution=solveWend(puzzle,words,{allowAmbiguous:true});
  if(solution.needsReasoning)return {dryRun,puzzle,...solution,complete:false};
  const startIndex=Number(await tab.playwright.locator('[data-testid="wend-game-board"] [data-cell-focused="true"]').getAttribute('data-cell-idx'));
  const inputPlan=planWendWordOrder(puzzle,solution.words.filter(entry=>!puzzle.found.includes(entry.word)),{startIndex});
  if(!dryRun)for(const entry of inputPlan.words){
    await enterWendWord(tab,puzzle,entry);
    const current=await tab.playwright.locator('[data-testid^="wend-word-list-row-"][data-locked="true"]').allTextContents({timeout:1000});
    if(!current.map(s=>s.replace(/\s/g,'')).includes(entry.word)&&!(await tab.url()).includes('/wend/results/'))throw new Error('Wend word was not accepted: '+entry.word);
  }
  return {dryRun,puzzle,solution,inputPlan,...(dryRun?{complete:false,state:null}:await confirmExtraResult(tab,'wend'))};
}
