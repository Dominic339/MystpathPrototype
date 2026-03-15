using System;
using System.Collections.Generic;

namespace Mystpath
{
    /// <summary>
    /// Represents a single cell in the hex grid. Acts as the authoritative source of truth
    /// for biome, elevation, water state, buildability, hidden resources, and terrain feature
    /// membership for its coordinate. All terrain and simulation logic reads from HexCell.
    /// </summary>
    [Serializable]
    public class HexCell
    {
        /// <summary>Axial coordinates identifying this cell within the HexGrid.</summary>
        public HexCoord Coord { get; private set; }

        // --- Biome & Terrain ---

        /// <summary>The biome type assigned to this cell.</summary>
        public BiomeType Biome;

        /// <summary>Base elevation value. 0 = sea level; positive values are above sea level.</summary>
        public float BaseElevation;

        // --- Water State ---
        //
        // Architecture note — future real water layer:
        //   Currently water is represented as lowered blue terrain mesh.
        //   The data model is intentionally structured so a future separate water
        //   surface layer can sit above ocean/lake cells without reworking the grid.
        //
        //   When the water surface layer is implemented it should:
        //     - Read IsWater to know which cells need a water quad
        //     - Read WaterDepth to tint and set translucency
        //     - Read IsShore (set by ShorelineResolver) to place foam/edge effects
        //     - NOT modify terrain mesh — water sits above, terrain is the sea floor
        //
        //   Future systems that depend on water data:
        //     - Fishery buildings: require adjacent IsWater hex
        //     - Fish resources: density proportional to water area and depth
        //     - Coastal structures (piers, harbours): require IsShore hex
        //     - Ship navigation: pathfinds through connected IsWater cells
        //     - Lake detection: flood-fill from IsWater cells not connected to the
        //       ocean border can classify lakes vs ocean separately

        /// <summary>
        /// Whether this cell is covered by water (ocean, lake, etc.).
        /// Populated by WorldGenerator.RunWaterPass. Consumed by ShorelineResolver,
        /// WorldTerrainBuilder, and future water surface / fishery systems.
        /// </summary>
        public bool IsWater;

        /// <summary>
        /// Approximate water depth in [0, 1] normalised units. Zero for non-water cells.
        /// 1.0 = deepest ocean. Used for visual water tinting and future fish-density weighting.
        /// </summary>
        public float WaterDepth;

        // --- Gameplay Properties ---

        /// <summary>Whether a building footprint may include this cell.</summary>
        public bool IsBuildable;

        /// <summary>Soil fertility (0–1). Used for farming yield and vegetation growth.</summary>
        public float Fertility;

        /// <summary>
        /// Movement cost multiplier for NPCs passing through this cell.
        /// Combines with NPC stats and biome profile values during pathfinding.
        /// </summary>
        public float MovementCost = 1f;

        // --- Hidden Resources ---

        /// <summary>
        /// Hidden resource weights by type. Higher weight = higher extraction yield when discovered.
        /// Populated during world generation; not revealed to the player until surveyed.
        /// </summary>
        public Dictionary<ResourceType, float> HiddenResourceWeights = new Dictionary<ResourceType, float>();

        // --- Feature Membership ---

        /// <summary>The terrain feature this cell belongs to, or null if none.</summary>
        public TerrainFeature OwningFeature;

        /// <summary>
        /// Stable string ID of the owning terrain feature. Populated alongside OwningFeature
        /// so feature membership survives serialization without a live object reference.
        /// Empty string means no feature.
        /// </summary>
        public string OwningFeatureId = string.Empty;

        /// <summary>Returns true if this cell is a member of any terrain feature.</summary>
        public bool HasFeature => !string.IsNullOrEmpty(OwningFeatureId);

        // --- Shoreline ---

        /// <summary>
        /// Whether this land cell borders at least one water cell.
        /// Populated by ShorelineResolver after world generation.
        /// Shore cells receive adjusted movement costs and may receive visual shoreline treatment.
        /// </summary>
        public bool IsShore;

        // --- Occupancy ---

        /// <summary>The building instance occupying this cell, or null if unoccupied.</summary>
        public BuildingInstance OccupyingBuilding;

        /// <summary>
        /// Stable string ID derived from coordinates. Safe to use as a dictionary key
        /// and for serialization across save/load cycles.
        /// </summary>
        public string StableId => $"{Coord.Q}_{Coord.R}";

        public HexCell(HexCoord coord)
        {
            Coord = coord;
        }

        /// <summary>Returns true if this cell is currently unoccupied and buildable.</summary>
        public bool IsAvailableForBuilding() => IsBuildable && OccupyingBuilding == null;
    }
}
