using System;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// MonoBehaviour that owns and coordinates kingdom-level systems at runtime.
    /// Acts as the host for the Kingdom data model and drives need evaluation
    /// and work scheduling each simulation tick.
    /// </summary>
    public class KingdomManager : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private TickManager _tickManager;

        /// <summary>The active kingdom for this session. Single-player: one kingdom only.</summary>
        public Kingdom ActiveKingdom { get; private set; }

        private KingdomNeedEvaluator _needEvaluator;
        private KingdomScheduler _scheduler;
        private DevotionSystem _devotionSystem;

        private void Awake()
        {
            _needEvaluator = new KingdomNeedEvaluator();
            _scheduler = new KingdomScheduler();
            _devotionSystem = new DevotionSystem();
        }

        private void OnEnable()
        {
            if (_tickManager != null)
                _tickManager.OnTick += OnTick;
        }

        private void OnDisable()
        {
            if (_tickManager != null)
                _tickManager.OnTick -= OnTick;
        }

        /// <summary>Creates and initializes a new kingdom for a fresh game session.</summary>
        /// <param name="kingdomName">Player-chosen name for the kingdom.</param>
        public void InitializeKingdom(string kingdomName)
        {
            ActiveKingdom = new Kingdom(Guid.NewGuid().ToString(), kingdomName);
            // TODO: Grant starting resources from a new-game configuration asset
            // TODO: Spawn starting population
            // TODO: Place starting building(s) at a designated start location
            Debug.Log($"[KingdomManager] Kingdom '{kingdomName}' initialized.");
        }

        /// <summary>Called each simulation tick. Drives need evaluation and task scheduling.</summary>
        private void OnTick()
        {
            if (ActiveKingdom == null) return;

            _devotionSystem.ProcessTick(ActiveKingdom);

            var needs = _needEvaluator.EvaluateNeeds(ActiveKingdom);
            _scheduler.ScheduleWork(ActiveKingdom, needs);
        }
    }
}
