using System;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Describes a single resource type that a harvestable prop can yield,
    /// with a configurable quantity range rolled when a harvest occurs.
    ///
    /// Used by <see cref="HarvestableProp"/> to define what resources are produced
    /// when a tree is felled, a rock is broken, or an ore outcrop is mined.
    ///
    /// Serializable so it can be embedded inside ScriptableObjects, MonoBehaviours,
    /// and editor lists without requiring a separate asset file.
    /// </summary>
    [Serializable]
    public class ResourceYieldEntry
    {
        /// <summary>The type of resource produced by this yield.</summary>
        [Tooltip("Resource type produced when this prop is harvested.")]
        public ResourceType Resource = ResourceType.None;

        /// <summary>Minimum quantity produced per harvest operation.</summary>
        [Tooltip("Minimum number of units produced per harvest.")]
        [Range(1, 50)]
        public int MinYield = 1;

        /// <summary>Maximum quantity produced per harvest operation.</summary>
        [Tooltip("Maximum number of units produced per harvest.")]
        [Range(1, 50)]
        public int MaxYield = 4;

        /// <summary>
        /// Rolls a yield quantity deterministically using the provided 0–1 value.
        /// Pass a CellHash-derived float for fully deterministic results, or
        /// pass <c>Random.value</c> for runtime variation.
        /// </summary>
        public int RollQuantity(float normalizedRoll)
        {
            return Mathf.RoundToInt(Mathf.Lerp(MinYield, MaxYield, normalizedRoll));
        }
    }
}
