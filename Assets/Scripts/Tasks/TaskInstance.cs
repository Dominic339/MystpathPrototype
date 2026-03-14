using System;
using System.Collections.Generic;

namespace Mystpath
{
    /// <summary>
    /// Represents a single unit of work within the kingdom's task system.
    /// Tasks are first-class objects: created by TaskGenerator, scored by TaskScorer,
    /// assigned by TaskAssignmentService, and executed by NPC behavior logic.
    /// Uses a stable ID for serialization and future networking compatibility.
    /// </summary>
    [Serializable]
    public class TaskInstance
    {
        /// <summary>Stable unique identifier for this task instance.</summary>
        public string TaskId { get; private set; }

        /// <summary>The category of work this task represents.</summary>
        public TaskType TaskType;

        /// <summary>Current lifecycle status of this task.</summary>
        public TaskStatus Status = TaskStatus.Pending;

        /// <summary>Scheduling priority. Higher values are assigned before lower ones.</summary>
        public float Priority;

        // --- Targeting ---

        /// <summary>Target hex coordinate for location-based tasks (gather, mine, chop, etc.).</summary>
        public HexCoord? TargetHexCoord;

        /// <summary>Target building instance ID for building-related tasks (construct, craft, etc.).</summary>
        public string TargetBuildingId;

        /// <summary>Resource type this task involves, if applicable.</summary>
        public ResourceType? TargetResourceType;

        // --- Worker Requirements ---

        /// <summary>Number of NPC workers required to execute this task.</summary>
        public int RequiredWorkerCount = 1;

        /// <summary>Stable NPC IDs currently assigned or reserved for this task.</summary>
        public List<string> AssignedNpcIds = new List<string>();

        // TODO: Add estimated completion progress (0–1) for UI display
        // TODO: Add prerequisite task IDs to support dependency chains
        // TODO: Add expiry tick after which the task auto-cancels if unstarted

        public TaskInstance(TaskType taskType, float priority = 1f)
        {
            TaskId = Guid.NewGuid().ToString();
            TaskType = taskType;
            Priority = priority;
        }
    }
}
