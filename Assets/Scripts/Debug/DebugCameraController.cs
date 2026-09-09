using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Player-style angled hover camera for inspecting the hex world in Play Mode.
    ///
    /// Camera style:
    ///   The camera is positioned at a fixed downward angle (think Diablo-style
    ///   overhead-angled view) and pans across the world surface. This gives a
    ///   readable kingdom-builder framing rather than a flat top-down debug view.
    ///
    /// Controls:
    ///   WASD / Arrow keys  — pan across the world (moves the camera pivot)
    ///   Q / E              — rotate the camera left / right around the current pivot
    ///   Middle mouse drag  — pan (click-drag on the world surface)
    ///   Right mouse drag   — pan (click-drag on the world surface)
    ///   Scroll wheel       — zoom in/out by moving the camera along its view axis
    ///   Right mouse + Scroll — tilt the camera pitch (up = more overhead, down = flatter)
    ///
    /// Zoom model:
    ///   The camera moves closer to / further from the terrain along its angled
    ///   view direction — a perspective dolly. The pitch angle is fixed by default;
    ///   hold right mouse and scroll to tilt the angle without affecting zoom distance.
    ///
    /// Pitch model:
    ///   Right mouse button held + scroll wheel adjusts _pitchAngle within [_minPitch, _maxPitch].
    ///   This lets the player tilt between an overhead read and a low horizon framing,
    ///   without the camera flying to a different height. Pure scroll (no right mouse) zooms.
    ///
    /// Bounds:
    ///   Camera pivot is soft-clamped to the grid bounds so the view stays
    ///   near the playfield.
    ///
    /// On Start, the camera automatically centres above the grid at a comfortable
    /// management distance. Call CenterOnWorld() at any time to return to that view.
    ///
    /// The WorldGenerator reference is auto-resolved from the scene if not assigned
    /// in the inspector, so no manual wiring is required for basic usage.
    ///
    /// Requires a Camera component on the same GameObject.
    /// Tag that GameObject "MainCamera" so WorldDebugRenderer can detect hover.
    ///
    /// TODO: Migrate input to a formal input layer when the production input system
    ///       is established. Currently uses legacy Input API (activeInputHandler = Both).
    /// </summary>
    [RequireComponent(typeof(Camera))]
    public class DebugCameraController : MonoBehaviour
    {
        [Header("References")]
        [Tooltip("Used to read grid dimensions for CenterOnWorld and pan clamping. " +
                 "Auto-found at runtime if left unassigned.")]
        [SerializeField] private WorldGenerator _worldGenerator;

        [Header("Hex Layout")]
        [Tooltip("Must match WorldDebugRenderer's Hex World Size and WorldTerrainBuilder._hexSize.")]
        [SerializeField] private float _hexWorldSize = 1.0f;

        [Header("Camera Angle")]
        [Tooltip("Pitch angle in degrees. 55 gives a Diablo-style angled overhead view " +
                 "that reads well for a strategy game. 90 = straight down.")]
        [SerializeField, Range(20f, 85f)] private float _pitchAngle = 55f;

        [Tooltip("Yaw angle in degrees. 0 = looking along +Z. 45 gives a classic " +
                 "isometric-flavoured orientation. Can be changed freely.")]
        [SerializeField] private float _yawAngle = 0f;

        [Header("Pan")]
        [Tooltip("World units per second when panning with keyboard. Scales with zoom distance.")]
        [SerializeField] private float _keyPanSpeed = 28f;

        [Tooltip("Drag sensitivity for middle/right mouse pan. Lower = faster.")]
        [SerializeField] private float _mousePanSensitivity = 0.012f;

        [Header("Rotation")]
        [Tooltip("Yaw rotation speed in degrees per second when Q or E is held.")]
        [SerializeField] private float _rotationSpeed = 60f;

        [Header("Zoom")]
        [Tooltip("Zoom speed multiplier. Proportional to current distance.")]
        [SerializeField] private float _zoomSpeed = 3f;
        [Tooltip("Minimum camera distance from terrain surface (dolly near limit).")]
        [SerializeField] private float _minZoomDistance = 8f;
        [Tooltip("Maximum camera distance from terrain surface (dolly far limit).")]
        [SerializeField] private float _maxZoomDistance = 70f;

        [Header("Pitch Tilt (Right Mouse + Scroll)")]
        [Tooltip("How fast the pitch angle changes when right mouse is held and scroll is used. " +
                 "Degrees per scroll axis unit (scaled by Time.deltaTime).")]
        [SerializeField] private float _pitchScrollSpeed = 250f;
        [Tooltip("Minimum camera pitch angle (flattest / most horizon-facing).")]
        [SerializeField, Range(15f, 60f)] private float _minPitch = 25f;
        [Tooltip("Maximum camera pitch angle (most overhead).")]
        [SerializeField, Range(45f, 89f)] private float _maxPitch = 80f;

        // =====================================================================
        // Private State
        // =====================================================================

        private Camera  _camera;
        private bool    _isDragging;
        private int     _dragButton;
        private Vector3 _dragLastMousePos;

        // Camera pivot: the world-space point the camera looks at.
        // The camera itself is offset from the pivot along the inverse view direction.
        private Vector3 _pivot;

        // Current dolly distance from the pivot to the camera position.
        private float _zoomDistance;

        private static readonly float Sqrt3 = Mathf.Sqrt(3f);

        // =====================================================================
        // Unity Lifecycle
        // =====================================================================

        private void Awake()
        {
            _camera = GetComponent<Camera>();

            // Use perspective projection for an angled 3D view.
            _camera.orthographic = false;
            if (_camera.fieldOfView < 1f) _camera.fieldOfView = 50f;
        }

        private void Start()
        {
            // Auto-resolve WorldGenerator if not wired in the inspector.
            // Done in Start so GameBootstrap.Awake has already run.
            if (_worldGenerator == null)
                _worldGenerator = FindFirstObjectByType<WorldGenerator>();

            if (_worldGenerator == null)
                Debug.LogWarning("[DebugCameraController] WorldGenerator not found. " +
                                 "Camera will centre on a default 96×96 grid.");

            CenterOnWorld();
        }

        private void Update()
        {
            HandleKeyPan();
            HandleKeyRotation();
            HandleMouseDragPan();
            HandleScrollZoomOrPitch();
            ClampPivotToBounds();
            ApplyCameraTransform();
        }

        // =====================================================================
        // Public API
        // =====================================================================

        /// <summary>
        /// Repositions the camera pivot above the grid centre at a comfortable management
        /// distance for the current grid size. Safe to call at any time.
        ///
        /// Default zoom opens close enough to see individual hexes and props clearly.
        /// The player can zoom out freely with the scroll wheel to see the full map.
        /// </summary>
        public void CenterOnWorld()
        {
            int gridWidth  = _worldGenerator?.Grid?.Width  ?? 96;
            int gridHeight = _worldGenerator?.Grid?.Height ?? 96;

            // World-space centre of the grid.
            Vector3 worldCenter = new HexCoord(gridWidth / 2, gridHeight / 2)
                                      .ToWorldPosition(_hexWorldSize);

            _pivot = new Vector3(worldCenter.x, 0f, worldCenter.z);

            // Open at a close management distance (~12 % of world diameter) so individual
            // hexes and props are readable immediately. Full world diameter ≈ gridWidth * hexSize * sqrt(3).
            float worldDiameter = gridWidth * _hexWorldSize * Sqrt3;
            _zoomDistance = Mathf.Clamp(worldDiameter * 0.12f,
                                        _minZoomDistance,
                                        _maxZoomDistance);

            ApplyCameraTransform();
        }

        // =====================================================================
        // Input — Keyboard Pan
        // =====================================================================

        private void HandleKeyPan()
        {
            // Scale speed by zoom distance so panning feels proportional at all zoom levels.
            float speed = _keyPanSpeed * Time.deltaTime * (_zoomDistance / 30f);

            // Pan in the XZ plane along the camera's left/forward vectors projected flat.
            Vector3 forward = FlatForward();
            Vector3 right   = Vector3.Cross(Vector3.up, forward).normalized;

            if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow))    _pivot += forward * speed;
            if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow))  _pivot -= forward * speed;
            if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow))  _pivot -= right   * speed;
            if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow)) _pivot += right   * speed;
        }

        // =====================================================================
        // Input — Q/E Keyboard Rotation
        // =====================================================================

        private void HandleKeyRotation()
        {
            float rotDir = 0f;
            if (Input.GetKey(KeyCode.Q)) rotDir -= 1f;
            if (Input.GetKey(KeyCode.E)) rotDir += 1f;
            if (Mathf.Approximately(rotDir, 0f)) return;

            _yawAngle += rotDir * _rotationSpeed * Time.deltaTime;
        }

        // =====================================================================
        // Input — Mouse Drag Pan (middle button or right button)
        // =====================================================================

        private void HandleMouseDragPan()
        {
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

            if (Input.GetMouseButtonUp(_dragButton))
            {
                _isDragging = false;
                return;
            }

            Vector3 delta = Input.mousePosition - _dragLastMousePos;
            _dragLastMousePos = Input.mousePosition;

            // Scale pan to zoom distance so dragging covers the same apparent distance
            // at any zoom level.
            float scale  = _zoomDistance * _mousePanSensitivity;
            Vector3 forward = FlatForward();
            Vector3 right   = Vector3.Cross(Vector3.up, forward).normalized;

            _pivot -= right   * (delta.x * scale);
            _pivot -= forward * (delta.y * scale);
        }

        // =====================================================================
        // Input — Scroll Wheel: Zoom or Pitch Tilt
        // =====================================================================

        /// <summary>
        /// Scroll alone zooms by dollying the camera closer/further from the pivot.
        /// Holding right mouse while scrolling adjusts the pitch angle instead,
        /// letting the player tilt between overhead and a low horizon view.
        /// </summary>
        private void HandleScrollZoomOrPitch()
        {
            float scroll = Input.GetAxis("Mouse ScrollWheel");
            if (Mathf.Approximately(scroll, 0f)) return;

            if (Input.GetMouseButton(1)) // right mouse held — tilt pitch
            {
                _pitchAngle = Mathf.Clamp(
                    _pitchAngle + scroll * _pitchScrollSpeed * Time.deltaTime,
                    _minPitch,
                    _maxPitch);
            }
            else // plain scroll — zoom dolly
            {
                _zoomDistance = Mathf.Clamp(
                    _zoomDistance * (1f - scroll * _zoomSpeed),
                    _minZoomDistance,
                    _maxZoomDistance);
            }
        }

        // =====================================================================
        // Pivot Bounds Clamping
        // =====================================================================

        private void ClampPivotToBounds()
        {
            if (_worldGenerator?.Grid == null) return;

            int gridWidth  = _worldGenerator.Grid.Width;
            int gridHeight = _worldGenerator.Grid.Height;

            // Compute grid world extents (approximate; flat-top hex geometry).
            float maxX = gridWidth  * _hexWorldSize * Sqrt3 * 0.5f;
            float maxZ = gridHeight * _hexWorldSize * 0.75f;

            // Allow the pivot to stray a little outside so the edge of the map
            // can be centred for large zooms, but never by more than half a screen.
            float margin = _zoomDistance * 0.5f;
            _pivot.x = Mathf.Clamp(_pivot.x, -margin, maxX + margin);
            _pivot.z = Mathf.Clamp(_pivot.z, -margin, maxZ + margin);
            _pivot.y = 0f;
        }

        // =====================================================================
        // Camera Transform
        // =====================================================================

        /// <summary>
        /// Positions the camera behind the pivot at the current pitch, yaw, and
        /// zoom distance. Called every frame after input is processed.
        /// </summary>
        private void ApplyCameraTransform()
        {
            Quaternion rotation = Quaternion.Euler(_pitchAngle, _yawAngle, 0f);

            // Offset backwards along the rotated -Z axis at the current zoom distance.
            Vector3 backward = rotation * Vector3.back;
            transform.position = _pivot + backward * _zoomDistance;
            transform.rotation = rotation;
        }

        // =====================================================================
        // Helpers
        // =====================================================================

        /// <summary>
        /// Returns the camera's forward vector projected onto the XZ plane and normalised.
        /// Used to make keyboard/drag pan feel aligned with the view direction.
        /// </summary>
        private Vector3 FlatForward()
        {
            Vector3 fwd = Quaternion.Euler(0f, _yawAngle, 0f) * Vector3.forward;
            fwd.y = 0f;
            return fwd.normalized;
        }
    }
}
