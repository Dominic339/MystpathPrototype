using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Defines how a god power selects its target in the world.
    /// </summary>
    public enum PowerTargetingMode
    {
        None,           // Global effect; no targeting required
        SingleHex,      // Player clicks a single hex cell
        HexRadius,      // Player clicks a center hex; effect covers a radius
        SingleNpc,      // Player clicks a single NPC
        SingleBuilding, // Player clicks a single building
        // TODO: Add more targeting modes as the power system is designed
    }

    /// <summary>
    /// ScriptableObject definition for a god power available to the player.
    /// Stores identity, activation cost, targeting parameters, and effect descriptors.
    /// Create instances via: Assets > Create > Mystpath > Power Definition.
    /// </summary>
    [CreateAssetMenu(menuName = "Mystpath/Power Definition", fileName = "PowerDef_New")]
    public class PowerDefinition : ScriptableObject
    {
        [Header("Identity")]
        /// <summary>Unique stable string identifier for this power (used in unlock checks).</summary>
        public string PowerId;

        /// <summary>Player-facing display name.</summary>
        public string DisplayName;

        [TextArea(2, 5)]
        /// <summary>Tooltip description explaining the power's effect to the player.</summary>
        public string Description;

        [Header("Cost")]
        /// <summary>Devotion points consumed on activation.</summary>
        public float DevotionCost;

        [Header("Targeting")]
        /// <summary>How the player selects the target when activating this power.</summary>
        public PowerTargetingMode TargetingMode;

        /// <summary>Effect radius in hex cells (used when TargetingMode is HexRadius).</summary>
        public int EffectRadius = 1;

        // TODO: Add cooldown duration in in-game days
        // TODO: Add required unlock ID for progression gating
        // TODO: Add effect parameter block (magnitude, duration, type enum)
    }
}
