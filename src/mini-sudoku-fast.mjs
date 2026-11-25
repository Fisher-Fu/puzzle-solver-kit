import {confirmExtraResult} from './extra-runtime.mjs';
export function readSudokuDom(elements){
  if(!elements.length)return null;
  const n=Math.sqrt(elements.length);
  if(n!==6)throw new Error('Unsupported Sudoku size');
  const cells=[...elements].map(el=>{
    const index=Number(el.getAttribute('data-cell-idx'));
    const text=el.querySelector('.sudoku-cell-content').textContent.trim();
    if(text&&!/^[1-6]$/.test(text))throw new Error('Unexpected Sudoku content; turn notes off');
    return {index,value:text?Number(text):0,fixed:el.classList.contains('sudoku-cell-prefilled'),
      walls:['top','right','bottom','left'].map(side=>el.classList.contains('sudoku-cell-wall-'+side))};
  }).sort((a,b)=>a.index-b.index);
  if(cells.some((c,i)=>c.index!==i))throw new Error('Invalid Sudoku cells');
  const regions=Array(36).fill(-1);let id=0;
  for(let start=0;start<36;start++)if(regions[start]<0){
    const queue=[start];regions[start]=id;
    for(let k=0;k<queue.length;k++){
      const a=queue[k],r=Math.floor(a/n),c=a%n;
      for(const [b,side,opposite,valid]of [[a-n,0,2,r>0],[a+1,1,3,c<n-1],[a+n,2,0,r<n-1],[a-1,3,1,c>0]])
        if(valid&&!cells[a].walls[side]&&!cells[b].walls[opposite]&&regions[b]<0){regions[b]=id;queue.push(b);}
    }
    if(queue.length!==n)throw new Error('Invalid Sudoku region');id++;
  }
  if(id!==n)throw new Error('Unexpected Sudoku region count');
  return {n,cells,regions};
}
export function solveSudoku(puzzle){
  const {n,cells,regions}=puzzle,values=cells.map(c=>c.fixed?c.value:0),solutions=[];
  const peers=values.map((_,a)=>values.map((_,b)=>b).filter(b=>a!==b&&(Math.floor(a/n)===Math.floor(b/n)||a%n===b%n||regions[a]===regions[b])));
  if(cells.length!==n*n||regions.length!==n*n||values.some((v,i)=>v&&(!Number.isInteger(v)||v<1||v>n||peers[i].some(j=>values[j]===v))))throw new Error('Conflicting Sudoku givens');
  function search(){
    if(solutions.length>1)return;
    let at=-1,options=null;
    for(let i=0;i<values.length;i++)if(!values[i]){
      const used=new Set(peers[i].map(j=>values[j]));
      const available=Array.from({length:n},(_,k)=>k+1).filter(v=>!used.has(v));
      if(!available.length)return;
      if(!options||available.length<options.length){at=i;options=available;if(options.length===1)break;}
    }
    if(at<0){solutions.push([...values]);return;}
    for(const v of options){values[at]=v;search();values[at]=0;}
  }
  search();if(solutions.length!==1)throw new Error(solutions.length?'Ambiguous Sudoku':'Impossible Sudoku');
  return solutions[0];
}
export async function runMiniSudoku(tab,{dryRun=true,inputMode='keyboard'}={}){
  if(!['buttons','keyboard'].includes(inputMode))throw new Error('Unknown Sudoku input mode');
  const read=()=>tab.playwright.locator('.sudoku-cell[data-cell-idx]').evaluateAll(readSudokuDom);
  const puzzle=await read();if(!puzzle)throw new Error('Sudoku board missing');
  const answer=solveSudoku(puzzle);let inputCalls=0,repairCells=0;
  const fill=async cells=>{for(const c of cells)if(!c.fixed&&c.value!==answer[c.index]){
    await tab.playwright.locator(`.sudoku-cell[data-cell-idx="${c.index}"]`).click();inputCalls++;
    if(inputMode==='keyboard')await tab.playwright.locator('.sudoku-grid').press(String(answer[c.index]));
    else await tab.playwright.getByRole('button',{name:String(answer[c.index]),exact:true}).click();
    inputCalls++;
  }};
  if(!dryRun){
    await fill(puzzle.cells);
    const current=await read();
    if(current){
      if(JSON.stringify(current.regions)!==JSON.stringify(puzzle.regions)||current.cells.some((c,i)=>c.fixed!==puzzle.cells[i].fixed||c.fixed&&c.value!==puzzle.cells[i].value))throw new Error('Sudoku board changed');
      repairCells=current.cells.filter(c=>!c.fixed&&c.value!==answer[c.index]).length;
      if(repairCells)await fill(current.cells);
    }
  }
  return {dryRun,puzzle,answer,inputCalls,repairCells,...(dryRun?{complete:false,state:null}:await confirmExtraResult(tab,'mini-sudoku'))};
}
