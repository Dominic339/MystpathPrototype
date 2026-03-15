using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Spawns decorative and harvestable props in the world based on each hex cell's
    /// biome data and a seeded random distribution.
    /// Prop placement is entirely data-driven — no manual artist placement.
    ///
    /// Resource gathering architecture — three distinct acquisition paths:
    ///
    ///   1. Wild Surface Harvestables  (this system, one-time or slowly regrowing)
    ///      Props placed by PropSpawner that can be gathered by workers:
    ///        - Trees          → Wood, Sticks (one-time; forester building regrows them)
    ///        - Rock outcrops  → small Stone yield
    ///        - Ore outcrops   → small Copper / Tin yield (visible surface veins)
    ///        - Berry bushes   → small RawFood yield (future)
    ///        - Reed patches   → Fiber (future; spawns near shore / swamp)
    ///      Surface props are spawned from this class using per-biome density tables.
    ///      They are NOT connected to HiddenResourceWeights — those are underground.
    ///
    ///   2. Managed / Renewable Production  (future building-controlled systems)
    ///      Buildings placed by the player that produce resources over time:
    ///        - Farm           → Grain, RawFood (requires arable/grassland cell)
    ///        - Forester Lodge → Wood (regrows trees in adjacent cells over time)
    ///        - Orchard        → RawFood (future; requires fertile land)
    ///        - Fishery        → Fish (requires adjacent IsWater hex)
    ///        - Reed Field     → Fiber (future; managed wetland crop)
    ///      These are implemented as BuildingDefinitions, not prop spawns.
    ///
    ///   3. Extractor / Underground Materials  (future extraction building systems)
    ///      Buildings that tap HiddenResourceWeights seeded during world generation:
    ///        - Quarry         → Stone (common; reveals Clay deposit if present)
    ///        - Mine           → Iron, Copper, Tin, Coal, Silver, Gold, MysticOre
    ///        - Clay Pit       → Clay (shallow alluvial; easier than a full mine)
    ///      Extraction rate is proportional to the cell's HiddenResourceWeights value.
    ///      Players discover deposits by surveying cells or building near them.
    ///
    /// This class is responsible only for path 1 (wild surface harvestables).
    /// Paths 2 and 3 are handled by the building and production systems.
    /// </summary>
    public class PropSpawner : MonoBehaviour
    {
        [Header("References")]
        [Tooltip("Source of hex cell and biome data. Auto-found if unassigned.")]
        [SerializeField] private HexGrid _hexGrid;

        [Tooltip("Used to subscribe to OnWorldGenerated for automatic re-spawn. " +
                 "Auto-found if unassigned.")]
        [SerializeField] private WorldGenerator _worldGenerator;

        [Header("Spawn Settings")]
        [Tooltip("Global density multiplier applied on top of per-biome prop weights. " +
                 "1.0 = default density from biome tables.")]
        [SerializeField] private float _propDensityMultiplier = 1f;

        // TODO: Add [SerializeField] per-biome prop table (ScriptableObject list).
        //       Each entry: BiomeType, prefab reference, base weight, min/max per cell.
        //       Biome tables should cover at minimum:
        //         Grassland : scattered rocks, small stone outcrops
        //         Forest    : trees (primary), undergrowth, mossy rocks
        //         Desert    : cacti (future), rock formations, rare ore outcrop
        //         Tundra    : sparse trees, boulders, ice-encrusted rocks
        //         Mountain  : large boulders, ore outcrops, cliff details
        //         Swamp     : twisted trees, reed patches, mud mounds
        //         Shore     : driftwood, small rocks, reed tufts (IsShore cells)

        // TODO: Link biome prop tables to BiomeProfile ScriptableObjects so art
        //       direction can be changed without code changes.

        // TODO: Implement seeded random placement using WorldGenerator's seed so
        //       prop layout is deterministic and matches the terrain generation.

        // TODO: Track spawned prop roots (e.g. List<GameObject> _spawnedRoots) so
        //       ClearAllProps can destroy them cleanly on world regeneration.

        // TODO: Subscribe to WorldGenerator.OnWorldGenerated in Start() and call
        //       ClearAllProps + SpawnAllProps on each regeneration.

        /// <summary>
        /// Spawns all wild surface props for the entire world using current HexGrid
        /// biome data. Should be called once after terrain generation is complete,
        /// or automatically via the OnWorldGenerated subscription.
        /// </summary>
        public void SpawnAllProps()
        {
            // TODO: Iterate all cells in the HexGrid
            // TODO: Skip cells where IsWater == true (no surface props in water)
            // TODO: For each land cell, look up the matching biome prop table
            // TODO: Use seeded deterministic randomness (CellHash-style) to determine
            //       prop count and type per cell, scaled by _propDensityMultiplier
            // TODO: Instantiate props as child GameObjects at world-space positions,
            //       rotated randomly around Y, with slight position jitter within hex
            // TODO: For shore cells (IsShore == true), apply the shore prop table
            //       (driftwood, reeds, etc.) in addition to the base biome table

            Debug.Log("[PropSpawner] Prop spawning triggered (not yet implemented).");
        }

        /// <summary>Destroys all previously spawned surface prop GameObjects.</summary>
        public void ClearAllProps()
        {
            // TODO: Destroy all tracked prop root GameObjects and clear the list
        }
    }
}
