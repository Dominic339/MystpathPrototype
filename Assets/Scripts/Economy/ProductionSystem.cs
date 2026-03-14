namespace Mystpath
{
    /// <summary>
    /// Manages crafting and production at production buildings (workshops, forges, mills, etc.).
    /// Each tick, consumes configured input resources from a building's local inventory
    /// and produces output resources at the configured rate.
    /// </summary>
    public class ProductionSystem
    {
        /// <summary>
        /// Processes one simulation tick of production for the given building.
        /// Checks staffing, input availability, and produces outputs accordingly.
        /// </summary>
        /// <param name="building">The building performing production this tick.</param>
        /// <param name="kingdom">The owning kingdom (for ledger recording).</param>
        public void ProcessProductionTick(BuildingInstance building, Kingdom kingdom)
        {
            if (!building.IsConstructed) return;
            if (building.AssignedWorkerIds.Count == 0) return;

            // TODO: Look up the building's production recipe from its BuildingDefinition
            // TODO: Check building.LocalInventory has sufficient input resources
            // TODO: Deduct inputs and produce output resources into building.LocalInventory
            // TODO: Apply worker skill bonuses to output quantity or speed
            // TODO: Record gains and losses in kingdom's ResourceLedger
        }
    }
}
