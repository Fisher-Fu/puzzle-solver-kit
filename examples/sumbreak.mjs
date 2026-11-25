import { solveSumbreak } from '../src/sumbreak-fast.mjs';

export const board = { rows: 2, columns: 2, cells: [2, '×2', 0, 4] };

const solution = solveSumbreak(board);
if (!solution) throw new Error('The sample board has no solution.');

console.log('Moves (zero-based cell indexes):');
for (const { from, to } of solution.moves) {
  console.log(`  ${from} -> ${to}`);
}
console.log(`Final value: ${solution.finalValue}`);
