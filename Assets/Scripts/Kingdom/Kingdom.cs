using System;
using System.Collections.Generic;

namespace Mystpath
{
    /// <summary>
    /// The development tier of a kingdom. Determines what buildings, powers,
    /// research paths, and progression options are available.
    /// </summary>
    public enum KingdomAgeTier
    {
        Primitive = 0,
        Agrarian,
        Classical,
        Medieval,
        // TODO: Expand age tiers to match the full game progression design
    }

    /// <summary>
    /// Core data model for a Mystpath kingdom. A kingdom owns its population,
    /// buildings, resources, and progression state. It acts as the central scheduler
    /// of all work — NPCs are assigned tasks by the kingdom, not the other way around.
    /// Uses a stable ID for serialization and future networking compatibility.
    /// </summary>
    [Serializable]
    public class Kingdom
    {
        /// <summary>Stable unique identifier for this kingdom (safe for save/load and networking).</summary>
        public string KingdomId { get; private set; }

        /// <summary>Player-visible name of the kingdom.</summary>
        public string KingdomName;

        /// <summary>Current development age tier.</summary>
        public KingdomAgeTier AgeTier = KingdomAgeTier.Primitive;

        /// <summary>Devotion points available for spending on god powers.</summary>
        public float Devotion;

        // --- Population ---

        /// <summary>All NPC entities belonging to this kingdom.</summary>
        public List<NpcEntity> Population = new List<NpcEntity>();

        // --- Buildings ---

        /// <summary>All building instances owned by this kingdom.</summary>
        public List<BuildingInstance> Buildings = new List<BuildingInstance>();

        // --- Economy ---

        /// <summary>The kingdom's shared central resource store.</summary>
        public InventoryStore ResourceStore = new InventoryStore();

        // --- Progression ---

        // TODO: Add reference to CapitalSystem instance
        // TODO: Add set of completed research IDs (HashSet<string>)
        // TODO: Add set of unlocked content IDs (HashSet<string>)

        public Kingdom(string kingdomId, string kingdomName)
        {
            KingdomId = kingdomId;
            KingdomName = kingdomName;
        }
    }
}
