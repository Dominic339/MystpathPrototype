using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Mystpath
{
    /// <summary>
    /// Converts HexGrid simulation data into a visible 3D terrain mesh at runtime.
    ///
    /// Architecture:
    ///   - The HexGrid remains the authoritative source of truth. This class only reads it.
    ///   - Each HexCell contributes seven vertices (center + six corners) to a single
    ///     combined mesh. Vertices are NOT shared across hex boundaries, giving a
    ///     clean low-poly stylized look consistent with the strategy-game aesthetic.
    ///
    /// Corner height/color correctness:
    ///   Corner i of a flat-top hex (at angle 60*i°) is the meeting point of three cells:
    ///   the owning cell, and the neighbors at axial directions (6-i)%6 and (7-i)%6.
    ///   Both the height and the blended color for each corner are averaged over those
    ///   three specific cells. Because every adjacent hex that shares a corner computes
    ///   the same average (same three cells, same formula), the resulting vertex heights
    ///   are identical at every shared position, producing a seamless continuous surface.
    ///
    ///   The incorrect formula used previously (dirs i and (i+1)%6) only happens to be
    ///   right for corners 0 and 3. For the remaining four corners it uses the wrong
    ///   neighbors, producing mismatched heights and the visible disconnected-plate look.
    ///
    /// Subscribes to WorldGenerator.OnWorldGenerated so terrain rebuilds automatically
    /// whenever the world is regenerated, including R / N debug hotkeys.
    ///
    /// Does NOT implement prop spawning, building footprints, or final art shading.
    /// </summary>
    public class WorldTerrainBuilder : MonoBehaviour
    {
        // Six axial neighbor directions for flat-top hexes (matches HexCoord._directions).
        // Corner i of a hex is shared with the neighbors at directions i and (i+1) % 6.
        private static readonly HexCoord[] Directions =
        {
            new HexCoord( 1,  0),   // 0 — right
            new HexCoord( 1, -1),   // 1 — upper-right
            new HexCoord( 0, -1),   // 2 — upper-left
            new HexCoord(-1,  0),   // 3 — left
            new HexCoord(-1,  1),   // 4 — lower-left
            new HexCoord( 0,  1),   // 5 — lower-right
        };

        // =====================================================================
        // Inspector Fields
        // =====================================================================

        [Header("References")]
        [Tooltip("Source of hex cell data. Auto-found at runtime if left unassigned.")]
        [SerializeField] private HexGrid _hexGrid;

        [Tooltip("Subscribes to OnWorldGenerated for automatic rebuilds. Auto-found if unassigned.")]
        [SerializeField] private WorldGenerator _worldGenerator;

        [Tooltip("Resolves shore flags before building mesh. Auto-found if unassigned.")]
        [SerializeField] private ShorelineResolver _shorelineResolver;

        [Header("Terrain Settings")]
        [Tooltip("Outer radius of each hex in world units. Must match " +
                 "WorldDebugRenderer._hexWorldSize and HexCoord.ToWorldPosition callers.")]
        [SerializeField] private float _hexSize = 1f;

        [Tooltip("Vertical scale applied to BaseElevation. " +
                 "At 4 an elevation of 1.0 becomes 4 world units above y = 0.")]
        [SerializeField] private float _elevationScale = 4f;

        [Tooltip("Maximum elevation (before scale) used for water cell surfaces. " +
                 "Keeps water visually below all land regardless of raw elevation value.")]
        [SerializeField, Range(0.1f, 0.5f)] private float _waterElevationCap = 0.28f;

        [Header("Material")]
        [Tooltip("Terrain material. If null, created at runtime from Mystpath/TerrainVertexColor. " +
                 "Assign a saved Material asset to avoid runtime shader lookup.")]
        [SerializeField] private Material _terrainMaterial;

        // =====================================================================
        // Private State
        // =====================================================================

        private GameObject _terrainRoot;

        // =====================================================================
        // Unity Lifecycle
        // =====================================================================

        private void Awake()
        {
            // Resolve references only — do not subscribe to events yet.
            // Event subscription happens in Start() so it is guaranteed to occur
            // after all Awake() calls (including GameBootstrap, which fires
            // OnWorldGenerated from within its Awake via GenerateWorld()).
            if (_hexGrid == null)
                _hexGrid = FindFirstObjectByType<HexGrid>();

            if (_worldGenerator == null)
                _worldGenerator = FindFirstObjectByType<WorldGenerator>();

            if (_shorelineResolver == null)
                _shorelineResolver = FindFirstObjectByType<ShorelineResolver>();
        }

        private void Start()
        {
            // Subscribe for future regenerations (debug R / N hotkeys, in-game triggers).
            // ShorelineResolver subscribed in its own Awake(), so it is guaranteed to run
            // before WorldTerrainBuilder's handler when OnWorldGenerated fires — shore flags
            // will always be current before BuildTerrain executes.
            if (_worldGenerator != null)
                _worldGenerator.OnWorldGenerated += HandleWorldGenerated;
            else
                Debug.LogWarning("[WorldTerrainBuilder] WorldGenerator not found. " +
                                 "Terrain will not rebuild automatically on regeneration.");

            // Build immediately using the world data that GameBootstrap.Awake() already
            // generated. The OnWorldGenerated event fired during Awake, before our
            // subscription — this Start() call compensates for that missed event.
            if (_hexGrid != null && _hexGrid.CellCount > 0)
                BuildTerrain();
            else
                Debug.LogWarning("[WorldTerrainBuilder] Grid is empty at Start. " +
                                 "Terrain will build when OnWorldGenerated fires.");
        }

        private void OnDestroy()
        {
            if (_worldGenerator != null)
                _worldGenerator.OnWorldGenerated -= HandleWorldGenerated;
        }

        // =====================================================================
        // Event Handler
        // =====================================================================

        /// <summary>
        /// Invoked by WorldGenerator.OnWorldGenerated after each generation pass.
        /// ShorelineResolver runs first (subscribed earlier) so shore flags are current.
        /// </summary>
        private void HandleWorldGenerated() => BuildTerrain();

        // =====================================================================
        // Public API
        // =====================================================================

        /// <summary>
        /// Builds (or rebuilds) the terrain mesh from the current HexGrid contents.
        /// Previous geometry is destroyed before the new mesh is created.
        /// Safe to call multiple times.
        /// </summary>
        public void BuildTerrain()
        {
            if (_hexGrid == null)
            {
                Debug.LogError("[WorldTerrainBuilder] HexGrid not found. Terrain cannot be built.");
                return;
            }

            // Ensure shore flags are current. ShorelineResolver may already have run via
            // its own OnWorldGenerated subscription, but calling it here is idempotent.
            _shorelineResolver?.ResolveShorelineCells();

            if (_terrainRoot != null)
                Destroy(_terrainRoot);

            _terrainRoot = new GameObject("TerrainRoot");
            _terrainRoot.transform.SetParent(transform, worldPositionStays: false);

            EnsureMaterial();
            BuildCombinedMesh();

            Debug.Log("[WorldTerrainBuilder] Terrain mesh built successfully.");
        }

        // =====================================================================
        // Material
        // =====================================================================

        private void EnsureMaterial()
        {
            if (_terrainMaterial != null) return;

            Shader shader = Shader.Find("Mystpath/TerrainVertexColor");

            if (shader == null)
            {
                Debug.LogWarning("[WorldTerrainBuilder] Shader 'Mystpath/TerrainVertexColor' not " +
                                 "found. Falling back to Universal Render Pipeline/Particles/Unlit.");
                shader = Shader.Find("Universal Render Pipeline/Particles/Unlit");
            }

            if (shader == null)
            {
                Debug.LogWarning("[WorldTerrainBuilder] Fallback shader also not found. " +
                                 "Using Universal Render Pipeline/Lit.");
                shader = Shader.Find("Universal Render Pipeline/Lit");
            }

            _terrainMaterial = new Material(shader) { name = "TerrainMaterial_Runtime" };
        }

        // =====================================================================
        // Mesh Generation
        // =====================================================================

        /// <summary>
        /// Iterates all cells in the HexGrid and emits 7 vertices + 6 triangles per hex
        /// into a single combined mesh attached to a new child GameObject.
        /// </summary>
        private void BuildCombinedMesh()
        {
            var vertices  = new List<Vector3>();
            var colors    = new List<Color>();
            var triangles = new List<int>();

            foreach (HexCell cell in _hexGrid.GetAllCells())
            {
                int       baseIndex  = vertices.Count;
                Vector3   worldXZ    = cell.Coord.ToWorldPosition(_hexSize);
                float     centerY    = CellHeight(cell);
                Color     cellColor  = BiomeBlendCalculator.GetCellColor(cell);

                // Center vertex — pure cell color, center height.
                vertices.Add(new Vector3(worldXZ.x, centerY, worldXZ.z));
                colors.Add(cellColor);

                // Six corner vertices.
                for (int i = 0; i < 6; i++)
                {
                    float rad = i * 60f * Mathf.Deg2Rad;
                    float cx  = Mathf.Cos(rad) * _hexSize;
                    float cz  = Mathf.Sin(rad) * _hexSize;

                    // Corner height: average of this cell and the two neighbors sharing it.
                    float cornerY = CornerHeight(cell, i);

                    // Corner color: blend toward adjacent biome colors for smooth transitions.
                    HexCell n1 = NeighborOrNull(cell.Coord, (6 - i) % 6);
                    HexCell n2 = NeighborOrNull(cell.Coord, (7 - i) % 6);
                    Color   cornerColor = BiomeBlendCalculator.BlendCornerColor(cell, n1, n2);

                    vertices.Add(new Vector3(worldXZ.x + cx, cornerY, worldXZ.z + cz));
                    colors.Add(cornerColor);
                }

                // Six triangles with CW winding viewed from +Y (front face = +Y normal).
                // (center, next_corner, current_corner) — matches WorldDebugRenderer convention.
                for (int i = 0; i < 6; i++)
                {
                    triangles.Add(baseIndex);                    // center
                    triangles.Add(baseIndex + (i + 1) % 6 + 1); // next corner
                    triangles.Add(baseIndex + i + 1);            // current corner
                }
            }

            var mesh = new Mesh { name = "TerrainCombined" };

            // 32-bit indices support grids larger than ~93×93 (> 65 535 verts).
            mesh.indexFormat = vertices.Count > 65535 ? IndexFormat.UInt32 : IndexFormat.UInt16;

            mesh.SetVertices(vertices);
            mesh.SetColors(colors);
            mesh.SetTriangles(triangles, 0);

            // Smooth normals within each hex face; hex edge normals remain faceted
            // because corner vertices are not shared across hex boundaries.
            // TODO: Post-process normals across hex boundaries for a smoother appearance.
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();

            var go = new GameObject("TerrainChunk_0");
            go.transform.SetParent(_terrainRoot.transform, worldPositionStays: false);
            go.AddComponent<MeshFilter>().sharedMesh      = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = _terrainMaterial;
        }

        // =====================================================================
        // Height Helpers
        // =====================================================================

        /// <summary>
        /// World-space Y height for a cell's center vertex.
        /// Water cells are capped at <see cref="_waterElevationCap"/> so they always
        /// sit visually below adjacent land cells regardless of their raw elevation.
        /// </summary>
        private float CellHeight(HexCell cell)
        {
            float elev = cell.IsWater
                ? Mathf.Min(cell.BaseElevation, _waterElevationCap)
                : cell.BaseElevation;
            return elev * _elevationScale;
        }

        /// <summary>
        /// World-space Y height for corner <paramref name="cornerIndex"/> of
        /// <paramref name="cell"/>. Corner i is the meeting point of the owning cell
        /// and the neighbors at axial directions (6-i)%6 and (7-i)%6. Averaging those
        /// three heights ensures every adjacent hex produces the identical value at
        /// the shared world position, eliminating visible seams without sharing vertices.
        /// </summary>
        private float CornerHeight(HexCell cell, int cornerIndex)
        {
            float h0 = CellHeight(cell);

            HexCell n1 = NeighborOrNull(cell.Coord, (6 - cornerIndex) % 6);
            HexCell n2 = NeighborOrNull(cell.Coord, (7 - cornerIndex) % 6);

            float h1 = n1 != null ? CellHeight(n1) : h0;
            float h2 = n2 != null ? CellHeight(n2) : h0;

            return (h0 + h1 + h2) / 3f;
        }

        /// <summary>
        /// Returns the grid cell at the neighbor in direction <paramref name="dirIndex"/>
        /// from <paramref name="origin"/>, or null if that coordinate is outside the grid.
        /// </summary>
        private HexCell NeighborOrNull(HexCoord origin, int dirIndex)
        {
            _hexGrid.TryGetCell(origin + Directions[dirIndex], out HexCell cell);
            return cell;
        }
    }
}
