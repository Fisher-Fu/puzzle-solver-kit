// Zip: ordered checkpoints + walls + a Hamiltonian path covering every cell.
// Browser selectors and input methods require live observation before binding.
import {isGameResult,confirmGameResult} from './race-runtime.mjs';

export function normalizeZip(puzzle){
  const {rows,cols}=puzzle;
  if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<1||cols<1||rows*cols<2||rows>16||cols>16)throw new Error('Invalid Zip grid');
  const count=rows*cols,clues=[...(puzzle.clues??[])].sort((a,b)=>a.number-b.number),numbers=Array(count).fill(0);
  if(clues.length<2)throw new Error('Zip needs at least two numbered checkpoints');
  clues.forEach((clue,i)=>{
    const {row,col,number}=clue;
    if(number!==i+1||!Number.isInteger(row)||!Number.isInteger(col)||row<0||col<0||row>=rows||col>=cols||numbers[row*cols+col])throw new Error('Invalid or nonconsecutive checkpoint labels');
    numbers[row*cols+col]=number;
  });
  const adjacent=(a,b)=>Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>=0&&a<count&&b<count&&
    (Math.abs(a-b)===cols||Math.abs(a-b)===1&&Math.floor(a/cols)===Math.floor(b/cols));
  const blocked=new Set();
  for(const wall of puzzle.walls??[]){
    if(!Array.isArray(wall)||wall.length!==2||!adjacent(...wall))throw new Error('A wall must separate adjacent cells');
    blocked.add([Math.min(...wall),Math.max(...wall)].join(':'));
  }
  const graph=Array.from({length:count},(_,i)=>{
    const r=Math.floor(i/cols),c=i%cols,candidates=[];
    if(r>0)candidates.push(i-cols);if(r+1<rows)candidates.push(i+cols);
    if(c>0)candidates.push(i-1);if(c+1<cols)candidates.push(i+1);
    return candidates.filter(j=>!blocked.has([Math.min(i,j),Math.max(i,j)].join(':')));
  });
  return {rows,cols,count,clues,numbers,graph,start:clues[0].row*cols+clues[0].col,end:clues.at(-1).row*cols+clues.at(-1).col};
}

export function validateZipAnswer(puzzle,path){
  const {count,numbers,graph,start,end,clues}=normalizeZip(puzzle);
  if(!Array.isArray(path)||path.length!==count||path[0]!==start||path.at(-1)!==end||new Set(path).size!==count)return false;
  let expected=1;
  for(let i=0;i<path.length;i++){
    const cell=path[i];
    if(!Number.isInteger(cell)||cell<0||cell>=count||i>0&&!graph[path[i-1]].includes(cell))return false;
    if(numbers[cell]&&numbers[cell]!==expected++)return false;
  }
  return expected===clues.length+1;
}

