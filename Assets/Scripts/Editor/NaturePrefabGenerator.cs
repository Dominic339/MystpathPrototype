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
        /// Carries both prefab-generation settings (collider, harvest yield) and
        /// spawn defaults used by <see cref="ValidateAndFixBiomePropSets"/> to
        /// auto-correct zero-value <see cref="BiomePropEntry"/> fields.
        ///
        /// Spawn defaults are inferred from the prefab's filename at validation time
        /// so that trees, rocks, bushes, and debris each get appropriate weights and
        /// probabilities rather than a flat generic value.
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

            // --- Spawn defaults (used by ValidateAndFixBiomePropSets) ---

            /// <summary>
            /// Relative weight this category's props get among others in a BiomePropSet.
            /// Grass and bushes (high) appear more often than rocks or debris (low).
            /// </summary>
            public readonly float DefaultSpawnWeight;

            /// <summary>
            /// Probability [0–1] that a slot for this category actually produces a prop.
            /// Combined with the set's GlobalDensityMultiplier and the spawner's
            /// global multiplier at runtime.
            /// </summary>
            public readonly float DefaultSpawnChance;

            /// <summary>Minimum uniform scale applied to the instantiated prefab.</summary>
            public readonly float DefaultMinScale;

            /// <summary>Maximum uniform scale applied to the instantiated prefab.</summary>
            public readonly float DefaultMaxScale;

            public Category(
                string subFolder, string[] keywords, ColliderShape collider,
                bool isHarvestable, ResourceType defaultYield,
                int minYield = 1, int maxYield = 4, int maxCount = 1,
                float spawnWeight = 1f, float spawnChance = 0.25f,
                float minScale = 0.85f, float maxScale = 1.15f)
            {
                SubFolder              = subFolder;
                Keywords               = keywords;
                Collider               = collider;
                IsHarvestable          = isHarvestable;
                DefaultYield           = defaultYield;
                DefaultMinYield        = minYield;
                DefaultMaxYield        = maxYield;
                DefaultMaxHarvestCount = maxCount;
                DefaultSpawnWeight     = spawnWeight;
                DefaultSpawnChance     = spawnChance;
                DefaultMinScale        = minScale;
                DefaultMaxScale        = maxScale;
            }
        }

        // The ordered list of categories checked against each model's filename.
        // First matching category wins — put more specific keywords earlier.
        //
        // Spawn defaults (spawnWeight, spawnChance, minScale, maxScale) are used by
        // ValidateAndFixBiomePropSets to assign sensible values per prefab category
        // instead of a flat generic default. Tweak these to adjust the
        // feel of each prop type globally.
        private static readonly Category[] Categories =
        {
            // Scale and SpawnChance note:
            //   These per-entry defaults are applied by ValidateAndFixBiomePropSets only for
            //   entries whose values are zero — existing non-zero values are left untouched.
            //
            //   minScale/maxScale are multiplied by WorldPropSpawner._globalScaleMultiplier
            //   (default 3.5) at runtime, so minScale=1.0 → 3.5 world units.
            //
            //   SpawnChance targets a management/kingdom-builder camera where biome identity
            //   must be readable from altitude. Higher values (0.55–0.75) are appropriate
            //   because props need to populate the surface visually at strategy zoom.
            //   Per-biome tuning uses BiomePropSet.GlobalDensityMultiplier instead of these.

            // Ore outcrops — rare landmarks, not meant to carpet biomes.
            new Category("OreOutcrops",
                new[] { "ore_vein", "vein", "outcrop", "mineral", "ore" },
                ColliderShape.Box, isHarvestable: true,
                ResourceType.Copper, minYield: 1, maxYield: 3, maxCount: 2,
                spawnWeight: 1.5f, spawnChance: 0.20f, minScale: 1.0f, maxScale: 1.5f),

            // Trees — backbone of forest/swamp identity; need high coverage to read clearly.
            new Category("Trees",
                new[] { "tree", "pine", "oak", "fir", "birch", "spruce",
                         "willow", "palm", "conifer", "maple", "cedar" },
                ColliderShape.Capsule, isHarvestable: true,
                ResourceType.Wood, minYield: 3, maxYield: 8, maxCount: 1,
                spawnWeight: 3.0f, spawnChance: 0.55f, minScale: 1.0f, maxScale: 1.5f),

            // Rocks — critical for mountain and desert visual identity; need visible density.
            new Category("Rocks",
                new[] { "rock", "stone", "boulder", "cliff", "pebble" },
                ColliderShape.Box, isHarvestable: true,
                ResourceType.Stone, minYield: 1, maxYield: 4, maxCount: 2,
                spawnWeight: 2.0f, spawnChance: 0.45f, minScale: 0.9f, maxScale: 1.5f),

            // Bushes — common mid-level clutter; keeps grassland from looking barren.
            new Category("Bushes",
                new[] { "bush", "shrub", "brush", "hedge", "berry" },
                ColliderShape.Capsule, isHarvestable: true,
                ResourceType.Fiber, minYield: 1, maxYield: 2, maxCount: 1,
                spawnWeight: 4.0f, spawnChance: 0.65f, minScale: 0.8f, maxScale: 1.2f),

            // Desert plants — define desert identity; sparse but each instance must be visible.
            new Category("Desert",
                new[] { "cactus", "agave", "desert", "succulent", "drygrass",
                         "sand_plant", "sandplant" },
                ColliderShape.Capsule, isHarvestable: true,
                ResourceType.Fiber, minYield: 1, maxYield: 2, maxCount: 1,
                spawnWeight: 3.5f, spawnChance: 0.60f, minScale: 0.9f, maxScale: 1.4f),

            // Reeds — core prop for shore and swamp; needs dense coverage near water.
            new Category("Reeds",
                new[] { "reed", "cattail", "bulrush", "watergrass" },
                ColliderShape.Box, isHarvestable: true,
                ResourceType.Fiber, minYield: 1, maxYield: 3, maxCount: 1,
                spawnWeight: 4.0f, spawnChance: 0.70f, minScale: 0.8f, maxScale: 1.2f),

            // Ground plants and flowers — common underbrush; fills gaps between trees and rocks.
            new Category("Plants",
                new[] { "flower", "plant", "herb", "fern", "weed" },
                ColliderShape.Capsule, isHarvestable: true,
                ResourceType.Fiber, minYield: 1, maxYield: 2, maxCount: 1,
                spawnWeight: 4.0f, spawnChance: 0.65f, minScale: 0.8f, maxScale: 1.2f),

            // Debris — fallen logs / stumps; atmospheric atmosphere prop, stays intentionally rare.
            new Category("Debris",
                new[] { "log", "stump", "driftwood", "debris" },
                ColliderShape.Box, isHarvestable: true,
                ResourceType.Wood, minYield: 1, maxYield: 3, maxCount: 1,
                spawnWeight: 1.0f, spawnChance: 0.22f, minScale: 1.0f, maxScale: 1.5f),

            // Ground cover grass — cheapest prop; used as base filler in almost every biome.
            new Category("Grass",
                new[] { "grass", "tuft", "groundcover" },
                ColliderShape.Box, isHarvestable: false,
                ResourceType.None,
                spawnWeight: 5.0f, spawnChance: 0.75f, minScale: 0.7f, maxScale: 1.1f),

            // Catch-all for anything not matched above.
            // Placed last so it only applies to unclassified models.
            new Category("Misc",
                new[] { "" },   // empty keyword matches anything
                ColliderShape.Box, isHarvestable: false,
                ResourceType.None,
                spawnWeight: 1.0f, spawnChance: 0.40f, minScale: 1.0f, maxScale: 1.5f),
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
        /// Name substrings that identify sets which are NOT primary biome sets and
        /// should be excluded from natural world spawning. When
        /// <see cref="ValidateAndFixBiomePropSets"/> encounters a set whose name
        /// contains any of these patterns (case-insensitive) it sets
        /// <see cref="BiomePropSet.ExcludeFromNaturalSpawning"/> = true automatically.
        ///
        /// Add to this list as new support/future/helper sets are created.
        /// Existing assets whose flag was already set manually are left alone.
        /// </summary>
        private static readonly string[] SupportSetNamePatterns =
        {
            "_dense",           // e.g. Forest_Dense
            "foothills",        // e.g. Foothills
            "debris_common",    // shared debris pool
            "harvestable_trees",// separate tree harvest pool
            "crops_",           // e.g. Crops_Future
            "_future",          // any future/placeholder set
            "_variant",         // named variant sets
            "_alt",             // alternative sets
        };

        /// <summary>
        /// Scans every BiomePropSet asset in the project and auto-corrects common
        /// misconfiguration issues that cause props not to appear at runtime.
        ///
        /// What is fixed:
        ///
        ///   Support / future sets (Forest_Dense, Foothills, Debris_Common,
        ///   Harvestable_Trees, Crops_Future, …)
        ///       → ExcludeFromNaturalSpawning set to true so they no longer
        ///         cause duplicate warnings or silently override primary sets.
        ///
        ///   GlobalDensityMultiplier == 0
        ///       → Set to 1.0.  A zero multiplier makes effectiveChance always 0,
        ///         so nothing ever spawns regardless of per-entry values.
        ///
        ///   SpawnWeight == 0
        ///       → Inferred from prefab category (tree≈3, rock≈2, bush≈4, debris≈1).
        ///         A zero weight makes the entry unreachable in weighted selection.
        ///
        ///   SpawnChance == 0
        ///       → Inferred from prefab category (tree≈0.35, rock≈0.22, bush≈0.45).
        ///         A zero chance makes the spawn roll always fail.
        ///
        ///   MinScale == 0 / MaxScale == 0
        ///       → Inferred from category.  Zero scale makes props invisible.
        ///
        ///   MaxScale &lt; MinScale
        ///       → Values are swapped.  An inverted range produces NaN or zero scale.
        ///
        /// What is NOT touched:
        ///   Sets already marked ExcludeFromNaturalSpawning=true (already opted out).
        ///   Entries with a null Prefab reference (skipped at runtime; removing them
        ///   is a designer decision, not an automated one).
        ///
        /// Safe to run multiple times — only dirty assets are written back.
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

            int setsAutoExcluded = 0; // support/future sets marked as excluded this run
            int setsAlreadyExcluded = 0; // already had ExcludeFromNaturalSpawning=true
            int setsFixed        = 0;
            int entriesFixed     = 0;
            int setsEmpty        = 0;
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

                    bool setDirty = false;

                    // ── Step 1: Auto-exclude known support / future / helper sets ────────
                    // Check name patterns BEFORE the already-excluded skip so we can
                    // auto-set the flag on sets that should be excluded but aren't yet.
                    if (!set.ExcludeFromNaturalSpawning && IsSupportSetName(set.name))
                    {
                        set.ExcludeFromNaturalSpawning = true;
                        setDirty = true;
                        setsAutoExcluded++;
                        report.AppendLine($"  AUTO-EXCLUDED: {set.name} (support/future set)");
                    }

                    // ── Step 2: Skip sets that are now (or were already) excluded ────────
                    if (set.ExcludeFromNaturalSpawning)
                    {
                        if (setDirty) // flag was just set above — save it
                        {
                            EditorUtility.SetDirty(set);
                            setsFixed++;
                        }
                        else
                        {
                            setsAlreadyExcluded++;
                        }
                        continue;
                    }

                    // ── Step 3: Fix set-level GlobalDensityMultiplier ────────────────────
                    // A multiplier of 0 collapses effectiveChance to 0 for every entry —
                    // the most common single cause of "Spawned 0 props".
                    if (set.GlobalDensityMultiplier <= 0f)
                    {
                        set.GlobalDensityMultiplier = 1f;
                        setDirty = true;
                        report.AppendLine($"  DENSITY FIX: {set.name}.GlobalDensityMultiplier → 1.0");
                    }

                    // ── Step 4: Fix per-entry values ─────────────────────────────────────
                    if (set.Entries == null || set.Entries.Count == 0)
                    {
                        setsEmpty++;
                        report.AppendLine($"  EMPTY: {set.name} — no entries (add prefabs in Inspector)");
                        if (setDirty)
                        {
                            EditorUtility.SetDirty(set);
                            setsFixed++;
                        }
                        continue;
                    }

                    foreach (BiomePropEntry e in set.Entries)
                    {
                        if (e == null) continue;

                        // Infer category-specific defaults from the prefab's filename
                        // so trees get tree-appropriate values, rocks get rock values, etc.
                        // Falls back to Misc defaults if the prefab is null or unrecognised.
                        Category cat = InferCategoryFromEntry(e);

                        bool entryDirty = false;

                        if (e.SpawnWeight <= 0f)
                        {
                            e.SpawnWeight = cat.DefaultSpawnWeight;
                            entryDirty = true;
                        }

                        if (e.SpawnChance <= 0f)
                        {
                            e.SpawnChance = cat.DefaultSpawnChance;
                            entryDirty = true;
                        }

                        if (e.MinScale <= 0f)
                        {
                            e.MinScale = cat.DefaultMinScale;
                            entryDirty = true;
                        }

                        if (e.MaxScale <= 0f)
                        {
                            e.MaxScale = cat.DefaultMaxScale;
                            entryDirty = true;
                        }

                        // Ensure min ≤ max; swap if inverted.
                        if (e.MinScale > e.MaxScale)
                        {
                            float tmp  = e.MinScale;
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
                        if (!report.ToString().Contains($"FIXED: {set.name}"))
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
                $"Sets scanned        : {guids.Length}\n" +
                $"Sets fixed          : {setsFixed}  ({entriesFixed} entries corrected)\n" +
                $"Auto-excluded (new) : {setsAutoExcluded} (support/future sets)\n" +
                $"Already excluded    : {setsAlreadyExcluded}\n" +
                $"Empty sets          : {setsEmpty} (no entries — add prefabs in Inspector)\n";

            if (report.Length > 0)
                summary += $"\nDetails:\n{report}";

            EditorUtility.DisplayDialog("Mystpath — Validate Biome Prop Sets", summary, "OK");
            Debug.Log($"[NaturePrefabGenerator] ValidateAndFixBiomePropSets: {summary.Replace('\n', ' ')}");
        }

        /// <summary>
        /// Returns true if <paramref name="setName"/> matches any pattern in
        /// <see cref="SupportSetNamePatterns"/> (case-insensitive).
        /// Used by <see cref="ValidateAndFixBiomePropSets"/> to auto-exclude
        /// support/future/helper sets from natural biome spawning.
        /// </summary>
        private static bool IsSupportSetName(string setName)
        {
            if (string.IsNullOrEmpty(setName)) return false;
            string lower = setName.ToLowerInvariant();
            foreach (string pattern in SupportSetNamePatterns)
                if (lower.Contains(pattern)) return true;
            return false;
        }

        /// <summary>
        /// Infers the spawn-default category for a <see cref="BiomePropEntry"/> by
        /// looking up the entry's prefab asset path and classifying its filename.
        /// Falls back to the Misc catch-all category when the prefab is null or
        /// the filename does not match any known keyword.
        /// </summary>
        private static Category InferCategoryFromEntry(BiomePropEntry entry)
        {
            if (entry.Prefab != null)
            {
                string assetPath = AssetDatabase.GetAssetPath(entry.Prefab);
                if (!string.IsNullOrEmpty(assetPath))
                {
                    string filename = Path.GetFileNameWithoutExtension(assetPath);
                    return ClassifyModel(filename);
                }
            }
            // Null prefab or unlocatable asset — use Misc defaults.
            return Categories[Categories.Length - 1];
        }

        // ─────────────────────────────────────────────────────────────────────

        [MenuItem("Tools/Mystpath/Create Default Biome Prop Sets")]
        private static void CreateDefaultBiomePropSets()
        {
            EnsureFolder("Assets/ScriptableObjects");
            EnsureFolder("Assets/ScriptableObjects/Nature");
            EnsureFolder(SoRoot);

            // Biomes to create sets for, together with their default density settings.
            //
            // Slot counts and density are tuned for a management/kingdom-builder camera
            // where biome identity must be readable from altitude on a ~200×200 hex world.
            //
            // Effective spawn chance per slot = entry.SpawnChance × density × globalDensity.
            // At the spawner's default globalDensity=1.5 and a typical entry SpawnChance=0.6:
            //   Forest:    7 slots × (0.6 × 1.2 × 1.5) ≈ 7 × 1.08 → ~6.5 props/hex (lush)
            //   Grassland: 5 slots × (0.6 × 1.0 × 1.5) ≈ 5 × 0.90 → ~4.5 props/hex
            //   Desert:    3 slots × (0.6 × 0.6 × 1.5) ≈ 3 × 0.54 → ~1.6 props/hex (sparse)
            //   Mountain:  4 slots × (0.6 × 0.8 × 1.5) ≈ 4 × 0.72 → ~2.9 props/hex
            //   Tundra:    3 slots × (0.6 × 0.6 × 1.5) ≈ 3 × 0.54 → ~1.6 props/hex (sparse)
            //   Swamp:     8 slots × (0.6 × 1.1 × 1.5) ≈ 8 × 0.99 → ~7.9 props/hex (dense)
            //
            // Biome identity hierarchy (most→least dense):  Swamp > Forest > Grassland > Mountain > Desert ≈ Tundra
            // Tune WorldPropSpawner._globalDensityMultiplier to shift all biomes together.
            var biomeDefaults = new (BiomeType biome, int slots, float density)[]
            {
                (BiomeType.Forest,    7, 1.2f),  // lush — trees dominate, clearly forested
                (BiomeType.Grassland, 5, 1.0f),  // adequately populated — not barren
                (BiomeType.Desert,    3, 0.6f),  // sparse — each cactus/rock stands out
                (BiomeType.Mountain,  4, 0.8f),  // rocky — enough boulders to read as highland
                (BiomeType.Tundra,    3, 0.6f),  // cold/sparse — mirrors desert feel
                (BiomeType.Swamp,     8, 1.1f),  // densest — overgrown, cluttered look
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
                shoreSet.SlotsPerHex            = 3;   // 3 slots gives distinct shoreline clutter
                shoreSet.GlobalDensityMultiplier = 0.75f; // lighter than land biomes, still visible
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
