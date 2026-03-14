using System;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Physical and derived statistics for an NPC. Covers base attributes,
    /// vitals, and age. Affects task eligibility, work speed, carry capacity,
    /// and need decay rates.
    /// </summary>
    [Serializable]
    public class NpcStats
    {
        [Header("Vitals")]
        /// <summary>Current health points.</summary>
        [Range(0f, 100f)]
        public float Health = 100f;

        /// <summary>Maximum health points.</summary>
        public float MaxHealth = 100f;

        [Header("Attributes")]
        /// <summary>Physical strength — affects carry capacity and mining/chopping speed.</summary>
        [Range(1, 20)]
        public int Strength = 5;

        /// <summary>Agility — affects movement speed and fine-motor task speed.</summary>
        [Range(1, 20)]
        public int Agility = 5;

        /// <summary>Intellect — affects learning rate and crafting quality.</summary>
        [Range(1, 20)]
        public int Intellect = 5;

        [Header("Life")]
        /// <summary>Current age of the NPC in in-game years.</summary>
        public float Age;

        /// <summary>Expected lifespan in in-game years.</summary>
        public float Lifespan = 60f;

        // TODO: Add carry weight calculation derived from Strength
        // TODO: Add stat degradation methods for unmet needs (e.g., hunger reduces MaxHealth)
        // TODO: Add age-based stat modifiers (young and elderly are less capable)
    }
}
