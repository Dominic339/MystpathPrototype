namespace Mystpath
{
    /// <summary>
    /// Tracks the lifecycle status of a TaskInstance from creation through completion.
    /// Status transitions are managed by TaskAssignmentService and task execution logic.
    /// </summary>
    public enum TaskStatus
    {
        Pending,        // Created but not yet assigned to any NPC
        Assigned,       // Assigned to one or more NPCs; NPC(s) are travelling to site
        InProgress,     // At least one assigned NPC is actively working the task
        Completed,      // Task successfully finished
        Failed,         // Task could not be completed (e.g., resource depleted, building destroyed)
        Cancelled,      // Explicitly cancelled by the KingdomScheduler
    }
}
