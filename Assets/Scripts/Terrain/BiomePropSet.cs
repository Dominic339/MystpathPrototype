using System.Collections.Generic;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// ScriptableObject that defines which props can spawn in a specific biome.
    /// One BiomePropSet asset per biome (plus optional shore-specific sets).
    ///
    /// Usage:
    ///   1. Create assets via the Unity menu:
    ///         Create → Mystpath → World → Biome Prop Set
    ///      Or run Tools/Mystpath/Create Default Biome Prop Sets to generate empty
    ///      assets for all primary biomes automatically.
    ///   2. Set <see cref="TargetBiome"/> to the biome this set controls.
    ///   3. Add <see cref="BiomePropEntry"/> entries — one per prop type.
    ///      Assign prefabs from Assets/Prefabs/Nature/ (use the NaturePrefabGenerator
    ///      tool to create them from raw models first).
    ///   4. Assign all sets to the WorldPropSpawner component's Biome Prop Sets list.
    ///
    /// The spawner runs deterministic placement: for each hex cell matching this
    /// biome, it evaluates <see cref="SlotsPerHex"/> candidate positions using
    /// a seeded hash. Each slot independently selects from <see cref="Entries"/>
    /// by weight and then checks <see cref="GlobalDensityMultiplier"/> × the
    /// entry's own <see cref="BiomePropEntry.SpawnChance"/> to decide whether to
    /// actually spawn a prop at that position.
    ///
    /// Shore handling:
    ///   Set <see cref="IsShoreSpecificSet"/> = true to create a set that applies
    ///   to shore cells across ALL biomes (IsShore == true), rather than to a
    ///   specific biome. Typical shore props: driftwood, reeds, small rocks.
    ///   Shore-specific sets are evaluated in addition to the primary biome set.
    ///
    /// Future:
    ///   TODO: Add a "regrowth timer" field to drive forester/managed-production rules.
    ///   TODO: Add slope filter (max slope angle from terrain normal) when terrain
    ///         normals are accessible.
    ///   TODO: Add season / climate modifiers when a season system is added.
    /// </summary>
    [CreateAssetMenu(
        menuName = "Mystpath/World/Biome Prop Set",
        fileName = "BiomePropSet_New")]
    public class BiomePropSet : ScriptableObject
    {
        // =====================================================================
        // Target
        // =====================================================================

        /// <summary>
        /// The biome this set applies to. Ignored when
        /// <see cref="IsShoreSpecificSet"/> is true.
        /// </summary>
        [Tooltip("Biome these props will spawn in. " +
                 "Ignored if IsShoreSpecificSet is checked.")]
        public BiomeType TargetBiome = BiomeType.Grassland;

        /// <summary>
        /// When true, this set is applied to ALL shore cells (IsShore == true)
        /// regardless of biome, in addition to the cell's primary biome set.
        /// Use for coastal props like driftwood, reeds, or beach rocks that
        /// should appear wherever land meets water.
        /// </summary>
        [Tooltip("If checked, spawns on shore cells of any biome (IsShore == true), " +
                 "in addition to the cell's own biome set. Use for coastal/shore props.")]
        public bool IsShoreSpecificSet = false;

        // =====================================================================
        // Prop Pool
        // =====================================================================

        /// <summary>
        /// The pool of props that can be selected for this biome.
        /// Each entry competes by weight; the winner is then checked against its
        /// per-entry <see cref="BiomePropEntry.SpawnChance"/>.
        /// </summary>
        [Tooltip("Props that can appear in this biome. Higher SpawnWeight = more frequent.")]
        public List<BiomePropEntry> Entries = new List<BiomePropEntry>();

        // =====================================================================
        // Density
        // =====================================================================

        /// <summary>
        /// Number of candidate spawn positions tested per hex cell.
        /// More slots produce denser coverage. Each slot independently passes
        /// or fails its spawn chance, so higher slot counts with low per-entry
        /// chances create natural spacing.
        ///
        /// Recommended values:
        ///   Dense forest  : 6–8
        ///   Grassland     : 3–4
        ///   Desert        : 1–2
        ///   Mountain      : 2–3
        /// </summary>
        [Tooltip("Candidate spawn positions tested per hex cell. " +
                 "More slots = denser world (modulated by per-entry SpawnChance).")]
        [Range(1, 8)]
        public int SlotsPerHex = 4;

        /// <summary>
        /// Multiplier applied to every entry's <see cref="BiomePropEntry.SpawnChance"/>
        /// in this set. Adjust to quickly scale the whole biome's density up or down
        /// without editing each entry individually.
        /// </summary>
        [Tooltip("Multiplier on per-entry SpawnChance. " +
                 "1.0 = use entry values as-is. 0 = nothing spawns.")]
        [Range(0f, 2f)]
        public float GlobalDensityMultiplier = 1f;

        // =====================================================================
        // Shore Handling
        // =====================================================================

        /// <summary>
        /// If true, this set also applies to shore cells of its own biome
        /// (cells where <c>HexCell.IsShore</c> is true). Set false if shore cells
        /// should only receive shore-specific props (from an <see cref="IsShoreSpecificSet"/>).
        /// </summary>
        [Tooltip("Whether shore cells of this biome receive this set's props. " +
                 "Often true — shore forest cells still have trees.")]
        public bool SpawnOnShoreCells = true;

        // =====================================================================
        // Managed-production Exclusion
        // =====================================================================

        /// <summary>
        /// When true, <see cref="WorldPropSpawner"/> ignores this set entirely.
        /// Use for sets that represent managed player-controlled production
        /// (e.g., crop fields, orchards) that must never appear as wild spawned props.
        ///
        /// Example: set this flag on any BiomePropSet whose name contains "Crops"
        /// or "Farm" to keep it out of natural world generation.
        /// </summary>
        [Tooltip("If checked, WorldPropSpawner skips this set entirely. " +
                 "Use for managed production sets (Crops_Future, Farm yields, etc.) " +
                 "that should not appear as wild props in the world.")]
        public bool ExcludeFromNaturalSpawning = false;
    }
}
