// Import before opening any timed board. This module never navigates or plays.
import {runTango} from './tango-fast.mjs';
import {runLinkedInQueens} from './queens-fast.mjs';
import {runLinkedInPatches} from './patches-fast.mjs';
import {runLinkedInZip} from './zip-fast.mjs';
import {isGameResult} from './race-runtime.mjs';
import {runMiniSudoku} from './mini-sudoku-fast.mjs';
import {runWend} from './wend-fast.mjs';
import {runCrossclimb} from './crossclimb-fast.mjs';
import {runPinpoint} from './pinpoint-fast.mjs';
import {runSumbreak,sumbreakBoard} from './sumbreak-fast.mjs';
import {confirmExtraResult} from './extra-runtime.mjs';
export const version='0.1.0';
export const allGames=['tango','queens','patches','zip','mini-sudoku','sumbreak','wend','crossclimb','pinpoint'];
let vocabulary=null;
export async function prepareRaceKit(){
  if(!vocabulary){
    const {readFile}=await import('node:fs/promises');
    try {
      const words=await readFile(new URL('../english-words.txt',import.meta.url),'utf8');
      vocabulary=words.trim().split(/\s+/).filter(Boolean);
    } catch(error) {
      if(error.code!=='ENOENT')throw error;
      vocabulary=[];
    }
  }
  return {version,wordCount:vocabulary.length};
}
export async function runGame(game,tab,options={}){
  if(game==='tango')return runTango(tab,options);
  if(game==='queens')return runLinkedInQueens(tab,options);
  if(game==='patches')return runLinkedInPatches(tab,options);
  if(game==='zip')return runLinkedInZip(tab,options);
  if(game==='mini-sudoku')return runMiniSudoku(tab,options);
  if(game==='sumbreak')return runSumbreak(tab,options);
  if(game==='wend'){if(!options.words)await prepareRaceKit();return runWend(tab,{...options,words:options.words??vocabulary});}
  if(game==='crossclimb')return runCrossclimb(tab,options);
  if(game==='pinpoint')return runPinpoint(tab,options);
  throw new Error('Unknown game');
}

const boardSelectors={tango:'[id^="tango-cell-"][data-cell-idx]',queens:'#queens-game-board',
  patches:'[role="button"][aria-label^="Row 1, column 1"]',zip:'[data-testid="interactive-grid"]',
  'mini-sudoku':'.sudoku-cell[data-cell-idx]',sumbreak:sumbreakBoard,wend:'[data-testid="wend-game-board"]',
  crossclimb:'.crossclimb__guess--middle input',pinpoint:'.pinpoint__input'};
// Enter one game at a time. Require explicit opt-in even to navigate.
export async function runDailyGames(tab,{play=false,games=allGames,options={},onResult=null}={}){
  if(!Array.isArray(games)||new Set(games).size!==games.length||games.some(g=>!boardSelectors[g]))throw new Error('Invalid game order');
  if(!play)return {preparedOnly:true,version,games};
  // Read the local vocabulary before opening any timed board.
  if(games.includes('wend')&&!options.wend?.words)await prepareRaceKit();
  const results=[];
  for(const game of games){
    try{
      const url=`https://www.linkedin.com/games/${game}/`;
      const currentUrl=await tab.url();
      if(currentUrl!==url&&!currentUrl?.startsWith(url+'results/'))await tab.goto(url);
      let state=await tab.getAXState();
      if(isGameResult(state,game)){
        const result={game,complete:true,alreadyCompleted:true,state};results.push(result);
        if(onResult)await onResult(result,tab);continue;
      }
      try{await tab.playwright.locator(boardSelectors[game]).first().waitFor({state:'visible',timeout:5000});}
      catch(error){
        state=await tab.getAXState();
        if(!isGameResult(state,game))throw error;
        const result={game,complete:true,alreadyCompleted:true,state};results.push(result);
        if(onResult)await onResult(result,tab);continue;
      }
      // Completed games can open as a filled board, with a See results link,
      // instead of redirecting automatically. Follow only this game's exact URL.
      const resultLink=tab.playwright.getByRole('link',{name:'See results',exact:true});
      if(await resultLink.count()===1){
        const href=await resultLink.getAttribute('href');
        const target=href?new URL(href,'https://www.linkedin.com'):null;
        if(target&&target.protocol==='https:'&&['www.linkedin.com','linkedin.com'].includes(target.hostname)&&target.pathname===`/games/${game}/results/`){
          await resultLink.click();state=await tab.getAXState();
          if(!isGameResult(state,game))return {complete:false,results,failedGame:game,reason:'Existing results not confirmed'};
          const result={game,complete:true,alreadyCompleted:true,state};results.push(result);
          if(onResult)await onResult(result,tab);continue;
        }
      }
      const result={game,...await runGame(game,tab,{...options[game],dryRun:false})};results.push(result);
      if(result.needsReasoning)return {complete:false,needsReasoning:true,pendingGame:game,results,stage:result.stage};
      if(!result.complete)Object.assign(result,await confirmExtraResult(tab,game));
      if(!result.complete)return {complete:false,results,failedGame:game,reason:'Result page not yet confirmed'};
      if(onResult)await onResult(result,tab);
    }catch(error){return {complete:false,results,failedGame:game,reason:error.message};}
  }
  return {complete:true,results};
}
