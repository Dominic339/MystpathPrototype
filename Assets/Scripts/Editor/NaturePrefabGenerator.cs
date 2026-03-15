using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using Mystpath; // HarvestableProp, BiomePropSet, BiomeType, ResourceType

namespace Mystpath.Editor
{
    /// <summary>
    /// Editor tool that scans imported nature models and generates ready-to-use
    /// prefabs with appropriate colliders and <see cref="HarvestableProp"/> components.
    ///
    /// Access via:
    ///   Tools → Mystpath → Generate Nature Prefabs
    ///   Tools → Mystpath → Create Default Biome Prop Sets
    ///
    /// Prefab Generation (Generate Nature Prefabs):
    ///   1. Scans Assets/Art/Nature/ recursively for all imported mesh assets.
    ///   2. Classifies each model into a category (Trees, Rocks, Bushes, etc.)
    ///      using filename keyword matching.
    ///   3. Creates prefab assets in Assets/Prefabs/Nature/[Category]/ with:
    ///        - An appropriate Collider (CapsuleCollider for organic shapes,
    ///          BoxCollider for rock/debris).
    ///        - A HarvestableProp component pre-configured with a default yield.
    ///   4. Skips prefabs that already exist — safe to run multiple times.
    ///
    /// Default Biome Prop Sets (Create Default Biome Prop Sets):
    ///   Creates one empty BiomePropSet ScriptableObject asset per primary biome
    ///   under Assets/ScriptableObjects/Nature/BiomeSets/.
    ///   Populate the Entries list in each set's Inspector by dragging generated
    ///   prefabs into it.
    ///
    /// Workflow after pulling this code:
    ///   1. Import nature models into Assets/Art/Nature/
    ///      (organising into sub-folders like Trees/, Rocks/ is optional but helpful).
    ///   2. Run Tools → Mystpath → Generate Nature Prefabs.
    ///   3. Run Tools → Mystpath → Create Default Biome Prop Sets (if not done already).
    ///   4. For each BiomePropSet in Assets/ScriptableObjects/Nature/BiomeSets/:
    ///        a. Open in Inspector.
    ///        b. Add entries by dragging prefabs from Assets/Prefabs/Nature/.
    ///        c. Adjust SpawnWeight and SpawnChance per entry.
    ///   5. Add a WorldPropSpawner component to a scene GameObject.
    ///   6. Assign the BiomePropSet assets to its Biome Prop Sets list.
    ///   7. Enter Play Mode — props spawn automatically after terrain is built.
    /// </summary>
    public static class NaturePrefabGenerator
    {
        // Source folder for imported nature models.
        private const string SourceRoot  = "Assets/Art/Nature";

        // Root output folder for generated prefabs.
        private const string PrefabRoot  = "Assets/Prefabs/Nature";

        // Output folder for biome ScriptableObject assets.
        private const string SoRoot      = "Assets/ScriptableObjects/Nature/BiomeSets";

        // Model file extensions recognised as mesh assets.
        private static readonly string[] MeshExtensions =
            { ".fbx", ".obj", ".blend", ".dae", ".3ds", ".gltf", ".glb" };

        // =====================================================================
        // Category Definitions
        // =====================================================================

        /// <summary>
        /// How a classified model should receive a collider.
        /// </summary>
        private enum ColliderShape { Capsule, Box }

        /// <summary>
        /// A classification bucket for an imported model.
        /// </summary>
        private readonly struct Category
        {
            public readonly string   SubFolder;
            public readonly string[] Keywords;
            public readonly ColliderShape Collider;
            public readonly bool     IsHarvestable;
            public readonly ResourceType DefaultYield;
            public readonly int      DefaultMinYield;
            public readonly int      DefaultMaxYield;
            public readonly int      DefaultMaxHarvestCount;

            public Category(
                string subFolder, string[] keywords, ColliderShape collider,
                bool isHarvestable, ResourceType defaultYield,
                int minYield = 1, int maxYield = 4, int maxCount = 1)
            {
                SubFolder              = subFolder;
                Keywords               = keywords;
                Collider               = collider;
                IsHarvestable          = isHarvestable;
                DefaultYield           = defaultYield;
                DefaultMinYield        = minYield;
                DefaultMaxYield        = maxYield;
                DefaultMaxHarvestCount = maxCount;
            }
        }

