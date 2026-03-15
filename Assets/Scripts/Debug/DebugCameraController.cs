using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Provides debug camera controls for inspecting the hex world in Play Mode.
    ///
    /// Controls:
    ///   WASD / Arrow keys  — pan across the world
    ///   Middle mouse drag  — pan (click-drag)
    ///   Right mouse drag   — pan (click-drag)
    ///   Scroll wheel       — zoom in/out (adjusts orthographic size)
    ///
    /// On Start, the camera automatically centres above the grid and sizes its
    /// orthographic frustum to show the full world. Call CenterOnWorld() at any
    /// time to return to that view.
    ///
    /// The WorldGenerator reference is auto-resolved from the scene if not assigned
    /// in the inspector, so no manual wiring is required for basic usage.
    ///
    /// Requires an orthographic Camera component on the same GameObject.
    /// Tag that GameObject "MainCamera" so WorldDebugRenderer can detect hover.
    ///
    /// TODO: Migrate input to a formal input layer when the production input system
    ///       is established. Currently uses legacy Input API (activeInputHandler = Both).
    /// </summary>
    [RequireComponent(typeof(Camera))]
    public class DebugCameraController : MonoBehaviour
    {
        [Header("References")]
        [Tooltip("Used to read grid dimensions for CenterOnWorld. " +
                 "Auto-found at runtime if left unassigned.")]
        [SerializeField] private WorldGenerator _worldGenerator;

        [Header("Hex Layout")]
        [Tooltip("Must match WorldDebugRenderer's Hex World Size.")]
        [SerializeField] private float _hexWorldSize = 1.0f;

        [Header("Pan")]
        [Tooltip("World units per second when panning with keyboard.")]
        [SerializeField] private float _keyPanSpeed = 20f;

        [Tooltip("Drag sensitivity for middle/right mouse pan. Lower = faster.")]
        [SerializeField] private float _mousePanSensitivity = 0.015f;

        [Header("Zoom")]
        [Tooltip("Zoom speed multiplier. Zoom is proportional to current size.")]
        [SerializeField] private float _zoomSpeed = 3f;
        [SerializeField] private float _minOrthographicSize =  3f;
        [SerializeField] private float _maxOrthographicSize = 120f;

        private Camera  _camera;
        private bool    _isDragging;
        private int     _dragButton;       // which mouse button started the current drag
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
            // Auto-resolve WorldGenerator if not wired in the inspector.
            // Done in Start (not Awake) so GameBootstrap.Awake has already run
            // and the generator exists with an initialised grid.
            if (_worldGenerator == null)
                _worldGenerator = FindFirstObjectByType<WorldGenerator>();

            if (_worldGenerator == null)
                Debug.LogWarning("[DebugCameraController] WorldGenerator not found. " +
                                 "Camera will centre on a default 48×48 grid.");

            CenterOnWorld();
        }

        private void Update()
        {
            HandleKeyPan();
            HandleMouseDragPan();
            HandleScrollZoom();
        }

        // =====================================================================
        // Public API
        // =====================================================================

        /// <summary>
        /// Repositions the camera directly above the grid centre and adjusts the
        /// orthographic size so the full world is visible. Safe to call at any time.
        /// </summary>
        public void CenterOnWorld()
        {
            // Use null-propagation so a missing Grid (before generation) falls back safely.
            int gridWidth  = _worldGenerator?.Grid?.Width  ?? 48;
            int gridHeight = _worldGenerator?.Grid?.Height ?? 48;

            // World-space centre derived from the middle axial coordinate.
            Vector3 center = new HexCoord(gridWidth / 2, gridHeight / 2)
                                 .ToWorldPosition(_hexWorldSize);

            // Camera sits directly above the grid, looking straight down.
            transform.position = new Vector3(center.x, 60f, center.z);
            transform.rotation = Quaternion.Euler(90f, 0f, 0f);

            // Orthographic size = half the visible vertical world extent.
            // Full grid height ≈ gridHeight × sqrt(3) × hexSize; 0.55 adds a small margin.
            _camera.orthographicSize = Mathf.Clamp(
                gridHeight * Sqrt3 * _hexWorldSize * 0.55f,
                _minOrthographicSize,
                _maxOrthographicSize);
        }

        // =====================================================================
        // Input — Keyboard Pan
        // =====================================================================

        private void HandleKeyPan()
        {
            // Scale key speed by zoom level so panning feels consistent at all scales.
            float speed = _keyPanSpeed * Time.deltaTime * (_camera.orthographicSize / 20f);
            Vector3 move = Vector3.zero;

            if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow))    move.z += speed;
            if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow))  move.z -= speed;
            if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow))  move.x -= speed;
            if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow)) move.x += speed;

            transform.position += move;
        }

        // =====================================================================
        // Input — Mouse Drag Pan (middle button or right button)
        // =====================================================================

        private void HandleMouseDragPan()
        {
            // Begin a drag with middle (2) or right (1) mouse button.
            if (!_isDragging)
            {
                if (Input.GetMouseButtonDown(2) || Input.GetMouseButtonDown(1))
                {
                    _isDragging       = true;
                    _dragButton       = Input.GetMouseButtonDown(2) ? 2 : 1;
                    _dragLastMousePos = Input.mousePosition;
                }
                return;
            }

            // End drag when the button is released.
            if (Input.GetMouseButtonUp(_dragButton))
            {
                _isDragging = false;
                return;
            }

            Vector3 delta = Input.mousePosition - _dragLastMousePos;
            _dragLastMousePos = Input.mousePosition;

            // Scale pan distance by the orthographic size so the drag distance in world
            // space stays proportional to the current zoom level.
            float scale = _camera.orthographicSize * _mousePanSensitivity;
            transform.position -= new Vector3(delta.x * scale, 0f, delta.y * scale);
        }

        // =====================================================================
        // Input — Scroll Wheel Zoom
        // =====================================================================

        private void HandleScrollZoom()
        {
            float scroll = Input.GetAxis("Mouse ScrollWheel");
            if (Mathf.Approximately(scroll, 0f)) return;

            // Proportional zoom: delta is a fraction of the current size, so zooming
            // feels equally responsive whether zoomed in or out.
            float newSize = _camera.orthographicSize * (1f - scroll * _zoomSpeed);
            _camera.orthographicSize = Mathf.Clamp(newSize, _minOrthographicSize, _maxOrthographicSize);
        }
    }
}
