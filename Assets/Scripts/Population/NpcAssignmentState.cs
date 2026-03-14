using System;

namespace Mystpath
{
    /// <summary>
    /// Tracks the current work assignment of an NPC: what task they are assigned to,
    /// whether they are in transit to the work site, and whether they are available
    /// for a new assignment.
    /// </summary>
    [Serializable]
    public class NpcAssignmentState
    {
        /// <summary>The ID of the task currently assigned to this NPC. Null or empty if unassigned.</summary>
        public string AssignedTaskId;

        /// <summary>Whether the NPC is travelling to its assigned task location.</summary>
        public bool IsInTransit;

        /// <summary>True when the NPC has no task assigned and is available for scheduling.</summary>
        public bool IsAvailable => string.IsNullOrEmpty(AssignedTaskId);

        // TODO: Add reservation timeout so stalled assignments don't block task completion
        // TODO: Support a secondary queued task for seamless reassignment on current task completion

        /// <summary>Assigns this NPC to the given task and marks them as in transit.</summary>
        public void AssignToTask(string taskId)
        {
            AssignedTaskId = taskId;
            IsInTransit = true;
        }

        /// <summary>Clears the current assignment and marks the NPC as available.</summary>
        public void ClearAssignment()
        {
            AssignedTaskId = null;
            IsInTransit = false;
        }
    }
}
