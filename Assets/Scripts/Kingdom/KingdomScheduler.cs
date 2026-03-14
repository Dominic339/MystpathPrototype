using System.Collections.Generic;

namespace Mystpath
{
    /// <summary>
    /// Converts prioritized kingdom needs into TaskInstances and assigns them to NPCs.
    /// Acts as the centralized work-assignment authority — NPCs do not self-schedule
    /// strategic decisions and rely entirely on the scheduler for task assignment.
    /// </summary>
    public class KingdomScheduler
    {
        private readonly TaskGenerator _taskGenerator;
        private readonly TaskAssignmentService _assignmentService;

        public KingdomScheduler()
        {
            _taskGenerator = new TaskGenerator();
            _assignmentService = new TaskAssignmentService();
        }

        /// <summary>
        /// Processes a list of evaluated kingdom needs and generates or updates tasks accordingly.
        /// Skips needs that already have sufficient open tasks to avoid redundant work orders.
        /// </summary>
        /// <param name="kingdom">The kingdom to schedule work for.</param>
        /// <param name="needs">Prioritized needs list from KingdomNeedEvaluator.</param>
        public void ScheduleWork(Kingdom kingdom, List<KingdomNeed> needs)
        {
            // TODO: Sort needs by priority (descending)
            // TODO: For each need, check existing active tasks to avoid duplicates
            // TODO: Generate new tasks for unaddressed needs via TaskGenerator
            // TODO: Register new tasks with TaskAssignmentService
            // TODO: Assign open tasks to available NPCs via TaskAssignmentService.TryAssignTask
        }
    }
}
