using System;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// The primary component representing a single NPC in the world.
    /// Holds references to all NPC subsystem data (stats, needs, skills, interests,
    /// assignment state) and bridges simulation data with physical scene presence.
    /// NPCs do not plan globally; they receive work from the KingdomScheduler.
    /// </summary>
    public class NpcEntity : MonoBehaviour
    {
        /// <summary>Stable unique identifier for this NPC (safe for save/load and future networking).</summary>
        public string NpcId { get; private set; }

        /// <summary>Player-visible display name of this NPC.</summary>
        public string DisplayName;

        // --- Subsystem Data ---

        /// <summary>Physical and derived stats (health, strength, age, etc.).</summary>
        public NpcStats Stats = new NpcStats();

        /// <summary>Current need levels (hunger, rest, social, shelter).</summary>
        public NpcNeeds Needs = new NpcNeeds();

        /// <summary>Learned skills and their proficiency levels.</summary>
        public NpcSkills Skills = new NpcSkills();

        /// <summary>Personal interests that influence task assignment scoring.</summary>
        public NpcInterests Interests = new NpcInterests();

        /// <summary>Current work assignment (task ID, transit state, availability).</summary>
        public NpcAssignmentState AssignmentState = new NpcAssignmentState();

        // --- Scene Components ---

        /// <summary>Motor component driving physical movement and locomotion.</summary>
        public NpcMotor Motor { get; private set; }

        // --- Ownership ---

        /// <summary>The stable ID of the kingdom this NPC belongs to.</summary>
        public string OwningKingdomId;

        // TODO: Add runtime reference to owning Kingdom object (set by KingdomManager at spawn)

        private void Awake()
        {
            NpcId = Guid.NewGuid().ToString();
            Motor = GetComponent<NpcMotor>();
        }
    }
}
