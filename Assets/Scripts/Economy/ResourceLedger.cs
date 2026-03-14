using System.Collections.Generic;

namespace Mystpath
{
    /// <summary>
    /// Tracks cumulative resource inflows and outflows for a kingdom over time.
    /// Used for economic reporting, trend display, and scheduling decisions.
    /// </summary>
    public class ResourceLedger
    {
        private readonly Dictionary<ResourceType, float> _totalGains = new Dictionary<ResourceType, float>();
        private readonly Dictionary<ResourceType, float> _totalLosses = new Dictionary<ResourceType, float>();

        /// <summary>Records a resource gain event (production, gathering, trade).</summary>
        public void RecordGain(ResourceType resource, float amount)
        {
            if (!_totalGains.ContainsKey(resource)) _totalGains[resource] = 0f;
            _totalGains[resource] += amount;
        }

        /// <summary>Records a resource loss event (consumption, construction, decay).</summary>
        public void RecordLoss(ResourceType resource, float amount)
        {
            if (!_totalLosses.ContainsKey(resource)) _totalLosses[resource] = 0f;
            _totalLosses[resource] += amount;
        }

        /// <summary>Returns the net flow for a resource type (total gains minus total losses).</summary>
        public float GetNetChange(ResourceType resource)
        {
            float gain = _totalGains.TryGetValue(resource, out float g) ? g : 0f;
            float loss = _totalLosses.TryGetValue(resource, out float l) ? l : 0f;
            return gain - loss;
        }

        // TODO: Add per-tick rolling average for economy trend display in UI
        // TODO: Add Reset() for per-period (e.g., per-day) window tracking
    }
}