        // The ordered list of categories checked against each model's filename.
        // First matching category wins — put more specific keywords earlier.
        private static readonly Category[] Categories =
        {
            new Category("OreOutcrops",
                new[] { "ore_vein", "vein", "outcrop", "mineral", "ore" },
                ColliderShape.Box, isHarvestable: true,
                ResourceType.Copper, minYield: 1, maxYield: 3, maxCount: 2),

            new Category("Trees",
                new[] { "tree", "pine", "oak", "fir", "birch", "spruce",
                         "willow", "palm", "conifer", "maple", "cedar" },
                ColliderShape.Capsule, isHarvestable: true,
                ResourceType.Wood, minYield: 3, maxYield: 8, maxCount: 1),

            new Category("Rocks",
                new[] { "rock", "stone", "boulder", "cliff", "pebble" },
                ColliderShape.Box, isHarvestable: true,
                ResourceType.Stone, minYield: 1, maxYield: 4, maxCount: 2),

            new Category("Bushes",
                new[] { "bush", "shrub", "brush", "hedge", "berry" },
                ColliderShape.Capsule, isHarvestable: true,
                ResourceType.Fiber, minYield: 1, maxYield: 2, maxCount: 1),

            new Category("Desert",
                new[] { "cactus", "agave", "desert", "succulent", "drygrass",
                         "sand_plant", "sandplant" },
                ColliderShape.Capsule, isHarvestable: true,
                ResourceType.Fiber, minYield: 1, maxYield: 2, maxCount: 1),

            new Category("Reeds",
                new[] { "reed", "cattail", "bulrush", "watergrass" },
                ColliderShape.Box, isHarvestable: true,
                ResourceType.Fiber, minYield: 1, maxYield: 3, maxCount: 1),

            new Category("Plants",
                new[] { "flower", "plant", "herb", "fern", "weed" },
                ColliderShape.Capsule, isHarvestable: true,
                ResourceType.Fiber, minYield: 1, maxYield: 2, maxCount: 1),

            new Category("Debris",
                new[] { "log", "stump", "driftwood", "debris" },
                ColliderShape.Box, isHarvestable: true,
                ResourceType.Wood, minYield: 1, maxYield: 3, maxCount: 1),

            new Category("Grass",
                new[] { "grass", "tuft", "groundcover" },
                ColliderShape.Box, isHarvestable: false,
                ResourceType.None),

            // Catch-all for anything not matched above.
            // Placed last so it only applies to unclassified models.
            new Category("Misc",
                new[] { "" },   // empty keyword matches anything
                ColliderShape.Box, isHarvestable: false,
                ResourceType.None),
        };

        // =====================================================================
        // Menu Actions
        // =====================================================================

