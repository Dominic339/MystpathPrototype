using System.Collections.Generic;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Calculates biome blend weights and blended vertex colors for hex cells.
    /// Used during terrain mesh generation to produce smooth visual transitions
    /// between adjacent biomes rather than hard-edged borders.
    ///
    /// Each hex corner vertex is shared by three cells; this class provides the
    /// blended color for that corner by averaging the representative colors of
    /// all three contributing cells. The owning cell's biome always carries the
    /// dominant weight (≥ 50 %) so the hex remains clearly readable.
    ///
    /// Also centralises the biome → representative color mapping so
    /// WorldTerrainBuilder and future systems read colors from one source of truth.
    /// </summary>
    public static class BiomeBlendCalculator
    {
        // Fraction of total color weight contributed by each neighbor at a corner.
        // Cell = 1.0 / (1.0 + 2 * NeighborWeight), neighbors = NeighborWeight each.
        // At 0.4 per neighbor: cell ≈ 55 %, each neighbor ≈ 22 %.
        private const float NeighborWeight = 0.4f;

        // =====================================================================
        // Biome Color Table
        // =====================================================================

        /// <summary>
        /// Returns the representative terrain color for a given biome.
        /// Colors are tuned for readability in a strategy-game top-down view.
        /// Adjust these values as art direction evolves.
        /// </summary>
        public static Color GetBiomeColor(BiomeType biome)
        {
            switch (biome)
            {
                case BiomeType.Grassland: return new Color(0.40f, 0.72f, 0.28f);
                case BiomeType.Forest:    return new Color(0.12f, 0.40f, 0.16f);
                case BiomeType.Desert:    return new Color(0.85f, 0.76f, 0.42f);
                case BiomeType.Tundra:    return new Color(0.72f, 0.80f, 0.84f);
                case BiomeType.Mountain:  return new Color(0.58f, 0.54f, 0.52f);
                case BiomeType.Swamp:     return new Color(0.30f, 0.42f, 0.20f);
                case BiomeType.Ocean:     return new Color(0.12f, 0.30f, 0.72f);
                case BiomeType.River:     return new Color(0.28f, 0.58f, 0.90f);
                case BiomeType.Lake:      return new Color(0.20f, 0.46f, 0.82f);
                case BiomeType.Volcanic:  return new Color(0.65f, 0.12f, 0.05f);
                default:                  return Color.magenta; // visible authoring error
            }
        }

        // =====================================================================
        // Cell Color
        // =====================================================================

        /// <summary>
        /// Returns the display color for a single cell, taking elevation and
        /// water depth into account. Used for center vertices where the cell's
        /// own biome dominates fully.
        /// </summary>
        public static Color GetCellColor(HexCell cell)
        {
            if (cell.IsWater)
            {
                // Deeper water is darker and more saturated.
                float t = Mathf.Clamp01(cell.WaterDepth);
                return Color.Lerp(
                    new Color(0.28f, 0.52f, 0.84f),  // shallow: bright blue
                    new Color(0.05f, 0.14f, 0.50f),  // deep: dark navy
                    t);
            }

            Color baseColor = GetBiomeColor(cell.Biome);

            // Slight elevation tint: higher cells lean a little lighter/cooler.
            // Range is subtle so biome identity stays clear.
            float elevT = Mathf.Clamp01((cell.BaseElevation - 0.3f) / 0.7f);
            return Color.Lerp(baseColor * 0.82f, baseColor, elevT);
        }

        // =====================================================================
        // Corner Blending
        // =====================================================================

        /// <summary>
        /// Returns a blended vertex color for a hex corner shared by
        /// <paramref name="cell"/>, <paramref name="neighbor1"/>, and
        /// <paramref name="neighbor2"/>. Missing neighbors (grid edge) fall
        /// back to the owning cell's color so border corners remain clean.
        /// </summary>
        public static Color BlendCornerColor(HexCell cell, HexCell neighbor1, HexCell neighbor2)
        {
            Color c0 = GetCellColor(cell);
            Color c1 = neighbor1 != null ? GetCellColor(neighbor1) : c0;
            Color c2 = neighbor2 != null ? GetCellColor(neighbor2) : c0;

            // Weighted average: cell is dominant, neighbors contribute equally.
            float totalWeight = 1f + NeighborWeight + NeighborWeight;
            return (c0 * 1f + c1 * NeighborWeight + c2 * NeighborWeight) / totalWeight;
        }

        // =====================================================================
        // Full Blend-Weight Map
        // =====================================================================

        /// <summary>
        /// Calculates blend weights between a cell's own biome and its neighbors'
        /// biomes. Returns a dictionary mapping each BiomeType present in or
        /// adjacent to the cell to its normalised blend weight (sum = 1).
        /// The owning cell's biome is always the dominant entry.
        ///
        /// Used by future systems (shader graph inputs, prop density maps, etc.)
        /// that need per-cell biome influence data beyond a single blended color.
        /// </summary>
        /// <param name="cell">The cell to calculate blend weights for.</param>
        /// <param name="neighbors">Neighboring cells from HexGrid.GetNeighbors.</param>
        public static Dictionary<BiomeType, float> CalculateBlendWeights(
            HexCell cell, List<HexCell> neighbors)
        {
            var weights = new Dictionary<BiomeType, float>();

            // The owning cell's biome starts with full weight.
            weights[cell.Biome] = 1.0f;

            if (neighbors == null || neighbors.Count == 0)
                return weights; // nothing to blend

            // Each neighbor contributes a fraction of its biome's weight.
            // Neighbors that share the owning biome reinforce it instead of adding a new entry.
            float perNeighbor = NeighborWeight / neighbors.Count;
            foreach (HexCell neighbor in neighbors)
            {
                if (weights.TryGetValue(neighbor.Biome, out float existing))
                    weights[neighbor.Biome] = existing + perNeighbor;
                else
                    weights[neighbor.Biome] = perNeighbor;
            }

            // Normalise so all weights sum to 1.
            float total = 0f;
            foreach (var kv in weights) total += kv.Value;

            var normalised = new Dictionary<BiomeType, float>(weights.Count);
            foreach (var kv in weights)
                normalised[kv.Key] = kv.Value / total;

            return normalised;
        }
    }
}
