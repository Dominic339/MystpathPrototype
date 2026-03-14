namespace Mystpath
{
    /// <summary>
    /// Manages the settlement/capital tier of the kingdom.
    /// Tracks progression requirements for age advancement and enforces
    /// constraints on what can be built or unlocked at each tier.
    /// </summary>
    public class CapitalSystem
    {
        /// <summary>
        /// Evaluates whether the kingdom currently meets all conditions
        /// required to advance to the next age tier.
        /// </summary>
        public bool CanAdvanceAge(Kingdom kingdom)
        {
            // TODO: Check minimum population count for the next tier
            // TODO: Check required landmark/civic buildings are constructed
            // TODO: Check resource threshold stockpiles
            return false;
        }

        /// <summary>
        /// Advances the kingdom to the next age tier and triggers associated events.
        /// Call only after CanAdvanceAge returns true.
        /// </summary>
        public void AdvanceAge(Kingdom kingdom)
        {
            kingdom.AgeTier = (KingdomAgeTier)((int)kingdom.AgeTier + 1);

            // TODO: Trigger unlock cascade via UnlockSystem for newly available content
            // TODO: Fire an age-advancement event for UI notification and audio
        }
    }
}
