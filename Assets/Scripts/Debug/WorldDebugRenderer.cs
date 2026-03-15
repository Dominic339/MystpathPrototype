using System.Collections.Generic;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace Mystpath
{
    /// <summary>
    /// Renders debug overlays on the hex grid for development and testing purposes.
    /// Visualizes per-cell data as colored hex meshes in the Scene and Game views.
    ///
    /// Overlay switching: keys 0-8 for direct selection, Tab to cycle forward.
    /// Regeneration: R re-runs the current seed, N generates a new random seed.
    /// Mouse hover: displays a cell inspection panel (Game view, Gizmos toggle on).
    ///
    /// Rendering: Gizmos.DrawMesh with a procedural flat-top hexagon mesh (7 verts,
    /// 6 triangles, +Y normals). Works in Scene view unconditionally; in Game view
    /// when the Gizmos toggle is enabled.
    ///
    /// Does NOT implement final terrain rendering, biome blending, or prop placement.
    /// </summary>
    public class WorldDebugRenderer : MonoBehaviour
    {
        [Header("References")]
        [Tooltip("The WorldGenerator whose output should be visualized.")]
        [SerializeField] private WorldGenerator _worldGenerator;

        [Header("Display Settings")]
        [SerializeField] private DebugOverlayType _currentOverlay = DebugOverlayType.None;
        [SerializeField] private bool _showCoordinateLabels;

        [Tooltip("Outer radius of each hex gizmo in world units. " +
                 "Must match the hex world size used by HexCoord.ToWorldPosition.")]
        [SerializeField] private float _hexWorldSize = 1.0f;

        // Procedural flat-top hexagon mesh shared across all draw calls in a frame.
        private Mesh _hexMesh;

        // Cell currently under the mouse cursor (null when no valid cell is hovered).
        private HexCell _hoveredCell;

        private static readonly float Sqrt3 = Mathf.Sqrt(3f);

        // Convenience accessor — reads the grid from the generator so both always stay in sync.
        private HexGrid ActiveGrid => _worldGenerator != null ? _worldGenerator.Grid : null;

        // =====================================================================
        // Unity Lifecycle
        // =====================================================================

        private void Awake()
        {
            RebuildHexMesh();
        }

        private void Update()
        {
            HandleOverlayHotkeys();
            HandleRegenerationHotkeys();
            UpdateHoveredCell();
        }

        /// <summary>Switches to the given overlay mode. Gizmos refresh automatically.</summary>
        public void SetOverlay(DebugOverlayType overlay)
        {
            _currentOverlay = overlay;
        }

        // =====================================================================
        // Input Handling
        // =====================================================================

        private void HandleOverlayHotkeys()
        {
            // Keys 0-8 select overlay modes directly by enum value.
            for (int i = 0; i <= 8; i++)
            {
                if (Input.GetKeyDown(KeyCode.Alpha0 + i))
                {
                    _currentOverlay = (DebugOverlayType)i;
                    return;
                }
            }

            // Tab cycles forward through all overlay modes.
            if (Input.GetKeyDown(KeyCode.Tab))
            {
                int count = System.Enum.GetValues(typeof(DebugOverlayType)).Length;
                _currentOverlay = (DebugOverlayType)(((int)_currentOverlay + 1) % count);
            }
        }

        private void HandleRegenerationHotkeys()
        {
            if (_worldGenerator == null) return;

            // R: regenerate with the current seed (same world).
            // N: randomize seed and regenerate (new world).
            if (Input.GetKeyDown(KeyCode.R))
                _worldGenerator.GenerateWorld();
            else if (Input.GetKeyDown(KeyCode.N))
                _worldGenerator.GenerateWithNewSeed();
        }

        // =====================================================================
        // Mouse Hover Detection
        // =====================================================================

        /// <summary>
        /// Casts a ray from the mouse through the XZ plane (y = 0) and maps the
        /// intersection point to the nearest hex coordinate, then looks up that cell.
        /// </summary>
        private void UpdateHoveredCell()
        {
            _hoveredCell = null;

            if (ActiveGrid == null || Camera.main == null) return;
            if (_currentOverlay == DebugOverlayType.None) return;

            Ray ray = Camera.main.ScreenPointToRay(Input.mousePosition);
            var ground = new Plane(Vector3.up, Vector3.zero);
            if (!ground.Raycast(ray, out float enter)) return;

            Vector3 hitPoint = ray.GetPoint(enter);
            HexCoord coord = WorldToHexCoord(hitPoint);
            _hoveredCell = ActiveGrid.GetCell(coord);
        }

        /// <summary>
        /// Converts a world-space XZ position to the nearest hex axial coordinate.
        /// Inverse of HexCoord.ToWorldPosition (flat-top layout) using cube-coordinate rounding.
        /// q = (2/3 * x) / hexSize
        /// r = (-1/3 * x + sqrt(3)/3 * z) / hexSize
        /// </summary>
        private HexCoord WorldToHexCoord(Vector3 worldPos)
        {
            float x = worldPos.x;
            float z = worldPos.z;

            // Fractional axial coordinates.
            float q = (2f / 3f * x) / _hexWorldSize;
            float r = (-1f / 3f * x + Sqrt3 / 3f * z) / _hexWorldSize;
            float s = -q - r;

            // Round all three cube axes, then fix the axis with the largest rounding error
            // so the cube constraint q+r+s=0 is maintained exactly.
            int rq = Mathf.RoundToInt(q);
            int rr = Mathf.RoundToInt(r);
            int rs = Mathf.RoundToInt(s);

            float dq = Mathf.Abs(rq - q);
            float dr = Mathf.Abs(rr - r);
            float ds = Mathf.Abs(rs - s);

            if (dq > dr && dq > ds)
                rq = -rr - rs;
            else if (dr > ds)
                rr = -rq - rs;
            // else: s is the inaccurate axis — not stored in axial coords, nothing to fix.

            return new HexCoord(rq, rr);
        }

        // =====================================================================
        // Gizmo Rendering
        // =====================================================================

        private void OnDrawGizmos()
        {
            HexGrid grid = ActiveGrid;
            if (grid == null || _currentOverlay == DebugOverlayType.None) return;

            if (_hexMesh == null) RebuildHexMesh();

            Vector3 hexScale = Vector3.one * _hexWorldSize;

            // Pass 1: filled hex faces.
            foreach (HexCell cell in grid.GetAllCells())
            {
                Vector3 worldPos = cell.Coord.ToWorldPosition(_hexWorldSize);
                Gizmos.color = GetOverlayColor(cell);
                Gizmos.DrawMesh(_hexMesh, worldPos, Quaternion.identity, hexScale);
            }

            // Pass 2: dark outline on every cell for grid readability.
            Gizmos.color = new Color(0f, 0f, 0f, 0.30f);
            foreach (HexCell cell in grid.GetAllCells())
            {
                Vector3 worldPos = cell.Coord.ToWorldPosition(_hexWorldSize);
                Gizmos.DrawWireMesh(_hexMesh, worldPos, Quaternion.identity, hexScale);
            }

            // Pass 3: white outline on the hovered cell.
            if (_hoveredCell != null)
            {
                Vector3 hoverPos = _hoveredCell.Coord.ToWorldPosition(_hexWorldSize);
                Gizmos.color = Color.white;
                Gizmos.DrawWireMesh(_hexMesh, hoverPos, Quaternion.identity, hexScale * 1.06f);
            }

            // Pass 4: feature anchor sphere markers in FeatureMembership overlay.
            if (_currentOverlay == DebugOverlayType.FeatureMembership && _worldGenerator != null)
            {
                Gizmos.color = Color.white;
                foreach (TerrainFeature feature in _worldGenerator.TerrainFeatures)
                {
                    Vector3 anchorPos = feature.AnchorHex.ToWorldPosition(_hexWorldSize);
                    Gizmos.DrawSphere(anchorPos, _hexWorldSize * 0.22f);
                }
            }

            // Pass 5: coordinate labels (Editor only — safe no-op at runtime).
#if UNITY_EDITOR
            if (_showCoordinateLabels)
            {
                var style = new GUIStyle { normal = { textColor = Color.white }, fontSize = 9, alignment = TextAnchor.MiddleCenter };
                foreach (HexCell cell in grid.GetAllCells())
                {
                    Vector3 worldPos = cell.Coord.ToWorldPosition(_hexWorldSize);
                    Handles.Label(worldPos, $"{cell.Coord.Q},{cell.Coord.R}", style);
                }
            }
#endif
        }

        // =====================================================================
        // IMGUI Panels
        // =====================================================================

        private void OnGUI()
        {
            if (_currentOverlay == DebugOverlayType.None) return;

            DrawControlsPanel();

            if (_hoveredCell != null)
                DrawInspectionPanel(_hoveredCell);
        }

        /// <summary>Draws a compact controls legend in the top-left corner of the screen.</summary>
        private void DrawControlsPanel()
        {
            GUI.Box(new Rect(6, 6, 226, 192), string.Empty);
            GUILayout.BeginArea(new Rect(12, 12, 216, 184));
            GUILayout.Label("<b>Debug Overlays</b>", RichLabel());
            GUILayout.Label("0 None       1 Biome      2 Elevation", SmallLabel());
            GUILayout.Label("3 Water      4 Buildable  5 MoveCost", SmallLabel());
            GUILayout.Label("6 Fertility  7 Resource   8 Feature", SmallLabel());
            GUILayout.Label("Tab — cycle overlay", SmallLabel());
            GUILayout.Space(4f);
            GUILayout.Label("<b>Camera</b>", RichLabel());
            GUILayout.Label("WASD / Arrows — pan", SmallLabel());
            GUILayout.Label("Scroll wheel — zoom", SmallLabel());
            GUILayout.Label("Middle drag — pan", SmallLabel());
            GUILayout.Space(4f);
            GUILayout.Label("R — regenerate same seed", SmallLabel());
            GUILayout.Label("N — new random seed", SmallLabel());
            GUILayout.Space(4f);
            GUILayout.Label($"Active: <b>{_currentOverlay}</b>", RichLabel());
            GUILayout.EndArea();
        }

        /// <summary>Draws a cell data panel in the top-right corner for the hovered cell.</summary>
        private void DrawInspectionPanel(HexCell cell)
        {
            const float width = 250f;
            float panelHeight = cell.HiddenResourceWeights.Count > 0
                ? 270f + cell.HiddenResourceWeights.Count * 18f
                : 210f;

            GUI.Box(new Rect(Screen.width - width - 6, 6, width, panelHeight), string.Empty);
            GUILayout.BeginArea(new Rect(Screen.width - width, 12, width - 12, panelHeight - 12));

            GUILayout.Label($"<b>Cell [{cell.Coord.Q}, {cell.Coord.R}]</b>", RichLabel());
            GUILayout.Label($"StableId:    {cell.StableId}", SmallLabel());
            GUILayout.Label($"Biome:       {cell.Biome}", SmallLabel());
            GUILayout.Label($"Elevation:   {cell.BaseElevation:F3}", SmallLabel());
            GUILayout.Label($"Water:       {cell.IsWater}  depth {cell.WaterDepth:F2}", SmallLabel());
            GUILayout.Label($"Buildable:   {cell.IsBuildable}", SmallLabel());
            GUILayout.Label($"Fertility:   {cell.Fertility:F3}", SmallLabel());

            string moveCostStr = cell.MovementCost >= float.MaxValue / 2f
                ? "Impassable"
                : cell.MovementCost.ToString("F2");
            GUILayout.Label($"MoveCost:    {moveCostStr}", SmallLabel());

            if (cell.HasFeature)
                GUILayout.Label($"Feature:     {cell.OwningFeatureId}", SmallLabel());

            if (cell.HiddenResourceWeights.Count > 0)
            {
                GUILayout.Space(4f);
                GUILayout.Label("<b>Hidden Resources</b>", RichLabel());

                // Sort descending by weight so the dominant resource is at the top.
                var sorted = new List<KeyValuePair<ResourceType, float>>(cell.HiddenResourceWeights);
                sorted.Sort((a, b) => b.Value.CompareTo(a.Value));
                foreach (var kv in sorted)
                    GUILayout.Label($"  {kv.Key,-14} {kv.Value:F3}", SmallLabel());
            }

            GUILayout.EndArea();
        }

        private static GUIStyle RichLabel()
        {
            var s = new GUIStyle(GUI.skin.label);
            s.richText = true;
            s.normal.textColor = Color.white;
            return s;
        }

        private static GUIStyle SmallLabel()
        {
            var s = new GUIStyle(GUI.skin.label);
            s.fontSize = 11;
            s.normal.textColor = Color.white;
            return s;
        }

        // =====================================================================
        // Overlay Color Mapping
        // =====================================================================

        /// <summary>
        /// Returns the debug visualization color for a cell under the current overlay mode.
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
                        ? new Color(0.10f, 0.30f, 0.90f)   // blue
                        : new Color(0.70f, 0.90f, 0.50f);  // pale green

                case DebugOverlayType.Buildability:
                    return cell.IsBuildable
                        ? new Color(0.20f, 0.80f, 0.20f)   // green
                        : new Color(0.80f, 0.20f, 0.20f);  // red

                case DebugOverlayType.MovementCost:
                    return GetMovementCostColor(cell.MovementCost);

                case DebugOverlayType.Fertility:
                    // Dark brown (low) → bright green (high).
                    return Color.Lerp(new Color(0.35f, 0.22f, 0.08f), new Color(0.10f, 0.85f, 0.10f), cell.Fertility);

                case DebugOverlayType.PrimaryHiddenResource:
                    return GetDominantResourceColor(cell.HiddenResourceWeights);

                case DebugOverlayType.FeatureMembership:
                    return cell.HasFeature
                        ? new Color(0.90f, 0.60f, 0.10f)   // warm orange — feature member
                        : new Color(0.25f, 0.25f, 0.25f);  // dark grey — no feature

                default:
                    return Color.white;
            }
        }

        /// <summary>
        /// Maps movement cost to a color. Green = easy travel, yellow = moderate,
        /// red = costly, dark blue = impassable.
        /// Cost range in use: 1.0 (grassland) to 3.5 (mountain), float.MaxValue (ocean).
        /// </summary>
        private static Color GetMovementCostColor(float cost)
        {
            if (cost >= float.MaxValue / 2f)
                return new Color(0.05f, 0.05f, 0.35f); // deep blue — impassable

            // Normalize the [1.0, 3.5] range to [0, 1], then lerp green → yellow → red.
            float t = Mathf.Clamp01((cost - 1.0f) / 2.5f);
            if (t < 0.5f)
                return Color.Lerp(new Color(0.15f, 0.85f, 0.15f), new Color(0.95f, 0.90f, 0.10f), t * 2f);
            return Color.Lerp(new Color(0.95f, 0.90f, 0.10f), new Color(0.85f, 0.10f, 0.10f), (t - 0.5f) * 2f);
        }

        /// <summary>
        /// Returns a representative color for the highest-weight resource in the cell.
        /// Dark grey is returned when no resource weights are present.
        /// </summary>
        private static Color GetDominantResourceColor(Dictionary<ResourceType, float> weights)
        {
            if (weights == null || weights.Count == 0)
                return new Color(0.20f, 0.20f, 0.20f);

            ResourceType dominant = ResourceType.None;
            float maxWeight = -1f;
            foreach (var kv in weights)
            {
                if (kv.Value > maxWeight)
                {
                    maxWeight = kv.Value;
                    dominant = kv.Key;
                }
            }

            switch (dominant)
            {
                case ResourceType.RawFood:   return new Color(0.95f, 0.55f, 0.10f); // orange
                case ResourceType.CookedFood:return new Color(0.90f, 0.45f, 0.10f); // dark orange
                case ResourceType.Grain:     return new Color(0.90f, 0.80f, 0.15f); // golden yellow
                case ResourceType.Wood:      return new Color(0.45f, 0.28f, 0.10f); // brown
                case ResourceType.Lumber:    return new Color(0.55f, 0.35f, 0.15f); // lighter brown
                case ResourceType.Stone:     return new Color(0.60f, 0.60f, 0.60f); // grey
                case ResourceType.Ore:       return new Color(0.20f, 0.60f, 0.70f); // steel blue
                case ResourceType.Metal:     return new Color(0.50f, 0.55f, 0.65f); // silver-blue
                case ResourceType.Clay:      return new Color(0.65f, 0.38f, 0.22f); // terracotta
                case ResourceType.Brick:     return new Color(0.75f, 0.30f, 0.20f); // brick red
                case ResourceType.Fiber:     return new Color(0.70f, 0.55f, 0.85f); // lavender
                case ResourceType.Cloth:     return new Color(0.80f, 0.65f, 0.90f); // light purple
                case ResourceType.Tools:     return new Color(0.70f, 0.70f, 0.40f); // olive
                default:                     return Color.magenta;                   // unknown — visible error
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

        // =====================================================================
        // Hex Mesh Construction
        // =====================================================================

        /// <summary>
        /// Builds (or rebuilds) the shared procedural flat-top hexagon mesh.
        ///
        /// Geometry (outer radius = 1; caller scales via Gizmos draw call):
        ///   Index 0       = center vertex
        ///   Indices 1–6   = corner vertices at 0°, 60°, 120°, 180°, 240°, 300°
        ///
        /// Winding (6 triangles, CW when viewed from +Y → normals point +Y):
        ///   Triangle i = (center, corner_{i+1 mod 6}, corner_i)
        /// </summary>
        private void RebuildHexMesh()
        {
            _hexMesh = new Mesh { name = "DebugHex" };

            var verts   = new Vector3[7];
            var normals = new Vector3[7];
            var uvs     = new Vector2[7];

            // Centre vertex.
            verts[0]   = Vector3.zero;
            normals[0] = Vector3.up;
            uvs[0]     = new Vector2(0.5f, 0.5f);

            // Six corner vertices at 60° intervals (flat-top: first corner at 0°).
            for (int i = 0; i < 6; i++)
            {
                float rad = i * 60f * Mathf.Deg2Rad;
                float cx  = Mathf.Cos(rad);
                float cz  = Mathf.Sin(rad);
                verts[i + 1]   = new Vector3(cx, 0f, cz); // outer radius 1; scaled at draw time
                normals[i + 1] = Vector3.up;
                uvs[i + 1]     = new Vector2(0.5f + cx * 0.5f, 0.5f + cz * 0.5f);
            }

            // Six triangles, 3 indices each = 18 total.
            // (center, next_corner, current_corner) → CW from above → front face pointing +Y.
            var tris = new int[18];
            for (int i = 0; i < 6; i++)
            {
                tris[i * 3 + 0] = 0;               // center
                tris[i * 3 + 1] = (i + 1) % 6 + 1; // next corner
                tris[i * 3 + 2] = i + 1;            // current corner
            }

            _hexMesh.vertices  = verts;
            _hexMesh.normals   = normals;
            _hexMesh.uv        = uvs;
            _hexMesh.triangles = tris;
            _hexMesh.RecalculateBounds();
        }
    }
}
