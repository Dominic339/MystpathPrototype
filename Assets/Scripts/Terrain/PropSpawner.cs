using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Obsolete stub. The prop spawning system is now implemented in
    /// <see cref="WorldPropSpawner"/>. This class exists only to prevent
    /// compile errors if a scene object still has this component attached.
    ///
    /// Migration:
    ///   1. Remove PropSpawner components from scene GameObjects.
    ///   2. Add a WorldPropSpawner component instead.
    ///   3. Assign BiomePropSet assets to WorldPropSpawner.BiomePropSets.
    /// </summary>
    [System.Obsolete("PropSpawner has been replaced by WorldPropSpawner. " +
                     "See Assets/Scripts/Terrain/WorldPropSpawner.cs.")]
    public class PropSpawner : MonoBehaviour { }
}
