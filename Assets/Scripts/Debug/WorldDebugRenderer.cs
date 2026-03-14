using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Renders debug overlays on the hex grid for development and testing purposes.
    /// Visualizes per-cell data (biome, elevation, water, buildability, fertility,
    /// feature membership) as colored gizmos in the Scene and Game views.
    /// Reads world state from a WorldGenerator reference so it always reflects
    /// the most recently generated world.
    /// </summary>
    public class WorldDebugRenderer : MonoBehaviour
    {
        [Header("References")]
        [Tooltip("The WorldGenerator whose output should be visualized.")]
        [SerializeField] private WorldGenerator _worldGenerator;

        [Header("Display Settings")]
        [SerializeField] private DebugOverlayType _currentOverlay = DebugOverlayType.None;
        [SerializeField] private bool _showCoordinateLabels;

        [Tooltip("Visual size of each hex gizmo cube in world units.")]
        [SerializeField] private float _gizmoSize = 0.4f;

        // Convenience accessor — reads the grid from the generator so both always stay in sync.
        private HexGrid ActiveGrid => _worldGenerator != null ? _worldGenerator.Grid : null;

        private void Update()
        {
            // TODO: Add hotkey (e.g., Tab) to cycle through DebugOverlayType values
        }

        /// <summary>Switches to the given overlay mode. Gizmos refresh automatically.</summary>
        public void SetOverlay(DebugOverlayType overlay)
        {
            _currentOverlay = overlay;
        }

        private void OnDrawGizmos()
        {
            HexGrid grid = ActiveGrid;
            if (grid == null || _currentOverlay == DebugOverlayType.None) return;

            float worldHexSize = _gizmoSize * 2f;

            foreach (HexCell cell in grid.GetAllCells())
            {
                Vector3 worldPos = cell.Coord.ToWorldPosition(worldHexSize);
                Gizmos.color = GetOverlayColor(cell);
                Gizmos.DrawCube(worldPos, Vector3.one * _gizmoSize);

                // TODO: Draw coordinate labels using Handles.Label when _showCoordinateLabels is true.
                //       Wrap in #if UNITY_EDITOR to avoid runtime cost.
            }

            // Draw feature anchor markers when in FeatureMembership overlay.
            if (_currentOverlay == DebugOverlayType.FeatureMembership && _worldGenerator != null)
            {
                Gizmos.color = Color.white;
                foreach (TerrainFeature feature in _worldGenerator.TerrainFeatures)
                {
                    Vector3 anchorPos = feature.AnchorHex.ToWorldPosition(worldHexSize);
                    // Draw a slightly larger cube at the feature anchor for easy identification.
                    Gizmos.DrawWireCube(anchorPos, Vector3.one * (_gizmoSize * 1.8f));
                }
            }
        }

        /// <summary>
        /// Returns the debug visualization color for a cell under the current overlay mode.
        /// Colors are chosen to be immediately readable in the Unity Scene view.
        /// </summary>
        private Color GetOverlayColor(HexCell cell)
        {
            switch (_currentOverlay)
            {
                case DebugOverlayType.Biome:
                    return GetBiomeColor(cell.Biome);

                case DebugOverlayType.Elevation:
                    // Black (0) → white (1) grayscale gradient.
                    return new Color(cell.BaseElevation, cell.BaseElevation, cell.BaseElevation);

                case DebugOverlayType.Water:
                    return cell.IsWater
                        ? new Color(0.1f, 0.3f, 0.9f)   // blue
                        : new Color(0.7f, 0.9f, 0.5f);  // pale green

                case DebugOverlayType.Buildability:
                    return cell.IsBuildable
                        ? new Color(0.2f, 0.8f, 0.2f)   // green
                        : new Color(0.8f, 0.2f, 0.2f);  // red

                case DebugOverlayType.Fertility:
                    // Dark brown (0) → bright green (1).
                    return Color.Lerp(new Color(0.35f, 0.22f, 0.08f), new Color(0.1f, 0.85f, 0.1f), cell.Fertility);

                case DebugOverlayType.FeatureMembership:
                    return cell.HasFeature
                        ? new Color(0.9f, 0.6f, 0.1f)   // warm orange — feature member
                        : new Color(0.25f, 0.25f, 0.25f); // dark grey — no feature

                default:
                    return Color.white;
            }
        }

        /// <summary>
        /// Maps a BiomeType to a representative color for the Biome overlay.
        /// Colors are chosen for visual distinctiveness, not physical accuracy.
        /// </summary>
        private static Color GetBiomeColor(BiomeType biome)
        {
            switch (biome)
            {
                case BiomeType.Grassland: return new Color(0.40f, 0.80f, 0.30f); // bright green
                case BiomeType.Forest:    return new Color(0.10f, 0.45f, 0.15f); // dark green
                case BiomeType.Desert:    return new Color(0.90f, 0.80f, 0.40f); // sandy yellow
                case BiomeType.Tundra:    return new Color(0.65f, 0.75f, 0.80f); // pale blue-grey
                case BiomeType.Mountain:  return new Color(0.55f, 0.50f, 0.50f); // stone grey
                case BiomeType.Swamp:     return new Color(0.30f, 0.40f, 0.20f); // murky olive
                case BiomeType.Ocean:     return new Color(0.10f, 0.25f, 0.70f); // deep blue
                case BiomeType.River:     return new Color(0.30f, 0.60f, 0.90f); // light blue
                case BiomeType.Lake:      return new Color(0.20f, 0.50f, 0.85f); // medium blue
                case BiomeType.Volcanic:  return new Color(0.70f, 0.15f, 0.05f); // volcanic red
                default:                  return Color.magenta;                   // unknown — visible error
            }
        }
    }
}
