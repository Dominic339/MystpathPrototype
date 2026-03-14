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

        /// <summary>Whether this cell contains standing or flowing water.</summary>
        public bool IsWater;

        /// <summary>Water depth in world units. Zero for non-water cells.</summary>
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
