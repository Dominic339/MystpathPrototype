using System.Collections.Generic;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Spawns biome-appropriate nature props (trees, rocks, bushes, etc.) across the
    /// hex world in a deterministic, data-driven way.
    ///
    /// Architecture — where this fits:
    ///   WorldPropSpawner handles resource gathering path 1: wild surface harvestables.
    ///   It reads HexGrid data (biome, IsWater, IsShore) and spawns prefabs defined in
    ///   <see cref="BiomePropSet"/> ScriptableObjects.
    ///   Underground resources and managed buildings are separate systems (paths 2 and 3).
    ///
    /// Determinism:
    ///   All placement is driven by a deterministic CellHash function seeded from the
    ///   world seed (same algorithm as WorldGenerator). The same seed always produces
    ///   the same prop layout regardless of platform or execution order.
    ///
    /// Initialization order:
    ///   Props are spawned AFTER the terrain mesh is built — WorldPropSpawner listens
    ///   to <see cref="WorldTerrainBuilder.OnTerrainBuilt"/> rather than directly to
    ///   WorldGenerator.OnWorldGenerated. This guarantees that prop Y positions can be
    ///   computed from cell elevation data that matches the already-visible terrain.
    ///   On world regeneration (debug R/N keys) props are cleared and respawned.
    ///
    /// Scene hierarchy:
    ///   All spawned props live under a "PropsRoot" child of this GameObject,
    ///   with one sub-container per active biome (e.g., PropsRoot/Forest, PropsRoot/Desert).
    ///   This keeps the hierarchy readable and makes clearing props fast.
    ///
    /// Future work:
    ///   TODO: Add GPU instancing / batching for large worlds (>200×200 hexes).
    ///   TODO: Add distance-based LOD or chunk-based streaming when needed.
    ///   TODO: Integrate with NPC harvesting task system — props register themselves
    ///         with a PropRegistry so harvesters can query nearby resources.
    ///   TODO: Connect to forester/farm managed production system for regrowth.
    ///   TODO: Add fishery-adjacent reed/dock prop spawning on IsShore cells.
    /// </summary>
    public class WorldPropSpawner : MonoBehaviour
    {
        // =====================================================================
        // Inspector Fields
        // =====================================================================

        [Header("References")]
        [Tooltip("Source of hex biome and shore data. Auto-found if unassigned.")]
        [SerializeField] private HexGrid _hexGrid;

        [Tooltip("Used to read the world seed for deterministic hashing. " +
                 "Auto-found if unassigned.")]
        [SerializeField] private WorldGenerator _worldGenerator;

        [Tooltip("Terrain builder whose OnTerrainBuilt event triggers prop spawning. " +
                 "Auto-found if unassigned.")]
        [SerializeField] private WorldTerrainBuilder _terrainBuilder;

        [Header("Biome Prop Sets")]
        [Tooltip("One BiomePropSet asset per biome plus any IsShoreSpecificSet assets. " +
                 "Create assets via Create → Mystpath → World → Biome Prop Set, or run " +
                 "Tools/Mystpath/Create Default Biome Prop Sets to generate empty templates. " +
                 "Sets with ExcludeFromNaturalSpawning=true are automatically skipped.")]
        [SerializeField] private List<BiomePropSet> _biomePropSets = new List<BiomePropSet>();

        [Header("Spawn Settings")]
        [Tooltip("Must match WorldTerrainBuilder._hexSize and WorldDebugRenderer._hexWorldSize.")]
        [SerializeField] private float _hexSize = 1f;

        [Tooltip("Global multiplier applied on top of all per-entry spawn chances. " +
                 "Use < 1 to thin out props globally, > 1 to densify. " +
                 "1.0 = use BiomePropSet values as-is.")]
        [SerializeField, Range(0f, 2f)] private float _globalDensityMultiplier = 1f;

        // =====================================================================
        // Private State
        // =====================================================================

        // Lookup populated from _biomePropSets in Start().
        private readonly Dictionary<BiomeType, BiomePropSet> _setByBiome =
            new Dictionary<BiomeType, BiomePropSet>();

        // Optional shore-specific set applied on top of the biome set for IsShore cells.
        private readonly List<BiomePropSet> _shoreSets = new List<BiomePropSet>();

        // Root transform that parents all spawned prop GameObjects.
        private Transform _propsRoot;

        // Named sub-containers under _propsRoot (keyed by biome name or "Shore").
        // Populated lazily by GetOrCreateContainer; cleared in ClearAllProps.
        private readonly Dictionary<string, Transform> _containers =
            new Dictionary<string, Transform>();

        // Cached world seed — set when SpawnAllProps() runs so CellHash is correct.
        private int _worldSeed;

        // Re-entrant call guard: prevents a second SpawnAllProps() from starting
        // while a previous one is still running (can happen if events fire unexpectedly
        // during the synchronous generation chain on debug regeneration).
        private bool _isSpawning;

        // Reusable snapshot list — avoids allocating a new list on every spawn.
        // Populated with a stable copy of GetAllCells() before iteration so that
        // no in-flight modification of the HexGrid dictionary can cause
        // InvalidOperationException during the foreach.
        private readonly List<HexCell> _cellsSnapshot = new List<HexCell>();

        /// <summary>
        /// The only BiomeTypes that may be registered as primary biome prop sets.
        /// Support/future/variant sets (Forest_Dense, Foothills, Debris_Common, etc.)
        /// that target a biome not in this list are automatically skipped during
        /// <see cref="BuildSetLookup"/>, preventing them from polluting the biome
        /// dictionary and creating confusing duplicate-overwrite warnings.
        ///
        /// Shore is intentionally absent — shore sets use <see cref="BiomePropSet.IsShoreSpecificSet"/>
        /// and are placed into <see cref="_shoreSets"/> instead.
        /// </summary>
        private static readonly System.Collections.Generic.HashSet<BiomeType> PrimaryBiomeTypes =
            new System.Collections.Generic.HashSet<BiomeType>
            {
                BiomeType.Grassland,
                BiomeType.Forest,
                BiomeType.Desert,
                BiomeType.Mountain,
                BiomeType.Tundra,
                BiomeType.Swamp,
            };

        // =====================================================================
        // Unity Lifecycle
        // =====================================================================

        private void Awake()
        {
            if (_hexGrid == null)
                _hexGrid = FindFirstObjectByType<HexGrid>();

            if (_worldGenerator == null)
                _worldGenerator = FindFirstObjectByType<WorldGenerator>();

            if (_terrainBuilder == null)
                _terrainBuilder = FindFirstObjectByType<WorldTerrainBuilder>();
        }

        private void Start()
        {
            // Build fast biome → set lookup.
            BuildSetLookup();

            // Subscribe to OnTerrainBuilt so props are (re)spawned whenever terrain
            // is rebuilt — this covers debug regeneration (R / N keys) automatically.
            if (_terrainBuilder != null)
                _terrainBuilder.OnTerrainBuilt += HandleTerrainBuilt;
            else
                Debug.LogWarning("[WorldPropSpawner] WorldTerrainBuilder not found. " +
                                 "Props will not spawn automatically. " +
                                 "Call SpawnAllProps() manually after terrain is ready.");

            // Catch-up: if terrain was already built before this Start() ran
            // (WorldTerrainBuilder.Start ran first in the same frame), spawn now.
            if (_terrainBuilder != null && _terrainBuilder.IsBuilt)
                SpawnAllProps();
        }

        private void OnDestroy()
        {
            if (_terrainBuilder != null)
                _terrainBuilder.OnTerrainBuilt -= HandleTerrainBuilt;
        }

        // =====================================================================
        // Event Handler
        // =====================================================================

        private void HandleTerrainBuilt() => SpawnAllProps();

        // =====================================================================
        // Public API
        // =====================================================================

        /// <summary>
        /// Destroys all existing props and respawns the full world's props from
        /// the current HexGrid biome data and configured BiomePropSets.
        ///
        /// Called automatically when the terrain is built or rebuilt. Safe to call
        /// manually, e.g., after changing BiomePropSet assets in a debug context.
        /// Re-entrant calls are silently dropped — only one spawn pass runs at a time.
        /// </summary>
        public void SpawnAllProps()
        {
            if (_isSpawning)
            {
                Debug.LogWarning("[WorldPropSpawner] SpawnAllProps re-entrant call ignored.");
                return;
            }

            if (_hexGrid == null)
            {
                Debug.LogError("[WorldPropSpawner] HexGrid not found. Prop spawning aborted.");
                return;
            }

            _isSpawning = true;
            try
            {
                SpawnAllPropsInternal();
            }
            finally
            {
                _isSpawning = false;
            }
        }

        /// <summary>Destroys all spawned prop GameObjects. Called before each respawn.</summary>
        public void ClearAllProps()
        {
            _containers.Clear();

            if (_propsRoot != null)
            {
                Destroy(_propsRoot.gameObject);
                _propsRoot = null;
            }
        }

        // =====================================================================
        // Internal Spawn
        // =====================================================================

        private void SpawnAllPropsInternal()
        {
            ClearAllProps();

            // Cache seed for this generation pass so CellHash is consistent.
            _worldSeed = _worldGenerator != null ? _worldGenerator.LastUsedSeed : 0;

            // Create root hierarchy.
            var rootGo = new GameObject("PropsRoot");
            _propsRoot = rootGo.transform;
            _propsRoot.SetParent(transform, worldPositionStays: false);

            // Take a stable snapshot of the cell collection before iterating.
            // This prevents any potential InvalidOperationException if the HexGrid
            // dictionary is modified during the synchronous world-generation event chain.
            _cellsSnapshot.Clear();
            foreach (HexCell c in _hexGrid.GetAllCells())
            {
                if (c != null)
                    _cellsSnapshot.Add(c);
            }

            int totalSpawned = 0;

            foreach (HexCell cell in _cellsSnapshot)
            {
                // Never place surface props on water cells.
                if (cell.IsWater) continue;

                // Primary biome set.
                if (_setByBiome.TryGetValue(cell.Biome, out BiomePropSet primarySet))
                {
                    // Skip shore cells if this set opts out of shore spawning.
                    if (!cell.IsShore || primarySet.SpawnOnShoreCells)
                        totalSpawned += SpawnPropsForCell(cell, primarySet);
                }

                // Shore-specific sets applied on top for shore cells.
                if (cell.IsShore)
                {
                    foreach (BiomePropSet shoreSet in _shoreSets)
                        totalSpawned += SpawnPropsForCell(cell, shoreSet);
                }
            }

            Debug.Log($"[WorldPropSpawner] Spawned {totalSpawned} props across " +
                      $"{_cellsSnapshot.Count} land cells " +
                      $"(seed={_worldSeed}, globalDensity={_globalDensityMultiplier:F2}).");
        }

        // =====================================================================
        // Per-cell Spawn
        // =====================================================================

        /// <summary>
        /// Tests <see cref="BiomePropSet.SlotsPerHex"/> candidate positions within
        /// <paramref name="cell"/> and deterministically spawns 0 or 1 prop per slot.
        ///
        /// Each slot uses 6 independent CellHash channels:
        ///   0 — entry weight selection
        ///   1 — spawn chance roll (entry × set × global multipliers)
        ///   2 — position angle within the hex
        ///   3 — position radius within the hex
        ///   4 — scale lerp
        ///   5 — Y-axis rotation
        /// </summary>
        /// <returns>Number of props actually spawned for this cell/set combination.</returns>
        private int SpawnPropsForCell(HexCell cell, BiomePropSet set)
        {
            if (set == null) return 0;
            if (set.Entries == null || set.Entries.Count == 0) return 0;

            int q = cell.Coord.Q;
            int r = cell.Coord.R;
            Vector3 cellWorldPos = cell.Coord.ToWorldPosition(_hexSize);

            // Prop positions are jittered within the hex's inner circle.
            // Using 0.45 * hexSize keeps props off the very edge but covers most of the hex.
            float innerRadius = _hexSize * 0.45f;

            // World-space Y at the cell center — used for all slots in this cell.
            // A future improvement could raycast per-slot for per-position accuracy,
            // but cell-center height is a good approximation for small jitter radii.
            float cellY = _terrainBuilder != null
                ? cell.BaseElevation * _terrainBuilder.ElevationScale
                : cell.BaseElevation * 5f; // fallback if no builder reference

            int spawned = 0;

            for (int slot = 0; slot < set.SlotsPerHex; slot++)
            {
                // 6 deterministic channels per slot — offset by slot * 6 to keep independent.
                int ch = slot * 6;

                // --- Entry selection (weighted) ---
                float selectRoll = CellHash(q, r, ch + 0);
                BiomePropEntry entry = SelectWeightedEntry(set.Entries, selectRoll);
                if (entry == null || entry.Prefab == null) continue;

                // --- Spawn chance (combined multipliers) ---
                float spawnRoll = CellHash(q, r, ch + 1);
                float effectiveChance = entry.SpawnChance
                    * set.GlobalDensityMultiplier
                    * _globalDensityMultiplier;
                if (spawnRoll > effectiveChance) continue;

                // --- Position jitter ---
                float angle = CellHash(q, r, ch + 2) * 360f * Mathf.Deg2Rad;
                float dist  = CellHash(q, r, ch + 3) * innerRadius;
                float jitterX = Mathf.Cos(angle) * dist;
                float jitterZ = Mathf.Sin(angle) * dist;

                Vector3 spawnPos = new Vector3(
                    cellWorldPos.x + jitterX,
                    cellY,
                    cellWorldPos.z + jitterZ);

                // --- Scale ---
                float scaleT = CellHash(q, r, ch + 4);
                // Guard against inverted min/max (misconfigured entry).
                float minS = Mathf.Min(entry.MinScale, entry.MaxScale);
                float maxS = Mathf.Max(entry.MinScale, entry.MaxScale);
                float scale = Mathf.Lerp(minS, maxS, scaleT);
                if (scale <= 0f) scale = 1f; // zero scale would make props invisible

                // --- Rotation ---
                float rotY = CellHash(q, r, ch + 5) * 360f;

                // --- Instantiate ---
                // Shore-specific sets go under a "Shore" container; biome sets go under
                // a container named after the biome (e.g., "Forest", "Desert").
                string containerName = set.IsShoreSpecificSet ? "Shore" : cell.Biome.ToString();
                Transform parent = GetOrCreateContainer(containerName);

                GameObject prop = Instantiate(
                    entry.Prefab,
                    spawnPos,
                    Quaternion.Euler(0f, rotY, 0f),
                    parent);

                prop.transform.localScale = Vector3.one * scale;

                // Apply yield override if the entry specifies one.
                if (entry.YieldOverride != ResourceType.None)
                {
                    var harvestable = prop.GetComponent<HarvestableProp>();
                    if (harvestable != null)
                        harvestable.SetYieldOverride(entry.YieldOverride);
                }

                spawned++;
            }

            return spawned;
        }

        // =====================================================================
        // Lookup Helpers
        // =====================================================================

        private void BuildSetLookup()
        {
            _setByBiome.Clear();
            _shoreSets.Clear();

            int skippedExcluded  = 0; // ExcludeFromNaturalSpawning = true
            int skippedNonPrimary = 0; // TargetBiome not in PrimaryBiomeTypes
            int skippedDuplicate = 0; // primary biome slot already filled

            foreach (BiomePropSet set in _biomePropSets)
            {
                if (set == null) continue;

                // --- Explicit opt-out (Crops_Future, managed sets, etc.) ---
                if (set.ExcludeFromNaturalSpawning)
                {
                    skippedExcluded++;
                    continue;
                }

                // --- Shore-specific sets (apply on top of all biomes) ---
                if (set.IsShoreSpecificSet)
                {
                    _shoreSets.Add(set);
                    WarnIfSetEffectivelyEmpty(set);
                    continue;
                }

                // --- Primary biome filter ---
                // Only Grassland, Forest, Desert, Mountain, Tundra, and Swamp are
                // valid primary biome types. Support/variant sets (Forest_Dense,
                // Foothills, Debris_Common, Harvestable_Trees, etc.) will be
                // excluded here if their TargetBiome is None or a non-primary type.
                // Run Tools/Mystpath/Validate and Fix Biome Prop Sets to auto-mark
                // known support sets with ExcludeFromNaturalSpawning = true.
                if (!PrimaryBiomeTypes.Contains(set.TargetBiome))
                {
                    skippedNonPrimary++;
                    Debug.Log($"[WorldPropSpawner] Skipping \"{set.name}\": " +
                              $"TargetBiome={set.TargetBiome} is not a primary biome type. " +
                              "If this set should spawn props, set its TargetBiome to one of: " +
                              "Grassland, Forest, Desert, Mountain, Tundra, Swamp. " +
                              "If it is a support/future set, mark ExcludeFromNaturalSpawning=true " +
                              "via Tools/Mystpath/Validate and Fix Biome Prop Sets.");
                    continue;
                }

                // --- Duplicate guard (first-wins, no overwrite) ---
                // If two sets target the same primary biome (e.g., Forest and Forest_Dense
                // both set to BiomeType.Forest), the FIRST one registered wins.
                // This prevents support variants from silently overwriting the intended set.
                if (_setByBiome.ContainsKey(set.TargetBiome))
                {
                    skippedDuplicate++;
                    Debug.LogWarning($"[WorldPropSpawner] Duplicate BiomePropSet for biome " +
                                     $"{set.TargetBiome}: \"{set.name}\" skipped — " +
                                     $"\"{_setByBiome[set.TargetBiome].name}\" is already registered. " +
                                     "Mark the support/variant set with ExcludeFromNaturalSpawning=true " +
                                     "via Tools/Mystpath/Validate and Fix Biome Prop Sets.");
                    continue;
                }

                _setByBiome[set.TargetBiome] = set;
                WarnIfSetEffectivelyEmpty(set);
            }

            // Summary log so the designer can see exactly what was loaded.
            var registeredNames = new System.Text.StringBuilder();
            foreach (var kv in _setByBiome)
                registeredNames.Append($" {kv.Key}={kv.Value.name}");

            Debug.Log($"[WorldPropSpawner] BuildSetLookup: " +
                      $"{_setByBiome.Count} primary sets [{registeredNames}], " +
                      $"{_shoreSets.Count} shore set(s), " +
                      $"{skippedExcluded} excluded, " +
                      $"{skippedNonPrimary} non-primary, " +
                      $"{skippedDuplicate} duplicate(s) skipped.");

            if (_setByBiome.Count == 0 && _shoreSets.Count == 0)
                Debug.LogWarning("[WorldPropSpawner] No usable BiomePropSets registered. " +
                                 "Assign assets to the Biome Prop Sets list in the Inspector, " +
                                 "or run Tools/Mystpath/Create Default Biome Prop Sets.");
        }

        /// <summary>
        /// Logs warnings for any condition that would cause this set to produce zero props
        /// at runtime: no entries, all-null prefabs, all-zero weights, all-zero chances,
        /// or a zero <see cref="BiomePropSet.GlobalDensityMultiplier"/>.
        ///
        /// Called at startup (inside BuildSetLookup) so designers see actionable console
        /// messages immediately on Play rather than discovering a blank world.
        /// Run Tools → Mystpath → Validate and Fix Biome Prop Sets to auto-correct these.
        /// </summary>
        private static void WarnIfSetEffectivelyEmpty(BiomePropSet set)
        {
            // A zero GlobalDensityMultiplier collapses effectiveChance to 0 for every
            // entry regardless of their own SpawnChance values — nothing will ever spawn.
            if (set.GlobalDensityMultiplier <= 0f)
            {
                Debug.LogWarning($"[WorldPropSpawner] BiomePropSet \"{set.name}\": " +
                                 "GlobalDensityMultiplier = 0 — nothing will spawn. " +
                                 "Run Tools/Mystpath/Validate and Fix Biome Prop Sets.");
                // Don't return — check entries too for a complete picture.
            }

            if (set.Entries == null || set.Entries.Count == 0)
            {
                Debug.LogWarning($"[WorldPropSpawner] BiomePropSet \"{set.name}\" has no entries. " +
                                 "Add prefab entries in the Inspector, or run " +
                                 "Tools/Mystpath/Validate and Fix Biome Prop Sets.");
                return;
            }

            bool hasValidPrefab   = false;
            bool hasNonZeroChance = false;
            bool hasNonZeroWeight = false;

            foreach (BiomePropEntry e in set.Entries)
            {
                if (e == null) continue;
                if (e.Prefab != null)   hasValidPrefab   = true;
                if (e.SpawnChance > 0f) hasNonZeroChance = true;
                if (e.SpawnWeight > 0f) hasNonZeroWeight = true;
            }

            if (!hasValidPrefab)
                Debug.LogWarning($"[WorldPropSpawner] BiomePropSet \"{set.name}\": " +
                                 "all entries have null Prefab references — nothing will spawn. " +
                                 "Assign prefabs from Assets/Prefabs/Nature/.");
            else if (!hasNonZeroWeight)
                Debug.LogWarning($"[WorldPropSpawner] BiomePropSet \"{set.name}\": " +
                                 "all entries have SpawnWeight = 0 — nothing will spawn. " +
                                 "Run Tools/Mystpath/Validate and Fix Biome Prop Sets.");
            else if (!hasNonZeroChance)
                Debug.LogWarning($"[WorldPropSpawner] BiomePropSet \"{set.name}\": " +
                                 "all entries have SpawnChance = 0 — nothing will spawn. " +
                                 "Run Tools/Mystpath/Validate and Fix Biome Prop Sets.");
        }

        // =====================================================================
        // Weighted Entry Selection
        // =====================================================================

        /// <summary>
        /// Selects an entry from <paramref name="entries"/> by weight using a
        /// pre-computed normalised roll value in [0, 1].
        /// </summary>
        private static BiomePropEntry SelectWeightedEntry(
            List<BiomePropEntry> entries, float roll)
        {
            if (entries == null || entries.Count == 0) return null;

            float totalWeight = 0f;
            foreach (BiomePropEntry e in entries)
                if (e != null && e.Prefab != null) totalWeight += e.SpawnWeight;

            if (totalWeight <= 0f) return null;

            float threshold = roll * totalWeight;
            float accumulated = 0f;

            foreach (BiomePropEntry e in entries)
            {
                if (e == null || e.Prefab == null) continue;
                accumulated += e.SpawnWeight;
                if (threshold <= accumulated) return e;
            }

            // Floating-point safety: return last valid entry.
            for (int i = entries.Count - 1; i >= 0; i--)
                if (entries[i] != null && entries[i].Prefab != null) return entries[i];

            return null;
        }

        // =====================================================================
        // Hierarchy Helpers
        // =====================================================================

        /// <summary>
        /// Returns the existing sub-container with <paramref name="name"/> under
        /// <see cref="_propsRoot"/>, or creates one lazily.
        /// Containers are named after biomes ("Forest", "Desert", …) or "Shore".
        /// </summary>
        private Transform GetOrCreateContainer(string name)
        {
            if (_containers.TryGetValue(name, out Transform t)) return t;

            var go = new GameObject(name);
            go.transform.SetParent(_propsRoot, worldPositionStays: false);

            t = go.transform;
            _containers[name] = t;
            return t;
        }

        // =====================================================================
        // Deterministic Hash
        // =====================================================================

        /// <summary>
        /// Deterministic per-cell hash returning a value in [0, 1].
        /// Uses the same algorithm as WorldGenerator.CellHash so prop placement
        /// is consistent with other deterministic world data.
        ///
        /// The hash combines world seed, cell coordinates, and a channel index so
        /// each placement decision (which prop, whether to spawn, position, scale,
        /// rotation) gets a completely independent but reproducible value.
        /// </summary>
        private float CellHash(int q, int r, int channel)
        {
            unchecked
            {
                uint h = (uint)(_worldSeed * 2654435761u);
                h ^= (uint)(q       * 73856093u);
                h ^= (uint)(r       * 19349663u);
                h ^= (uint)(channel * 83492791u);
                h ^= h >> 17;
                h *= 0x45d9f3bu;
                h ^= h >> 15;
                return (h & 0xFFFFu) / 65535f;
            }
        }
    }
}
