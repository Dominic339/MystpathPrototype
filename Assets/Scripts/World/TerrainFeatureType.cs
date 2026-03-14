namespace Mystpath
{
    /// <summary>
    /// Defines the types of large-scale terrain features that can span multiple hex cells.
    /// Features are managed as runtime objects rather than being baked into individual hex data,
    /// allowing them to carry their own names, settings, and visual representations.
    /// </summary>
    public enum TerrainFeatureType
    {
        None = 0,
        Mountain,           // Single prominent peak
        MountainRange,      // Multi-hex chain of connected peaks
        Volcano,            // Volcanic peak with special gameplay rules
        Plateau,            // Elevated flat region spanning multiple hexes
        Canyon,             // Sunken region with steep walls
        Lake,               // Standing water body
        River,              // Flowing water corridor
        Forest,             // Large multi-hex forest stand
        Desert,             // Dune field or salt flat spanning multiple hexes
        // TODO: Add more feature types as the world generation system matures
    }
}
