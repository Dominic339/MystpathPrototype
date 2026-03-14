using System;
using System.Collections.Generic;

namespace Mystpath
{
    /// <summary>
    /// Serializable container for the complete kingdom state at save time.
    /// Stores identity, progression, economy, and known content references.
    /// </summary>
    [Serializable]
    public class KingdomSaveData
    {
        public string KingdomId;
        public string KingdomName;
        public KingdomAgeTier AgeTier;
        public float Devotion;

        // TODO: Add resource store snapshot (parallel ResourceType / float lists)
        // TODO: Add completed research ID list
        // TODO: Add unlocked content ID list
        // TODO: Add open task list (active tasks that should survive a save/load)
    }
}
