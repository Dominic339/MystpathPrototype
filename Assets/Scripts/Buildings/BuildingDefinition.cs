using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// ScriptableObject definition for a building type. Stores all static design data:
    /// identity, footprint, construction cost, staffing, storage, and upgrade paths.
    /// One asset per building type; runtime instances are BuildingInstance objects.
    /// Create instances via: Assets > Create > Mystpath > Building Definition.
    /// </summary>
    [CreateAssetMenu(menuName = "Mystpath/Building Definition", fileName = "BuildingDef_New")]
    public class BuildingDefinition : ScriptableObject
    {
        [Header("Identity")]
        /// <summary>Unique stable string identifier for this building type (used in save data).</summary>
        public string BuildingId;

        /// <summary>Player-facing display name.</summary>
        public string DisplayName;

        /// <summary>Broad category this building belongs to.</summary>
        public BuildingCategory Category;

        [Header("Footprint")]
        /// <summary>Total number of hex cells this building's footprint covers.</summary>
        public int FootprintHexCount = 1;

        // TODO: Define footprint shape as a list of HexCoord offsets from the anchor cell

        [Header("Requirements")]
        /// <summary>Minimum kingdom age tier required to construct this building.</summary>
        public KingdomAgeTier MinimumAgeTier = KingdomAgeTier.Primitive;

        // TODO: Add required unlock/research ID (string) for progression gating

        [Header("Construction Cost")]
        // TODO: Add build cost as a serializable list of (ResourceType, float) pairs

        [Header("Staffing")]
        /// <summary>Number of worker slots this building provides (for production) or requires (for function).</summary>
        public int WorkerSlots = 1;

        [Header("Storage")]
        /// <summary>Local resource storage capacity in units. 0 = no local storage.</summary>
        public int LocalStorageCapacity;

        [Header("Upgrades")]
        /// <summary>BuildingId of the next upgrade tier, or empty if this is the maximum level.</summary>
        public string UpgradeTargetBuildingId;

        // TODO: Add production output definition (resource type + rate + required inputs)
        // TODO: Add maintenance cost definition (resources consumed per day while staffed)
    }
}
