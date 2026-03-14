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
        [Header("Core System References")]
        [SerializeField] private GameManager _gameManager;
        [SerializeField] private KingdomManager _kingdomManager;

        private void Awake()
        {
            // TODO: Validate all required references are assigned via inspector
            // TODO: Determine whether to start a new game or load a save
            InitializeSystems();
        }

        /// <summary>Initializes all game systems in the correct dependency order.</summary>
        private void InitializeSystems()
        {
            // TODO: Initialize SimulationClock
            // TODO: Initialize HexGrid and trigger WorldGenerator
            // TODO: Initialize KingdomManager with starting kingdom
            // TODO: Initialize population spawn
            // TODO: Start the first simulation tick

            if (_gameManager != null)
                _gameManager.SetState(GameState.Playing);

            Debug.Log("[GameBootstrap] All systems initialized.");
        }
    }
}
