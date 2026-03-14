namespace Mystpath
{
    /// <summary>
    /// Handles building upgrade validation and execution. Transitions a building from
    /// its current definition to the next upgrade tier defined by UpgradeTargetBuildingId.
    /// </summary>
    public class BuildingUpgradeService
    {
        /// <summary>
        /// Returns true if the given building instance is eligible for an upgrade.
        /// Checks the definition's upgrade target, kingdom age tier, and available resources.
        /// </summary>
        public bool CanUpgrade(BuildingInstance building, Kingdom kingdom)
        {
            if (building.Definition == null) return false;
            if (string.IsNullOrEmpty(building.Definition.UpgradeTargetBuildingId)) return false;
            if (!building.IsConstructed) return false;

            // TODO: Load the next definition asset by UpgradeTargetBuildingId (via registry or asset reference)
            // TODO: Validate kingdom.AgeTier >= next definition's MinimumAgeTier
            // TODO: Validate kingdom.ResourceStore has sufficient upgrade cost

            return false;
        }

        /// <summary>
        /// Executes an upgrade: deducts cost, updates the building's definition reference,
        /// increments the level, and initiates a construction task for the upgrade work.
        /// </summary>
        public void UpgradeBuilding(BuildingInstance building, BuildingDefinition nextDefinition, Kingdom kingdom)
        {
            // TODO: Deduct upgrade cost from kingdom.ResourceStore
            building.Definition = nextDefinition;
            building.CurrentLevel++;
            building.IsConstructed = false;
            building.ConstructionProgress = 0f;

            // TODO: Generate a Construct task for the upgrade work via TaskGenerator
        }
    }
}
