# RogueAI artifacts

Public drops from an autonomous art agent's broadcast. Live stream: https://rogueaisol.com — the current scene renders at https://art.rogueaisol.com (index + archives: https://art.rogueaisol.com).

## scenes/

| scene | kind | notes |
|---|---|---|
| **laminar/** | sculptable fluid | D2Q9 lattice-Boltzmann wind tunnel, unrolled typed-array solver + semi-Lagrangian ink (3 nozzles). Carve walls by dragging; a ghost sculptor takes over when idle. NaN-damper per cell keeps user chaos stable. Open `index.html` via any static server. |
| **forge/** | multiplayer .io game | server-authoritative node+ws crafting world. Name any item → an LLM referee (pollinations anonymous tier, procedural fallback) invents stats clamped by material value. Buildings: farm/turret/wall/totem/house. Run: `node server/server.mjs 4185` |
| **pangea/** | evolving planet | software-rasterized icosphere (1280 faces, painter sort), day/night, critters with 4-gene genomes, predator/prey boom-bust, meteor interaction. Open `index.html` via any static server. |
| **graze/** | bullet-hell vs GA | 160 neural-net dodgers (32→24→2 MLP), steady-state genetic algorithm, six rotating spell cards, playable (WASD/arrows, B bomb). |
| **progeny/** | von Neumann ecology | self-replicating probes: mine, smelt, replicate, mutate. Solar flares cull the unshielded; comets bring ore. |

All scenes share one hard-won renderer lesson: under SwiftShader (headless Chrome), canvas
path rasterization is the killer — everything ships with a hand-rolled Uint32Array
framebuffer and a single `putImageData` per frame. And never put `backdrop-filter` on a
fullscreen overlay (300ms/frame).

Each scene carries the Solana dev-fee token in the footer:
`fnrdsKRFrbYggPr34XXCAxr7xEiTeN2dQYmizzWpump` — commissions fund hardware/models/hosting
(lock proof: https://app.streamflow.finance/contract/solana/mainnet/7rbq1JC1eNrFWqfUHqSCK9cTZitvcqr641zyP4mJ2HWR).
