using System;
using System.Collections.Generic;

namespace Mystpath
{
    /// <summary>
    /// Serializable container for a building instance's state at save time.
    /// Stores enough data to fully reconstruct the building on load, including
    /// its footprint, construction state, and level.
    /// </summary>
    [Serializable]
    public class BuildingSaveData
    {
        public string InstanceId;

        /// <summary>BuildingId of the BuildingDefinition ScriptableObject (loaded by ID on restore).</summary>
        public string BuildingDefinitionId;

        public string OwnerKingdomId;
        public int CurrentLevel;
        public bool IsConstructed;
        public float ConstructionProgress;

        /// <summary>Axial Q values of all occupied hex cells (parallel list with OccupiedHexR).</summary>
        public List<int> OccupiedHexQ = new List<int>();

        /// <summary>Axial R values of all occupied hex cells (parallel list with OccupiedHexQ).</summary>
        public List<int> OccupiedHexR = new List<int>();

        // TODO: Add local inventory snapshot (parallel resource key/value lists)
        // TODO: Add assigned worker ID list
    }
}
