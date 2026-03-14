namespace Mystpath
{
    /// <summary>
    /// Defines all resource types tracked by the Mystpath economy.
    /// Resources are produced, stored, consumed, and transported by the kingdom.
    /// </summary>
    public enum ResourceType
    {
        None = 0,

        // --- Raw Materials ---
        Wood,
        Stone,
        Ore,
        Clay,
        Fiber,

        // --- Food ---
        RawFood,
        CookedFood,
        Grain,

        // --- Processed Goods ---
        Lumber,
        Brick,
        Metal,
        Cloth,
        Tools,

        // TODO: Expand resource types as economy and production systems are designed
    }
}
