using System.Collections.Generic;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Processes the HexGrid to identify and tag shoreline cells — land cells
    /// that are directly adjacent to water cells. Shoreline data is consumed by
    /// terrain mesh generation, biome blending, prop spawning, and movement cost calculations.
    /// </summary>
    public class ShorelineResolver : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private HexGrid _hexGrid;

        /// <summary>Analyzes the entire grid and marks all shoreline cells.</summary>
        public void ResolveShorelineCells()
        {
            if (_hexGrid == null)
            {
                Debug.LogError("[ShorelineResolver] HexGrid reference is missing.");
                return;
            }

            int shoreCount = 0;
            foreach (HexCell cell in _hexGrid.GetAllCells())
            {
                if (cell.IsWater) continue;

                // Check whether any neighbor is a water cell
                bool adjacentToWater = false;
                List<HexCell> neighbors = _hexGrid.GetNeighbors(cell.Coord);
                foreach (HexCell neighbor in neighbors)
                {
                    if (neighbor.IsWater)
                    {
                        adjacentToWater = true;
                        break;
                    }
                }

                if (adjacentToWater)
                {
                    // TODO: Tag cell with an IsShore flag (add field to HexCell)
                    // TODO: Adjust movement cost and buildability for shoreline cells
                    shoreCount++;
                }
            }

            Debug.Log($"[ShorelineResolver] Found {shoreCount} shoreline cells.");
        }
    }
}
