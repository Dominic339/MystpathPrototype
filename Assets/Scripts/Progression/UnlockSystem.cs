using System.Collections.Generic;

namespace Mystpath
{
    /// <summary>
    /// Tracks which game content (buildings, powers, technologies) has been unlocked
    /// for the kingdom. Unlocks are triggered by research completion, age advancement,
    /// and scripted world events.
    /// </summary>
    public class UnlockSystem
    {
        /// <summary>Set of unlocked content IDs for the associated kingdom.</summary>
        private readonly HashSet<string> _unlockedIds = new HashSet<string>();

        /// <summary>Returns true if the given content ID is currently unlocked.</summary>
        public bool IsUnlocked(string contentId) => _unlockedIds.Contains(contentId);

        /// <summary>Unlocks the given content ID and fires the unlock event.</summary>
        public void Unlock(string contentId)
        {
            if (_unlockedIds.Contains(contentId)) return;

            _unlockedIds.Add(contentId);
            // TODO: Fire an UnlockEvent for UI notification (e.g., "New building available: Forge!")
        }

        /// <summary>Returns a read-only view of all currently unlocked content IDs.</summary>
        public IReadOnlyCollection<string> GetAllUnlocked() => _unlockedIds;
    }
}
