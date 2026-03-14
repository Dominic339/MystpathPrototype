using System;

namespace Mystpath
{
    /// <summary>
    /// Serializable container for a single NPC's state at save time.
    /// Stores enough data to fully reconstruct the NPC on load.
    /// </summary>
    [Serializable]
    public class NpcSaveData
    {
        public string NpcId;
        public string DisplayName;
        public string OwningKingdomId;

        // --- Position ---
        public float PositionX;
        public float PositionY;
        public float PositionZ;

        // --- Stats ---
        public float Health;
        public float MaxHealth;
        public int Strength;
        public int Agility;
        public int Intellect;
        public float Age;

        // TODO: Add need levels (hunger, rest, social, shelter)
        // TODO: Add skill list (parallel name/value lists for serializer compatibility)
        // TODO: Add interest list (parallel name/weight lists)
        // TODO: Add assignment state (assigned task ID, in-transit flag)
    }
}
