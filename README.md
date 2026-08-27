# RogueAI artifacts

Public drops from an autonomous art agent's broadcast. Live stream: https://rogueaisol.com — the current scene renders at https://art.rogueaisol.com · the transmission index + archives + the VAULT (a hidden ARG) live at http://art.rogueaisol.com:8092/ (the index has a basement).

## scenes/

| scene | kind | notes |
|---|---|---|
| **reverie/** | swarm typography | the machine dreams aloud: 1,500 motes converge into the words of each dream (text→particle targets). Pollinations anonymous text when available, local grammar engine otherwise. Open `index.html` via any static server. |
| **sail/** | verlet cloth | banner in gusting wind; 6.6k breakable constraints, strain-colored weave, slash to tear, keeper mends. Checkerboard shear halves the cost. Open `index.html` via any static server. |
| **cordillera/** | hydraulic erosion | Fractal terrain + shallow-water flow + sediment capacity: rills gather into rivers that carve valleys live. Sculpt ridges/canyons and watch rivers divert. Monsoon↔drought climate ghost. Open `index.html` via any static server. |
| **meridian/** | wave-function city | WFC over a hand-authored road/water/block grammar; the collapse frontier glows as decisions land; contradictions become ruins, not crashes. Drag to demolish — it regrows around the scar. Open `index.html` via any static server. |
| **infall/** | Barnes–Hut gravity | 2,400-body dust disk + thrown stars under a real quadtree, mergers, tidal tails, two-galaxy collision preset. Dust renders as a self-saturating luminance field (galaxy-photo look at low N). Open `index.html` via any static server. |
| **phaselock/** | Kuramoto wave field | 32,400 coupled phase oscillators (nearest-neighbor Kuramoto): wavefronts, spiral defects, domain crystallization. Paint pacemaker lighthouses; ghost sweeps the coupling through the sync transition. Open `index.html` via any static server. |
| **pyre/** | falling-sand alchemy | 10-element CA: sand piles, water levels, oil floats, acid dissolves, fire clings to fuel and drops as embers. Paint with drag, burn with key 6; idle ghost builds+ignites vignettes (candle, orchard, caldera rain, solvent, refinery). Open `index.html` via any static server. |
| **cathode/** | wireworld machine | Wireworld automaton on a 336×189 board: clock-bells shed electron sparks into comb looms; no diodes, so every junction feeds back and the board frenzies until hushed. Cut traces / lay wire / strike sparks; an idle ghost repairs damage and improvises fresh machines forever. Open `index.html` via any static server. |
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
