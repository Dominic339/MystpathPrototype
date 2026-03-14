using System.Collections.Generic;

namespace Mystpath
{
    /// <summary>
    /// Scores task–NPC pairings to determine the best assignment for a given task.
    /// Takes into account NPC proximity, relevant skill levels, personal interests,
    /// and current need urgency. Higher scores indicate a better match.
    /// </summary>
    public class TaskScorer
    {
        /// <summary>
        /// Computes a fitness score for assigning the given NPC to the given task.
        /// Higher scores are preferred by the TaskAssignmentService.
        /// </summary>
        public float ScoreAssignment(TaskInstance task, NpcEntity npc)
        {
            float score = 0f;

            // TODO: Add skill match bonus (NPC proficiency in the relevant skill for task.TaskType)
            // TODO: Add interest weight bonus from npc.Interests matching task category
            // TODO: Subtract proximity penalty (distance from NPC to task.TargetHexCoord)
            // TODO: Subtract urgency penalty if NPC has critical needs that should be met first

            return score;
        }

        /// <summary>
        /// Finds and returns the best available NPC for the given task from the candidate list.
        /// Returns null if no suitable unassigned NPC is found.
        /// </summary>
        public NpcEntity FindBestAssignee(TaskInstance task, List<NpcEntity> candidates)
        {
            NpcEntity best = null;
            float bestScore = float.NegativeInfinity;

            foreach (NpcEntity npc in candidates)
            {
                if (!npc.AssignmentState.IsAvailable) continue;

                float score = ScoreAssignment(task, npc);
                if (score > bestScore)
                {
                    bestScore = score;
                    best = npc;
                }
            }

            return best;
        }
    }
}
