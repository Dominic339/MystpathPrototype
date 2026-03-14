using System;
using UnityEngine;

namespace Mystpath
{
    /// <summary>
    /// Represents a position in the hex grid using axial coordinates (Q, R).
    /// Immutable value type designed to be used as dictionary keys and equality comparisons.
    /// Uses flat-top hex orientation. Derive cube coordinate S as -Q - R when needed.
    /// </summary>
    [Serializable]
    public struct HexCoord : IEquatable<HexCoord>
    {
        /// <summary>Column axis of the axial coordinate system.</summary>
        public readonly int Q;

        /// <summary>Row axis of the axial coordinate system.</summary>
        public readonly int R;

        /// <summary>Derived cube coordinate. Always satisfies Q + R + S = 0.</summary>
        public int S => -Q - R;

        public HexCoord(int q, int r)
        {
            Q = q;
            R = r;
        }

        // Neighbor direction vectors in axial space for flat-top hex orientation.
        private static readonly HexCoord[] _directions = new HexCoord[]
        {
            new HexCoord( 1,  0),
            new HexCoord( 1, -1),
            new HexCoord( 0, -1),
            new HexCoord(-1,  0),
            new HexCoord(-1,  1),
            new HexCoord( 0,  1),
        };

        /// <summary>Returns an array of the six immediate neighbor coordinates (index 0–5).</summary>
        public HexCoord[] GetNeighbors()
        {
            HexCoord[] neighbors = new HexCoord[6];
            for (int i = 0; i < 6; i++)
                neighbors[i] = new HexCoord(Q + _directions[i].Q, R + _directions[i].R);
            return neighbors;
        }

        /// <summary>Returns the neighbor in a specific direction (0–5, wraps).</summary>
        public HexCoord GetNeighbor(int direction)
        {
            HexCoord dir = _directions[direction % 6];
            return new HexCoord(Q + dir.Q, R + dir.R);
        }

        /// <summary>Returns the hex-grid distance between this coord and another.</summary>
        public int DistanceTo(HexCoord other)
        {
            // Cube-distance formula: max of absolute differences across all three cube axes.
            return (Mathf.Abs(Q - other.Q) + Mathf.Abs(Q + R - other.Q - other.R) + Mathf.Abs(R - other.R)) / 2;
        }

        /// <summary>Converts axial coordinates to a Unity world-space position (XZ plane, flat-top layout).</summary>
        /// <param name="hexSize">Outer radius (center to vertex) of each hex in world units.</param>
        public Vector3 ToWorldPosition(float hexSize = 1f)
        {
            // TODO: Source hexSize from a global HexGridSettings asset rather than a parameter.
            float x = hexSize * (3f / 2f * Q);
            float z = hexSize * (Mathf.Sqrt(3f) / 2f * Q + Mathf.Sqrt(3f) * R);
            return new Vector3(x, 0f, z);
        }

        // --- Equality & Hashing ---

        public bool Equals(HexCoord other) => Q == other.Q && R == other.R;
        public override bool Equals(object obj) => obj is HexCoord other && Equals(other);

        public override int GetHashCode()
        {
            unchecked
            {
                return (Q * 397) ^ R;
            }
        }

        public override string ToString() => $"Hex({Q}, {R})";

        public static bool operator ==(HexCoord a, HexCoord b) => a.Equals(b);
        public static bool operator !=(HexCoord a, HexCoord b) => !a.Equals(b);
        public static HexCoord operator +(HexCoord a, HexCoord b) => new HexCoord(a.Q + b.Q, a.R + b.R);
        public static HexCoord operator -(HexCoord a, HexCoord b) => new HexCoord(a.Q - b.Q, a.R - b.R);
    }
}
