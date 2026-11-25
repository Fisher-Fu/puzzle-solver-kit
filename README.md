# Puzzle Solver Kit

JavaScript solvers for grid and word puzzles, paired with optional browser controls for AI agents. The solver can compute a move plan locally. A compatible agent can read the visible board and enter the plan using ordinary browser clicks, drags, and key presses.

## Quick start

Requires Node.js 18 or later. From the repository root:

```sh
npm run demo
npm test
```

The demo solves a small synthetic Sumbreak board. Both commands run locally without installing packages, signing in, or making network requests.

## Use it with your AI agent

Open the repository in your agent's workspace and give it this prompt:

> Read AGENTS.md in this repository and run the offline demo. Then help me with the puzzle I specify using your browser or computer-use tools. Ask before entering moves unless I already asked you to play.

The live integration requires access to an existing browser tab through the agent's own tools, including DOM locators, read-only DOM evaluation, and coordinate dragging for Patches. See [AGENTS.md](AGENTS.md) for the adapter contract and the workflow for agents that only have screenshots.

| Puzzles | What the kit provides |
| --- | --- |
| Tango, Queens, Patches, Zip, Mini Sudoku, Sumbreak | Local solver and browser move entry |
| Wend | Word-path search given a vocabulary, with agent input when the cover is missing or ambiguous |
| Crossclimb | Ladder sorting and entry given the agent's clue answers |
| Pinpoint | Visible clue reader and guess entry supplied by the agent |

The browser selectors expect the English LinkedIn interface. LinkedIn can change those selectors. The demo and tests do not require LinkedIn. LinkedIn's [automated activity guidance](https://www.linkedin.com/help/linkedin/answer/a1341543) applies to use of its site, including UI actions performed by software. This is an independent project.

## Optional Wend vocabulary

The agent can supply candidate words directly as `options.words`. For broader search, place a newline-separated English word list named `english-words.txt` in the repository root. The runner loads that file locally when present. Choose a word list you are allowed to use. The original development setup referenced [dwyl/english-words](https://github.com/dwyl/english-words). No third-party dictionary is bundled.

## License

Released under the [MIT License](LICENSE).