export function solveZip(puzzle,{timeBudgetMs=3000,maxNodes=1000000}={}){
  const started=performance.now(),data=normalizeZip(puzzle),{count,clues,numbers,graph,start,end,cols}=data;
  const checkpoints=clues.map(c=>c.row*cols+c.col),bits=Array.from({length:count},(_,i)=>1n<<BigInt(i));
  const color=Array.from({length:count},(_,i)=>(Math.floor(i/cols)+i%cols)%2);
  const totalColors=[color.filter(c=>c===0).length,color.filter(c=>c===1).length];
  const distances=graph.map((_,origin)=>{
    const d=Array(count).fill(Infinity),queue=[origin];d[origin]=0;
    for(let k=0;k<queue.length;k++)for(const j of graph[queue[k]])if(d[j]===Infinity){d[j]=d[queue[k]]+1;queue.push(j);}
    return d;
  });
  const tail=Array(clues.length).fill(0);
  for(let i=clues.length-2;i>=0;i--)tail[i]=tail[i+1]+distances[checkpoints[i]][checkpoints[i+1]];
  const visited=new Uint8Array(count),path=[start],solutions=[],failed=new Set(),usedColors=[0,0];
  visited[start]=1;usedColors[color[start]]=1;let nodes=0;
  function search(pos,next,mask){
    if(solutions.length>=2)return;
    nodes++;
    if(nodes>maxNodes||(nodes%128===1&&performance.now()-started>timeBudgetMs))throw new Error('Zip search limit reached; no input performed');
    const remaining=count-path.length;
    if(!remaining){if(pos===end&&next===clues.length)solutions.push([...path]);return;}
    if(pos===end||next>=clues.length)return;
    if(distances[pos][checkpoints[next]]+tail[next]>remaining)return;
    const blacks=totalColors[0]-usedColors[0]+(color[pos]===0?1:0),whites=totalColors[1]-usedColors[1]+(color[pos]===1?1:0);
    if(color[pos]!==color[end]?(blacks!==whites):(color[pos]===0?blacks!==whites+1:whites!==blacks+1))return;
    const key=pos+':'+mask.toString(16);if(failed.has(key))return;
    const open=[];for(let i=0;i<count;i++)if(!visited[i])open.push(i);
    let forced=-1;
    for(const cell of open){
      const options=graph[cell].filter(j=>!visited[j]||j===pos);
      if(options.length<(cell===end?1:2))return;
      if(cell!==end&&options.length===2&&options.includes(pos)){
        if(forced!==-1&&forced!==cell)return;forced=cell;
      }
    }
    // Once we leave the current cell, all remaining cells must stay connected.
    const reached=new Set([open[0]]),queue=[open[0]];
    for(let k=0;k<queue.length;k++)for(const j of graph[queue[k]])if(!visited[j]&&!reached.has(j)){reached.add(j);queue.push(j);}
    if(reached.size!==remaining)return;
    const options=graph[pos].filter(j=>!visited[j]&&(forced===-1||j===forced)&&(!numbers[j]||numbers[j]===next+1)&&
      (j!==end||remaining===1));
    options.sort((a,b)=>{
      const da=graph[a].filter(j=>!visited[j]).length,db=graph[b].filter(j=>!visited[j]).length;
      return da-db||distances[a][checkpoints[next]]-distances[b][checkpoints[next]];
    });
    const before=solutions.length;
    for(const cell of options){
      visited[cell]=1;usedColors[color[cell]]++;path.push(cell);
      search(cell,next+(numbers[cell]?1:0),mask|bits[cell]);
      path.pop();usedColors[color[cell]]--;visited[cell]=0;
      if(solutions.length>=2)break;
    }
    if(solutions.length===before&&failed.size<100000)failed.add(key);
  }
  search(start,1,bits[start]);
  if(solutions.length!==1)throw new Error(solutions.length?'Zip is ambiguous; inspect numbers and walls':'No valid Zip path; inspect numbers and walls');
  if(!validateZipAnswer(puzzle,solutions[0]))throw new Error('Independent Zip path validation failed');
  return {path:solutions[0],nodes,solveMs:performance.now()-started};
}

export function planZip(puzzle,solution,{maxSegmentSteps=3,stopAtCheckpoints=true}={}){
  if(!validateZipAnswer(puzzle,solution.path))throw new Error('Invalid Zip answer');
  if(!Number.isInteger(maxSegmentSteps)||maxSegmentSteps<1)throw new Error('Invalid segment length');
  const checkpoints=new Set(puzzle.clues.map(c=>c.row*puzzle.cols+c.col));
  const segments=[];let segment=null;
  for(let i=1;i<solution.path.length;i++){
    const a=solution.path[i-1],b=solution.path[i],delta=b-a;
    const direction=delta===puzzle.cols?'down':delta===-puzzle.cols?'up':delta===1?'right':'left';
    if(segment&&segment.direction===direction&&segment.steps<maxSegmentSteps&&(!stopAtCheckpoints||!checkpoints.has(a))){segment.endIndex=b;segment.steps++;}
    else {segment={startIndex:a,endIndex:b,direction,steps:1};segments.push(segment);}
  }
  return {path:solution.path,segments};
}

export async function runZip(tab,binding,{dryRun=true,...solverOptions}={}){
  if(!binding||typeof binding.readBoard!=='function')throw new Error('Observe and bind the live Zip board first');
  const started=performance.now(),puzzle=await binding.readBoard(tab),readAt=performance.now();
  const solution=solveZip(puzzle,solverOptions),plan=planZip(puzzle,solution),solvedAt=performance.now();
  if(!dryRun){
    if(binding.inputVerified!==true||typeof binding.drawPath!=='function')throw new Error('Verify Zip input before drawing');
    await binding.drawPath(tab,plan,puzzle);
  }
  const filledAt=performance.now(),state=!dryRun?await tab.getAXState():null;
  return {dryRun,puzzle,solution,plan,state,timingsMs:{read:readAt-started,solveAndPlan:solvedAt-readAt,input:filledAt-solvedAt}};
}

