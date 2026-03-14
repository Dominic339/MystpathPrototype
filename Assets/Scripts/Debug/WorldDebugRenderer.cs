using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Renders debug overlays on the hex grid for development and testing purposes.
    /// Visualizes cell data (biome, elevation, buildability, task state, etc.) as
    /// colored gizmos or GUI elements. Toggle overlays via inspector or hotkeys.
    /// </summary>
    public class WorldDebugRenderer : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private HexGrid _hexGrid;

        [Header("Display Settings")]
        [SerializeField] private DebugOverlayType _currentOverlay = DebugOverlayType.None;
        [SerializeField] private bool _showCoordinateLabels;

        [Tooltip("Size of hex visualization gizmos in world units.")]
        [SerializeField] private float _gizmoSize = 0.4f;

        private void Update()
        {
            // TODO: Add hotkey cycling through DebugOverlayType values for quick switching
        }

        /// <summary>Switches to the given overlay mode and triggers a display refresh.</summary>
        public void SetOverlay(DebugOverlayType overlay)
        {
            _currentOverlay = overlay;
            // OnDrawGizmos re-renders automatically in editor; no explicit refresh needed.
        }

        private void OnDrawGizmos()
        {
            if (_hexGrid == null || _currentOverlay == DebugOverlayType.None) return;

            foreach (HexCell cell in _hexGrid.GetAllCells())
            {
                Vector3 worldPos = cell.Coord.ToWorldPosition(_gizmoSize * 2f);
                Gizmos.color = GetOverlayColor(cell);
                Gizmos.DrawCube(worldPos, Vector3.one * _gizmoSize);

                // TODO: Draw coordinate label at worldPos if _showCoordinateLabels is true
                //       (requires Handles.Label from UnityEditor, wrap in #if UNITY_EDITOR)
            }
        }

        /// <summary>Returns a debug color for a cell based on the current overlay mode.</summary>
        private Color GetOverlayColor(HexCell cell)
        {
            switch (_currentOverlay)
            {
                case DebugOverlayType.Biome:
                    // TODO: Map cell.Biome to a representative color
                    return Color.green;

                case DebugOverlayType.Elevation:
                    // TODO: Gradient from blue (low) to white (high)
                    return new Color(cell.BaseElevation, cell.BaseElevation, cell.BaseElevation);

                case DebugOverlayType.Water:
                    return cell.IsWater ? Color.blue : Color.yellow;

                case DebugOverlayType.Buildability:
                    return cell.IsBuildable ? Color.green : Color.red;

                case DebugOverlayType.Fertility:
                    return new Color(0f, cell.Fertility, 0f);

                default:
                    return Color.white;
            }
        }
    }
}
