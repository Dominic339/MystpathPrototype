using System.IO;
using UnityEditor;
using UnityEngine;
using Mystpath; // HarvestableProp

namespace Mystpath.Editor
{
    /// <summary>
    /// Editor utility that normalizes the root transform and CapsuleCollider settings
    /// on every prefab under <see cref="NaturePrefabRoot"/>.
    ///
    /// Access via:
    ///   Tools → Mystpath → Normalize Nature Prefabs
    ///
    /// ── Why normalization is needed ─────────────────────────────────────────────
    ///
    ///   Nature models are authored in various DCC tools (Blender, Maya, etc.) that
    ///   may use Z-up or Y-up coordinate systems and different working units. When
    ///   imported into Unity without a consistent convention, each prefab arrives with
    ///   a different root rotation and scale, which means:
    ///     • Props appear at wildly different sizes in the world.
    ///     • WorldPropSpawner's yaw-only rotation (yaw × prefab.transform.rotation)
    ///       produces incorrect results when the prefab base rotation is non-standard.
    ///     • Colliders end up at arbitrary sizes, creating huge invisible blocking
    ///       volumes or missing pick targets entirely.
    ///
    ///   This tool permanently bakes a single agreed-upon convention into every
    ///   prefab asset so that all downstream systems (spawner, density tuning,
    ///   collider physics) behave predictably and consistently.
    ///
    /// ── Normalization rules applied ─────────────────────────────────────────────
    ///
    ///   1. Root Transform Rotation → (-90, 0, 0) local degrees
    ///      Corrects for Blender FBX Z-up export, which places models lying flat
    ///      in Unity. After normalization every prop stands upright at the origin
    ///      before any runtime rotation is applied. WorldPropSpawner then composes
    ///      a random yaw on top of this base rotation:
    ///        finalRotation = Quaternion.AngleAxis(rotY, Vector3.up) × prefab.rotation
    ///      This only works correctly when prefab.rotation IS the axis-correction
    ///      and nothing else — which this tool guarantees.
    ///
    ///   2. Root Transform Scale → (5, 5, 5)
    ///      Sets a baseline asset scale tuned for the Mystpath world where hex cells
    ///      are 1 Unity unit across and the intended camera is a kingdom-builder
    ///      management view at altitude 150–250 units. Combined with the spawner's
    ///      _globalScaleMultiplier (default 3.5) the effective world scale becomes
    ///      17.5× the raw model unit size, which is appropriate for typical nature
    ///      models authored at centimetre scale (a 1 cm tree → 17.5 cm world tree
    ///      at hex_size=1 is intentionally large for management-camera silhouette
    ///      readability). Designers can adjust _globalScaleMultiplier without
    ///      re-running this tool.
    ///
    ///   3. CapsuleCollider → Center (0, 0, 0.005)  Radius 0.01  Height 0.01  Dir Y
    ///      Derived from the working reference prefab (Bush_1). A very small
    ///      normalised footprint rather than a collider that wraps the full mesh.
    ///      Rationale:
    ///        • Terrain occlusion and player movement blocking is handled by the
    ///          terrain MeshCollider, not by individual prop colliders.
    ///        • These colliders serve as lightweight pick/raycast targets for the
    ///          future harvesting UI (click prop → begin harvest action).
    ///        • A tiny footprint prevents props from acting as walls for NPC
    ///          pathfinding before a proper avoidance system is added.
    ///
    /// ── Safety guarantees ───────────────────────────────────────────────────────
    ///
    ///   • Only the ROOT transform and ROOT CapsuleCollider are modified.
    ///     Child GameObjects, MeshRenderer, MeshFilter, HarvestableProp, and all
    ///     other components are preserved.
    ///   • BoxColliders (used by rocks, debris, ore outcrops) are left untouched —
    ///     only CapsuleColliders are in scope per the reference configuration.
    ///   • A CapsuleCollider is only ADDED if the prefab has a HarvestableProp
    ///     component and no CapsuleCollider already exists. Non-harvestable props
    ///     (grass, ambient filler) do not receive a collider.
    ///   • Idempotent: already-normalised prefabs are processed again but produce
    ///     no observable change — safe to re-run after adding new models.
    ///   • Pure editor utility: no runtime MonoBehaviour, no Update loop, no cost
    ///     in built player or during Play Mode.
    /// </summary>
    public static class NaturePrefabNormalizer
    {
        // Folder scanned recursively for .prefab assets.
        // Must match the output folder used by NaturePrefabGenerator.
        private const string NaturePrefabRoot = "Assets/Prefabs/Nature";

