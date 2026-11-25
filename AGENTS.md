# Using the kit from an AI agent

1. Run `npm run demo` and `npm test` from the repository root.
2. Use the agent's supported browser or computer-use tools to bind the user's open game tab. Verify the visible game. The repository never opens a browser itself.
3. In a JavaScript runtime that can use the tab handle and read this repository, import `src/race-kit.mjs` and `src/browser-adapter.mjs`. Resolve module paths from the current checkout. Build the adapter from the agent's documented browser APIs.
4. Start with `runGame(game, tab, { dryRun: true })` on a visible board. Crossclimb may focus cells to reveal clues. To enter moves, pass `dryRun: false` only when the user has asked to play and the site permits the intended use.
5. Check the visible results screen and report the displayed outcome. Keep account data and full page snapshots out of logs, commits, and issue reports.

## Browser adapter

```js
import { runGame } from './src/race-kit.mjs';
import { createBrowserAdapter } from './src/browser-adapter.mjs';

// Replace boundTab with a tab provided by your agent's browser tools.
const tab = createBrowserAdapter({
  playwright: boundTab.playwright,
  url: () => boundTab.url(),
  goto: url => boundTab.goto(url),
  snapshot: () => boundTab.playwright.domSnapshot(),
  screenshot: () => boundTab.screenshot({}),
  // Supply click(point) and drag(from, to) only if supported by your tools.
});

const plan = await runGame('sumbreak', tab, { dryRun: true });
```

`playwright` is the browser's locator interface. It needs CSS, role and test-ID locators, read-only `evaluate` and `evaluateAll`, and the locator actions used by the chosen game. If your tool uses different names, map those documented actions when constructing the adapter. Coordinate input uses viewport coordinates. Patches requires a screenshot and a drag method. Zip defaults to keyboard input when possible. Sumbreak can use locator clicks without coordinate clicking.

For ordered runs, use `runDailyGames(tab, { play: true, games: [...] })`. It stops on a pending reasoning step or an unsuccessful result. Resolve that game on the current board, verify its result, and resume with the remaining games.

- **Wend:** If the runner needs vocabulary, inspect `puzzle` and `choices`, then pass `words` covering the whole board.
- **Crossclimb:** Supply `answers` in visible clue order. If it returns the endpoint clue, supply `ends` in the current ladder's top-to-bottom order.
- **Pinpoint:** Read the visible clues and supply `guess`. After entering a guess, check for the results screen or a visible **See results** button before considering another guess.

For a screenshot-only agent, transcribe the visible board into the relevant solver's input format, run the solver locally, and apply or describe its plan using the tools available to you. There is no universal browser transport. The solver modules work without the browser adapter.
