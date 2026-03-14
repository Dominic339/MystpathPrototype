using System;
using System.Collections.Generic;

namespace Mystpath
{
    /// <summary>
    /// Evaluates the current needs of a kingdom each tick and produces a prioritized
    /// list of KingdomNeed descriptors. The KingdomScheduler converts these needs
    /// into concrete task assignments.
    /// </summary>
    public class KingdomNeedEvaluator
    {
        /// <summary>
        /// Evaluates the given kingdom and returns a prioritized list of needs.
        /// Higher Priority values indicate more urgent needs.
        /// </summary>
        public List<KingdomNeed> EvaluateNeeds(Kingdom kingdom)
        {
            var needs = new List<KingdomNeed>();

            // TODO: Evaluate food sufficiency (population vs. food storage)
            // TODO: Evaluate housing capacity (beds vs. population count)
            // TODO: Evaluate resource stockpile levels vs. configured minimums
            // TODO: Evaluate idle worker count (high idle → seek new tasks)
            // TODO: Evaluate pending construction queue
            // TODO: Evaluate NPC need averages (widespread hunger triggers food tasks)

            return needs;
        }
    }

    /// <summary>
    /// Describes a single evaluated need of a kingdom.
    /// Used to drive task generation in the KingdomScheduler.
    /// </summary>
    [Serializable]
    public class KingdomNeed
    {
        /// <summary>Category label for this need (e.g., "Food", "Shelter", "Resources").</summary>
        public string NeedCategory;

        /// <summary>Priority score (higher = more urgent). Used to sort task generation order.</summary>
        public float Priority;

        // TODO: Add metadata payload (e.g., target resource type, deficit amount, target location)
        // so the TaskGenerator can create appropriately specific tasks without re-querying the kingdom.
    }
}
