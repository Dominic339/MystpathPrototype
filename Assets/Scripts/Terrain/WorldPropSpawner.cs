using System.Collections;
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
    /// Orientation:
    ///   Each prop receives a random yaw rotation composed with its prefab's authored base
    ///   rotation. This preserves any FBX import axis-correction rotations baked into the
    ///   prefab root (common with Blender-exported assets), so props always stand upright
    ///   regardless of how the original model was oriented in the source DCC tool.
    ///
    /// Scale / readability:
    ///   Use <see cref="_globalScaleMultiplier"/> to increase all prop sizes for a
    ///   zoomed-out management camera without editing every BiomePropSet entry individually.
    ///
    /// Large-world performance:
    ///   Spawning is batched across multiple frames (controlled by <see cref="_spawnBatchSize"/>)
    ///   so the game remains responsive during world load. Use <see cref="_maxPropsTotal"/>
    ///   to hard-cap the prop count on very large (>300×300) worlds.
    ///
    /// Coverage distribution:
    ///   A two-octave Perlin coverage mask (<see cref="CoverageMask"/>,
    ///   tuned by <see cref="_coverageNoiseScale"/>) creates smooth large-scale density
    ///   variation spanning many hex cells. Rather than every cell rolling an identical
    ///   flat spawn chance, props cluster naturally into dense patches, open glades, rocky
    ///   outcrops, and sparse clearings — matching how real ecosystems distribute.
    ///   Each biome uses its own shaping curve so Forest always has a dense floor and Desert
    ///   stays mostly empty with occasional cactus/rock clusters.
    ///   Jitter is also widened (0.75 × hexSize) with Mathf.Sqrt uniform-disk sampling so
    ///   props spread across cell boundaries instead of piling at each cell's centre.
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
                 "Effective spawn chance per slot = entry.SpawnChance × set.GlobalDensityMultiplier × this. " +
                 "Values above 1.0 densify the world; the formula clamps naturally at 1.0 so " +
                 "setting this to 2.0 with SpawnChance=0.5 gives 100% fill on those slots. " +
                 "Tuning guide for a 200×200 management-camera world: " +
                 "  1.0 = sparse prototype look (few props visible from above). " +
                 "  1.5 = target baseline — biomes are clearly populated. " +
                 "  2.0 = dense / overgrown feel. " +
                 "  3.0+ = extreme — only useful for swamp/dense forest biomes. " +
                 "Per-biome tuning uses BiomePropSet.GlobalDensityMultiplier instead.")]
        [SerializeField, Range(0f, 20f)] private float _globalDensityMultiplier = 1.5f;

        [Header("Scale & Readability")]
        [Tooltip("Global scale multiplier applied on top of every per-entry scale range. " +
                 "At hexSize=1 a 200×200 world is 200 units across. Props need to be " +
                 "≥3 world units to be visible from a management camera at altitude 150–250. " +
                 "Tuning guide (entry default MinScale=1, MaxScale=1.5, avg=1.25): " +
                 "  2.0 = 2.5 units avg — borderline visible, small blobs. " +
                 "  3.5 = 4.4 units avg — clearly readable from kingdom-builder camera. " +
                 "  5.0 = 6.25 units avg — large, dramatic; good for hero props. " +
                 "Does not alter BiomePropSet assets; safe to tweak freely at runtime.")]
        [SerializeField, Range(0.1f, 30f)] private float _globalScaleMultiplier = 3.5f;

        [Header("Large-World Performance")]
        [Tooltip("Hard cap on the total number of spawned props across the whole world. " +
                 "0 = no cap (suitable for worlds up to ~200×200 hexes). " +
                 "Set 50 000–100 000 for worlds above 300×300 to prevent memory pressure. " +
                 "Props are spawned in cell-iteration order, so the cap naturally biases " +
                 "toward the cells iterated first (no spatial preference).")]
        [SerializeField] private int _maxPropsTotal = 0;

        [Tooltip("Number of props instantiated per frame during the spawn pass. " +
                 "Lower values keep the game responsive during world load " +
                 "(world is visible and interactive while props stream in). " +
                 "Higher values finish spawning faster at the cost of frame spikes. " +
                 "500 is a good balance for most hardware.")]
        [SerializeField, Range(50, 2000)] private int _spawnBatchSize = 500;

        [Header("Coverage Distribution")]
        [Tooltip("Spatial frequency of the Perlin coverage noise mask. Lower = broader " +
                 "smooth density zones that span more cells; higher = tighter variation. " +
                 "At the default 0.08, one noise period spans ~12 hex cells, creating " +
                 "natural forest patches and open glades. Raising to 0.15 tightens zones " +
                 "to ~7 cells (small meadow pockets). Lowering to 0.04 gives very broad " +
                 "25-cell zones, like continental-scale biome blending. " +
                 "Safe to tune at runtime — only affects the next spawn pass.")]
        [SerializeField, Range(0.02f, 0.40f)] private float _coverageNoiseScale = 0.08f;

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

        // Cached world seed — set when the spawn coroutine starts so CellHash is correct.
        private int _worldSeed;

        // Handle to the active spawn coroutine, or null if spawning is not in progress.
        // Used by SpawnAllProps() to cancel any in-flight pass before starting a new one,
        // and by OnDestroy() to stop the coroutine cleanly when the component is removed.
        private Coroutine _spawnCoroutine;

        // Reusable snapshot list — avoids allocating a new list on every spawn.
        // Populated with a stable copy of GetAllCells() before iteration so that
        // no in-flight modification of the HexGrid dictionary can cause
        // InvalidOperationException during the foreach.
        private readonly List<HexCell> _cellsSnapshot = new List<HexCell>();

        // Noise offsets for the large-scale coverage mask.
        // Derived deterministically from the world seed at the start of each spawn pass
        // via SeedHash() with large fixed indices that never collide with cell coordinates
        // or with WorldGenerator's biome/moisture noise offsets.
        private float _coverageOffX;
        private float _coverageOffZ;

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

            // Stop any in-progress spawn coroutine to avoid callbacks after destruction.
            if (_spawnCoroutine != null)
            {
                StopCoroutine(_spawnCoroutine);
                _spawnCoroutine = null;
            }
        }

        // =====================================================================
        // Event Handler
        // =====================================================================

        private void HandleTerrainBuilt() => SpawnAllProps();

        // =====================================================================
        // Public API
        // =====================================================================

        /// <summary>
        /// Cancels any in-progress spawn pass, destroys existing props, and starts a
        /// fresh batched spawn pass spread across multiple frames.
        ///
        /// Called automatically when the terrain is built or rebuilt. Safe to call
        /// manually, e.g., after changing BiomePropSet assets in a debug context.
        /// If a previous spawn is in progress it is cancelled and restarted cleanly.
        /// </summary>
        public void SpawnAllProps()
        {
            if (_hexGrid == null)
            {
                Debug.LogError("[WorldPropSpawner] HexGrid not found. Prop spawning aborted.");
                return;
            }

            // Cancel any in-flight spawn coroutine before starting a new one.
            // This handles world regeneration (debug R/N) cleanly: the old pass stops
            // immediately rather than continuing to place props from the previous world.
            if (_spawnCoroutine != null)
            {
                StopCoroutine(_spawnCoroutine);
                _spawnCoroutine = null;
            }

            _spawnCoroutine = StartCoroutine(SpawnAllPropsCoroutine());
        }

        /// <summary>Destroys all spawned prop GameObjects immediately.</summary>
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
        // Internal Spawn Coroutine
        // =====================================================================

        /// <summary>
        /// Core spawn pass, distributed across multiple frames via yield.
        ///
        /// Each iteration of the outer foreach processes one hex cell synchronously.
        /// After every <see cref="_spawnBatchSize"/> Instantiate calls the coroutine
        /// yields a frame, keeping the game responsive and the editor from freezing
        /// during world load — particularly important on large (>200×200) worlds.
        ///
        /// The <see cref="_maxPropsTotal"/> cap stops the pass early on very large
        /// worlds where spawning every cell would exceed memory budgets.
        /// </summary>
        private IEnumerator SpawnAllPropsCoroutine()
        {
            ClearAllProps();

            // Cache seed for this generation pass so CellHash is consistent.
            _worldSeed = _worldGenerator != null ? _worldGenerator.LastUsedSeed : 0;

            // Derive stable coverage noise offsets from the seed.
            // SeedHash with large fixed indices ensures these are independent of both
            // cell coordinates and WorldGenerator's noise offsets — each world seed
            // produces a unique coverage pattern that is always deterministic.
            _coverageOffX = SeedHash(20001) * 9999f;
            _coverageOffZ = SeedHash(20002) * 9999f;

            // Create root hierarchy.
            var rootGo = new GameObject("PropsRoot");
            _propsRoot = rootGo.transform;
            _propsRoot.SetParent(transform, worldPositionStays: false);

            // Take a stable snapshot of the cell collection before iterating.
            // This prevents any potential InvalidOperationException if the HexGrid
            // dictionary is modified during the event chain.
            _cellsSnapshot.Clear();
            foreach (HexCell c in _hexGrid.GetAllCells())
            {
                if (c != null)
                    _cellsSnapshot.Add(c);
            }

            int totalSpawned = 0;
            int instantiatedThisFrame = 0;

            foreach (HexCell cell in _cellsSnapshot)
            {
                // Never place surface props on water cells.
                if (cell.IsWater) continue;

                // Hard prop cap — stop when the world limit is reached.
                if (_maxPropsTotal > 0 && totalSpawned >= _maxPropsTotal) break;

                // Primary biome set.
                if (_setByBiome.TryGetValue(cell.Biome, out BiomePropSet primarySet))
                {
                    if (!cell.IsShore || primarySet.SpawnOnShoreCells)
                        totalSpawned += SpawnPropsForCell(cell, primarySet,
                                                         ref instantiatedThisFrame);
                }

                // Shore-specific sets applied on top for shore cells.
                if (cell.IsShore)
                {
                    foreach (BiomePropSet shoreSet in _shoreSets)
                        totalSpawned += SpawnPropsForCell(cell, shoreSet,
                                                         ref instantiatedThisFrame);
                }

                // Yield to the engine after each batch of instantiations.
                // This keeps frame time bounded even on 500×500 worlds.
                if (instantiatedThisFrame >= _spawnBatchSize)
                {
                    instantiatedThisFrame = 0;
                    yield return null;
                }
            }

            _spawnCoroutine = null;

            Debug.Log($"[WorldPropSpawner] Spawned {totalSpawned} props across " +
                      $"{_cellsSnapshot.Count} land cells " +
                      $"(seed={_worldSeed}, density={_globalDensityMultiplier:F2}, " +
                      $"scale×{_globalScaleMultiplier:F2}" +
                      (_maxPropsTotal > 0 ? $", cap={_maxPropsTotal}" : "") + ").");
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
        ///   1 — spawn chance roll (SpawnChance × set density × global density × coverage mask)
        ///   2 — position angle in [0, 2π] (uniform direction)
        ///   3 — position radius (Mathf.Sqrt applied for uniform disk area distribution)
        ///   4 — scale lerp (entry range × global scale multiplier)
        ///   5 — Y-axis rotation (yaw only; prop stays upright)
        ///
        /// Coverage mask:
        ///   A <see cref="CoverageMask"/> value is computed once per cell before the slot
        ///   loop and multiplied into every slot's effective spawn chance. This creates smooth
        ///   large-scale density variation — dense forest patches, open glades, rocky outcrops
        ///   — without changing the slot count or adding more GameObjects.
        ///   Each biome has its own shaping curve; see <see cref="CoverageMask"/>.
        ///
        /// Jitter (position):
        ///   Jitter radius is 0.75 × hexSize, wider than the previous 0.45. This allows
        ///   props to cross hex cell boundaries, breaking up the per-cell clump pattern so
        ///   coverage feels spatially continuous rather than hex-grid-aligned.
        ///   Mathf.Sqrt() on the raw radius value corrects the radial bias inherent in
        ///   sampling a uniform [0, 1] value as a radius — without it, 50% of props would
        ///   land in the inner 25% of the jitter area, crowding at each cell's centre.
        ///
        /// Orientation contract:
        ///   The random yaw is COMPOSED with the prefab's authored root rotation rather
        ///   than replacing it. This preserves any FBX import axis-correction transforms
        ///   baked into the prefab root (e.g., the –90 ° X rotation Unity's FBX importer
        ///   adds when the source file uses Z-up). Without this, explicitly passing a
        ///   world rotation to Instantiate would silently discard the correction and
        ///   cause props to appear sideways or flat on the terrain.
        /// </summary>
        /// <param name="instantiatedThisFrame">
        /// Running count of props instantiated in the current frame batch.
        /// Incremented by this method; caller resets to 0 and yields on threshold.
        /// </param>
        /// <returns>Number of props actually spawned for this cell/set combination.</returns>
        private int SpawnPropsForCell(HexCell cell, BiomePropSet set,
                                      ref int instantiatedThisFrame)
        {
            if (set == null) return 0;
            if (set.Entries == null || set.Entries.Count == 0) return 0;

            int q = cell.Coord.Q;
            int r = cell.Coord.R;
            Vector3 cellWorldPos = cell.Coord.ToWorldPosition(_hexSize);

            // Jitter radius wider than the hex inscribed circle so props spread across
            // cell boundaries, breaking the per-cell clump pattern.
            // 0.75 × hexSize reaches well into neighbouring cell territory, which is
            // visually desirable at strategy-camera scale — coverage feels continuous.
            float jitterRadius = _hexSize * 0.75f;

            // World-space Y at the cell center — used for all slots in this cell.
            float cellY = _terrainBuilder != null
                ? cell.BaseElevation * _terrainBuilder.ElevationScale
                : cell.BaseElevation * 5f;

            // Large-scale coverage mask: smooth Perlin zones spanning multiple cells.
            // Creates natural density variation — dense patches, open glades, sparse areas —
            // without adding more GameObjects. Always uses cell.Biome so that shore-specific
            // sets inherit the actual cell biome's coverage character.
            // See CoverageMask() for biome-specific shaping rationale.
            float coverageMask = CoverageMask(q, r, cell.Biome);

            int spawned = 0;

            for (int slot = 0; slot < set.SlotsPerHex; slot++)
            {
                // 6 deterministic channels per slot — offset by slot * 6 to keep independent.
                int ch = slot * 6;

                // --- Entry selection (weighted) ---
                float selectRoll = CellHash(q, r, ch + 0);
                BiomePropEntry entry = SelectWeightedEntry(set.Entries, selectRoll);
                if (entry == null || entry.Prefab == null) continue;

                // --- Spawn chance (all multipliers including coverage mask) ---
                // coverageMask is the per-cell noise value, giving each cell a density
                // that varies smoothly across space rather than being uniformly constant.
                float spawnRoll = CellHash(q, r, ch + 1);
                float effectiveChance = entry.SpawnChance
                    * set.GlobalDensityMultiplier
                    * _globalDensityMultiplier
                    * coverageMask;
                if (spawnRoll > effectiveChance) continue;

                // --- Position jitter (uniform disk distribution) ---
                // Mathf.Sqrt() corrects radial bias: without it a uniform [0,1] radius
                // places 50% of props in the inner 25% of the disc area (centre crowding).
                // Sqrt maps the raw value to a radius that gives uniform area coverage.
                float angle = CellHash(q, r, ch + 2) * Mathf.PI * 2f;
                float dist  = Mathf.Sqrt(CellHash(q, r, ch + 3)) * jitterRadius;

                Vector3 spawnPos = new Vector3(
                    cellWorldPos.x + Mathf.Cos(angle) * dist,
                    cellY,
                    cellWorldPos.z + Mathf.Sin(angle) * dist);

                // --- Scale (per-entry range × global readability multiplier) ---
                float scaleT = CellHash(q, r, ch + 4);
                float minS = Mathf.Min(entry.MinScale, entry.MaxScale);
                float maxS = Mathf.Max(entry.MinScale, entry.MaxScale);
                float scale = Mathf.Lerp(minS, maxS, scaleT);
                if (scale <= 0f) scale = 1f;
                scale *= _globalScaleMultiplier;

                // --- Rotation (yaw-only, composed with prefab's authored base rotation) ---
                // We compose the random yaw with the prefab root's world rotation instead
                // of passing an absolute Euler. This preserves any import-correction rotation
                // baked into the prefab (e.g., Blender FBX Z-up → Y-up) so props never
                // appear sideways regardless of how the source model was authored.
                float rotY      = CellHash(q, r, ch + 5) * 360f;
                Quaternion yaw  = Quaternion.AngleAxis(rotY, Vector3.up);
                Quaternion baseRot = entry.Prefab.transform.rotation; // prefab asset's world rot

                // --- Instantiate ---
                string containerName = set.IsShoreSpecificSet ? "Shore" : cell.Biome.ToString();
                Transform parent = GetOrCreateContainer(containerName);

                GameObject prop = Instantiate(entry.Prefab, spawnPos, yaw * baseRot, parent);
                prop.transform.localScale = Vector3.one * scale;

                // Apply yield override if the entry specifies one.
                if (entry.YieldOverride != ResourceType.None)
                {
                    var harvestable = prop.GetComponent<HarvestableProp>();
                    if (harvestable != null)
                        harvestable.SetYieldOverride(entry.YieldOverride);
                }

                spawned++;
                instantiatedThisFrame++;
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
            if (set.GlobalDensityMultiplier <= 0f)
            {
                Debug.LogWarning($"[WorldPropSpawner] BiomePropSet \"{set.name}\": " +
                                 "GlobalDensityMultiplier = 0 — nothing will spawn. " +
                                 "Run Tools/Mystpath/Validate and Fix Biome Prop Sets.");
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
        // Coverage Distribution
        // =====================================================================

        /// <summary>
        /// Returns a smooth coverage intensity in [0, 1] for hex cell (q, r), shaped
        /// by the biome's character. This value is multiplied into every slot's effective
        /// spawn chance in <see cref="SpawnPropsForCell"/>, creating organic large-scale
        /// density variation without changing the total slot count or prop budget.
        ///
        /// Two Perlin octaves are blended:
        ///   Primary (1×)   : broad smooth regions spanning ~12 cells at default scale.
        ///   Secondary (2.5×): finer local texture that breaks up Perlin's squarish grids.
        ///
        /// Biome shaping:
        ///   Forest   → [0.40, 1.00]  Dense floor — forests always have some coverage,
        ///                             clearings just reduce density rather than emptying.
        ///   Swamp    → [0.35, 1.00]  Similar to Forest but slightly more open pockets
        ///                             to suggest standing water and bog patches.
        ///   Grassland→ [0.20, 1.00]  Wide variation — open meadow glades alternate with
        ///                             denser bush and plant patches.
        ///   Mountain → power curve   Sparse by default; occasional rocky cluster at high
        ///                             noise values reads as a natural rockfall or outcrop.
        ///   Desert   → raw²          Most cells near-zero; rare dense patches suggest
        ///                             isolated cactus or dune-rock groupings.
        ///   Tundra   → raw^1.6       Slightly softer than Desert; cold ground-cover
        ///                             gives a touch more even base coverage.
        ///
        /// The _coverageOffX/Z offsets are derived from the world seed so each seed
        /// produces a unique but always deterministic coverage pattern.
        /// </summary>
        private float CoverageMask(int q, int r, BiomeType biome)
        {
            // Sample two Perlin octaves using the per-session noise offsets.
            float bx = q * _coverageNoiseScale + _coverageOffX;
            float bz = r * _coverageNoiseScale + _coverageOffZ;

            float raw = Mathf.PerlinNoise(bx, bz) * 0.70f
                      + Mathf.PerlinNoise(bx * 2.5f, bz * 2.5f) * 0.30f;

            // Clamp: Perlin can return slightly outside [0,1] at tile seams.
            raw = Mathf.Clamp01(raw);

            // Biome-specific shaping — maps [0,1] noise to the coverage range
            // appropriate for each biome's intended feel.
            switch (biome)
            {
                case BiomeType.Forest:
                    // Dense continuous canopy. Floor of 0.4 prevents true clearings;
                    // the remaining 0–0.6 variation creates lighter and heavier patches.
                    return 0.40f + raw * 0.60f;

                case BiomeType.Swamp:
                    // Cluttered and organic. Slightly wider low end than Forest so
                    // wet-ground pockets and open bog patches occur naturally.
                    return 0.35f + raw * 0.65f;

                case BiomeType.Grassland:
                    // Light-to-moderate scatter with the widest dynamic range.
                    // High values produce bushy meadow patches; low values produce
                    // the open, lightly-scattered plains feel.
                    return 0.20f + raw * 0.80f;

                case BiomeType.Mountain:
                    // Sparse by default: squaring pushes most values toward zero,
                    // but the ×1.6 factor lets the rare high-noise cells approach
                    // full density — reads as a tight rocky cluster or scree field.
                    return Mathf.Min(raw * raw * 1.6f, 1.0f);

                case BiomeType.Desert:
                    // Very sparse: strong squaring makes most cells near-empty.
                    // Rare high-noise patches become isolated cactus / rock groupings.
                    return raw * raw;

                case BiomeType.Tundra:
                    // Sparse like Desert, but power 1.6 is softer than squaring,
                    // giving a slight even base to suggest frozen ground cover.
                    return Mathf.Pow(raw, 1.6f);

                default:
                    // Fallback for Ocean, Shore, or any future biome: linear noise.
                    // Shore sets pass cell.Biome so this covers unrecognised biomes only.
                    return raw;
            }
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

        /// <summary>
        /// Deterministic hash seeded only from the world seed and an index integer.
        /// Used to derive stable noise offsets that are independent of cell coordinates.
        ///
        /// Unlike <see cref="CellHash"/>, this produces the same output for the same
        /// (seed, index) pair regardless of which cell is being processed, making it
        /// suitable for world-level constants that should not vary per cell.
        ///
        /// The large fixed indices used by callers (e.g. 20001, 20002) prevent collisions
        /// with the range of cell coordinates on any practical world size.
        /// </summary>
        private float SeedHash(int index)
        {
            unchecked
            {
                uint h = (uint)(_worldSeed * 2654435761u);
                h ^= (uint)(index * 83492791u);
                h ^= h >> 17;
                h *= 0x45d9f3bu;
                h ^= h >> 15;
                return (h & 0xFFFFu) / 65535f;
            }
        }
    }
}