        [MenuItem("Tools/Mystpath/Generate Nature Prefabs")]
        private static void GenerateNaturePrefabs()
        {
            if (!AssetDatabase.IsValidFolder(SourceRoot))
            {
                EditorUtility.DisplayDialog(
                    "Mystpath — Generate Nature Prefabs",
                    $"Source folder not found:\n  {SourceRoot}\n\n" +
                    "Import your nature models into that folder first, " +
                    "then run this tool again.",
                    "OK");
                return;
            }

            // Build output folder structure.
            EnsureFolder("Assets/Prefabs");
            EnsureFolder(PrefabRoot);
            foreach (Category cat in Categories)
                EnsureFolder($"{PrefabRoot}/{cat.SubFolder}");

            // Find all model assets under the source root.
            string[] guids = AssetDatabase.FindAssets("t:Model", new[] { SourceRoot });

            if (guids.Length == 0)
            {
                EditorUtility.DisplayDialog(
                    "Mystpath — Generate Nature Prefabs",
                    $"No model assets found in:\n  {SourceRoot}\n\n" +
                    "Confirm models are imported and visible in the Project window.",
                    "OK");
                return;
            }

            int created = 0, skipped = 0, failed = 0;

            try
            {
                AssetDatabase.StartAssetEditing();

                for (int i = 0; i < guids.Length; i++)
                {
                    string assetPath = AssetDatabase.GUIDToAssetPath(guids[i]);

                    EditorUtility.DisplayProgressBar(
                        "Mystpath — Generating Nature Prefabs",
                        $"{Path.GetFileName(assetPath)}  ({i + 1} / {guids.Length})",
                        (float)i / guids.Length);

                    // Only process recognised mesh extensions.
                    string ext = Path.GetExtension(assetPath).ToLowerInvariant();
                    if (!System.Array.Exists(MeshExtensions, e => e == ext)) continue;

                    GameObject model = AssetDatabase.LoadAssetAtPath<GameObject>(assetPath);
                    if (model == null) { failed++; continue; }

                    string baseName = Path.GetFileNameWithoutExtension(assetPath);
                    Category cat = ClassifyModel(baseName);

                    string prefabPath = $"{PrefabRoot}/{cat.SubFolder}/{baseName}.prefab";

                    // Idempotent: skip if this prefab already exists.
                    if (AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath) != null)
                    {
                        skipped++;
                        continue;
                    }

                    // Instantiate a copy in the scene (not saved yet), add components,
                    // then save as a new prefab asset.
                    GameObject instance = Object.Instantiate(model);
                    instance.name = baseName;

                    AddCollider(instance, cat.Collider, baseName);

                    if (cat.IsHarvestable)
                    {
                        var harvestable = instance.GetComponent<HarvestableProp>()
                                          ?? instance.AddComponent<HarvestableProp>();

                        harvestable.EditorSetDefaults(
                            cat.DefaultYield,
                            cat.DefaultMinYield,
                            cat.DefaultMaxYield,
                            cat.DefaultMaxHarvestCount);
                    }

                    bool savedOk;
                    PrefabUtility.SaveAsPrefabAsset(instance, prefabPath, out savedOk);
                    Object.DestroyImmediate(instance);

                    if (savedOk) created++;
                    else          failed++;
                }
            }
            finally
            {
                AssetDatabase.StopAssetEditing();
                EditorUtility.ClearProgressBar();
                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();
            }

            string summary = $"Generation complete.\n\n" +
                             $"Created : {created}\n" +
                             $"Skipped (already exist): {skipped}\n" +
                             $"Failed  : {failed}\n\n" +
                             $"Prefabs saved to:\n  {PrefabRoot}";

            EditorUtility.DisplayDialog("Mystpath — Generate Nature Prefabs", summary, "OK");
            Debug.Log($"[NaturePrefabGenerator] {summary.Replace('\n', ' ')}");
        }

