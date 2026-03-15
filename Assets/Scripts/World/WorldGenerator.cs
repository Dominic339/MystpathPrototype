using System.Collections.Generic;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Responsible for procedurally generating the initial world state from a seed.
    /// Populates the HexGrid with biomes, elevations, water, terrain features, and hidden
    /// underground resources in a series of deterministic layered passes.
    ///
    /// Generation is fully deterministic: the same seed always produces the same world.
    /// Per-cell variation uses either Perlin noise (with seed-derived offsets) or a
    /// coordinate-hash function, so output is independent of dictionary iteration order.
    ///
    /// Hidden resource model (Pass 6):
    ///   HiddenResourceWeights represents underground or extractor-style deposits only.
    ///   Food-like resources (RawFood, Grain, Fish) are intentionally absent — they come
    ///   from visible surface props (PropSpawner), managed buildings (farms, fisheries),
    ///   or player-controlled production zones, never from underground seeding.
    ///   Surface raw materials like Wood are also excluded; those come from prop objects.
    ///
    ///   Underground resources seeded here:
    ///     Clay       — shallow alluvial deposits (grassland, swamp, lowlands)
    ///     Copper     — common metal ore (forest hills, foothills)
    ///     Tin        — common metal ore (desert, hills)
    ///     Iron       — mid-tier ore (mountain foothills, tundra)
    ///     Coal       — fuel ore (tundra belt, mid-mountain)
    ///     Silver     — precious ore (high mountain)
    ///     Gold       — precious ore (high mountain peaks, very rare)
    ///     MysticOre  — magical trace mineral (rare; progression-gated)
    ///
    /// Does NOT generate terrain meshes — that is WorldTerrainBuilder's job.
    /// </summary>
    public class WorldGenerator : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private HexGrid _hexGrid;

        [Header("World Dimensions")]
        [Tooltip("Grid width in hexes. 96 gives a large kingdom-scale playfield " +
                 "while remaining fast to generate in prototype form.")]
        [SerializeField] private int _worldWidth  = 96;
        [Tooltip("Grid height in hexes. Should match width for a roughly square map.")]
        [SerializeField] private int _worldHeight = 96;

        [Header("Generation Settings")]
        [SerializeField] private int _seed = 42;

        [Header("Elevation")]
        [Tooltip("Perlin noise scale for elevation. Smaller = broader terrain features " +
                 "and larger biome regions. 0.028 produces wide continent-scale landmasses.")]
        [SerializeField] private float _elevationNoiseScale = 0.028f;

        [Tooltip("Elevation values below this threshold become ocean/water. " +
                 "0.38 gives roughly 35-40 % ocean coverage on an average seed.")]
        [SerializeField, Range(0.2f, 0.6f)] private float _waterThreshold = 0.38f;

        [Header("Mountain Features")]
        [Tooltip("Number of mountain ranges stamped into the world.")]
        [SerializeField, Range(1, 12)] private int _mountainCount = 4;
        [Tooltip("Hex radius of each mountain feature. Larger = wider ranges.")]
        [SerializeField, Range(2, 10)] private int _mountainRadius = 5;

        // --- Public Output ---

        /// <summary>The HexGrid populated by the most recent GenerateWorld call.</summary>
        public HexGrid Grid => _hexGrid;

        /// <summary>The seed used in the most recent generation pass.</summary>
        public int LastUsedSeed => _seed;

        /// <summary>All terrain features stamped into the world during generation.</summary>
        public IReadOnlyList<TerrainFeature> TerrainFeatures => _terrainFeatures;

        /// <summary>
        /// Fired synchronously at the end of every successful GenerateWorld call.
        /// Systems that depend on world data (terrain builder, shoreline resolver, etc.)
        /// subscribe here to rebuild themselves automatically on regeneration.
        /// </summary>
        public event System.Action OnWorldGenerated;

        // --- Private State ---

        private readonly List<TerrainFeature> _terrainFeatures = new List<TerrainFeature>();
        private readonly List<HexCoord>       _mountainCenters = new List<HexCoord>();

        // Perlin noise offsets, seeded at generation start.
        private float _elevOffX, _elevOffY;
        private float _moistOffX, _moistOffY;
        private float _fertOffX,  _fertOffY;

        // =====================================================================
        // Public Entry Points
        // =====================================================================

        /// <summary>
        /// Generates a new world using the currently configured seed and dimensions.
        /// Clears and repopulates the HexGrid. Safe to call multiple times.
        /// </summary>
        [ContextMenu("Generate World (Current Seed)")]
        public void GenerateWorld()
        {
            // Auto-resolve HexGrid if the inspector reference was not assigned.
            // Checks the same GameObject first, then falls back to a scene-wide search.
            if (_hexGrid == null)
                _hexGrid = GetComponent<HexGrid>() ?? FindFirstObjectByType<HexGrid>();

            if (_hexGrid == null)
            {
                Debug.LogError("[WorldGenerator] HexGrid reference is not assigned and could " +
                               "not be found in the scene. Generation aborted. " +
                               "Add a HexGrid component to the same GameObject or scene.");
                return;
            }

            _terrainFeatures.Clear();
            _mountainCenters.Clear();

            // Seed Unity's RNG — used only for global decisions (offsets, feature positions).
            // Per-cell variation is handled by the deterministic CellHash function.
            Random.InitState(_seed);

            // --- Derive noise offsets from seed ---
            _elevOffX  = Random.Range(-9999f, 9999f);
            _elevOffY  = Random.Range(-9999f, 9999f);
            _moistOffX = Random.Range(-9999f, 9999f);
            _moistOffY = Random.Range(-9999f, 9999f);
            _fertOffX  = Random.Range(-9999f, 9999f);
            _fertOffY  = Random.Range(-9999f, 9999f);

            // --- Choose mountain centers before any per-cell work ---
            // Margin ensures no mountain bleeds fully off the grid edge.
            int margin = _mountainRadius + 2;
            for (int i = 0; i < _mountainCount; i++)
            {
                int q = Random.Range(margin, _worldWidth  - margin);
                int r = Random.Range(margin, _worldHeight - margin);
                _mountainCenters.Add(new HexCoord(q, r));
            }

            // --- Initialize grid (allocates all cells) ---
            _hexGrid.Initialize(_worldWidth, _worldHeight);

            // --- Layered generation passes ---
            RunElevationPass();         // Pass 1: base elevation from fractal Perlin noise
            RunBiomePass();             // Pass 2: biome from elevation + moisture noise
            RunMountainStampPass();     // Pass 3: stamp mountain features over the base biomes
            RunWaterPass();             // Pass 4: derive water flags from biome
            RunDerivedPropertiesPass(); // Pass 5: fertility, movement cost, buildability
            RunResourceWeightPass();    // Pass 6: hidden resource weights by biome

            Debug.Log($"[WorldGenerator] World generated. Seed={_seed}, " +
                      $"Size={_worldWidth}×{_worldHeight}, " +
                      $"Cells={_hexGrid.CellCount}, Features={_terrainFeatures.Count}.");

            // Notify subscribers (ShorelineResolver, WorldTerrainBuilder, etc.) so they
            // can rebuild automatically without requiring explicit wiring in GameBootstrap.
            OnWorldGenerated?.Invoke();
        }

        /// <summary>Generates a world with a freshly randomized seed.</summary>
        [ContextMenu("Generate World (New Seed)")]
        public void GenerateWithNewSeed()
        {
            _seed = Random.Range(0, int.MaxValue);
            GenerateWorld();
        }

        // =====================================================================
        // Generation Passes
        // =====================================================================

        /// <summary>
        /// Pass 1: Assigns base elevation to every cell using three-octave fractal Perlin noise.
        /// Elevation values land roughly in [0, 1]. Higher octaves add fine-grain detail.
        /// </summary>
        private void RunElevationPass()
        {
            foreach (HexCell cell in _hexGrid.GetAllCells())
            {
                float nx = cell.Coord.Q * _elevationNoiseScale + _elevOffX;
                float ny = cell.Coord.R * _elevationNoiseScale + _elevOffY;

                // Three octaves: coarse shape (60%), medium detail (30%), fine detail (10%).
                float e = Mathf.PerlinNoise(nx,         ny        ) * 0.60f
                        + Mathf.PerlinNoise(nx * 2.1f,  ny * 2.1f ) * 0.30f
                        + Mathf.PerlinNoise(nx * 4.3f,  ny * 4.3f ) * 0.10f;

                cell.BaseElevation = e; // No clamp; mountain pass will push some cells above 1.
            }
        }

        /// <summary>
        /// Pass 2: Assigns a BiomeType to every cell based on elevation and a separate
        /// moisture noise layer. Both layers use seed-derived offsets for determinism.
        /// </summary>
        private void RunBiomePass()
        {
            float moistureScale = _elevationNoiseScale * 0.8f;

            foreach (HexCell cell in _hexGrid.GetAllCells())
            {
                float e = cell.BaseElevation;

                float mx       = cell.Coord.Q * moistureScale + _moistOffX;
                float my       = cell.Coord.R * moistureScale + _moistOffY;
                float moisture = Mathf.PerlinNoise(mx, my);

                if (e < _waterThreshold)
                {
                    cell.Biome = BiomeType.Ocean;
                }
                else if (e < 0.47f)
                {
                    // Low-lying land: wet areas become swamp, drier areas become grassland.
                    cell.Biome = moisture > 0.62f ? BiomeType.Swamp : BiomeType.Grassland;
                }
                else if (e < 0.62f)
                {
                    // Mid-elevation: moisture drives the forest / grassland / desert split.
                    if      (moisture > 0.55f) cell.Biome = BiomeType.Forest;
                    else if (moisture < 0.33f) cell.Biome = BiomeType.Desert;
                    else                       cell.Biome = BiomeType.Grassland;
                }
                else if (e < 0.74f)
                {
                    // High-mid elevation: moisture determines tundra vs high desert.
                    cell.Biome = moisture > 0.48f ? BiomeType.Tundra : BiomeType.Desert;
                }
                else
                {
                    // Very high elevation: raw mountain (before feature stamping).
                    cell.Biome = BiomeType.Mountain;
                }
            }
        }

        /// <summary>
        /// Pass 3: Stamps multi-hex mountain features into the world.
        /// Each mountain claims a disc of hexes, elevates them, overrides biomes in the
        /// core and foothill rings, and registers itself on each member cell.
        /// </summary>
        private void RunMountainStampPass()
        {
            for (int i = 0; i < _mountainCenters.Count; i++)
                StampMountainFeature(_mountainCenters[i], i);
        }

        /// <summary>
        /// Creates and stamps a single mountain terrain feature centered at the given hex.
        /// </summary>
        private void StampMountainFeature(HexCoord center, int index)
        {
            // Stable ID encodes both seed and index so IDs are unique across worlds.
            string featureId = $"mountain_{_seed}_{index}";

            var feature = new TerrainFeature(featureId, TerrainFeatureType.Mountain)
            {
                DisplayName         = BuildMountainName(index),
                AnchorHex           = center,
                Radius              = _mountainRadius,
                PeakHeight          = 1.50f,  // max BaseElevation at the anchor after boost
                EdgeFalloffSharpness = 0.60f,
            };

            // Stamp every hex within the feature radius.
            List<HexCoord> hexesInRange = HexCoord.GetHexesInRange(center, _mountainRadius);
            foreach (HexCoord coord in hexesInRange)
            {
                if (!_hexGrid.TryGetCell(coord, out HexCell cell))
                    continue; // Hex is outside the grid bounds — skip silently.

                // Distance-based normalized position: 0 = anchor peak, 1 = outermost ring.
                int   dist = coord.DistanceTo(center);
                float t    = (float)dist / _mountainRadius;

                // Elevation boost tapers from a strong peak contribution to a gentle foothill edge.
                // Using Pow(t, 0.65f) keeps the peak wide and convex, then drops off toward edges.
                //
                // The boost intentionally allows BaseElevation to exceed the normal [0, 1] noise
                // range (clamped to 1.8f rather than 1.0f) so mountain peaks sit clearly higher
                // than any surrounding terrain and read as genuine landmark features.
                // CellHeight() multiplies by _elevationScale, so a peak at 1.8 is 9 world units
                // while average grassland (elev ~0.55) is only ~2.75 — a clear visual hierarchy.
                float elevBoost = Mathf.Lerp(0.72f, 0.08f, Mathf.Pow(t, 0.65f));
                cell.BaseElevation = Mathf.Clamp(cell.BaseElevation + elevBoost, 0f, 1.8f);

                // Biome override: core cells become Mountain, the next ring becomes Tundra
                // (foothill), and outer cells keep their noise-assigned biome as a transition.
                if      (t <= 0.35f) cell.Biome = BiomeType.Mountain;
                else if (t <= 0.72f) cell.Biome = BiomeType.Tundra;
                // else: keep noise biome — creates a natural gradient at the mountain's edge.

                // Register feature membership on the cell.
                cell.OwningFeature   = feature;
                cell.OwningFeatureId = featureId;
                feature.OccupiedHexes.Add(coord);
            }

            _terrainFeatures.Add(feature);
        }

        /// <summary>
        /// Pass 4: Derives water flags from biome type.
        /// Water depth for ocean cells is proportional to how far below the threshold they sit.
        /// </summary>
        private void RunWaterPass()
        {
            foreach (HexCell cell in _hexGrid.GetAllCells())
            {
                switch (cell.Biome)
                {
                    case BiomeType.Ocean:
                        cell.IsWater    = true;
                        // Deeper water = further below the water threshold.
                        cell.WaterDepth = Mathf.Clamp01((_waterThreshold - cell.BaseElevation) * 5f + 0.2f);
                        break;

                    case BiomeType.Swamp:
                        // Swamp is passable but has shallow standing water.
                        cell.IsWater    = false;
                        cell.WaterDepth = 0.15f;
                        break;

                    default:
                        cell.IsWater    = false;
                        cell.WaterDepth = 0f;
                        break;
                }
            }
        }

        /// <summary>
        /// Pass 5: Assigns fertility, movement cost, and buildability to each cell.
        /// Fertility uses an additional Perlin layer so values vary within the same biome.
        /// </summary>
        private void RunDerivedPropertiesPass()
        {
            float fertScale = _elevationNoiseScale * 1.4f;

            foreach (HexCell cell in _hexGrid.GetAllCells())
            {
                float fx       = cell.Coord.Q * fertScale + _fertOffX;
                float fy       = cell.Coord.R * fertScale + _fertOffY;
                float fertNoise = Mathf.PerlinNoise(fx, fy);

                switch (cell.Biome)
                {
                    case BiomeType.Grassland:
                        cell.Fertility    = Mathf.Lerp(0.55f, 0.92f, fertNoise);
                        cell.MovementCost = 1.0f;
                        cell.IsBuildable  = true;
                        break;

                    case BiomeType.Forest:
                        cell.Fertility    = Mathf.Lerp(0.35f, 0.65f, fertNoise);
                        cell.MovementCost = 1.5f;
                        cell.IsBuildable  = true;
                        break;

                    case BiomeType.Desert:
                        cell.Fertility    = Mathf.Lerp(0.02f, 0.15f, fertNoise);
                        cell.MovementCost = 1.4f;
                        cell.IsBuildable  = true;
                        break;

                    case BiomeType.Tundra:
                        // Tundra / foothills: buildable but harsh.
                        cell.Fertility    = Mathf.Lerp(0.08f, 0.28f, fertNoise);
                        cell.MovementCost = 1.8f;
                        cell.IsBuildable  = true;
                        break;

                    case BiomeType.Mountain:
                        cell.Fertility    = Mathf.Lerp(0f, 0.06f, fertNoise);
                        cell.MovementCost = 3.5f;
                        cell.IsBuildable  = false;
                        break;

                    case BiomeType.Swamp:
                        cell.Fertility    = Mathf.Lerp(0.25f, 0.52f, fertNoise);
                        cell.MovementCost = 2.2f;
                        cell.IsBuildable  = false;
                        break;

                    case BiomeType.Ocean:
                    default:
                        cell.Fertility    = 0f;
                        cell.MovementCost = float.MaxValue;
                        cell.IsBuildable  = false;
                        break;
                }
            }
        }

        /// <summary>
        /// Pass 6: Seeds hidden underground resource weights on each cell.
        ///
        /// Only extractor/underground materials are seeded here (Clay, Copper, Tin, Iron,
        /// Coal, Silver, Gold, MysticOre). Surface food (RawFood, Grain, Fish) and surface
        /// raw materials (Wood, Fiber) are intentionally absent — those will come from
        /// visible world props, managed production buildings, and fishery structures,
        /// not from underground deposits.
        ///
        /// Uses CellHash for deterministic per-cell variation that is independent of
        /// dictionary iteration order — weights are the same no matter when the cell is visited.
        ///
        /// Weight range semantics:
        ///   0.00 – 0.20  : trace / marginal deposit (yields only with dedicated effort)
        ///   0.20 – 0.50  : moderate deposit (viable quarry/mine site)
        ///   0.50 – 1.00  : rich deposit (high-value extraction target)
        /// </summary>
        private void RunResourceWeightPass()
        {
            foreach (HexCell cell in _hexGrid.GetAllCells())
            {
                int q = cell.Coord.Q;
                int r = cell.Coord.R;
                var w = cell.HiddenResourceWeights;
                w.Clear();

                switch (cell.Biome)
                {
                    case BiomeType.Grassland:
                        // Lowland alluvial soil: Clay deposits are common.
                        // Copper traces appear near sub-surface rock layers.
                        w[ResourceType.Clay]   = Remap(0.25f, 0.65f, CellHash(q, r, 0));
                        w[ResourceType.Copper] = Remap(0.00f, 0.20f, CellHash(q, r, 1));
                        break;

                    case BiomeType.Forest:
                        // Forest soils over older rock; Clay and Copper present.
                        // Occasional Iron in areas of uplifted geology.
                        w[ResourceType.Clay]   = Remap(0.15f, 0.45f, CellHash(q, r, 0));
                        w[ResourceType.Copper] = Remap(0.10f, 0.35f, CellHash(q, r, 1));
                        w[ResourceType.Iron]   = Remap(0.00f, 0.18f, CellHash(q, r, 2));
                        break;

                    case BiomeType.Desert:
                        // Eroded surface exposes sub-surface rock; good for Clay and Tin.
                        // Copper veins appear in ancient bedrock.
                        // Rare Silver in ancient rift zones.
                        w[ResourceType.Clay]   = Remap(0.20f, 0.55f, CellHash(q, r, 0));
                        w[ResourceType.Tin]    = Remap(0.15f, 0.50f, CellHash(q, r, 1));
                        w[ResourceType.Copper] = Remap(0.10f, 0.35f, CellHash(q, r, 2));
                        w[ResourceType.Silver] = Remap(0.00f, 0.12f, CellHash(q, r, 3));
                        break;

                    case BiomeType.Tundra:
                        // Mountain foothills — geologically active; Iron and Coal common.
                        // Copper and Tin also present in the exposed rock belt.
                        w[ResourceType.Iron]   = Remap(0.30f, 0.70f, CellHash(q, r, 0));
                        w[ResourceType.Coal]   = Remap(0.25f, 0.60f, CellHash(q, r, 1));
                        w[ResourceType.Copper] = Remap(0.15f, 0.45f, CellHash(q, r, 2));
                        w[ResourceType.Tin]    = Remap(0.10f, 0.35f, CellHash(q, r, 3));
                        break;

                    case BiomeType.Mountain:
                        // Core mountain: richest ore deposits in the world.
                        // Iron and Coal are common; Silver appears in deep veins.
                        // Gold is rare but present at high-peak cells.
                        // MysticOre traces occur; gated behind Mystpath progression.
                        w[ResourceType.Iron]      = Remap(0.50f, 0.95f, CellHash(q, r, 0));
                        w[ResourceType.Coal]      = Remap(0.40f, 0.85f, CellHash(q, r, 1));
                        w[ResourceType.Silver]    = Remap(0.15f, 0.55f, CellHash(q, r, 2));
                        w[ResourceType.Gold]      = Remap(0.00f, 0.25f, CellHash(q, r, 3));
                        w[ResourceType.MysticOre] = Remap(0.00f, 0.10f, CellHash(q, r, 4));
                        break;

                    case BiomeType.Swamp:
                        // Waterlogged lowlands: heavy Clay and peat-equivalent Coal seams.
                        // Copper traces from ancient floodplains.
                        w[ResourceType.Clay]   = Remap(0.40f, 0.80f, CellHash(q, r, 0));
                        w[ResourceType.Coal]   = Remap(0.15f, 0.40f, CellHash(q, r, 1));
                        w[ResourceType.Copper] = Remap(0.00f, 0.15f, CellHash(q, r, 2));
                        break;

                    case BiomeType.Ocean:
                        // Ocean floors have no extractable underground resources in this model.
                        // Fish and sea resources come from fishery buildings, not hidden weights.
                        // TODO: Future — seafloor deposits (rare minerals, sand/gravel) if
                        //       offshore extraction buildings are added.
                        break;
                }
            }
        }

        // =====================================================================
        // Utility Helpers
        // =====================================================================

        /// <summary>
        /// Deterministic per-cell hash that returns a value in [0, 1].
        /// Combines the world seed with the cell coordinate and a channel index so each
        /// resource type gets an independent but reproducible value for the same cell.
        /// Order-independent: does not depend on when the cell is visited.
        /// </summary>
        private float CellHash(int q, int r, int channel)
        {
            unchecked
            {
                uint h = (uint)(_seed * 2654435761u);
                h ^= (uint)(q       * 73856093u);
                h ^= (uint)(r       * 19349663u);
                h ^= (uint)(channel * 83492791u);
                h ^= h >> 17;
                h *= 0x45d9f3bu;
                h ^= h >> 15;
                return (h & 0xFFFFu) / 65535f;
            }
        }

        /// <summary>Remaps a [0, 1] value to [min, max] via linear interpolation.</summary>
        private static float Remap(float min, float max, float t) => min + (max - min) * t;

        /// <summary>
        /// Builds a deterministic display name for a mountain feature based on its index.
        /// Names cycle through prefix/suffix combos — purely cosmetic, not gameplay-relevant.
        /// </summary>
        private static string BuildMountainName(int index)
        {
            string[] prefixes = { "Iron", "Stone", "Frost", "Ash", "Grey", "Black", "Silver", "Ember" };
            string[] suffixes = { "peak Mountains", "crest Heights", "spine Range", "horn Massif", "ridge Peaks" };

            string prefix = prefixes[index % prefixes.Length];
            string suffix = suffixes[(index / prefixes.Length) % suffixes.Length];
            return $"{prefix}{suffix}";
        }
    }
}
