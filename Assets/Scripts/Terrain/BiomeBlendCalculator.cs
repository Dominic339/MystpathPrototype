using System.Collections.Generic;

namespace Mystpath
{
    /// <summary>
    /// Calculates biome blend weights for a hex cell based on its neighbors.
    /// Used during terrain mesh generation to produce smooth visual transitions
    /// between adjacent biomes rather than hard borders.
    /// </summary>
    public static class BiomeBlendCalculator
    {
        /// <summary>
        /// Calculates blend weights between a cell's own biome and its neighbors' biomes.
        /// Returns a dictionary mapping each neighboring BiomeType to a blend weight (0–1).
        /// The owning cell's biome is always the dominant weight.
        /// </summary>
        /// <param name="cell">The cell to calculate blend weights for.</param>
        /// <param name="neighbors">Neighboring cells returned from HexGrid.GetNeighbors.</param>
        public static Dictionary<BiomeType, float> CalculateBlendWeights(HexCell cell, List<HexCell> neighbors)
        {
            var weights = new Dictionary<BiomeType, float>();

            // TODO: Count how many neighbors share each biome type
            // TODO: Normalize neighbor counts to [0, 1] weights
            // TODO: Apply a falloff curve based on distance from the cell center
            // TODO: Return the owning cell's biome with a guaranteed minimum dominant weight

            return weights;
        }
    }
}
