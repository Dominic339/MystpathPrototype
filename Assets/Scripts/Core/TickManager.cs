using System;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Drives the simulation's tick-based update loop. Systems subscribe to OnTick
    /// to receive periodic callbacks at a defined interval, decoupling game logic
    /// from Unity's per-frame Update cycle.
    /// </summary>
    public class TickManager : MonoBehaviour
    {
        [Header("Tick Settings")]
        [Tooltip("Real-world seconds between each simulation tick.")]
        [SerializeField] private float _tickIntervalSeconds = 0.5f;

        /// <summary>Fired once every simulation tick. Subscribe to receive tick callbacks.</summary>
        public event Action OnTick;

        /// <summary>Total number of ticks elapsed since the simulation started.</summary>
        public long TickCount { get; private set; }

        private float _tickTimer;

        private void Update()
        {
            // TODO: Respect simulation pause state (query GameManager.CurrentState)
            _tickTimer += Time.deltaTime;
            if (_tickTimer >= _tickIntervalSeconds)
            {
                _tickTimer -= _tickIntervalSeconds;
                ProcessTick();
            }
        }

        /// <summary>Processes one simulation tick and notifies all subscribers.</summary>
        private void ProcessTick()
        {
            TickCount++;
            OnTick?.Invoke();
        }

        /// <summary>
        /// Adjusts the interval between ticks. Lower values increase simulation speed.
        /// Minimum enforced at 10ms to prevent runaway updates.
        /// </summary>
        public void SetTickInterval(float seconds)
        {
            _tickIntervalSeconds = Mathf.Max(0.01f, seconds);
        }
    }
}
