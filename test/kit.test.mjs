import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserAdapter } from '../src/browser-adapter.mjs';
import { planCrossclimb } from '../src/crossclimb-fast.mjs';
import { prepareRaceKit, runDailyGames, runGame } from '../src/race-kit.mjs';
import { solveSumbreak } from '../src/sumbreak-fast.mjs';
import { solveWend } from '../src/wend-fast.mjs';

test('Sumbreak solves an original board with a multiplier', () => {
  const solution = solveSumbreak({ rows: 2, columns: 2, cells: [2, '×2', 0, 4] });
  assert.equal(solution.finalValue, 8);
  assert.deepEqual(solution.moves.map(({ from, to }) => [from, to]), [[0, 1], [1, 3]]);
});

test('a Sumbreak preview parses English tile labels without sending inputs', async () => {
  const labels = ['Number 2, row 1, column 1', 'Multiply by 2, row 1, column 2', 'Number 4, row 2, column 2'];
  const tab = createBrowserAdapter({
    playwright: {
      locator() {
        return {
          evaluate: async () => ({
            rows: 2, columns: 2,
            tiles: labels.map((label, index) => ({ label, index: [0, 1, 3][index] })),
          }),
        };
      },
    },
    url: () => 'https://www.linkedin.com/games/sumbreak/',
    snapshot: () => 'Visible board',
  });
  const preview = await runGame('sumbreak', tab);
  assert.equal(preview.dryRun, true);
  assert.equal(preview.solution.finalValue, 8);
});

test('the adapter identifies the result page without copying URL parameters', async () => {
  const tab = createBrowserAdapter({
    playwright: {},
    url: () => 'https://www.linkedin.com/games/zip/results/?sample=discard#details',
    snapshot: () => 'Visible result',
  });
  assert.equal(await tab.getAXState(), 'https://www.linkedin.com/games/zip/results/\nVisible result');
});

test('the default batch stays offline and the dictionary is optional', async () => {
  assert.equal((await runDailyGames(null)).preparedOnly, true);
  assert.ok(Number.isInteger((await prepareRaceKit()).wordCount));
});

test('Wend uses supplied vocabulary and Crossclimb orders a word chain', () => {
  const puzzle = {
    rows: 2, cols: 3, lengths: [3, 3],
    cells: [...'CATDOG'].map((letter, index) => ({ index, letter, hole: false })),
  };
  assert.deepEqual(solveWend(puzzle, ['CAT', 'DOG']).words.map(x => x.word), ['CAT', 'DOG']);
  assert.deepEqual(planCrossclimb(['COLD', 'CORD', 'CARD', 'WARD']), ['COLD', 'CORD', 'CARD', 'WARD']);
});
