using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Entry point for the Mystpath game. Responsible for initializing all core systems
    /// in the correct order before gameplay begins. Attach to a persistent bootstrap
    /// GameObject in the Main scene.
    /// </summary>
    public class GameBootstrap : MonoBehaviour
    {
        [Header("Core Systems")]
        [SerializeField] private GameManager _gameManager;

        [Header("World Systems")]
        [SerializeField] private WorldGenerator _worldGenerator;

        // TODO: Add KingdomManager reference when kingdom init is implemented
        // TODO: Add SimulationClock reference when clock startup is implemented

        private void Awake()
        {
            // Auto-resolve references if not wired in the inspector.
            // FindFirstObjectByType is safe here — all MonoBehaviours are instantiated
            // before any Awake is called, so other components are already present.
            if (_worldGenerator == null)
                _worldGenerator = FindFirstObjectByType<WorldGenerator>();

            if (_gameManager == null)
                _gameManager = FindFirstObjectByType<GameManager>();

            // TODO: Determine whether to start a new game or restore a save file
            InitializeSystems();
        }

        /// <summary>
        /// Initializes all game systems in dependency order.
        /// World generation runs first so downstream systems (kingdom, NPCs) can query the grid.
        /// </summary>
        private void InitializeSystems()
        {
            // World generation must happen before any system that reads cell data.
            if (_worldGenerator != null)
                _worldGenerator.GenerateWorld();
            else
                Debug.LogWarning("[GameBootstrap] WorldGenerator reference is not assigned.");

            // TODO: Initialize KingdomManager with starting kingdom after world exists
            // TODO: Start SimulationClock
            // TODO: Start TickManager

            if (_gameManager != null)
                _gameManager.SetState(GameState.Playing);

            Debug.Log("[GameBootstrap] All systems initialized.");
        }
    }
}
