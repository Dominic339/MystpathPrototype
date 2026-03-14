namespace Mystpath
{
    /// <summary>
    /// Defines the available debug overlay modes for the WorldDebugRenderer.
    /// Each overlay visualizes a different layer of hex cell data to aid
    /// development, tuning, and testing.
    /// </summary>
    public enum DebugOverlayType
    {
        None = 0,
        Biome,              // Color cells by BiomeType
        Elevation,          // Color cells by BaseElevation (gradient)
        Water,              // Highlight water cells
        Buildability,       // Highlight buildable vs. non-buildable cells
        Fertility,          // Color cells by Fertility value
        ResourceWeights,    // Visualize hidden resource weight totals
        FeatureMembership,  // Color cells by owning TerrainFeature
        TaskOverlay,        // Show active task locations
        NpcAssignments,     // Show NPC positions and assigned task targets
        // TODO: Add more overlays as systems are implemented
    }
}
