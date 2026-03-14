namespace Mystpath
{
    /// <summary>
    /// Drives resource extraction from hex cells (gathering, mining, chopping).
    /// Invoked during task execution to transfer resources from cells into inventory stores.
    /// Depletion of cell resource weights is tracked here.
    /// </summary>
    public class ExtractionSystem
    {
        /// <summary>
        /// Processes one tick of extraction work by the given NPC on the target cell.
        /// Returns the amount of resource successfully extracted this tick.
        /// </summary>
        /// <param name="targetCell">The hex cell being worked.</param>
        /// <param name="resource">The resource type being extracted.</param>
        /// <param name="worker">The NPC performing the extraction.</param>
        /// <param name="destination">The inventory store that receives extracted resources.</param>
        public float ProcessExtraction(HexCell targetCell, ResourceType resource, NpcEntity worker, InventoryStore destination)
        {
            // TODO: Validate targetCell has a non-zero weight for the requested resource
            // TODO: Calculate extraction rate from worker.Skills (relevant skill) and cell weight
            // TODO: Deplete targetCell.HiddenResourceWeights[resource] by the extraction amount
            // TODO: destination.Add(resource, extractedAmount)
            // TODO: RecordGain in the kingdom's ResourceLedger
            return 0f;
        }
    }
}
