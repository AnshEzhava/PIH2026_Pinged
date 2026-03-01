import React, { useRef, useMemo, useCallback, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, LayoutChangeEvent } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer, THREE } from 'expo-three';
import type { ExpoWebGLRenderingContext } from 'expo-gl';

import { parseSDF, normalizeAtoms, CPK, RADII, DEFAULT_COLOR, DEFAULT_RADIUS } from '@/utils';
import type { StructureData } from '@/types';
import { useThemeColors } from '@/theme';

// Ensure Three.js uses the single global instance expo-three provides.
// Metro can otherwise bundle two separate copies, breaking instanceof checks.
// The `declare` block tells TypeScript that this global property exists.
declare const global: typeof globalThis & { THREE?: typeof THREE };
global.THREE = global.THREE || THREE;

interface MoleculeViewerProps {
  structureData: StructureData | null;
  drugName?: string;
}

export default function MoleculeViewer({ structureData, drugName }: MoleculeViewerProps) {
  const C = useThemeColors();

  // Track the rendered pixel dimensions so we can size the GL viewport correctly
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Whether the auto-rotation is paused by the user
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false); // mirror for use inside the RAF closure

  // requestAnimationFrame handle — kept in a ref so we can cancel on unmount
  const rafRef = useRef<number>(0);

  // Parse the SDF text and normalize atom positions exactly once per structureData change
  const { atoms, bonds } = useMemo(() => {
    if (!structureData?.data) return { atoms: [], bonds: [] };
    try {
      const parsed = parseSDF(structureData.data);
      return { atoms: normalizeAtoms(parsed.atoms), bonds: parsed.bonds };
    } catch {
      return { atoms: [], bonds: [] };
    }
  }, [structureData]);

  // Unique element symbols present in the molecule, used to render the legend
  const uniqueElements = useMemo(
    () => [...new Set(atoms.map(a => a.element))].sort(),
    [atoms],
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  /**
   * Called by GLView once the native OpenGL-ES context is ready.
   * We imperatively build the full Three.js scene here (scene, camera, lights,
   * atom spheres, bond cylinders, a rotating group) and then drive the render
   * loop with requestAnimationFrame.
   *
   * expo-three's Renderer wraps THREE.WebGLRenderer so that gl.endFrameEXP()
   * is called automatically at the end of each render, which tells the native
   * layer to flush the framebuffer to the screen.
   */
  const onContextCreate = useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      const { drawingBufferWidth: w, drawingBufferHeight: h } = gl;

      // ── Renderer ──────────────────────────────────────────────────────────
      const renderer = new Renderer({ gl });
      renderer.setSize(w, h);
      renderer.setClearColor(0x1a1a2e, 1);

      // ── Scene ─────────────────────────────────────────────────────────────
      const scene = new THREE.Scene();

      // ── Camera ────────────────────────────────────────────────────────────
      // PerspectiveCamera(fov, aspect, near, far)
      const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
      camera.position.set(0, 0, 18);

      // ── Lighting ──────────────────────────────────────────────────────────
      // AmbientLight fills shadow regions; two DirectionalLights create the
      // highlights needed for meshStandardMaterial to look 3-dimensional
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight1.position.set(10, 10, 5);
      scene.add(dirLight1);
      const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
      dirLight2.position.set(-10, -5, 5);
      scene.add(dirLight2);

      // ── Molecule group (will be rotated each frame) ────────────────────────
      const moleculeGroup = new THREE.Group();
      scene.add(moleculeGroup);

      // ── Atom spheres ──────────────────────────────────────────────────────
      // SphereGeometry args: (radius, widthSegments, heightSegments)
      // Higher segment counts give smoother spheres at the cost of geometry.
      // 16×16 is a good balance for mobile GPU budgets.
      atoms.forEach(atom => {
        if (isNaN(atom.x) || isNaN(atom.y) || isNaN(atom.z)) return;
        const radius   = RADII[atom.element]   ?? DEFAULT_RADIUS;
        const color    = CPK[atom.element]     ?? DEFAULT_COLOR;
        const geometry = new THREE.SphereGeometry(radius, 16, 16);
        const material = new THREE.MeshStandardMaterial({
          color,
          metalness: 0.3,
          roughness: 0.4,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(atom.x, atom.y, atom.z);
        moleculeGroup.add(mesh);
      });

      // ── Bond cylinders ────────────────────────────────────────────────────
      bonds.forEach(bond => {
        const a1 = atoms[bond.from];
        const a2 = atoms[bond.to];
        if (!a1 || !a2) return;

        const start = new THREE.Vector3(a1.x, a1.y, a1.z);
        const end   = new THREE.Vector3(a2.x, a2.y, a2.z);

        // Midpoint position and orientation for the cylinder
        const mid    = start.clone().add(end).multiplyScalar(0.5);
        const dir    = end.clone().sub(start);
        const length = dir.length();
        dir.normalize();

        // Quaternion that rotates the default Y-axis cylinder to point from a1 → a2
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir,
        );

        if (bond.order >= 2) {
          // Double bonds are rendered as two parallel thin cylinders offset
          // perpendicular to the bond axis
          const perp  = new THREE.Vector3(1, 0, 0);
          let cross = new THREE.Vector3().crossVectors(dir, perp);
          // Fallback when dir is nearly parallel to (1,0,0) to avoid a zero-length cross
          if (cross.length() < 0.01) {
            cross = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
          }
          cross.normalize().multiplyScalar(0.12);

          [-1, 1].forEach(sign => {
            const geo = new THREE.CylinderGeometry(0.08, 0.08, length, 6);
            const mat = new THREE.MeshStandardMaterial({ color: '#A0A0A0' });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(
              mid.x + cross.x * sign,
              mid.y + cross.y * sign,
              mid.z + cross.z * sign,
            );
            mesh.setRotationFromQuaternion(quat);
            moleculeGroup.add(mesh);
          });
        } else {
          const geo  = new THREE.CylinderGeometry(0.1, 0.1, length, 6);
          const mat  = new THREE.MeshStandardMaterial({ color: '#A0A0A0' });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.copy(mid);
          mesh.setRotationFromQuaternion(quat);
          moleculeGroup.add(mesh);
        }
      });

      // ── Render loop ───────────────────────────────────────────────────────
      // We use a simple rAF loop instead of a dedicated animation library
      // because expo-three's Renderer requires gl.endFrameEXP() to be called
      // on the same JS thread that created the context.
      let lastTime = 0;
      const render = (time: number) => {
        rafRef.current = requestAnimationFrame(render);
        const delta = (time - lastTime) / 1000; // seconds
        lastTime = time;

        if (!pausedRef.current) {
          moleculeGroup.rotation.y += delta * 0.15; // ~9°/s slow rotation
        }

        renderer.render(scene, camera);
        // expo-gl requires this call to present the rendered frame
        gl.endFrameEXP();
      };

      rafRef.current = requestAnimationFrame(render);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [atoms, bonds],
  );

  // Keep the ref in sync so the RAF closure always reads the latest value
  // without needing to be re-created (which would restart the GL context)
  const togglePause = useCallback(() => {
    setPaused(prev => {
      pausedRef.current = !prev;
      return !prev;
    });
  }, []);

  // Cancel the render loop when the component unmounts
  React.useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (atoms.length === 0) {
    return (
      <View style={[styles.placeholder, { backgroundColor: C.backgroundSubtle }]}>
        <Text style={[styles.placeholderText, { color: C.textMuted }]}>
          No structure available
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container} onLayout={onLayout}>
      {size.width > 0 && (
        <GLView
          style={StyleSheet.absoluteFill}
          onContextCreate={onContextCreate}
        />
      )}

      {/* Drug name badge — top-left */}
      {drugName ? (
        <View style={[styles.nameBadge, { backgroundColor: C.card + 'E6', borderColor: C.border }]}>
          <Text style={[styles.nameBadgeText, { color: C.textPrimary }]} numberOfLines={1}>
            {drugName}
          </Text>
        </View>
      ) : null}

      {/* Pause / Resume button — top-right */}
      <Pressable
        onPress={togglePause}
        style={[styles.pauseButton, { backgroundColor: C.card + 'E6', borderColor: C.border }]}
      >
        <Text style={[styles.pauseButtonText, { color: C.textSecondary }]}>
          {paused ? 'Resume' : 'Pause'}
        </Text>
      </Pressable>

      {/* Element colour legend — bottom-left, max 6 elements to avoid overflow */}
      <View style={styles.legend}>
        {uniqueElements.slice(0, 6).map(elem => (
          <View key={elem} style={styles.legendItem}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: CPK[elem] ?? DEFAULT_COLOR, borderColor: C.border },
              ]}
            />
            <Text style={[styles.legendLabel, { color: C.textMuted }]}>{elem}</Text>
          </View>
        ))}
      </View>

      {/* Source / CID info — bottom-right */}
      {structureData ? (
        <View style={[styles.infoBadge, { backgroundColor: C.card + 'B3' }]}>
          <Text style={[styles.infoBadgeText, { color: C.textMuted }]}>
            {structureData.source ?? '3d'} · CID {structureData.pubchem_cid ?? 'N/A'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 8,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  placeholderText: {
    fontSize: 12,
  },
  nameBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: '60%',
  },
  nameBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  pauseButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  pauseButtonText: {
    fontSize: 11,
  },
  legend: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
  },
  legendLabel: {
    fontSize: 10,
    fontFamily: 'monospace',
  },
  infoBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  infoBadgeText: {
    fontSize: 10,
  },
});
