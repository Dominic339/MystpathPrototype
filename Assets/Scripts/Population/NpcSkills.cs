using System;
using System.Collections.Generic;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Stores the skill proficiency levels for a single NPC.
    /// Skills improve through use and determine task eligibility and execution speed.
    /// Proficiency is stored as a float 0–100 (0 = untrained, 100 = master).
    /// </summary>
    [Serializable]
    public class NpcSkills
    {
        // Note: Unity's default serializer does not support Dictionary<,> directly.
        // TODO: Replace with a serializable list of key-value pairs for inspector visibility.
        private Dictionary<string, float> _skillLevels = new Dictionary<string, float>();

        /// <summary>Returns the proficiency level for the given skill name (0 if untrained).</summary>
        public float GetSkill(string skillName) =>
            _skillLevels.TryGetValue(skillName, out float level) ? level : 0f;

        /// <summary>Sets a skill's proficiency level, clamped to the valid range [0, 100].</summary>
        public void SetSkill(string skillName, float level) =>
            _skillLevels[skillName] = Mathf.Clamp(level, 0f, 100f);

        /// <summary>
        /// Adds experience to a skill. Clamps the result at 100.
        /// Applies diminishing returns for high-level skills.
        /// </summary>
        public void AddExperience(string skillName, float xpAmount)
        {
            float current = GetSkill(skillName);
            // TODO: Implement diminishing returns curve (e.g., XP earned = xpAmount / (1 + current/20))
            SetSkill(skillName, current + xpAmount);
        }

        // TODO: Define skill name constants as a static class (e.g., SkillNames.Farming)
        //       to avoid stringly-typed usage throughout the codebase.
    }
}
