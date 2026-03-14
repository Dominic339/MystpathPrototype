using System.Collections.Generic;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Owns and provides access to all HexCells in the world.
    /// Acts as the primary data store for the hex-grid simulation layer.
    /// All world queries (biome, elevation, occupancy, etc.) go through this class.
    /// </summary>
    public class HexGrid : MonoBehaviour
    {
        [Header("Grid Dimensions")]
        [SerializeField] private int _width = 64;
        [SerializeField] private int _height = 64;

        /// <summary>Width of the grid in hex columns.</summary>
        public int Width => _width;

        /// <summary>Height of the grid in hex rows.</summary>
        public int Height => _height;

        /// <summary>Total number of cells currently stored in the grid.</summary>
        public int CellCount => _cells.Count;

        // Dictionary-backed storage for O(1) coordinate lookup.
        private readonly Dictionary<HexCoord, HexCell> _cells = new Dictionary<HexCoord, HexCell>();

        /// <summary>
        /// Initializes the grid, creating an empty HexCell for every coordinate
        /// within the specified rectangular bounds.
        /// </summary>
        public void Initialize(int width, int height)
        {
            _width = width;
            _height = height;
            _cells.Clear();

            // TODO: Support non-rectangular grid shapes (e.g., circular or island masks)
            for (int q = 0; q < _width; q++)
            {
                for (int r = 0; r < _height; r++)
                {
                    var coord = new HexCoord(q, r);
                    _cells[coord] = new HexCell(coord);
                }
            }

            Debug.Log($"[HexGrid] Initialized {_cells.Count} cells ({_width}×{_height}).");
        }

        /// <summary>Returns the HexCell at the given coordinates, or null if out of bounds.</summary>
        public HexCell GetCell(HexCoord coord)
        {
            _cells.TryGetValue(coord, out HexCell cell);
            return cell;
        }

        /// <summary>Returns true if a cell exists at the given coordinates.</summary>
        public bool HasCell(HexCoord coord) => _cells.ContainsKey(coord);

        /// <summary>
        /// Returns all valid neighboring cells for the given coordinate.
        /// Cells outside grid bounds are omitted from the result.
        /// </summary>
        public List<HexCell> GetNeighbors(HexCoord coord)
        {
            var result = new List<HexCell>(6);
            foreach (HexCoord neighborCoord in coord.GetNeighbors())
            {
                HexCell cell = GetCell(neighborCoord);
                if (cell != null)
                    result.Add(cell);
            }
            return result;
        }

        /// <summary>Returns all cells in the grid. Avoid frequent calls in hot loops.</summary>
        public IEnumerable<HexCell> GetAllCells() => _cells.Values;
    }
}
