namespace Mystpath
{
    /// <summary>
    /// Defines the available biome categories for hex cells.
    /// Biome influences terrain appearance, NPC movement cost, resource availability,
    /// fertility, and default buildability.
    /// </summary>
    public enum BiomeType
    {
        None = 0,
        Grassland,
        Forest,
        Desert,
        Tundra,
        Swamp,
        Mountain,
        Ocean,
        River,
        Lake,
        Volcanic,
        // TODO: Expand biome types to match the world simulation design
    }
}