        // ── Target root transform values ─────────────────────────────────────
        // These match the manually-verified working reference (Bush_1).
        // Rotation corrects DCC Z-up export; scale sets the management-camera
        // baseline. See class summary for full rationale.
        private static readonly Vector3 TargetRotationEuler = new Vector3(-90f, 0f, 0f);
        private static readonly Vector3 TargetScale         = new Vector3(5f, 5f, 5f);

        // ── Target CapsuleCollider values ────────────────────────────────────
        // Tiny normalised footprint. See class summary for rationale.
        private static readonly Vector3 ColliderCenter    = new Vector3(0f, 0f, 0.005f);
        private const           float   ColliderRadius    = 0.01f;
        private const           float   ColliderHeight    = 0.01f;
        // CapsuleCollider.direction: 0 = X-Axis  1 = Y-Axis  2 = Z-Axis
        private const           int     ColliderDirection = 1; // Y-Axis

        // =====================================================================
        // Menu Entry Point
        // =====================================================================

        [MenuItem("Tools/Mystpath/Normalize Nature Prefabs")]
        private static void NormalizeNaturePrefabs()
        {
            // Early-out with a friendly message if the prefab folder does not yet exist.
            // This happens when GenerateNaturePrefabs has not been run yet.
            if (!AssetDatabase.IsValidFolder(NaturePrefabRoot))
            {
                EditorUtility.DisplayDialog(
                    "Mystpath — Normalize Nature Prefabs",
                    $"Prefab folder not found:\n  {NaturePrefabRoot}\n\n" +
                    "Run Tools → Mystpath → Generate Nature Prefabs first " +
                    "to create the prefabs, then normalise them.",
                    "OK");
                return;
            }

            // Find every .prefab asset under the nature prefab root (recursive).
            string[] guids = AssetDatabase.FindAssets("t:Prefab", new[] { NaturePrefabRoot });

            if (guids.Length == 0)
            {
                EditorUtility.DisplayDialog(
                    "Mystpath — Normalize Nature Prefabs",
                    $"No prefab assets found in:\n  {NaturePrefabRoot}\n\n" +
                    "Run Tools → Mystpath → Generate Nature Prefabs first.",
                    "OK");
                return;
            }

            int processed      = 0;
            int collidersAdded = 0;
            int failed         = 0;

            try
            {
                for (int i = 0; i < guids.Length; i++)
                {
                    string assetPath = AssetDatabase.GUIDToAssetPath(guids[i]);

                    EditorUtility.DisplayProgressBar(
                        "Mystpath — Normalizing Nature Prefabs",
                        $"{Path.GetFileName(assetPath)}  ({i + 1} / {guids.Length})",
                        (float)i / guids.Length);

                    bool colliderAdded;
                    bool ok = NormalizePrefab(assetPath, out colliderAdded);

                    if (ok)
                    {
                        processed++;
                        if (colliderAdded) collidersAdded++;
                    }
                    else
                    {
                        failed++;
                        Debug.LogWarning(
                            $"[NaturePrefabNormalizer] Failed to normalize: {assetPath}");
                    }
                }
            }
            finally
            {
                // Always clear progress and flush assets — even if an exception occurred.
                EditorUtility.ClearProgressBar();
                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();
            }

            string summary =
                $"Normalization complete.\n\n" +
                $"Prefabs found       : {guids.Length}\n" +
                $"Normalized OK       : {processed}\n" +
                $"Colliders added     : {collidersAdded}  (harvestable props without one)\n" +
                $"Failed              : {failed}\n\n" +
                $"Folder scanned:\n  {NaturePrefabRoot}\n\n" +
                $"Settings applied:\n" +
                $"  Rotation  : {TargetRotationEuler}\n" +
                $"  Scale     : {TargetScale}\n" +
                $"  Collider  : Center={ColliderCenter}  " +
                $"R={ColliderRadius}  H={ColliderHeight}  Dir=Y\n\n" +
                "Re-run any time after adding new nature models to keep assets consistent.";

            EditorUtility.DisplayDialog(
                "Mystpath — Normalize Nature Prefabs", summary, "OK");

            Debug.Log(
                $"[NaturePrefabNormalizer] Done: {processed}/{guids.Length} normalized " +
                $"({collidersAdded} colliders added, {failed} failed). " +
                $"Rotation={TargetRotationEuler}  Scale={TargetScale}");
        }

