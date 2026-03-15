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
    /// Biome/terrain separation:
    ///   Two noise scales operate independently so macro biome identity and local terrain
    ///   detail do not interfere with each other.
    ///
    ///   _elevationNoiseScale (0.028) — multi-octave, drives terrain mesh shape.
    ///     Coarse base (60%) + mid detail (30%) + fine detail (10%).
    ///     Used by WorldTerrainBuilder for mesh vertices.
    ///
    ///   _macroRegionScale (0.012) — single-pass two-octave, drives biome classification only.
    ///     One full noise period ≈ 83 hexes → biome regions span 40–80 hexes before
    ///     transitioning. The secondary octave (20% at 2.1×) adds gentle boundary curvature
    ///     without re-introducing tile-scale fragmentation.
    ///     Does NOT affect BaseElevation or the terrain mesh.
    ///
    ///   Moisture for biome is driven at _macroRegionScale × 0.75 for the same reason:
    ///   Forest/Desert/Swamp bands are broad geographical zones, not fine-grain patches.
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

        [Header("Biome Region Scale")]
        [Tooltip("Noise scale used ONLY for macro biome region classification (Pass 2). " +
                 "Smaller values = larger, broader biome regions. " +
                 "Completely independent from _elevationNoiseScale — changing this " +
                 "does not affect the terrain mesh. \n\n" +
                 "At 0.012: one noise period ≈ 83 hexes, biome regions span ~40–80 hexes. " +
                 "At 0.020: one noise period ≈ 50 hexes, biome regions span ~25–50 hexes. " +
                 "At 0.028: matches elevation noise — fragmented patches (the old behaviour). \n\n" +
                 "Decrease to expand biome zones; increase to fragment them.")]
        [SerializeField, Range(0.005f, 0.04f)] private float _macroRegionScale = 0.012f;

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
        // Each pair is independently randomised from the seed so the noise layers
        // are uncorrelated — biome identity, moisture, fertility, and elevation
        // each vary independently across the map.
        private float _elevOffX,  _elevOffY;   // elevation mesh noise
        private float _biomeOffX, _biomeOffY;  // macro biome region noise (independent of elevation)
        private float _moistOffX, _moistOffY;  // macro moisture / wetness noise
        private float _fertOffX,  _fertOffY;   // per-cell fertility noise

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
            // Each pair is drawn from the same RNG stream in a fixed order so
            // the same seed always produces the same offsets — deterministic.
            _elevOffX  = Random.Range(-9999f, 9999f);
            _elevOffY  = Random.Range(-9999f, 9999f);
            _biomeOffX = Random.Range(-9999f, 9999f); // macro biome classification
            _biomeOffY = Random.Range(-9999f, 9999f);
            _moistOffX = Random.Range(-9999f, 9999f); // macro moisture
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
        /// Pass 2: Assigns a BiomeType to every cell using two independent noise signals.
        ///
        /// Key design: biome classification is intentionally DECOUPLED from the terrain
        /// mesh elevation noise.
        ///
        ///   cell.BaseElevation (multi-octave, scale 0.028) → terrain mesh shape only.
        ///   macroElev (two-octave, scale _macroRegionScale) → biome zone identity only.
        ///   moisture  (single-octave, scale _macroRegionScale × 0.75) → wet/dry split.
        ///
        /// Water and mountain are still anchored to actual terrain elevation (BaseElevation)
        /// so they align correctly with the mesh:
        ///   Ocean   : BaseElevation < _waterThreshold (real terrain dips below sea level)
        ///   Mountain: BaseElevation ≥ 0.74            (real terrain is genuinely tall)
        ///
        /// All other biomes (Grassland, Forest, Desert, Swamp, Tundra) use the smooth
        /// macro signal so they form large, coherent continental-scale regions rather than
        /// fragmenting at the scale of individual terrain bumps.
        ///
        /// The secondary macro octave (20% at 2.1× scale) adds gentle boundary curvature
        /// — biome edges are not perfectly straight — without re-introducing fine-grain
        /// fragmentation. Adjust _macroRegionScale to resize all biome regions globally.
        /// </summary>
        private void RunBiomePass()
        {
            // Macro moisture uses a slightly different scale from macro elevation so the
            // wet/dry axis is not perfectly correlated with the high/low axis.
            float macroMoistureScale = _macroRegionScale * 0.75f;

            foreach (HexCell cell in _hexGrid.GetAllCells())
            {
                float e = cell.BaseElevation; // real terrain elevation

                // ── Water: anchored to actual terrain so ocean fills genuine low areas ──
                if (e < _waterThreshold)
                {
                    cell.Biome = BiomeType.Ocean;
                    continue;
                }

                // ── Mountain: anchored to actual terrain so peaks are genuinely tall ──
                // The mountain stamp pass (Pass 3) will reinforce and expand this, but seeding
                // Mountain here ensures naturally elevated ridges also get the biome.
                if (e >= 0.74f)
                {
                    cell.Biome = BiomeType.Mountain;
                    continue;
                }

                // ── Macro biome classification for all other land cells ─────────────────
                // Two-octave low-frequency noise: coarse region shape (80%) + gentle
                // boundary variation (20% at 2.1× scale). The secondary octave makes biome
                // boundaries curved and organic without causing tile-scale fragmentation.
                float bx = cell.Coord.Q * _macroRegionScale + _biomeOffX;
                float by = cell.Coord.R * _macroRegionScale + _biomeOffY;
                float macroElev = Mathf.PerlinNoise(bx,        by       ) * 0.80f
                                + Mathf.PerlinNoise(bx * 2.1f, by * 2.1f) * 0.20f;

                // Single-octave moisture at macro scale — broad wet/dry zones.
                float mx       = cell.Coord.Q * macroMoistureScale + _moistOffX;
                float my       = cell.Coord.R * macroMoistureScale + _moistOffY;
                float moisture = Mathf.PerlinNoise(mx, my);

                if (macroElev < 0.47f)
                {
                    // Low-lying macro zone: wet pockets become Swamp, dry areas Grassland.
                    cell.Biome = moisture > 0.62f ? BiomeType.Swamp : BiomeType.Grassland;
                }
                else if (macroElev < 0.65f)
                {
                    // Mid-elevation macro zone: moisture drives Forest / Grassland / Desert.
                    if      (moisture > 0.55f) cell.Biome = BiomeType.Forest;
                    else if (moisture < 0.33f) cell.Biome = BiomeType.Desert;
                    else                       cell.Biome = BiomeType.Grassland;
                }
                else
                {
                    // High macro zone (below actual mountain): Tundra in wet areas, Desert dry.
                    cell.Biome = moisture > 0.48f ? BiomeType.Tundra : BiomeType.Desert;
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