// Reader grounded in the completed LinkedIn Zip board inspected in this chat.
// Reads visible numbers and painted border styles, including wall pseudo-elements;
// it never reads framework state or a stored answer.
export function readLinkedInZipDom(grid){
  const elements=[...grid.querySelectorAll(':scope > [data-cell-idx]')];
  const n=Math.sqrt(elements.length);
  if(!Number.isInteger(n)||n<2||n>16)throw new Error('Unexpected Zip grid size');
  const cells=Array(n*n),clues=[],wallKeys=new Set();
  const view=grid.ownerDocument.defaultView,root=grid.ownerDocument.documentElement;
  function dark(color){
    const values=color.match(/[\d.]+/g)?.map(Number);
    return !!values&&values.length>=3&&values.slice(0,3).every(c=>c<=50)&&(values.length<4||values[3]>0.5);
  }
  for(const el of elements){
    const index=Number(el.getAttribute('data-cell-idx'));
    if(!Number.isInteger(index)||index<0||index>=n*n||cells[index])throw new Error('Invalid Zip cell index');
    const r=el.getBoundingClientRect();
    if(r.width<=0||r.height<=0)throw new Error('Hidden Zip grid');
    const label=el.querySelector('[data-cell-content]')?.getAttribute('aria-label')??null;
    if(label!==null&&!/^\d+$/.test(label))throw new Error('Unexpected Zip checkpoint');
    if(label!==null)clues.push({row:Math.floor(index/n),col:index%n,number:Number(label)});
    cells[index]={index,x:r.x+r.width/2,y:r.y+r.height/2,
      filled:!!el.querySelector('[data-testid="filled-cell"]'),
      inViewport:r.x>=0&&r.y>=0&&r.right<=root.clientWidth&&r.bottom<=root.clientHeight};
    for(const child of el.children){
      const box=child.getBoundingClientRect();
      if(box.width<r.width*0.6||box.height<r.height*0.6)continue;
      for(const pseudo of [null,'::before','::after']){
        const s=view.getComputedStyle(child,pseudo);
        if(pseudo&&['none','normal'].includes(s.content))continue;
        for(const [side,offset,allowed] of [['Top',-n,index>=n],['Right',1,index%n<n-1],['Bottom',n,index<n*(n-1)],['Left',-1,index%n>0]]){
          if(allowed&&Number(s['border'+side+'Width'].replace(/px$/,''))>=2&&s['border'+side+'Style']!=='none'&&dark(s['border'+side+'Color'])){
            wallKeys.add([Math.min(index,index+offset),Math.max(index,index+offset)].join(':'));
          }
        }
      }
    }
  }
  if(Array.from({length:n*n},(_,i)=>cells[i]).some(c=>!c))throw new Error('Incomplete Zip grid');
  return {rows:n,cols:n,clues:clues.sort((a,b)=>a.number-b.number),walls:[...wallKeys].map(k=>k.split(':').map(Number)),cells,
    hasExistingPath:cells.some(c=>c.filled)};
}

export async function readLinkedInZip(tab){
  return tab.playwright.getByTestId('interactive-grid').evaluate(readLinkedInZipDom);
}

export function readZipProgressDom(grids){
  if(!grids.length)return null;
  if(grids.length!==1)throw new Error('More than one Zip grid');
  const grid=grids[0],root=grid.ownerDocument.documentElement;
  return [...grid.querySelectorAll(':scope > [data-cell-idx]')].map(el=>{
    const r=el.getBoundingClientRect();
    return {index:Number(el.getAttribute('data-cell-idx')),filled:!!el.querySelector('[data-testid="filled-cell"]'),
      x:r.x+r.width/2,y:r.y+r.height/2,inViewport:r.width>0&&r.height>0&&r.x>=0&&r.y>=0&&r.right<=root.clientWidth&&r.bottom<=root.clientHeight};
  }).sort((a,b)=>a.index-b.index);
}

