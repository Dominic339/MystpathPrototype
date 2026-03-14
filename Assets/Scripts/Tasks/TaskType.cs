namespace Mystpath
{
    /// <summary>
    /// Defines the categories of work tasks that can be assigned to NPCs by the KingdomScheduler.
    /// TaskType determines which buildings, resources, and NPC skills are relevant to execution.
    /// </summary>
    public enum TaskType
    {
        None = 0,
        Gather,         // Collect a natural resource from a hex cell
        Haul,           // Transport resources between two locations
        Construct,      // Build or repair a building
        Farm,           // Tend crops or livestock
        Mine,           // Extract ore or stone from a rock hex
        Chop,           // Fell trees for wood
        Craft,          // Produce goods at a workshop building
        Rest,           // Fulfill the NPC's rest need at a bed
        Eat,            // Fulfill the NPC's hunger need at a food source
        Patrol,         // Guard duty along a defined route
        // TODO: Expand task types as gameplay systems are implemented
    }
}
