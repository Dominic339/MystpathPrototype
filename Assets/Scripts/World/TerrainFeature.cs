using System;
using System.Collections.Generic;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Represents a large-scale terrain feature that occupies one or more hex cells.
    /// Examples include mountain ranges, lakes, and large forest stands.
    /// Features influence the visual and simulation properties of their member cells
    /// and can be named for lore and UI purposes.
    /// </summary>
    [Serializable]
    public class TerrainFeature
    {
        /// <summary>Stable unique identifier for this feature instance (safe for save/load).</summary>
        public string FeatureId { get; private set; }

        /// <summary>The type of terrain feature this represents.</summary>
        public TerrainFeatureType FeatureType;

        /// <summary>Player-visible name (e.g., "Ironpeak Mountains", "Lake Verath").</summary>
        public string DisplayName;

        /// <summary>All hex coordinates claimed by this feature.</summary>
        public List<HexCoord> OccupiedHexes = new List<HexCoord>();

        /// <summary>
        /// The anchor (center) hex of this feature. Used as the reference point for
        /// elevation influence calculations and feature-relative queries.
        /// </summary>
        public HexCoord AnchorHex;

        /// <summary>Radius of this feature in hex steps from the anchor.</summary>
        public int Radius;

        // --- Height / Shape Settings ---

        /// <summary>Peak height contribution added to member hex elevations at the anchor.</summary>
        public float PeakHeight;

        /// <summary>
        /// How sharply the feature's height influence falls off toward its edges.
        /// 0 = gradual slope, 1 = near-vertical cliff.
        /// </summary>
        [Range(0f, 1f)]
        public float EdgeFalloffSharpness = 0.5f;

        // TODO: Add per-hex height weight table for irregular shape support
        // TODO: Add biome override list for hexes within the feature
        // TODO: Add named sub-regions (e.g., a volcano's caldera vs. its slopes)

        public TerrainFeature(string featureId, TerrainFeatureType featureType)
        {
            FeatureId = featureId;
            FeatureType = featureType;
        }

        /// <summary>Returns true if the given coordinate is part of this feature.</summary>
        public bool ContainsHex(HexCoord coord) => OccupiedHexes.Contains(coord);

        /// <summary>
        /// Returns the elevation boost that this feature contributes to a member hex,
        /// based on its distance from the anchor and the falloff curve.
        /// Returns 0 if the coord is not within the feature's radius.
        /// </summary>
        public float GetElevationInfluenceAt(HexCoord coord)
        {
            if (Radius <= 0) return PeakHeight;

            int dist = coord.DistanceTo(AnchorHex);
            if (dist > Radius) return 0f;

            // Normalized distance 0 (peak) → 1 (edge). Pow < 1 flattens the peak.
            float t = (float)dist / Radius;
            float falloff = Mathf.Pow(t, Mathf.Lerp(0.5f, 2.5f, EdgeFalloffSharpness));
            return Mathf.Lerp(PeakHeight, 0f, falloff);
        }
    }
}
