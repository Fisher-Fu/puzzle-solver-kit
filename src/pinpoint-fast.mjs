import {confirmExtraResult} from './extra-runtime.mjs';
export function readPinpointDom(board){
  const clues=[...board.querySelectorAll('.pinpoint__card--clue')].filter(e=>e.getBoundingClientRect().width>0).map(e=>e.textContent.trim()).filter(Boolean);
  const count=board.querySelector('.pinpoint__count')?.textContent.trim();
  const feedback=board.querySelector('.pinpoint__answers')?.textContent.trim()??'';
  if(!clues.length||clues.length>5)throw new Error('Pinpoint visible clues unavailable');
  return {clues,count,feedback};
}
export async function readPinpoint(tab){return tab.playwright.locator('.pinpoint__wrapper').evaluate(readPinpointDom);}
const normalizeClue=value=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();

export async function runPinpoint(tab,{dryRun=true,guess=null,reasoner=null,maxGuesses=5,publishedAnswer=null}={}){
  let snapshot=await readPinpoint(tab);const submitted=[];
  if(dryRun)return {dryRun,needsReasoning:true,stage:'category',snapshot};
  if(!Number.isInteger(maxGuesses)||maxGuesses<1||maxGuesses>5)throw new Error('Invalid Pinpoint guess limit');
  if(publishedAnswer!==null){
    const {answer,clues}=publishedAnswer;
    if(typeof answer!=='string'||!answer.trim()||!Array.isArray(clues)||clues.length!==5||
       clues.some(clue=>typeof clue!=='string'||!clue.trim()))throw new Error('Invalid published Pinpoint answer');
    const matches=snapshot.clues.every((clue,i)=>normalizeClue(clue)===normalizeClue(clues[i]));
    if(!matches)return {complete:false,needsReasoning:true,stage:'published-answer-mismatch',snapshot,submitted};
    guess=answer;
    maxGuesses=1;
  }
  for(let attempt=0;attempt<maxGuesses;attempt++){
    const answer=attempt===0&&guess?guess:reasoner?await reasoner({...snapshot,submitted:[...submitted]}):null;
    if(!answer)return {complete:false,needsReasoning:true,stage:'category',snapshot,submitted};
    if(typeof answer!=='string'||!answer.trim()||answer.length>160)throw new Error('Invalid Pinpoint category');
    if(submitted.some(s=>s.guess.toLowerCase()===answer.trim().toLowerCase())||snapshot.feedback.split(/\n+/).map(s=>s.trim().toLowerCase()).includes(answer.trim().toLowerCase()))throw new Error('Repeated Pinpoint guess');
    const input=tab.playwright.getByRole('textbox',{name:'Guess the category...',exact:true});
    await input.fill(answer.trim());await input.press('Enter');
    const state=await tab.getAXState();submitted.push({guess:answer.trim(),clues:[...snapshot.clues]});
    if(state.includes('/games/pinpoint/results/'))return {submitted,complete:true,state};
    if(state.includes('Correct guess')||await input.count()===0)return {...await confirmExtraResult(tab,'pinpoint'),submitted};
    // Success may display a final answer before redirecting; allow navigation.
    const boards=await tab.playwright.locator('.pinpoint__wrapper').count();
    if(!boards)return {...await confirmExtraResult(tab,'pinpoint'),submitted};
    const next=await readPinpoint(tab);
    if(next.clues.length===snapshot.clues.length&&next.feedback===snapshot.feedback){
      const confirmed=await confirmExtraResult(tab,'pinpoint');
      if(confirmed.complete)return {...confirmed,submitted};
      return {...confirmed,needsReasoning:true,stage:'feedback',snapshot:next,submitted};
    }
    snapshot=next;
  }
  return {complete:false,needsReasoning:true,stage:'category',snapshot,submitted};
}