export function zipPrefixLength(path,cells){
  if(!Array.isArray(cells)||cells.length!==path.length||cells.some((c,i)=>c.index!==i))throw new Error('Zip grid changed during input');
  const filled=new Set(cells.filter(c=>c.filled).map(c=>c.index));
  let prefix=0;while(prefix<path.length&&filled.has(path[prefix]))prefix++;
  if(filled.size!==prefix)throw new Error('Existing Zip path disagrees with the answer; no automatic reset');
  return prefix;
}

// Segmented UI drag was verified on #578. Long drags occasionally missed an
// endpoint, so check the actual filled prefix after EVERY drag and repair only
// missing forward edges. All checks remain in the same tool execution.
export async function drawZipVerified(tab,plan,puzzle,{maxSegmentSteps=3,maxStalls=2,stopAtCheckpoints=true}={}){
  if(!validateZipAnswer(puzzle,plan.path))throw new Error('Invalid Zip route');
  if(!Number.isInteger(maxSegmentSteps)||maxSegmentSteps<1||!Number.isInteger(maxStalls)||maxStalls<1)throw new Error('Invalid Zip input limits');
  const checkpoints=new Set(puzzle.clues.map(c=>c.row*puzzle.cols+c.col));
  const stats={dragCalls:0,progressReads:0,repairDrags:0,resumedCells:0};
  async function progress(){stats.progressReads++;return tab.playwright.getByTestId('interactive-grid').evaluateAll(readZipProgressDom);}
  let cells=await progress();
  if(!cells)return {...stats,boardGone:true};
  let length=zipPrefixLength(plan.path,cells);stats.resumedCells=length;
  if(length===plan.path.length)return stats;
  if(cells.some(c=>!c.inViewport))throw new Error('Whole Zip board must be visible');
  await tab.getScreenshot();
  let repairUntil=-1,stalls=0;
  while(length<plan.path.length){
    const at=Math.max(0,length-1),a=plan.path[at];
    let target=at+1;
    if(at>=repairUntil){
      const delta=plan.path[target]-a;
      while(target+1<plan.path.length&&target-at<maxSegmentSteps&&
        plan.path[target+1]-plan.path[target]===delta&&(!stopAtCheckpoints||!checkpoints.has(plan.path[target])))target++;
    }else stats.repairDrags++;
    if(cells.some(c=>!c.inViewport))throw new Error('Zip viewport changed; stop before drawing');
    const from=cells[a],to=cells[plan.path[target]];
    await tab.drag([from.x,from.y],[to.x,to.y]);stats.dragCalls++;
    if(stats.dragCalls>plan.path.length*2+8)throw new Error('Zip action limit reached');
    const current=await progress();
    if(!current)return {...stats,boardGone:true};
    const next=zipPrefixLength(plan.path,current);
    if(next<length)throw new Error('Zip path moved backwards unexpectedly');
    if(next===length){if(++stalls>=maxStalls)throw new Error('Zip input is not advancing; stopped without resetting');}
    else stalls=0;
    if(next<target+1)repairUntil=target;
    length=next;cells=current;
  }
  return stats;
}

