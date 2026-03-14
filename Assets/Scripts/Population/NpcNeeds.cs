using System;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Tracks an NPC's current need levels. Unmet needs reduce productivity and,
    /// at critical thresholds, escalate into KingdomNeeds that the scheduler must address.
    /// All values are normalized 0–1 (0 = critical deficit, 1 = fully met).
    /// </summary>
    [Serializable]
    public class NpcNeeds
    {
        /// <summary>Hunger fulfillment (0 = starving, 1 = fully fed).</summary>
        [Range(0f, 1f)]
        public float Hunger = 1f;

        /// <summary>Rest fulfillment (0 = exhausted, 1 = fully rested).</summary>
        [Range(0f, 1f)]
        public float Rest = 1f;

        /// <summary>Social fulfillment (0 = isolated, 1 = socially content).</summary>
        [Range(0f, 1f)]
        public float Social = 0.5f;

        /// <summary>Shelter fulfillment (0 = exposed, 1 = adequately housed).</summary>
        [Range(0f, 1f)]
        public float Shelter = 1f;

        // TODO: Define per-need decay rates (e.g., hunger decays faster than social)
        // TODO: Add need fulfillment methods that consume kingdom resources
        // TODO: Add threshold constants for "critical" level triggering (e.g., Hunger < 0.2f)
        // TODO: Add overall wellbeing score derived from weighted need averages
    }
}
