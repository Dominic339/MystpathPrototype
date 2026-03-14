using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Spawns decorative props (trees, rocks, bushes, ruins, etc.) in the world
    /// based on each hex cell's biome data and a seeded random distribution.
    /// Prop placement is entirely data-driven — no manual artist placement.
    /// </summary>
    public class PropSpawner : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private HexGrid _hexGrid;

        [Header("Spawn Settings")]
        [Tooltip("Global density multiplier applied on top of per-biome prop weights.")]
        [SerializeField] private float _propDensityMultiplier = 1f;

        // TODO: Add serialized prop table per BiomeType (prefab + weight pairs)
        // TODO: Link prop table entries to BiomeProfile ScriptableObjects

        /// <summary>
        /// Spawns all props for the entire world using current HexGrid biome data.
        /// Should be called once after terrain generation is complete.
        /// </summary>
        public void SpawnAllProps()
        {
            // TODO: Iterate all cells in the HexGrid
            // TODO: For each cell, look up the matching BiomeProfile prop table
            // TODO: Use seeded randomness to determine prop count and type per cell
            // TODO: Instantiate props as child GameObjects at world-space positions

            Debug.Log("[PropSpawner] Prop spawning triggered.");
        }

        /// <summary>Destroys all previously spawned prop GameObjects.</summary>
        public void ClearAllProps()
        {
            // TODO: Track spawned prop roots and destroy them here
        }
    }
}
