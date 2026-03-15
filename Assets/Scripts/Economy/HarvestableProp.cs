using System.Collections.Generic;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Marks a world prop as harvestable and tracks its remaining quantity.
    /// Attach to any prop prefab that a worker can gather resources from.
    ///
    /// Lifecycle:
    ///   1. The prop is instantiated by <see cref="WorldPropSpawner"/>.
    ///   2. Workers (future system) call <see cref="CanHarvest"/> before approaching.
    ///   3. On arrival, the worker calls <see cref="Harvest(int)"/> to claim resources.
    ///   4. When depleted, the prop disables itself cleanly.
    ///
    /// Resource gathering path:
    ///   This component handles path 1 — wild surface harvestables (trees, rocks,
    ///   ore outcrops). It is NOT used for underground extraction or managed buildings.
    ///   See <see cref="ResourceType"/> for the full resource category documentation.
    ///
    /// Future work:
    ///   - Regrowth timer (forester lodge re-enables depleted trees over time)
    ///   - Harvest VFX / sound triggers
    ///   - NPC harvesting task integration via a HarvestTask component
    ///   - Loot table randomisation tied to world seed for fully deterministic yields
    /// </summary>
    public class HarvestableProp : MonoBehaviour
    {
        // =====================================================================
        // Inspector Fields
        // =====================================================================

        [Header("Yield Configuration")]
        [Tooltip("Resources produced each time this prop is harvested. " +
                 "Multiple entries allow a single prop to yield several resource types " +
                 "(e.g. a tree yields Wood and a small amount of Fiber).")]
        [SerializeField] private List<ResourceYieldEntry> _yields = new List<ResourceYieldEntry>();

        [Header("Harvest Quantity")]
        [Tooltip("How many harvest operations this prop supports before it is depleted. " +
                 "1 = single-gather (tree felled in one action). " +
                 "Higher values represent large boulders or ore-rich outcrops.")]
        [SerializeField, Range(1, 20)]
        private int _maxHarvestCount = 1;

        // =====================================================================
        // Runtime State
        // =====================================================================

        private int _remainingHarvestCount;

        // =====================================================================
        // Properties
        // =====================================================================

        /// <summary>True if this prop has remaining harvest operations available.</summary>
        public bool CanHarvest => _remainingHarvestCount > 0;

        /// <summary>True when all harvest operations have been consumed.</summary>
        public bool IsDepleted => _remainingHarvestCount <= 0;

        /// <summary>Number of harvest operations remaining before depletion.</summary>
        public int RemainingHarvestCount => _remainingHarvestCount;

        /// <summary>Maximum harvest operations this prop was initialised with.</summary>
        public int MaxHarvestCount => _maxHarvestCount;

        /// <summary>Read-only access to the yield entries defined on this prop.</summary>
        public IReadOnlyList<ResourceYieldEntry> Yields => _yields;

        // =====================================================================
        // Unity Lifecycle
        // =====================================================================

        private void Awake()
        {
            _remainingHarvestCount = _maxHarvestCount;
        }

        // =====================================================================
        // Harvesting API
        // =====================================================================

        /// <summary>
        /// Performs up to <paramref name="amount"/> harvest operations.
        /// Each operation decrements the remaining count and produces one set of yields.
        /// Returns the number of operations actually performed (may be less than
        /// <paramref name="amount"/> if the prop is nearly depleted).
        ///
        /// The actual resource quantities to award per operation should be computed
        /// by the calling system from <see cref="Yields"/> using
        /// <see cref="ResourceYieldEntry.RollQuantity"/>.
        ///
        /// TODO: When the NPC harvesting task system is implemented, this should be
        ///       called from a HarvestTask that also handles pathfinding and animation.
        /// </summary>
        /// <param name="amount">Desired number of harvest operations.</param>
        /// <returns>Actual number of operations performed.</returns>
        public int Harvest(int amount = 1)
        {
            if (!CanHarvest) return 0;

            int actual = Mathf.Min(amount, _remainingHarvestCount);
            _remainingHarvestCount -= actual;

            if (IsDepleted)
                HandleDepletion();

            return actual;
        }

        // =====================================================================
        // Configuration API (called by WorldPropSpawner and editor tool)
        // =====================================================================

        /// <summary>
        /// Replaces the yields list with a single entry for the specified resource.
        /// Called by <see cref="WorldPropSpawner"/> when a
        /// <see cref="Terrain.BiomePropEntry.YieldOverride"/> is configured.
        /// </summary>
        public void SetYieldOverride(ResourceType resource, int minYield = 1, int maxYield = 4)
        {
            _yields.Clear();
            if (resource != ResourceType.None)
            {
                _yields.Add(new ResourceYieldEntry
                {
                    Resource = resource,
                    MinYield = minYield,
                    MaxYield = maxYield,
                });
            }
        }

        // =====================================================================
        // Editor-only setup helpers
        // =====================================================================

#if UNITY_EDITOR
        /// <summary>
        /// Sets default yield configuration and harvest count during prefab creation.
        /// Only available in the Unity Editor. Called by
        /// <see cref="Editor.NaturePrefabGenerator"/> when generating nature prefabs.
        /// </summary>
        public void EditorSetDefaults(ResourceType defaultResource,
                                      int minYield, int maxYield,
                                      int maxHarvestCount)
        {
            _yields.Clear();
            if (defaultResource != ResourceType.None)
            {
                _yields.Add(new ResourceYieldEntry
                {
                    Resource = defaultResource,
                    MinYield = minYield,
                    MaxYield = maxYield,
                });
            }
            _maxHarvestCount = maxHarvestCount;
        }
#endif

        // =====================================================================
        // Private — Depletion
        // =====================================================================

        /// <summary>
        /// Called when <see cref="_remainingHarvestCount"/> reaches zero.
        /// Disables the GameObject so it disappears cleanly from the world.
        ///
        /// TODO: Trigger a depletion particle effect before disabling.
        /// TODO: If managed by a Forester Lodge or farm, start a regrowth timer
        ///       instead of simply disabling, then re-enable after the timer expires.
        /// TODO: Consider object-pool return instead of simple SetActive(false) if
        ///       prop count is large enough to justify pooling.
        /// </summary>
        private void HandleDepletion()
        {
            gameObject.SetActive(false);
        }
    }
}
