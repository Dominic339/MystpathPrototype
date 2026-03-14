using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Coordinates the saving and loading of the full game state.
    /// Serializes all major systems into structured save data objects and
    /// writes them to disk. On load, reconstructs runtime state from saved data.
    /// </summary>
    public class SaveManager : MonoBehaviour
    {
        /// <summary>Filename prefix used when writing save files to disk.</summary>
        private const string SaveFilePrefix = "mystpath_save_slot";

        /// <summary>Saves the current game state to the specified slot.</summary>
        /// <param name="slot">Save slot index (0-based).</param>
        public void SaveGame(int slot)
        {
            // TODO: Gather WorldSaveData from HexGrid
            // TODO: Gather KingdomSaveData from KingdomManager.ActiveKingdom
            // TODO: Gather NpcSaveData for each NPC in the kingdom
            // TODO: Gather BuildingSaveData for each building in the kingdom
            // TODO: Wrap all data in a root save envelope with version and timestamp
            // TODO: Serialize to JSON via JsonUtility or Newtonsoft
            // TODO: Write to Application.persistentDataPath

            Debug.Log($"[SaveManager] Game saved to slot {slot}.");
        }

        /// <summary>Loads game state from the specified save slot.</summary>
        /// <param name="slot">Save slot index (0-based).</param>
        public void LoadGame(int slot)
        {
            // TODO: Read and deserialize save file from disk
            // TODO: Restore HexGrid cells from WorldSaveData
            // TODO: Restore Kingdom data model from KingdomSaveData
            // TODO: Reconstruct NPC GameObjects from NpcSaveData
            // TODO: Reconstruct Building instances from BuildingSaveData

            Debug.Log($"[SaveManager] Game loaded from slot {slot}.");
        }

        /// <summary>Returns true if a save file exists in the given slot.</summary>
        public bool SaveExists(int slot)
        {
            // TODO: Check for file on disk at the expected path
            return false;
        }

        /// <summary>Deletes the save file in the given slot.</summary>
        public void DeleteSave(int slot)
        {
            // TODO: Delete save file from disk
        }
    }
}
