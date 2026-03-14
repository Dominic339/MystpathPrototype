using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Defines the top-level lifecycle states of a game session.
    /// </summary>
    public enum GameState
    {
        Loading,
        Playing,
        Paused,
        GameOver,
    }

    /// <summary>
    /// Central manager for top-level game state. Tracks the current GameState,
    /// exposes a global singleton, and coordinates high-level transitions between
    /// major systems. Keep heavy system logic in dedicated managers, not here.
    /// </summary>
    public class GameManager : MonoBehaviour
    {
        /// <summary>Global singleton access. Set on Awake and cleared on destroy.</summary>
        public static GameManager Instance { get; private set; }

        /// <summary>The current state of the active game session.</summary>
        public GameState CurrentState { get; private set; } = GameState.Loading;

        [Header("System References")]
        [SerializeField] private TickManager _tickManager;
        [SerializeField] private SimulationClock _simulationClock;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        /// <summary>Transitions the game to a new state and fires any necessary callbacks.</summary>
        public void SetState(GameState newState)
        {
            // TODO: Fire a state-change event for systems that need to react
            CurrentState = newState;
            Debug.Log($"[GameManager] State → {newState}");
        }

        /// <summary>Pauses the simulation clock and tick processing.</summary>
        public void PauseSimulation()
        {
            // TODO: Pause TickManager and SimulationClock
            SetState(GameState.Paused);
        }

        /// <summary>Resumes the simulation from a paused state.</summary>
        public void ResumeSimulation()
        {
            // TODO: Resume TickManager and SimulationClock
            SetState(GameState.Playing);
        }
    }
}
