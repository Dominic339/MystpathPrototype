namespace Mystpath
{
    /// <summary>
    /// Broad category groupings for building types.
    /// Used for UI filtering, unlock progression routing, and task generation classification.
    /// </summary>
    public enum BuildingCategory
    {
        None = 0,
        Housing,        // Homes, barracks, dormitories
        Food,           // Farms, mills, cookhouses, granaries
        Production,     // Workshops, forges, sawmills
        Storage,        // Storehouses, warehouses, stockpiles
        Defense,        // Walls, towers, gatehouses
        Civic,          // Town halls, markets, schools
        Religious,      // Shrines, temples
        Infrastructure, // Roads, bridges, wells, docks
        // TODO: Add categories as the building design document is finalized
    }
}
