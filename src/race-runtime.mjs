// Common completion checks. A successful input call is not a completed game.
export function isGameResult(state,game){
  return typeof state==='string'&&state.includes(`linkedin.com/games/${game}/results/`);
}
export async function confirmGameResult(tab,game,state){
  if(isGameResult(state,game))return {complete:true,state};
  // One bounded follow-up lets the normal completion animation navigate.
  const latest=await tab.getAXState();
  return {complete:isGameResult(latest,game),state:latest};
}
export function samePuzzle(a,b){return JSON.stringify(a)===JSON.stringify(b);}
