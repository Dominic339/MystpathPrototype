using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// ScriptableObject definition for a biome type. Stores visual, gameplay, and
    /// simulation parameters associated with a specific BiomeType value.
    /// Create instances via: Assets > Create > Mystpath > Biome Profile.
    /// </summary>
    [CreateAssetMenu(menuName = "Mystpath/Biome Profile", fileName = "BiomeProfile_New")]
    public class BiomeProfile : ScriptableObject
    {
        [Header("Identity")]
        /// <summary>The BiomeType enum value this profile corresponds to.</summary>
        public BiomeType BiomeType;

        /// <summary>Player-facing display name for this biome.</summary>
        public string DisplayName;

        [Header("Terrain Properties")]
        /// <summary>Movement cost multiplier for NPCs traversing this biome (1 = normal).</summary>
        [Range(0.1f, 5f)]
        public float MovementCostMultiplier = 1f;

        /// <summary>Whether cells of this biome allow building placement by default.</summary>
        public bool IsBuildableByDefault = true;

        /// <summary>Elevation range that this biome typically occupies (min, max).</summary>
        public Vector2 ElevationRange = new Vector2(0f, 1f);

        [Header("Resources")]
        /// <summary>Default soil fertility for cells of this biome (0–1).</summary>
        [Range(0f, 1f)]
        public float BaseFertility = 0.5f;

        // TODO: Add per-resource spawn weight table (Dictionary<ResourceType, float>)
        // TODO: Add color/texture reference for terrain mesh material blending
        // TODO: Add weighted prop spawn table (prefab + density per biome)
        // TODO: Add ambient audio clip reference
    }
}
