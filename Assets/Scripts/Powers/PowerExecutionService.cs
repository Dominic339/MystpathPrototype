using System.Collections.Generic;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Executes god power effects on the world after targeting has been confirmed.
    /// Validates devotion cost, applies effects to target cells or entities,
    /// and triggers visual/audio feedback.
    /// </summary>
    public class PowerExecutionService
    {
        private readonly DevotionSystem _devotionSystem;

        public PowerExecutionService(DevotionSystem devotionSystem)
        {
            _devotionSystem = devotionSystem;
        }

        /// <summary>
        /// Attempts to execute the given power against the confirmed target list.
        /// Deducts devotion and applies effects if successful.
        /// Returns true if the power was executed; false if devotion was insufficient.
        /// </summary>
        public bool TryExecutePower(PowerDefinition power, List<HexCoord> targets, Kingdom kingdom, HexGrid hexGrid)
        {
            if (!_devotionSystem.TrySpendDevotion(kingdom, power.DevotionCost))
            {
                Debug.Log($"[PowerExecutionService] Insufficient devotion for '{power.DisplayName}' (need {power.DevotionCost}, have {kingdom.Devotion:F1}).");
                return false;
            }

            // TODO: Dispatch to a specific effect handler based on power.PowerId or an effect type enum
            // TODO: Apply effects to each coord in targets (modify HexCell, spawn entities, etc.)
            // TODO: Trigger VFX at target positions
            // TODO: Trigger audio feedback

            Debug.Log($"[PowerExecutionService] Executed power '{power.DisplayName}' on {targets.Count} hex(es).");
            return true;
        }
    }
}
