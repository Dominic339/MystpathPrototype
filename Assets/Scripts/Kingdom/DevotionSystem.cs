using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Manages the generation and expenditure of devotion points for the kingdom.
    /// Devotion is the primary currency for player god powers and is generated
    /// passively by the population each tick.
    /// </summary>
    public class DevotionSystem
    {
        /// <summary>Base devotion generated per NPC per simulation tick.</summary>
        public float DevotionPerNpcPerTick = 0.01f;

        // TODO: Add shrine and temple building bonuses
        // TODO: Add devotion decay if critical NPC needs go unmet
        // TODO: Add event-based devotion bonuses (festivals, miracles)

        /// <summary>Calculates devotion generated this tick and adds it to the kingdom.</summary>
        public void ProcessTick(Kingdom kingdom)
        {
            float generated = kingdom.Population.Count * DevotionPerNpcPerTick;
            // TODO: Apply building bonus multipliers from temples/shrines
            kingdom.Devotion += generated;
        }

        /// <summary>
        /// Attempts to spend the specified amount of devotion from the kingdom pool.
        /// Returns true if the kingdom had sufficient devotion; false otherwise.
        /// </summary>
        public bool TrySpendDevotion(Kingdom kingdom, float amount)
        {
            if (kingdom.Devotion < amount)
                return false;

            kingdom.Devotion -= amount;
            return true;
        }
    }
}
