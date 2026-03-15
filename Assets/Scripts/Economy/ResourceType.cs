namespace Mystpath
{
    /// <summary>
    /// Defines all resource types tracked by the Mystpath economy.
    /// Resources are produced, stored, consumed, and transported by the kingdom.
    ///
    /// Resource categories and their intended acquisition paths:
    ///
    ///   Underground / Extractor Materials
    ///     Discovered by surveying, extracted by quarries and mines.
    ///     These are the resources seeded into HiddenResourceWeights on each cell.
    ///
    ///   Surface Raw Materials
    ///     Harvested from visible world props (trees, rock outcrops, ore veins).
    ///     Props are spawned by PropSpawner; one-time or slowly regrowing.
    ///     NOT generated as hidden underground values.
    ///
    ///   Managed / Renewable Production
    ///     Produced by player-built facilities: farms, foresters, orchards, fisheries.
    ///     Output rates are determined by building level and cell fertility.
    ///     NOT generated as hidden underground values.
    ///
    ///   Processed Goods
    ///     Crafted from raw materials at workshops and production buildings.
    ///
    ///   Food
    ///     Supplied exclusively by surface or managed sources (farms, fisheries,
    ///     hunting camps, orchards). Never underground. Listed here as economy
    ///     types but not used in HiddenResourceWeights.
    /// </summary>
    public enum ResourceType
    {
        None = 0,

        // ----------------------------------------------------------------
        // Surface Raw Materials
        // Harvested from visible world props. NOT seeded as hidden resources.
        //   Sources: trees (Wood), rock outcrops (Stone), ore veins (Copper/Tin/etc.)
        //   Future: PropSpawner will place the corresponding world objects.
        // ----------------------------------------------------------------

        Wood,           // from tree props — one-time or forester-managed
        Stone,          // from rock outcrop props; also a common mine byproduct

        // ----------------------------------------------------------------
        // Underground / Extractor Materials
        // Seeded into HexCell.HiddenResourceWeights during world generation.
        // Revealed by surveying; extracted by quarry, mine, or well buildings.
        // ----------------------------------------------------------------

        Clay,           // shallow — alluvial deposits, swamp/grassland lowlands
        Copper,         // common metal ore — forest, hills, light mountain
        Tin,            // common metal ore — pairs with Copper for Bronze
        Iron,           // mid-tier ore — mountain foothills, tundra
        Coal,           // fuel ore — mid-mountain and tundra belts
        Silver,         // precious — high mountain, rare desert veins
        Gold,           // precious — high mountain peaks, very rare
        MysticOre,      // magical trace mineral — rare; unlocked by Mystpath progression

        // ----------------------------------------------------------------
        // Processed Goods
        // Produced at workshops from raw or extracted materials.
        // ----------------------------------------------------------------

        Lumber,         // processed Wood (sawmill)
        Brick,          // fired Clay (kiln)
        Metal,          // smelted Copper / Tin / Iron (smelter)
        Cloth,          // woven Fiber (loom)  — Fiber from surface props / managed flax
        Tools,          // crafted Metal + Wood (workshop)
        Fiber,          // raw plant fiber — from surface props (reeds, flax)

        // ----------------------------------------------------------------
        // Food — Managed / Surface Sources ONLY
        // Supplied by farms, fisheries, orchards, and hunting camps.
        // Listed here as economy types for ledger/storage tracking.
        // NOT seeded into HiddenResourceWeights; not underground.
        // ----------------------------------------------------------------

        RawFood,        // unprocessed food from any managed/surface source
        CookedFood,     // prepared at cookhouses; improves satisfaction
        Grain,          // farm crop — wheat, rye, barley; requires arable land
        Fish,           // caught by fishery buildings on coast/lake hexes

        // TODO: Expand resource types as economy and production systems mature
        //       Candidates: Salt, Gems, Marble, Sulphur, Herbs, Pelts
    }
}
