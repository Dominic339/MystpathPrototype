using System;
using System.Collections.Generic;

namespace Mystpath
{
    /// <summary>
    /// Serializable container for the complete world hex grid state.
    /// Stores all cell data required to reconstruct the world on load
    /// without re-running procedural generation.
    /// </summary>
    [Serializable]
    public class WorldSaveData
    {
        /// <summary>Seed used to generate this world (for reference; cells are stored explicitly).</summary>
        public int WorldSeed;

        /// <summary>Width of the hex grid at save time.</summary>
        public int GridWidth;

        /// <summary>Height of the hex grid at save time.</summary>
        public int GridHeight;

        /// <summary>Per-cell save records for every hex cell in the grid.</summary>
        public List<HexCellSaveRecord> Cells = new List<HexCellSaveRecord>();

        // TODO: Add terrain feature save records (FeatureId, type, occupied hex lists)
    }

    /// <summary>
    /// Serializable save record for a single hex cell's state.
    /// </summary>
    [Serializable]
    public class HexCellSaveRecord
    {
        public int Q;
        public int R;
        public BiomeType Biome;
        public float BaseElevation;
        public bool IsWater;
        public float WaterDepth;
        public bool IsBuildable;
        public float Fertility;
        public float MovementCost;

        /// <summary>FeatureId of the owning TerrainFeature, or empty if none.</summary>
        public string OwningFeatureId;

        // TODO: Add serialized hidden resource weights (parallel key/value lists)
    }
}