        // ─────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Scans every BiomePropSet asset in the project and auto-corrects
        /// common misconfiguration issues that cause props not to appear:
        ///
        ///   SpawnWeight == 0   → set to 1.0  (entry would be unreachable by weighted selection)
        ///   SpawnChance == 0   → set to 0.5  (entry would always be skipped)
        ///   MinScale  == 0     → set to 0.85 (zero scale makes props invisible)
        ///   MaxScale  == 0     → set to 1.15 (zero scale makes props invisible)
        ///   MaxScale < MinScale→ swapped      (inverted range produces NaN scale)
        ///
        /// Entries whose Prefab is null are left untouched — they will still be
        /// skipped by WorldPropSpawner, but removing them is a designer decision.
        ///
        /// Sets with ExcludeFromNaturalSpawning = true are reported but not modified.
        ///
        /// Safe to run multiple times; only dirty assets are written back.
        /// Access via Tools → Mystpath → Validate and Fix Biome Prop Sets.
        /// </summary>
        [MenuItem("Tools/Mystpath/Validate and Fix Biome Prop Sets")]
        private static void ValidateAndFixBiomePropSets()
        {
            string[] guids = AssetDatabase.FindAssets("t:BiomePropSet");

            if (guids.Length == 0)
            {
                EditorUtility.DisplayDialog(
                    "Mystpath — Validate Biome Prop Sets",
                    "No BiomePropSet assets found in the project.\n\n" +
                    "Create some via Create → Mystpath → World → Biome Prop Set\n" +
                    "or run Tools/Mystpath/Create Default Biome Prop Sets first.",
                    "OK");
                return;
            }

            int setsFixed   = 0;
            int entriesFixed = 0;
            int setsExcluded = 0;
            int setsEmpty    = 0;
            var report = new System.Text.StringBuilder();

            try
            {
                AssetDatabase.StartAssetEditing();

                for (int i = 0; i < guids.Length; i++)
                {
                    string path = AssetDatabase.GUIDToAssetPath(guids[i]);
                    var set = AssetDatabase.LoadAssetAtPath<BiomePropSet>(path);
                    if (set == null) continue;

                    EditorUtility.DisplayProgressBar(
                        "Mystpath — Validating Biome Prop Sets",
                        $"{set.name}  ({i + 1} / {guids.Length})",
                        (float)i / guids.Length);

                    if (set.ExcludeFromNaturalSpawning)
                    {
                        setsExcluded++;
                        continue; // Managed sets — don't touch them.
                    }

                    if (set.Entries == null || set.Entries.Count == 0)
                    {
                        setsEmpty++;
                        report.AppendLine($"  EMPTY: {set.name} — no entries to fix");
                        continue;
                    }

                    bool setDirty = false;

                    foreach (BiomePropEntry e in set.Entries)
                    {
                        if (e == null) continue;

                        bool entryDirty = false;

                        if (e.SpawnWeight <= 0f)
                        {
                            e.SpawnWeight = 1f;
                            entryDirty = true;
                        }

                        if (e.SpawnChance <= 0f)
                        {
                            e.SpawnChance = 0.5f;
                            entryDirty = true;
                        }

                        if (e.MinScale <= 0f)
                        {
                            e.MinScale = 0.85f;
                            entryDirty = true;
                        }

                        if (e.MaxScale <= 0f)
                        {
                            e.MaxScale = 1.15f;
                            entryDirty = true;
                        }

                        // Ensure min ≤ max; swap if inverted.
                        if (e.MinScale > e.MaxScale)
                        {
                            float tmp = e.MinScale;
                            e.MinScale = e.MaxScale;
                            e.MaxScale = tmp;
                            entryDirty = true;
                        }

                        if (entryDirty)
                        {
                            entriesFixed++;
                            setDirty = true;
                        }
                    }

                    if (setDirty)
                    {
                        EditorUtility.SetDirty(set);
                        setsFixed++;
                        report.AppendLine($"  FIXED: {set.name}");
                    }
                }
            }
            finally
            {
                AssetDatabase.StopAssetEditing();
                EditorUtility.ClearProgressBar();
                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();
            }

            string summary =
                $"Validation complete.\n\n" +
                $"Sets scanned  : {guids.Length}\n" +
                $"Sets fixed    : {setsFixed}  ({entriesFixed} entries corrected)\n" +
                $"Sets skipped  : {setsExcluded} (ExcludeFromNaturalSpawning=true)\n" +
                $"Sets empty    : {setsEmpty} (no entries — add prefabs in Inspector)\n";

            if (report.Length > 0)
                summary += $"\nDetails:\n{report}";

            EditorUtility.DisplayDialog("Mystpath — Validate Biome Prop Sets", summary, "OK");
            Debug.Log($"[NaturePrefabGenerator] ValidateAndFixBiomePropSets: {summary.Replace('\n', ' ')}");
        }

        // ─────────────────────────────────────────────────────────────────────

