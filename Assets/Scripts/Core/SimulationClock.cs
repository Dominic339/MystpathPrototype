using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Tracks in-game simulation time independently of real-world time.
    /// Supports pausing, variable speed multipliers, and querying current day/year.
    /// Other systems should read time from here, not from Unity's Time.time.
    /// </summary>
    public class SimulationClock : MonoBehaviour
    {
        [Header("Time Settings")]
        [Tooltip("How many real-world seconds equal one in-game day.")]
        [SerializeField] private float _secondsPerDay = 60f;

        [Tooltip("Current playback speed multiplier (0 = paused, 2 = 2x speed).")]
        [SerializeField, Range(0f, 10f)] private float _timeScale = 1f;

        /// <summary>Total elapsed in-game days since the simulation started.</summary>
        public float TotalDays { get; private set; }

        /// <summary>Current in-game day within the current year (0-based).</summary>
        public int CurrentDayOfYear => Mathf.FloorToInt(TotalDays) % DaysPerYear;

        /// <summary>Current in-game year (0-based).</summary>
        public int CurrentYear => Mathf.FloorToInt(TotalDays) / DaysPerYear;

        /// <summary>Number of in-game days per year.</summary>
        public const int DaysPerYear = 365;

        /// <summary>Whether the clock is currently advancing.</summary>
        public bool IsRunning { get; private set; }

        private void Update()
        {
            if (!IsRunning || _secondsPerDay <= 0f) return;

            TotalDays += (Time.deltaTime / _secondsPerDay) * _timeScale;
        }

        /// <summary>Starts or resumes the simulation clock.</summary>
        public void StartClock()
        {
            IsRunning = true;
        }

        /// <summary>Pauses the simulation clock without resetting it.</summary>
        public void StopClock()
        {
            IsRunning = false;
        }

        /// <summary>Sets the simulation time-scale (e.g., 2.0 = 2× speed, 0 = paused).</summary>
        public void SetTimeScale(float scale)
        {
            _timeScale = Mathf.Max(0f, scale);
        }

        /// <summary>Resets the clock to time zero. Use only when starting a new game.</summary>
        public void Reset()
        {
            TotalDays = 0f;
        }
    }
}
