using System;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Defines a single entry in a <see cref="BiomePropSet"/> — one prefab type
    /// that can be spawned in the owning biome, together with its spawn parameters.
    ///
    /// Multiple entries in a BiomePropSet form a weighted pool from which
    /// <see cref="WorldPropSpawner"/> selects during deterministic placement.
    ///
    /// Serializable so entries can be defined directly inside the BiomePropSet
    /// asset's inspector list without requiring per-entry asset files.
    /// </summary>
    [Serializable]
    public class BiomePropEntry
    {
        // =====================================================================
        // Prefab
        // =====================================================================

        /// <summary>
        /// The prefab to instantiate at spawn positions.
        /// Should be a nature prop created by the NaturePrefabGenerator tool or
        /// hand-authored under Assets/Prefabs/Nature/.
        /// </summary>
        [Tooltip("Prefab to spawn. Use prefabs from Assets/Prefabs/Nature/.")]
        public GameObject Prefab;

        // =====================================================================
        // Weighting
        // =====================================================================

        /// <summary>
        /// Relative spawn weight among all entries in the owning BiomePropSet.
        /// Higher values make this entry more likely to be selected when a spawn
        /// slot is triggered. Example: tree at 3.0 vs. rock at 1.0 means trees
        /// are selected 75 % of the time in that set.
        /// </summary>
        [Tooltip("Relative likelihood of this entry being chosen. Higher = more common.")]
        [Range(0.1f, 10f)]
        public float SpawnWeight = 1f;

        // =====================================================================
        // Per-entry Spawn Chance
        // =====================================================================

        /// <summary>
        /// Probability [0–1] that a spawn slot targeting this entry will actually
        /// produce a prop. Values below 1.0 create natural spacing in dense biomes.
        /// Multiplied with <see cref="BiomePropSet.GlobalDensityMultiplier"/> and
        /// the spawner's own density multiplier.
        /// </summary>
        [Tooltip("Probability this slot actually spawns a prop. Combined with " +
                 "BiomePropSet.GlobalDensityMultiplier.")]
        [Range(0f, 1f)]
        public float SpawnChance = 0.5f;

        // =====================================================================
        // Scale
        // =====================================================================

        /// <summary>
        /// Minimum uniform scale multiplier applied on instantiation.
        /// The final scale is further multiplied by
        /// <see cref="WorldPropSpawner._globalScaleMultiplier"/> (default 2×),
        /// so a value of 1.0 here results in a 2× world-space scale at default settings.
        /// </summary>
        [Tooltip("Minimum uniform scale (before the spawner's Global Scale Multiplier). " +
                 "At the default Global Scale Multiplier of 2, MinScale=1 → world scale 2.")]
        [Range(0.1f, 5f)]
        public float MinScale = 1f;

        /// <summary>
        /// Maximum uniform scale multiplier applied on instantiation.
        /// See <see cref="MinScale"/> for how this interacts with the global multiplier.
        /// </summary>
        [Tooltip("Maximum uniform scale (before the spawner's Global Scale Multiplier). " +
                 "At the default Global Scale Multiplier of 2, MaxScale=1.5 → world scale 3.")]
        [Range(0.1f, 5f)]
        public float MaxScale = 1.5f;

        // =====================================================================
        // Yield Override
        // =====================================================================

        /// <summary>
        /// If set to anything other than <see cref="ResourceType.None"/>, overrides the
        /// <see cref="HarvestableProp"/> yield list on the instantiated prefab so this
        /// biome's props yield the specified resource instead of the prefab's default.
        ///
        /// Example: a "rock" prefab placed in a Desert biome could override its yield
        /// to Tin instead of the default Stone.
        /// </summary>
        [Tooltip("Overrides the prefab's default HarvestableProp yield resource. " +
                 "Leave as None to use the prefab's own yield configuration.")]
        public ResourceType YieldOverride = ResourceType.None;
    }
}