// Only check between straight runs. Repeating one direction cannot turn
// off the solution when a key is missed, so it is safe to retry the suffix.
async function drawZipByKeyboard(tab,puzzle,solution){
  const grid=tab.playwright.getByTestId('interactive-grid');
  const label=await grid.getAttribute('aria-label');
  if(!/arrow keys/i.test(label??''))return null;

  const {path,segments}=planZip(puzzle,solution,{
    maxSegmentSteps:Math.max(puzzle.rows,puzzle.cols)-1,stopAtCheckpoints:false,
  });
  const keys={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'};
  const readFilled=()=>grid.evaluateAll(grids=>{
    if(!grids.length)return null;
    if(grids.length!==1)throw new Error('More than one Zip grid');
    return [...grids[0].querySelectorAll(':scope > [data-cell-idx]')]
      .map(cell=>({index:Number(cell.getAttribute('data-cell-idx')),
        filled:!!cell.querySelector('[data-testid="filled-cell"]')}))
      .sort((a,b)=>a.index-b.index);
  });

  let length=zipPrefixLength(path,puzzle.cells);
  const stats={keyPresses:0,progressReads:0,repairKeys:0,resumedCells:length};
  if(length===0)return {...stats,fallback:'Keyboard input needs the starting cell'};
  let end=0;
  for(const segment of segments){
    end+=segment.steps;
    if(length> end)continue;
    let stalled=false, retrying=false;
    while(length<=end){
      const expectedKeys=end+1-length;
      let keyFailed=false;
      for(let step=0;step<expectedKeys;step++){
        try{
          await grid.press(keys[segment.direction]);
          stats.keyPresses++;
          if(retrying)stats.repairKeys++;
        }catch{
          keyFailed=true;
          break;
        }
      }
      const cells=await readFilled();
      stats.progressReads++;
      if(!cells)return {...stats,boardGone:true};
      const next=zipPrefixLength(path,cells);
      if(next<length||next>end+1)throw new Error('Zip keyboard input advanced unexpectedly');
      const noProgress=next===length;
      length=next;
      if(length===path.length)break;
      if(keyFailed||(noProgress&&stalled))return {...stats,fallback:'Keyboard input did not advance'};
      stalled=noProgress;
      retrying=true;
    }
  }
  return stats;
}

export async function runLinkedInZip(tab,{dryRun=true,binding=null,inputMode='auto',maxSegmentSteps=3,maxStalls=2,stopAtCheckpoints=true,...solverOptions}={}){
  const started=performance.now(),puzzle=await readLinkedInZip(tab),readAt=performance.now();
  const solution=solveZip(puzzle,solverOptions),plan=planZip(puzzle,solution,{maxSegmentSteps,stopAtCheckpoints}),solvedAt=performance.now();
  let inputStats=null,state=null,complete=false;
  if(!dryRun){
    if(binding){
      if(binding.inputVerified!==true||typeof binding.drawPath!=='function')throw new Error('Unverified Zip input override');
      await binding.drawPath(tab,plan,puzzle);
    }else{
      const keyboard=inputMode==='auto'?await drawZipByKeyboard(tab,puzzle,solution):null;
      if(keyboard&&!keyboard.fallback)inputStats={...keyboard,inputMode:'keyboard'};
      else{
        const drag=await drawZipVerified(tab,plan,puzzle,{maxSegmentSteps,maxStalls,stopAtCheckpoints});
        inputStats=keyboard?{...drag,inputMode:'drag',keyboard}:drag;
      }
    }
  }
  const filledAt=performance.now();
  if(!dryRun){
    state=await tab.getAXState();
    ({state,complete}=await confirmGameResult(tab,'zip',state));
    if(!complete&&inputStats?.inputMode==='keyboard'){
      try{await tab.playwright.waitForURL('**/games/zip/results/**',{waitUntil:'commit',timeout:5000});}catch{}
      state=await tab.getAXState();
      ({state,complete}=await confirmGameResult(tab,'zip',state));
    }
  }
  return {dryRun,puzzle,solution,plan,inputStats,state,complete,
    timingsMs:{read:readAt-started,solveAndPlan:solvedAt-readAt,input:filledAt-solvedAt,verify:performance.now()-filledAt}};
}

// Prepared input candidate, NOT yet validated against a fresh Zip board.
// First test a single segment, inspect whether release preserves the path, then
// continue at segment 1. No puzzle state is changed except through UI drags.
export async function drawZipSegments(tab,plan,puzzle,{startSegment=0,endSegment=plan.segments.length}={}){
  if(!validateZipAnswer(puzzle,plan.path))throw new Error('Invalid Zip route');
  if(!Array.isArray(puzzle.cells)||puzzle.cells.some(c=>!c.inViewport))throw new Error('Current visible cell coordinates required');
  if(!Number.isInteger(startSegment)||!Number.isInteger(endSegment)||startSegment<0||endSegment>plan.segments.length||startSegment>=endSegment)throw new Error('Invalid segment range');
  await tab.getScreenshot();
  for(const segment of plan.segments.slice(startSegment,endSegment)){
    const a=puzzle.cells[segment.startIndex],b=puzzle.cells[segment.endIndex];
    await tab.drag([a.x,a.y],[b.x,b.y]);
  }
  return tab.getAXState();
}
