using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Responsible for procedurally generating the initial world state from configuration.
    /// Populates the HexGrid with biomes, elevations, water, terrain features, and hidden
    /// resources. Does NOT generate terrain meshes — that is WorldTerrainBuilder's job.
    /// </summary>
    public class WorldGenerator : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private HexGrid _hexGrid;

        [Header("Generation Settings")]
        [SerializeField] private int _seed;
        [SerializeField] private int _worldWidth = 64;
        [SerializeField] private int _worldHeight = 64;

        [Header("Biome Profiles")]
        [Tooltip("All available biome profiles. Used during biome assignment pass.")]
        [SerializeField] private BiomeProfile[] _biomeProfiles;

        /// <summary>The seed used for the most recent generation pass.</summary>
        public int LastUsedSeed => _seed;

        /// <summary>Generates a new world using the currently configured seed and dimensions.</summary>
        public void GenerateWorld()
        {
            Random.InitState(_seed);
            _hexGrid.Initialize(_worldWidth, _worldHeight);

            // TODO: Pass 1 — elevation noise (Perlin / fractal noise across all cells)
            // TODO: Pass 2 — biome assignment (elevation + moisture + temperature model)
            // TODO: Pass 3 — water placement (ocean threshold, lake seeding, river tracing)
            // TODO: Pass 4 — terrain feature placement (mountains, forests, etc.)
            // TODO: Pass 5 — hidden resource seeding (weighted by biome)
            // TODO: Pass 6 — buildability marking (flat, non-water, non-mountain cells)

            Debug.Log($"[WorldGenerator] World generated. Seed={_seed}, Size={_worldWidth}×{_worldHeight}.");
        }

        /// <summary>Generates a world with a freshly randomized seed.</summary>
        public void GenerateWithNewSeed()
        {
            _seed = Random.Range(0, int.MaxValue);
            GenerateWorld();
        }
    }
}
