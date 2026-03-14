using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Controls the physical locomotion of an NPC in the world.
    /// Receives movement commands from task execution logic and drives the NPC's
    /// transform toward a destination using the pathfinding system.
    /// Requires NpcEntity on the same GameObject.
    /// </summary>
    [RequireComponent(typeof(NpcEntity))]
    public class NpcMotor : MonoBehaviour
    {
        [Header("Movement Settings")]
        [Tooltip("Base movement speed in world units per second (modified by NpcStats.Agility).")]
        [SerializeField] private float _baseMoveSpeed = 3f;

        /// <summary>Whether the NPC is currently travelling toward a destination.</summary>
        public bool IsMoving { get; private set; }

        /// <summary>Current target world-space position.</summary>
        private Vector3 _targetPosition;

        // TODO: Cache NpcEntity reference and read Agility to modulate actual move speed
        // TODO: Integrate with hex-based pathfinding (custom A* over HexGrid)

        /// <summary>Commands the motor to begin moving to the given world position.</summary>
        public void MoveTo(Vector3 worldPosition)
        {
            _targetPosition = worldPosition;
            IsMoving = true;
            // TODO: Request a path from the pathfinding service
        }

        /// <summary>Immediately stops NPC movement and cancels any active path request.</summary>
        public void Stop()
        {
            IsMoving = false;
            // TODO: Cancel active pathfinding request
        }

        /// <summary>Called by the movement system when the NPC reaches its destination.</summary>
        private void OnDestinationReached()
        {
            IsMoving = false;
            // TODO: Notify the assigned task so it can begin work execution
        }

        private void Update()
        {
            if (!IsMoving) return;

            // TODO: Follow pathfinding waypoints rather than direct movement
            // Placeholder: step directly toward target
            transform.position = Vector3.MoveTowards(transform.position, _targetPosition, _baseMoveSpeed * Time.deltaTime);

            if (Vector3.Distance(transform.position, _targetPosition) < 0.05f)
                OnDestinationReached();
        }
    }
}
