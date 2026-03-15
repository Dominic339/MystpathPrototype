using System.Collections.Generic;
using UnityEngine;

namespace Mystpath
{
    // =========================================================================
    // Activation State
    // =========================================================================

    /// <summary>
    /// Lifecycle state for passive world objects.
    ///
    /// Dormant  — prop exists in the world but runs no simulation logic. Default
    ///            state for all newly spawned props. Zero per-frame cost.
    /// Active   — prop has been woken up by a relevance system (proximity, player
    ///            interaction, villager approach) and is eligible for harvesting tasks.
    ///
    /// This enum is shared by HarvestableProp and is intended to be the basis for
    /// a broader <c>WorldActivationManager</c> that gates simulation work by distance
    /// or interaction relevance rather than running everything all the time.
    /// </summary>
    public enum PropActivationState
    {
        /// <summary>Prop exists but is not participating in any simulation. Default.</summary>
        Dormant = 0,

        /// <summary>Prop is within relevance range and eligible for harvesting tasks.</summary>
        Active  = 1,
    }
    /// <summary>
    /// Marks a world prop as harvestable and tracks its remaining quantity.
    /// Attach to any prop prefab that a worker can gather resources from.
    ///
    /// Lifecycle:
    ///   1. The prop is instantiated by <see cref="WorldPropSpawner"/>.
    ///   2. Workers (future system) check <see cref="IsActive"/> before approaching,
    ///      then call <see cref="CanHarvest"/> once adjacent.
    ///   3. On arrival, the worker calls <see cref="Harvest(int)"/> to claim resources.
    ///   4. When depleted, the prop disables itself cleanly.
    ///
    /// Activation model (scalability foundation):
    ///   Props begin in the <see cref="PropActivationState.Dormant"/> state. A dormant
    ///   prop has zero per-frame cost — it holds data but runs no logic. A future
    ///   <c>WorldActivationManager</c> (or villager proximity system) calls
    ///   <see cref="Activate"/> on props within interaction range, transitioning them
    ///   to <see cref="PropActivationState.Active"/>. Only active props are eligible
    ///   for harvesting tasks. This pattern keeps the simulation lightweight when
    ///   thousands of props are spawned across a large world — nothing runs until it
    ///   becomes relevant.
    ///
    ///   Summary of intended activation flow (not yet wired):
    ///     WorldActivationManager.Update → finds props near workers or the player
    ///       → calls prop.Activate()  (enter active state, add to harvest task pool)
    ///     On worker departure or distance threshold exceeded:
    ///       → calls prop.Deactivate() (back to dormant, removed from task pool)
    ///
    /// Resource gathering path:
    ///   This component handles path 1 — wild surface harvestables (trees, rocks,
    ///   ore outcrops). It is NOT used for underground extraction or managed buildings.
    ///   See <see cref="ResourceType"/> for the full resource category documentation.
    ///
    /// Future work:
    ///   - WorldActivationManager: distance / relevance checks, calls Activate/Deactivate
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

        /// <summary>
        /// Current activation state. Starts Dormant so freshly spawned props have
        /// zero per-frame overhead until a relevance system explicitly wakes them.
        /// </summary>
        private PropActivationState _activationState = PropActivationState.Dormant;

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

        // ── Activation ───────────────────────────────────────────────────────

        /// <summary>Current activation state of this prop.</summary>
        public PropActivationState ActivationState => _activationState;

        /// <summary>
        /// True when this prop is in the <see cref="PropActivationState.Active"/> state
        /// and therefore eligible for harvesting tasks.
        ///
        /// Future worker / NPC systems should check this before assigning a HarvestTask.
        /// Props are Dormant by default; call <see cref="Activate"/> to enable them.
        /// </summary>
        public bool IsActive => _activationState == PropActivationState.Active;

        // =====================================================================
        // Unity Lifecycle
        // =====================================================================

        private void Awake()
        {
            _remainingHarvestCount = _maxHarvestCount;
        }

        // =====================================================================
        // Activation API
        // =====================================================================

        /// <summary>
        /// Transitions this prop to <see cref="PropActivationState.Active"/>.
        ///
        /// Call this when a relevance system (villager proximity, player interaction
        /// radius, forester lodge range) determines this prop should participate in
        /// simulation. Has no effect on an already-active or depleted prop.
        ///
        /// Intended caller: a future <c>WorldActivationManager</c> that sweeps nearby
        /// props and activates them before assigning harvesting tasks to workers.
        /// </summary>
        public void Activate()
        {
            if (_activationState == PropActivationState.Active) return;
            if (IsDepleted) return; // depleted props stay dormant; no reason to activate
            _activationState = PropActivationState.Active;
        }

        /// <summary>
        /// Returns this prop to <see cref="PropActivationState.Dormant"/>.
        ///
        /// Call this when no worker is assigned to the prop and it is no longer within
        /// an active relevance radius. A dormant prop incurs zero per-frame cost.
        ///
        /// Intended caller: <c>WorldActivationManager</c> when evicting props from the
        /// active set due to distance, worker reassignment, or simulation de-prioritisation.
        /// </summary>
        public void Deactivate()
        {
            _activationState = PropActivationState.Dormant;
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