        [MenuItem("Tools/Mystpath/Create Default Biome Prop Sets")]
        private static void CreateDefaultBiomePropSets()
        {
            EnsureFolder("Assets/ScriptableObjects");
            EnsureFolder("Assets/ScriptableObjects/Nature");
            EnsureFolder(SoRoot);

            // Biomes to create sets for, together with their default density settings.
            var biomeDefaults = new (BiomeType biome, int slots, float density)[]
            {
                (BiomeType.Forest,    6, 1.2f),
                (BiomeType.Grassland, 4, 0.8f),
                (BiomeType.Desert,    2, 0.4f),
                (BiomeType.Mountain,  3, 0.7f),
                (BiomeType.Tundra,    3, 0.6f),
                (BiomeType.Swamp,     5, 1.0f),
            };

            int created = 0;

            foreach (var (biome, slots, density) in biomeDefaults)
            {
                string path = $"{SoRoot}/BiomePropSet_{biome}.asset";

                if (AssetDatabase.LoadAssetAtPath<BiomePropSet>(path) != null)
                    continue; // Already exists — skip.

                var set = ScriptableObject.CreateInstance<BiomePropSet>();
                set.name                   = $"BiomePropSet_{biome}";
                set.TargetBiome            = biome;
                set.SlotsPerHex            = slots;
                set.GlobalDensityMultiplier = density;
                set.SpawnOnShoreCells      = true;
                set.IsShoreSpecificSet     = false;

                AssetDatabase.CreateAsset(set, path);
                created++;
            }

            // Shore-specific set.
            string shorePath = $"{SoRoot}/BiomePropSet_Shore.asset";
            if (AssetDatabase.LoadAssetAtPath<BiomePropSet>(shorePath) == null)
            {
                var shoreSet = ScriptableObject.CreateInstance<BiomePropSet>();
                shoreSet.name                   = "BiomePropSet_Shore";
                shoreSet.IsShoreSpecificSet     = true;
                shoreSet.SlotsPerHex            = 2;
                shoreSet.GlobalDensityMultiplier = 0.5f;
                AssetDatabase.CreateAsset(shoreSet, shorePath);
                created++;
            }

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            string summary = $"Created {created} BiomePropSet assets in:\n  {SoRoot}\n\n" +
                             "Next steps:\n" +
                             "1. Open each set in the Inspector.\n" +
                             "2. Add Entries by dragging prefabs from Assets/Prefabs/Nature/.\n" +
                             "3. Set SpawnWeight and SpawnChance per entry.\n" +
                             "4. Assign sets to WorldPropSpawner.BiomePropSets.";

            EditorUtility.DisplayDialog("Mystpath — Biome Prop Sets", summary, "OK");
            Debug.Log($"[NaturePrefabGenerator] Created {created} BiomePropSet assets.");
        }

        // =====================================================================
        // Classification
        // =====================================================================

        /// <summary>
        /// Returns the first <see cref="Category"/> whose keywords appear in
        /// <paramref name="modelName"/> (case-insensitive).
        /// Falls back to the Misc category if nothing matches.
        /// </summary>
        private static Category ClassifyModel(string modelName)
        {
            string lower = modelName.ToLowerInvariant();

            foreach (Category cat in Categories)
            {
                foreach (string kw in cat.Keywords)
                {
                    if (string.IsNullOrEmpty(kw)) continue; // skip catch-all sentinel
                    if (lower.Contains(kw)) return cat;
                }
            }

            // Return the Misc catch-all (last entry).
            return Categories[Categories.Length - 1];
        }

        // =====================================================================
        // Collider Placement
        // =====================================================================

        /// <summary>
        /// Adds a collider of the specified <paramref name="shape"/> to the root of
        /// <paramref name="go"/>. Sizes are set to rough defaults that match typical
        /// nature prop proportions; final tuning should be done per-prefab.
        /// </summary>
        private static void AddCollider(GameObject go, ColliderShape shape, string modelName)
        {
            // Remove any pre-existing colliders on the root to avoid doubles.
            foreach (Collider existing in go.GetComponents<Collider>())
                Object.DestroyImmediate(existing);

            switch (shape)
            {
                case ColliderShape.Capsule:
                {
                    var col = go.AddComponent<CapsuleCollider>();

                    // Taller models (trees) get a taller capsule; bushes get a short fat one.
                    bool isTree = modelName.ToLowerInvariant().Contains("tree")
                               || modelName.ToLowerInvariant().Contains("pine")
                               || modelName.ToLowerInvariant().Contains("fir");

                    col.center = new Vector3(0f, isTree ? 2f : 0.5f, 0f);
                    col.radius = isTree ? 0.3f : 0.5f;
                    col.height = isTree ? 5f   : 1.2f;
                    break;
                }

                case ColliderShape.Box:
                {
                    var col = go.AddComponent<BoxCollider>();
                    col.center = new Vector3(0f, 0.5f, 0f);
                    col.size   = new Vector3(1f, 1f, 1f);
                    break;
                }
            }
        }

        // =====================================================================
        // Folder Utilities
        // =====================================================================

        /// <summary>
        /// Creates the asset database folder at <paramref name="path"/> if it does
        /// not already exist. Handles intermediate parent folders recursively.
        /// </summary>
        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;

            string parent = Path.GetDirectoryName(path)?.Replace('\\', '/');
            string folderName = Path.GetFileName(path);

            if (!string.IsNullOrEmpty(parent))
                EnsureFolder(parent);

            AssetDatabase.CreateFolder(parent, folderName);
        }
    }
}
