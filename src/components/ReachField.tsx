import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { Campaign } from '../lib/types';
import { fmt } from '../lib/format';

/**
 * Reach Field — every campaign in the current result set as one point.
 *
 *   x  time (oldest left)     y  reach, log10     z  industry lane
 *   size  engagement          colour  industry
 *
 * This is a view of the data, not a decoration: the points are always exactly
 * what the query returned, hovering names the campaign, clicking opens it. It
 * answers the one question the grid cannot — where is the portfolio thin? A
 * lane with nothing in its upper half is a vertical with no big proof point,
 * visible in a glance instead of after twenty searches.
 *
 * Rendered as a single InstancedMesh: 1,700 individual meshes would drop the
 * frame rate through the floor.
 */

const Y_FLOOR = 3;      // log10(1K)
const Y_SCALE = 2.1;
const X_SPAN = 34;      // wide enough that a year of work does not pile up
const LANE_GAP = 1.05;


interface Node {
  c: Campaign; x: number; y: number; z: number; s: number;
  colour: THREE.Color;
  /** Unclassified rows are 40% of the archive and would otherwise be the
   *  loudest thing on screen; they are drawn small and dim instead. */
  dim: boolean;
}

function Field({
  nodes, lanes, decades, onPick, spin,
}: {
  nodes: Node[];
  lanes: string[];
  decades: number[];
  onPick: (c: Campaign) => void;
  spin: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const [hover, setHover] = useState<number | null>(null);

  // Write every instance's transform and colour once per data change.
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const dummy = new THREE.Object3D();
    nodes.forEach((n, i) => {
      dummy.position.set(n.x, n.y, n.z);
      dummy.scale.setScalar(n.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, n.colour);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.count = nodes.length;
  }, [nodes]);

  useFrame((_, dt) => {
    if (group.current && spin && hover === null) group.current.rotation.y += dt * 0.05;
  });

  const hovered = hover !== null ? nodes[hover] : null;

  return (
    <group ref={group}>
      {/* reach decades as floor rings, so height reads as a real quantity */}
      {decades.map((exp) => (
        <group key={exp} position={[0, (exp - Y_FLOOR) * Y_SCALE, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[18.2, 18.3, 96]} />
            <meshBasicMaterial color="#55556E" transparent opacity={0.22} side={THREE.DoubleSide} />
          </mesh>
          <Html position={[18.8, 0, 0]} center style={{ pointerEvents: 'none' }}>
            <span style={{
              font: '600 10px/1 Bricolage Grotesque, sans-serif',
              color: '#7C7C8C', whiteSpace: 'nowrap',
            }}>{fmt(10 ** exp)}</span>
          </Html>
        </group>
      ))}

      {/* industry lanes */}
      {lanes.map((name, i) => {
        const z = (i - (lanes.length - 1) / 2) * LANE_GAP;
        return (
          <Line
            key={name}
            points={[[-X_SPAN / 2, 0, z], [X_SPAN / 2, 0, z]]}
            color="#2A2A32" lineWidth={1} transparent opacity={0.6}
          />
        );
      })}

      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, Math.max(nodes.length, 1)]}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          if (e.instanceId !== undefined) {
            setHover(e.instanceId);
            document.body.style.cursor = 'pointer';
          }
        }}
        onPointerOut={() => { setHover(null); document.body.style.cursor = ''; }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          if (e.instanceId !== undefined) onPick(nodes[e.instanceId].c);
        }}
      >
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {hovered && (
        <>
          {/* a drop line makes the height readable against the rings */}
          <Line
            points={[[hovered.x, 0, hovered.z], [hovered.x, hovered.y, hovered.z]]}
            color="#FF3427" lineWidth={1.5} transparent opacity={0.7}
          />
          <Html position={[hovered.x, hovered.y + 0.55, hovered.z]} center style={{ pointerEvents: 'none' }}>
            <div className="field__tip">
              <b>{hovered.c.client}</b> · {fmt(hovered.c.reach)} reach
            </div>
          </Html>
        </>
      )}
    </group>
  );
}

