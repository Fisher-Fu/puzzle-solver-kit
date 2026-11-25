import {confirmExtraResult} from './extra-runtime.mjs';
export const oneLetterApart=(a,b)=>a.length===b.length&&[...a].filter((ch,i)=>ch!==b[i]).length===1;
export function planCrossclimb(words){
  words=words.map(w=>w.toUpperCase());
  if(words.length<2||new Set(words).size!==words.length||words.some(w=>!/^[A-Z]+$/.test(w)||w.length!==words[0].length))throw new Error('Invalid Crossclimb words');
  const paths=[],path=[];
  function search(){if(path.length===words.length){paths.push([...path]);return;}for(let i=0;i<words.length;i++)if(!path.includes(i)&&(!path.length||oneLetterApart(words[path.at(-1)],words[i]))){path.push(i);search();path.pop();}}
  search();
  if(paths.length!==2)throw new Error(paths.length?'Ambiguous Crossclimb ladder':'Words do not make a Crossclimb ladder');
  const inversions=p=>p.reduce((sum,v,i)=>sum+p.slice(i+1).filter(w=>w<v).length,0);
  paths.sort((a,b)=>inversions(a)-inversions(b));return paths[0].map(i=>words[i]);
}
export function readCrossRowsDom(elements){return elements.map((e,index)=>({index,label:e.getAttribute('aria-label'),
  letters:[...e.querySelectorAll('input')].map(i=>i.value),disabled:[...e.querySelectorAll('input')].every(i=>i.disabled)}));}
export async function readCrossRows(tab){return tab.playwright.locator('.crossclimb__guess--middle').evaluateAll(readCrossRowsDom);}
export async function collectCrossclimbClues(tab){
  const rows=await readCrossRows(tab),clues=[];
  for(let i=0;i<rows.length;i++){
    const input=tab.playwright.locator('.crossclimb__guess--middle').nth(i).locator('input').first();
    await input.click();
    const clue=await tab.playwright.locator('.crossclimb__clue').innerText();
    if(!clue.trim())throw new Error('Crossclimb clue not loaded');
    clues.push({index:i,length:rows[i].letters.length,clue,letters:rows[i].letters});
  }
  return clues;
}
export async function fillCrossRow(tab,row,word){
  const values=await row.locator('input').evaluateAll(es=>es.map(e=>e.value));
  if(word.length!==values.length)throw new Error('Crossclimb answer length mismatch');
  for(let j=0;j<values.length;j++)if(values[j]!==word[j]){
    const input=row.locator('input').nth(j);
    if(values[j])await input.press('Backspace');
    await input.fill(word[j]);
  }
  const actual=await row.locator('input').evaluateAll(es=>es.map(e=>e.value).join(''));
  if(actual!==word)throw new Error('Crossclimb input did not match answer');
}
export async function sortCrossclimb(tab,ladder){
  for(let dest=0;dest<ladder.length;dest++){
    const current=await readCrossRows(tab),words=current.map(r=>r.letters.join(''));
    // Correct answers can lock their inputs BEFORE row ordering is complete.
    // Only an actual one-letter chain establishes the sorted state.
    if(words.every((w,i)=>!i||oneLetterApart(words[i-1],w)))return;
    const source=words.indexOf(ladder[dest]);if(source<dest)throw new Error('Crossclimb order changed unexpectedly');
    if(source===dest)continue;
    await tab.playwright.locator('.crossclimb__guess--middle').nth(source).locator('[data-sortable-handle="true"]').first().press('Space');
    for(let i=source;i>dest;i--)await tab.playwright.locator('ol.crossclimb__guess__container').press('ArrowUp');
    await tab.playwright.locator('ol.crossclimb__guess__container').press('Space');
    const after=(await readCrossRows(tab)).map(r=>r.letters.join(''));
    const expected=[...words];expected.splice(dest,0,...expected.splice(source,1));
    if(JSON.stringify(after)!==JSON.stringify(expected))throw new Error('Crossclimb keyboard reorder was not registered');
  }
}
export async function runCrossclimb(tab,{dryRun=true,answers=null,ends=null,clueReasoner=null,endReasoner=null}={}){
  let rows=await readCrossRows(tab),clues=null,ladder;
  if(!rows.length)throw new Error('Crossclimb board unavailable');
  if(!rows.every(r=>r.disabled)){
    clues=await collectCrossclimbClues(tab);
    if(!answers&&clueReasoner)answers=await clueReasoner(clues);
    if(!answers)return {dryRun,needsReasoning:true,stage:'middle',clues};
    if(answers.length!==rows.length)throw new Error('Crossclimb missing answers');
    answers=answers.map(w=>w.toUpperCase());ladder=planCrossclimb(answers);
    if(dryRun)return {dryRun,clues,answers,ladder};
    for(let i=0;i<rows.length;i++)await fillCrossRow(tab,tab.playwright.locator('.crossclimb__guess--middle').nth(i),answers[i]);
    await sortCrossclimb(tab,ladder);
  }
  rows=await readCrossRows(tab);ladder=rows.map(r=>r.letters.join(''));
  if(rows.every(r=>r.disabled)&&!ladder.every((w,i)=>!i||oneLetterApart(ladder[i-1],w))){
    if(dryRun)return {dryRun,ladder:planCrossclimb(ladder)};
    await sortCrossclimb(tab,planCrossclimb(ladder));
    rows=await readCrossRows(tab);ladder=rows.map(r=>r.letters.join(''));
  }
  if(!rows.every(r=>r.disabled))throw new Error('Crossclimb middle ladder was not accepted');
  await tab.playwright.locator('.crossclimb__guess--non-drag input').first().waitFor({state:'visible',timeout:5000});
  await tab.playwright.locator('.crossclimb__guess--non-drag input').first().click();
  const finalClue=await tab.playwright.locator('.crossclimb__clue').innerText();
  if(!ends&&endReasoner)ends=await endReasoner({clue:finalClue,ladder});
  if(!ends)return {complete:false,needsReasoning:true,stage:'ends',clue:finalClue,ladder};
  ends=ends.map(w=>w.toUpperCase());
  if(ends.length!==2)throw new Error('Crossclimb needs two endpoint words');
  if(!(oneLetterApart(ends[0],ladder[0])&&oneLetterApart(ends[1],ladder.at(-1))))ends.reverse();
  if(!(oneLetterApart(ends[0],ladder[0])&&oneLetterApart(ends[1],ladder.at(-1))))throw new Error('Crossclimb endpoint words do not fit ladder');
  if(!dryRun){for(let i=0;i<2;i++)await fillCrossRow(tab,tab.playwright.locator('.crossclimb__guess--non-drag').nth(i),ends[i]);return {...await confirmExtraResult(tab,'crossclimb'),ladder,ends};}
  return {dryRun,ladder,ends};
}
