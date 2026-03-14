using System;
using System.Collections.Generic;

namespace Mystpath
{
    /// <summary>
    /// Stores an NPC's personal interests. Interests influence which tasks the NPC
    /// is preferentially assigned to via the TaskScorer's interest-weight bonus.
    /// An NPC with high interest in farming will be favored for farming tasks.
    /// </summary>
    [Serializable]
    public class NpcInterests
    {
        // Note: Unity's default serializer does not support Dictionary<,> directly.
        // TODO: Replace with a serializable list of key-value pairs for inspector visibility.
        private Dictionary<string, float> _interestWeights = new Dictionary<string, float>();

        /// <summary>
        /// Returns the interest weight for a given topic (0 = disinterested, 1 = passionate).
        /// Defaults to 0.5 (neutral) for topics not explicitly set.
        /// </summary>
        public float GetInterest(string topic) =>
            _interestWeights.TryGetValue(topic, out float weight) ? weight : 0.5f;

        /// <summary>Sets the interest weight for a given topic.</summary>
        public void SetInterest(string topic, float weight) =>
            _interestWeights[topic] = UnityEngine.Mathf.Clamp01(weight);

        // TODO: Generate interests procedurally at NPC creation from a distribution table
        // TODO: Allow interests to drift slightly over time based on NPC life experiences
        // TODO: Use topic names consistent with task category labels for easy scoring lookup
    }
}
