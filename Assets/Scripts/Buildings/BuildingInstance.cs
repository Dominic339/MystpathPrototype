using System;
using System.Collections.Generic;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// A runtime instance of a building placed in the world.
    /// Tracks current state: construction progress, upgrade level, occupied cells,
    /// assigned workers, and local inventory. References its definition for static data.
    /// Uses a stable ID for serialization and future networking compatibility.
    /// </summary>
    [Serializable]
    public class BuildingInstance
    {
        /// <summary>Stable unique identifier for this building instance.</summary>
        public string InstanceId { get; private set; }

        /// <summary>The ScriptableObject definition describing this building's type.</summary>
        public BuildingDefinition Definition;

        /// <summary>The stable ID of the kingdom that owns this building.</summary>
        public string OwnerKingdomId;

        // --- Placement ---

        /// <summary>All hex coordinates occupied by this building's footprint.</summary>
        public List<HexCoord> PlacedCells = new List<HexCoord>();

        /// <summary>The anchor (primary) hex cell. All footprint offsets are relative to this.</summary>
        public HexCoord AnchorCell => PlacedCells.Count > 0 ? PlacedCells[0] : default;

        // --- State ---

        /// <summary>Current upgrade level (0 = base, 1 = first upgrade, etc.).</summary>
        public int CurrentLevel;

        /// <summary>Whether this building has been fully constructed and is operational.</summary>
        public bool IsConstructed;

        /// <summary>Construction progress from 0 (not started) to 1 (complete).</summary>
        [Range(0f, 1f)]
        public float ConstructionProgress;

        // --- Workers ---

        /// <summary>Stable NPC IDs currently assigned to work at this building.</summary>
        public List<string> AssignedWorkerIds = new List<string>();

        // --- Inventory ---

        /// <summary>Local resource store for inputs and outputs at this building.</summary>
        public InventoryStore LocalInventory = new InventoryStore();

        // TODO: Add operational state enum (Idle, Running, Broken, Decommissioned)
        // TODO: Add reference to spawned scene GameObject for visual updates

        public BuildingInstance(BuildingDefinition definition, string ownerKingdomId)
        {
            InstanceId = Guid.NewGuid().ToString();
            Definition = definition;
            OwnerKingdomId = ownerKingdomId;
        }
    }
}
