using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Converts HexGrid data into visible 3D terrain geometry.
    /// Reads biome and elevation values from HexCells and generates meshes,
    /// vertex colors, and terrain objects entirely from data — no premade tiles.
    /// </summary>
    public class WorldTerrainBuilder : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private HexGrid _hexGrid;

        [Header("Terrain Settings")]
        [Tooltip("Outer radius (center to vertex) of each hex in world units.")]
        [SerializeField] private float _hexSize = 1f;

        [Tooltip("Multiplier applied to BaseElevation when positioning hex geometry.")]
        [SerializeField] private float _elevationScale = 2f;

        /// <summary>Builds (or rebuilds) the full terrain from the current HexGrid data.</summary>
        public void BuildTerrain()
        {
            if (_hexGrid == null)
            {
                Debug.LogError("[WorldTerrainBuilder] HexGrid reference is missing.");
                return;
            }

            // TODO: Divide grid into chunks for efficient frustum culling and LOD
            // TODO: For each chunk, generate a combined mesh from constituent hex cells
            // TODO: Apply vertex colors or UV data per cell based on biome and elevation
            // TODO: Displace vertex heights by cell.BaseElevation * _elevationScale
            // TODO: Handle seam stitching between chunk boundaries
            // TODO: Assign appropriate URP materials to chunk mesh renderers

            Debug.Log("[WorldTerrainBuilder] Terrain build triggered.");
        }

        /// <summary>Rebuilds only the terrain chunk that contains the specified hex coordinate.</summary>
        public void RebuildChunkAt(HexCoord coord)
        {
            // TODO: Map coord to chunk index
            // TODO: Regenerate only the affected chunk's mesh data
        }
    }
}
