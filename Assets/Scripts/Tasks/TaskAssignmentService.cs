using System.Collections.Generic;

namespace Mystpath
{
    /// <summary>
    /// Manages the full lifecycle of task assignments. Tracks active tasks,
    /// orchestrates scoring and reservation, and handles cancellation with
    /// proper NPC state cleanup. Called by KingdomScheduler each tick.
    /// </summary>
    public class TaskAssignmentService
    {
        private readonly TaskScorer _scorer = new TaskScorer();

        /// <summary>All tasks currently being tracked by this service.</summary>
        private readonly List<TaskInstance> _activeTasks = new List<TaskInstance>();

        /// <summary>Registers a newly generated task for tracking and assignment processing.</summary>
        public void RegisterTask(TaskInstance task)
        {
            _activeTasks.Add(task);
        }

        /// <summary>
        /// Attempts to assign the given task to the best available NPC from the candidate pool.
        /// Returns true if an assignee was found and the assignment was made.
        /// </summary>
        public bool TryAssignTask(TaskInstance task, List<NpcEntity> availableNpcs)
        {
            NpcEntity assignee = _scorer.FindBestAssignee(task, availableNpcs);
            if (assignee == null) return false;

            assignee.AssignmentState.AssignToTask(task.TaskId);
            task.AssignedNpcIds.Add(assignee.NpcId);
            task.Status = TaskStatus.Assigned;

            // TODO: Command NPC motor to travel to task.TargetHexCoord world position
            return true;
        }

        /// <summary>
        /// Cancels the given task and releases all assigned NPCs back to available state.
        /// </summary>
        public void CancelTask(TaskInstance task, Kingdom kingdom)
        {
            task.Status = TaskStatus.Cancelled;

            foreach (string npcId in task.AssignedNpcIds)
            {
                // TODO: Look up NPC by npcId from kingdom.Population and call ClearAssignment()
            }

            task.AssignedNpcIds.Clear();
            _activeTasks.Remove(task);
        }

        /// <summary>Returns a read-only view of all currently tracked active tasks.</summary>
        public IReadOnlyList<TaskInstance> GetActiveTasks() => _activeTasks.AsReadOnly();
    }
}
