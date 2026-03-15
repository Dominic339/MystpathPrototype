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
        Biome,                  // Color cells by BiomeType
        Elevation,              // Color cells by BaseElevation (gradient)
        Water,                  // Highlight water cells
        Buildability,           // Highlight buildable vs. non-buildable cells
        MovementCost,           // Color cells by movement cost (green → red → impassable)
        Fertility,              // Color cells by Fertility value
        PrimaryHiddenResource,  // Color cells by their highest-weight hidden resource
        FeatureMembership,      // Color cells by owning TerrainFeature
        TaskOverlay,            // Show active task locations (TODO: implement with task system)
        NpcAssignments,         // Show NPC positions and assigned task targets (TODO: implement with NPC system)
    }
}
