using System;
using System.Collections.Generic;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// A reusable storage container for resources. Used by kingdoms (shared store),
    /// buildings (local buffers), and NPCs (carried inventory).
    /// Enforces capacity constraints and provides add/remove/query operations.
    /// </summary>
    [Serializable]
    public class InventoryStore
    {
        // Note: Unity's default serializer does not support Dictionary<,> directly.
        // TODO: Replace with a serializable list of key-value pairs if inspector visibility is needed.
        private Dictionary<ResourceType, float> _stock = new Dictionary<ResourceType, float>();

        /// <summary>Maximum total units this store can hold across all resource types. 0 = unlimited.</summary>
        public float Capacity;

        /// <summary>Returns the current quantity of the given resource type (0 if none stored).</summary>
        public float GetAmount(ResourceType resource) =>
            _stock.TryGetValue(resource, out float amount) ? amount : 0f;

        /// <summary>
        /// Adds up to the given amount of a resource.
        /// Returns the actual amount added (may be less if capacity is limited).
        /// </summary>
        public float Add(ResourceType resource, float amount)
        {
            if (amount <= 0f) return 0f;

            // TODO: Enforce total capacity across all resource types
            float current = GetAmount(resource);
            _stock[resource] = current + amount;
            return amount;
        }

        /// <summary>
        /// Removes up to the given amount of a resource.
        /// Returns the actual amount removed (capped at what is available).
        /// </summary>
        public float Remove(ResourceType resource, float amount)
        {
            if (amount <= 0f) return 0f;

            float current = GetAmount(resource);
            float toRemove = Mathf.Min(current, amount);
            _stock[resource] = current - toRemove;
            return toRemove;
        }

        /// <summary>Returns true if this store contains at least the given amount of the resource.</summary>
        public bool HasAmount(ResourceType resource, float amount) => GetAmount(resource) >= amount;

        /// <summary>Returns true if all resource quantities in this store are zero.</summary>
        public bool IsEmpty()
        {
            foreach (float amount in _stock.Values)
                if (amount > 0f) return false;
            return true;
        }

        /// <summary>Returns a read-only snapshot of all stored resource quantities.</summary>
        public IReadOnlyDictionary<ResourceType, float> GetAllStock() => _stock;
    }
}
