using System.Collections.Generic;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Processes the HexGrid to identify and tag shoreline cells — land cells
    /// that are directly adjacent to at least one water cell.
    ///
    /// Shore data is consumed by the terrain mesh builder (for visual shoreline
    /// treatment), future prop spawning, and movement cost adjustments.
    ///
    /// Subscribes to <see cref="WorldGenerator.OnWorldGenerated"/> so it
    /// automatically re-resolves whenever the world is regenerated (including
    /// debug hotkeys R / N). ShorelineResolver is guaranteed to subscribe
    /// before WorldTerrainBuilder so shore flags are set before mesh generation.
    /// </summary>
    public class ShorelineResolver : MonoBehaviour
    {
        [Header("References")]
        [Tooltip("Auto-found at runtime if left unassigned.")]
        [SerializeField] private HexGrid _hexGrid;

        [Tooltip("Auto-found at runtime if left unassigned.")]
        [SerializeField] private WorldGenerator _worldGenerator;

        private void Awake()
        {
            if (_hexGrid == null)
                _hexGrid = FindFirstObjectByType<HexGrid>();

            if (_worldGenerator == null)
                _worldGenerator = FindFirstObjectByType<WorldGenerator>();

            if (_worldGenerator != null)
                _worldGenerator.OnWorldGenerated += ResolveShorelineCells;
            else
                Debug.LogWarning("[ShorelineResolver] WorldGenerator not found. " +
                                 "Shore flags will not be set automatically.");
        }

        private void OnDestroy()
        {
            // Unsubscribe to prevent dangling delegate references.
            if (_worldGenerator != null)
                _worldGenerator.OnWorldGenerated -= ResolveShorelineCells;
        }

        /// <summary>
        /// Scans every land cell in the grid and sets <see cref="HexCell.IsShore"/>
        /// true if any immediate neighbor is a water cell.
        /// Clears existing shore flags first so the method is idempotent across
        /// regeneration calls.
        /// </summary>
        public void ResolveShorelineCells()
        {
            if (_hexGrid == null)
            {
                Debug.LogError("[ShorelineResolver] HexGrid reference is missing. " +
                               "Add a HexGrid component to the scene.");
                return;
            }

            int shoreCount = 0;

            foreach (HexCell cell in _hexGrid.GetAllCells())
            {
                // Reset on each run so stale data from a previous generation is cleared.
                cell.IsShore = false;

                if (cell.IsWater) continue;

                List<HexCell> neighbors = _hexGrid.GetNeighbors(cell.Coord);
                bool adjacentToWater = false;
                foreach (HexCell neighbor in neighbors)
                {
                    if (neighbor.IsWater)
                    {
                        adjacentToWater = true;
                        break;
                    }
                }

                if (!adjacentToWater) continue;

                cell.IsShore = true;

                // Shore cells are slightly slower to traverse due to soft ground and
                // water proximity. Clamp so we never reduce a higher existing cost.
                // TODO: Expose shore movement penalty as a configurable parameter.
                cell.MovementCost = Mathf.Max(cell.MovementCost, 1.3f);

                shoreCount++;
            }

            Debug.Log($"[ShorelineResolver] Resolved {shoreCount} shoreline cells.");
        }
    }
}
