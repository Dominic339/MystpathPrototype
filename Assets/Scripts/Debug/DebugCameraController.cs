using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Provides debug camera controls for inspecting the hex world in Play Mode.
    ///
    /// Controls:
    ///   WASD / Arrow keys  — pan across the world
    ///   Scroll wheel       — zoom in/out (adjusts orthographic size)
    ///   Middle mouse drag  — pan (drag-to-scroll)
    ///
    /// On Start the camera is centred above the grid and sized to show the full world.
    /// Requires an orthographic Camera component on the same GameObject.
    ///
    /// Attach to the scene camera alongside a WorldDebugRenderer setup.
    /// _hexWorldSize must match the value set on WorldDebugRenderer.
    /// </summary>
    [RequireComponent(typeof(Camera))]
    public class DebugCameraController : MonoBehaviour
    {
        [Header("References")]
        [Tooltip("Used to read grid dimensions for CenterOnWorld. Can be left null if grid size is set manually.")]
        [SerializeField] private WorldGenerator _worldGenerator;

        [Header("Hex Layout")]
        [Tooltip("Must match WorldDebugRenderer's Hex World Size.")]
        [SerializeField] private float _hexWorldSize = 1.0f;

        [Header("Pan")]
        [SerializeField] private float _keyPanSpeed   = 20f;
        [SerializeField] private float _mousePanSpeed = 0.03f;

        [Header("Zoom")]
        [SerializeField] private float _zoomSpeed          = 6f;
        [SerializeField] private float _minOrthographicSize = 3f;
        [SerializeField] private float _maxOrthographicSize = 120f;

        private Camera _camera;
        private bool   _isDragging;
        private Vector3 _dragLastMousePos;

        private static readonly float Sqrt3 = Mathf.Sqrt(3f);

        // =====================================================================
        // Unity Lifecycle
        // =====================================================================

        private void Awake()
        {
            _camera = GetComponent<Camera>();
            _camera.orthographic = true;
        }

        private void Start()
        {
            CenterOnWorld();
        }

        private void Update()
        {
            HandleKeyPan();
            HandleMiddleMousePan();
            HandleScrollZoom();
        }

        // =====================================================================
        // Public API
        // =====================================================================

        /// <summary>
        /// Repositions and resizes the camera to frame the entire hex grid.
        /// Looks straight down (+Y → −Y) at the grid centre.
        /// </summary>
        public void CenterOnWorld()
        {
            int gridWidth  = _worldGenerator != null ? _worldGenerator.Grid.Width  : 48;
            int gridHeight = _worldGenerator != null ? _worldGenerator.Grid.Height : 48;

            // World-space centre of the grid (use the centre cell coordinate).
            Vector3 centerWorld = new HexCoord(gridWidth / 2, gridHeight / 2)
                                      .ToWorldPosition(_hexWorldSize);

            // Position directly above the grid centre, looking straight down.
            transform.position = new Vector3(centerWorld.x, 60f, centerWorld.z);
            transform.rotation = Quaternion.Euler(90f, 0f, 0f);

            // Orthographic size = half the screen height in world units.
            // Full vertical world extent ≈ gridHeight * sqrt(3) * hexWorldSize.
            // Multiply by 0.55 so a little margin is visible around the edges.
            _camera.orthographicSize = Mathf.Clamp(
                gridHeight * Sqrt3 * _hexWorldSize * 0.55f,
                _minOrthographicSize,
                _maxOrthographicSize);
        }

        // =====================================================================
        // Input Handling
        // =====================================================================

        private void HandleKeyPan()
        {
            float speed = _keyPanSpeed * Time.deltaTime;
            Vector3 move = Vector3.zero;

            if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow))    move.z += speed;
            if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow))  move.z -= speed;
            if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow))  move.x -= speed;
            if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow)) move.x += speed;

            // Scale pan speed with zoom level so it feels consistent at all distances.
            move *= (_camera.orthographicSize / 20f);

            transform.position += move;
        }

        private void HandleMiddleMousePan()
        {
            if (Input.GetMouseButtonDown(2))
            {
                _isDragging       = true;
                _dragLastMousePos = Input.mousePosition;
                return;
            }

            if (Input.GetMouseButtonUp(2))
            {
                _isDragging = false;
                return;
            }

            if (!_isDragging) return;

            Vector3 delta = Input.mousePosition - _dragLastMousePos;
            _dragLastMousePos = Input.mousePosition;

            // Scale drag speed by orthographic size so drag distance is consistent at all zooms.
            float scale = _camera.orthographicSize * _mousePanSpeed;
            transform.position -= new Vector3(delta.x * scale, 0f, delta.y * scale);
        }

        private void HandleScrollZoom()
        {
            float scroll = Input.GetAxis("Mouse ScrollWheel");
            if (Mathf.Approximately(scroll, 0f)) return;

            // Zoom proportional to the current size so the feel is consistent at all distances.
            _camera.orthographicSize = Mathf.Clamp(
                _camera.orthographicSize - scroll * _zoomSpeed * _camera.orthographicSize * 0.1f,
                _minOrthographicSize,
                _maxOrthographicSize);
        }
    }
}
