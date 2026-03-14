namespace Mystpath
{
    /// <summary>
    /// Handles validation and execution of building placement requests.
    /// Checks hex eligibility, footprint availability, resource cost, and age requirements
    /// before committing the placement and initiating construction.
    /// </summary>
    public class BuildingPlacementService
    {
        private readonly HexGrid _hexGrid;

        public BuildingPlacementService(HexGrid hexGrid)
        {
            _hexGrid = hexGrid;
        }

        /// <summary>
        /// Returns true if the given building can be legally placed at the anchor hex.
        /// Validates all footprint cells for buildability and occupancy.
        /// </summary>
        public bool CanPlace(BuildingDefinition definition, HexCoord anchor, Kingdom kingdom)
        {
            // TODO: Resolve full footprint from definition offset list + anchor
            // TODO: Validate each footprint cell: exists, IsBuildable, OccupyingBuilding == null
            // TODO: Validate kingdom.AgeTier >= definition.MinimumAgeTier
            // TODO: Validate kingdom.ResourceStore has sufficient build cost resources
            return false;
        }

        /// <summary>
        /// Places the building at the anchor hex, marks footprint cells as occupied,
        /// deducts construction cost, and generates a Construct task.
        /// Returns the new BuildingInstance, or null if placement fails validation.
        /// </summary>
        public BuildingInstance PlaceBuilding(BuildingDefinition definition, HexCoord anchor, Kingdom kingdom)
        {
            if (!CanPlace(definition, anchor, kingdom))
                return null;

            var instance = new BuildingInstance(definition, kingdom.KingdomId);

            // TODO: Resolve and add all footprint HexCoords to instance.PlacedCells
            // TODO: Mark each HexCell.OccupyingBuilding = instance
            // TODO: Deduct construction cost from kingdom.ResourceStore
            // TODO: Add instance to kingdom.Buildings
            // TODO: Generate a Construct task via TaskGenerator

            return instance;
        }
    }
}
