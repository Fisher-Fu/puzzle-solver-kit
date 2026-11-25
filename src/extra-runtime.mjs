export async function confirmExtraResult(tab,game){
  // Results use optional query parameters. Check the URL and a fresh AX tree,
  // and tolerate one navigation transition while the results UI is mounting.
  for(let attempt=0;attempt<3;attempt++){
    if((await tab.url()).includes(`/games/${game}/results/`))return {complete:true,state:await tab.getAXState()};
    try{await tab.playwright.getByRole('button',{name:'See puzzle',exact:true}).waitFor({state:'visible',timeout:3000});}catch{}
    const state=await tab.getAXState();
    if(state.includes(`linkedin.com/games/${game}/results/`))return {complete:true,state};
  }
  return {complete:false,state:await tab.getAXState()};
}