/** Probed once: without WebGL the canvas would throw rather than render. */
function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl')),
    );
  } catch { return false; }
}

export default function ReachField({
  items, colourOf, onPick,
}: {
  items: Campaign[];
  colourOf: (c: Campaign) => string;
  onPick: (c: Campaign) => void;
}) {
  const reduced = typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [webgl] = useState(hasWebGL);

  const lanes = useMemo(
    () => [...new Set(items.map((c) => (c.isVertical ? c.industry : 'Unclassified')))].sort(),
    [items],
  );

  const nodes = useMemo<Node[]>(() => {
    const plot = items.filter((c) => c.reach !== null && c.reach > 0 && c.date);
    if (!plot.length) return [];
    const times = plot.map((c) => Date.parse(c.date));
    const lo = Math.min(...times);
    const span = Math.max(1, Math.max(...times) - lo);
    return plot.map((c) => {
      const lane = lanes.indexOf(c.isVertical ? c.industry : 'Unclassified');
      const dim = !c.isVertical;
      const base = new THREE.Color(colourOf(c));
      return {
        c,
        x: ((Date.parse(c.date) - lo) / span - 0.5) * X_SPAN,
        y: Math.max(0.04, (Math.log10(c.reach as number) - Y_FLOOR) * Y_SCALE),
        z: (lane - (lanes.length - 1) / 2) * LANE_GAP,
        // Engagement drives size, but gently — a point is a mark, not a bubble.
        s: (dim ? 0.028 : 0.05) + Math.min(0.075, Math.log10((c.eng ?? 100) + 1) / 105),
        colour: dim ? base.multiplyScalar(0.34) : base,
        dim,
      };
    });
  }, [items, lanes, colourOf]);

  // Only draw the decades the result set actually occupies, and aim the camera
  // at the middle of that band — otherwise the cloud floats in the top third of
  // the frame above a large empty floor.
  const { decades, centre } = useMemo(() => {
    if (!nodes.length) return { decades: [] as number[], centre: 4 };
    const ys = nodes.map((n) => n.y);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const expLo = Math.max(3, Math.floor(lo / Y_SCALE + Y_FLOOR));
    const expHi = Math.min(10, Math.ceil(hi / Y_SCALE + Y_FLOOR));
    const out: number[] = [];
    for (let e = expLo; e <= expHi; e++) out.push(e);
    return { decades: out, centre: (lo + hi) / 2 };
  }, [nodes]);

  if (!webgl) {
    return (
      <div className="field">
        <div className="empty">
          <h3>This browser has no WebGL</h3>
          <p>
            The Reach Field needs hardware 3D, which this browser or machine has
            turned off. Every campaign it would plot is in the grid — switch back
            with <span className="kbd">G</span>.
          </p>
        </div>
      </div>
    );
  }

  if (!nodes.length) {
    return (
      <div className="field">
        <div className="empty">
          <h3>Nothing to plot</h3>
          <p>These campaigns have no reach figures and dates filed, so there is nothing to place in space. Switch back to the grid to see them.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="field">
      <Canvas camera={{ position: [0, centre + 7, 38], fov: 42 }} dpr={[1, 2]}>
        <color attach="background" args={['#050506']} />
        <fog attach="fog" args={['#050506', 46, 104]} />
        <Field nodes={nodes} lanes={lanes} decades={decades} onPick={onPick} spin={!reduced} />
        <OrbitControls
          target={[0, centre, 0]}
          enablePan={false} minDistance={12} maxDistance={70}
          maxPolarAngle={Math.PI * 0.95} enableDamping dampingFactor={0.08}
        />
      </Canvas>

      <p className="field__hint">Drag to orbit · scroll to zoom · click a point to open</p>
      <div className="field__legend">
        <span>{nodes.length} plotted · height is reach · width is time · size is engagement</span>
        {lanes.slice(0, 7).map((l) => (
          <span className="field__key" key={l}>
            <span className="field__dot" style={{
              background: colourOf({ industry: l, isVertical: l !== 'Unclassified' } as Campaign),
            }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
