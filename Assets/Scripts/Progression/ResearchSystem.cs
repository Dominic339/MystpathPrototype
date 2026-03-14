using System.Collections.Generic;

namespace Mystpath
{
    /// <summary>
    /// Manages technology and research progression for the kingdom.
    /// Tracks completed research and coordinates with UnlockSystem to make
    /// researched content available.
    /// </summary>
    public class ResearchSystem
    {
        // TODO: Define a ResearchDefinition ScriptableObject with cost, prerequisites, and unlock payload

        /// <summary>Set of completed research IDs for the associated kingdom.</summary>
        private readonly HashSet<string> _completedResearch = new HashSet<string>();

        /// <summary>Returns true if the given research has already been completed.</summary>
        public bool IsResearched(string researchId) => _completedResearch.Contains(researchId);

        /// <summary>
        /// Marks the given research as completed and triggers any downstream unlocks.
        /// </summary>
        public void CompleteResearch(string researchId, Kingdom kingdom, UnlockSystem unlockSystem)
        {
            if (_completedResearch.Contains(researchId)) return;

            _completedResearch.Add(researchId);

            // TODO: Load the ResearchDefinition and pass its unlock payload to unlockSystem.Unlock()
            // TODO: Fire a research-complete event for UI notification
        }

        /// <summary>Returns all completed research IDs.</summary>
        public IReadOnlyCollection<string> GetCompletedResearch() => _completedResearch;
    }
}
