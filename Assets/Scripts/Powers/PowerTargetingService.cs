using System.Collections.Generic;

namespace Mystpath
{
    /// <summary>
    /// Manages player targeting input for god powers. Tracks the active power awaiting
    /// target selection, validates target choices, and returns the set of affected hexes
    /// once a target is confirmed.
    /// </summary>
    public class PowerTargetingService
    {
        /// <summary>The power currently being targeted by the player, or null if none.</summary>
        public PowerDefinition ActivePower { get; private set; }

        /// <summary>
        /// Begins targeting mode for the given power.
        /// Enables targeting cursor and highlights valid cells.
        /// </summary>
        public void BeginTargeting(PowerDefinition power)
        {
            ActivePower = power;
            // TODO: Enable targeting cursor in UI
            // TODO: Highlight valid target cells based on power.TargetingMode
        }

        /// <summary>Cancels the current targeting operation without spending devotion.</summary>
        public void CancelTargeting()
        {
            ActivePower = null;
            // TODO: Disable targeting cursor and clear cell highlights
        }

        /// <summary>
        /// Confirms a target hex selection and returns all affected hex coordinates.
        /// For SingleHex mode returns only the clicked cell; HexRadius expands to a full radius.
        /// </summary>
        public List<HexCoord> ConfirmTarget(HexCoord targetHex, HexGrid hexGrid)
        {
            var affected = new List<HexCoord>();
            if (ActivePower == null) return affected;

            // TODO: Validate target cell is legal for the active power
            // TODO: Expand to radius ring if TargetingMode == HexRadius
            affected.Add(targetHex);

            return affected;
        }
    }
}