        // =====================================================================
        // Per-Prefab Normalization
        // =====================================================================

        /// <summary>
        /// Opens the prefab at <paramref name="assetPath"/> in an isolated prefab
        /// editing context, applies all normalization rules to the root GameObject,
        /// and saves the result back to disk.
        ///
        /// Uses Unity's <c>PrefabUtility.LoadPrefabContents</c> / <c>SaveAsPrefabAsset</c>
        /// / <c>UnloadPrefabContents</c> pattern (Unity 2018.3+) so changes are written
        /// directly to the prefab asset without needing to instantiate it in a scene.
        /// </summary>
        /// <param name="assetPath">Project-relative path, e.g. "Assets/Prefabs/Nature/Trees/Oak_1.prefab".</param>
        /// <param name="colliderAdded">Set to true if a new CapsuleCollider was added to the root.</param>
        /// <returns>True if the prefab was loaded, modified, and saved successfully.</returns>
        private static bool NormalizePrefab(string assetPath, out bool colliderAdded)
        {
            colliderAdded = false;

            // LoadPrefabContents opens the prefab into a special hidden editing scene.
            // It returns the root GameObject of that prefab. Any changes made here are
            // NOT committed until SaveAsPrefabAsset is called — UnloadPrefabContents
            // must always be called afterward to release the editing scene.
            GameObject root = PrefabUtility.LoadPrefabContents(assetPath);
            if (root == null) return false;

            try
            {
                // ── Rule 1: Root Transform ────────────────────────────────────
                // Rotation and scale only. Position is left untouched because
                // prefab root position is (0,0,0) by convention and we don't
                // want to accidentally move a prefab that was saved with an offset.
                //
                // localRotation / localScale are used (not world-space equivalents)
                // because the prefab root has no parent — local == world for roots,
                // but using local* makes the intent explicit and avoids ambiguity.
                root.transform.localRotation = Quaternion.Euler(TargetRotationEuler);
                root.transform.localScale    = TargetScale;

                // ── Rule 2: CapsuleCollider on root ───────────────────────────
                // Only the ROOT's CapsuleCollider is in scope — child colliders
                // are not touched. BoxColliders (rocks, ore outcrops, debris) are
                // also not touched; only CapsuleCollider is normalised to match
                // the working Bush_1 reference configuration.

                CapsuleCollider capsule = root.GetComponent<CapsuleCollider>();

                if (capsule == null)
                {
                    // Add a CapsuleCollider only if the root carries a HarvestableProp.
                    // Non-harvestable props (Grass, ambient Misc) are used for visual
                    // filler only and don't need a pick collider.
                    bool hasHarvestable = root.GetComponent<HarvestableProp>() != null;
                    if (hasHarvestable)
                    {
                        capsule       = root.AddComponent<CapsuleCollider>();
                        colliderAdded = true;
                    }
                }

                // Apply normalised values to any CapsuleCollider present (existing or new).
                if (capsule != null)
                {
                    capsule.center    = ColliderCenter;
                    capsule.radius    = ColliderRadius;
                    capsule.height    = ColliderHeight;
                    capsule.direction = ColliderDirection; // Y-Axis
                }

                // ── Rule 3: Save ──────────────────────────────────────────────
                // Writes the modified root back to the prefab asset on disk.
                // The bool overload is used so we can detect and report save failures.
                bool savedOk;
                PrefabUtility.SaveAsPrefabAsset(root, assetPath, out savedOk);
                return savedOk;
            }
            finally
            {
                // UnloadPrefabContents MUST be called in a finally block.
                // If this is skipped after a LoadPrefabContents call, the hidden
                // editing scene leaks and subsequent calls to LoadPrefabContents on
                // the same asset within the same editor session will fail.
                PrefabUtility.UnloadPrefabContents(root);
            }
        }
    }
}
