using System.Collections.Generic;

namespace Mystpath
{
    /// <summary>
    /// Creates TaskInstance objects in response to evaluated kingdom needs.
    /// Translates abstract need descriptors into concrete, actionable work orders
    /// with appropriate targeting, priority, and worker requirements.
    /// </summary>
    public class TaskGenerator
    {
        /// <summary>
        /// Generates a list of tasks appropriate for the given kingdom need.
        /// May return an empty list if the need cannot be addressed with currently
        /// available knowledge or resources.
        /// </summary>
        public List<TaskInstance> GenerateTasksForNeed(KingdomNeed need, Kingdom kingdom)
        {
            var tasks = new List<TaskInstance>();

            // TODO: Route by need.NeedCategory to appropriate factory methods
            // "Food"         → CreateGatherTask or CreateFarmTask
            // "Construction" → CreateConstructTask for queued buildings
            // "Resources"    → CreateGatherTask or CreateMineTask

            return tasks;
        }

        /// <summary>Creates a gather task targeting the given hex coordinate and resource type.</summary>
        public TaskInstance CreateGatherTask(HexCoord target, ResourceType resource, float priority)
        {
            // TODO: Validate that target hex is accessible and has the specified resource
            return new TaskInstance(TaskType.Gather, priority)
            {
                TargetHexCoord = target,
                TargetResourceType = resource,
            };
        }

        /// <summary>Creates a haul task to move resources from one location to another.</summary>
        public TaskInstance CreateHaulTask(HexCoord from, HexCoord to, ResourceType resource, float priority)
        {
            // TODO: Store source coord — either add a SourceHexCoord field to TaskInstance
            //       or create a HaulTaskPayload subclass for haul-specific data.
            return new TaskInstance(TaskType.Haul, priority)
            {
                TargetHexCoord = to,
                TargetResourceType = resource,
            };
        }

        /// <summary>Creates a construction task for the specified building instance.</summary>
        public TaskInstance CreateConstructTask(BuildingInstance building, float priority)
        {
            // TODO: Set RequiredWorkerCount from building definition worker slots
            return new TaskInstance(TaskType.Construct, priority)
            {
                TargetBuildingId = building.InstanceId,
            };
        }
    }
}
