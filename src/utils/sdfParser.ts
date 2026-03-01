export interface SDFAtom {
  x: number;
  y: number;
  z: number;
  element: string;
}

export interface SDFBond {
  from: number;
  to: number;
  order: number;
}

export interface SDFMolecule {
  atoms: SDFAtom[];
  bonds: SDFBond[];
}

/**
 * Parses an MDL Molfile / SDF block into atom and bond arrays.
 *
 * The V2000 Molfile format uses fixed-width columns, not delimiters:
 *   - Line 0–2: molecule name, program/date metadata, comment (skipped)
 *   - Line 3: "counts line" — columns 0–2 = atom count, 3–5 = bond count
 *   - Lines 4 … 4+atomCount-1: one atom per line
 *       cols  0–9  = x   (float)
 *       cols 10–19 = y   (float)
 *       cols 20–29 = z   (float)
 *       cols 31–33 = element symbol
 *   - Lines 4+atomCount … 4+atomCount+bondCount-1: one bond per line
 *       cols 0–2 = atom-1 index (1-based)
 *       cols 3–5 = atom-2 index (1-based)
 *       cols 6–8 = bond order (1 = single, 2 = double, 3 = triple)
 *
 * Returns empty arrays on any parse failure so the caller can show a graceful
 * empty-state instead of crashing.
 */
export function parseSDF(sdfText: string): SDFMolecule {
  const empty: SDFMolecule = { atoms: [], bonds: [] };
  if (!sdfText) return empty;

  const lines = sdfText.split('\n');
  if (lines.length < 4) return empty;

  const countsLine = lines[3];
  const atomCount = parseInt(countsLine.substring(0, 3).trim(), 10);
  const bondCount = parseInt(countsLine.substring(3, 6).trim(), 10);

  if (isNaN(atomCount) || isNaN(bondCount)) return empty;

  const atoms: SDFAtom[] = [];
  for (let i = 0; i < atomCount; i++) {
    const line = lines[4 + i];
    if (!line) continue;

    const x = parseFloat(line.substring(0, 10).trim());
    const y = parseFloat(line.substring(10, 20).trim());
    const z = parseFloat(line.substring(20, 30).trim());
    const element = line.substring(31, 34).trim();

    // Skip lines that didn't parse cleanly — corrupted or truncated SDF blocks
    if (isNaN(x) || isNaN(y) || isNaN(z) || !element) continue;

    atoms.push({ x, y, z, element });
  }

  const bonds: SDFBond[] = [];
  const bondStart = 4 + atomCount;
  for (let i = 0; i < bondCount; i++) {
    const line = lines[bondStart + i];
    if (!line) continue;

    // SDF bond indices are 1-based; convert to 0-based for array access
    const from  = parseInt(line.substring(0, 3).trim(), 10) - 1;
    const to    = parseInt(line.substring(3, 6).trim(), 10) - 1;
    const order = parseInt(line.substring(6, 9).trim(), 10);

    // Discard bonds that reference out-of-range atom indices
    if (from >= 0 && to >= 0 && from < atoms.length && to < atoms.length) {
      bonds.push({ from, to, order });
    }
  }

  return { atoms, bonds };
}

/**
 * Centers the atom cloud at the origin and uniformly scales it so the
 * furthest atom sits at radius `targetRadius` from the center.
 *
 * This is needed because SDF coordinates are in Angstroms and vary wildly
 * by molecule size — without normalization some molecules would appear as a
 * tiny dot or fill the entire viewport.
 */
export function normalizeAtoms(atoms: SDFAtom[], targetRadius = 7): SDFAtom[] {
  if (!atoms.length) return atoms;

  // Compute centroid
  const cx = atoms.reduce((s, a) => s + a.x, 0) / atoms.length;
  const cy = atoms.reduce((s, a) => s + a.y, 0) / atoms.length;
  const cz = atoms.reduce((s, a) => s + a.z, 0) / atoms.length;

  const centered = atoms.map(a => ({
    ...a,
    x: a.x - cx,
    y: a.y - cy,
    z: a.z - cz,
  }));

  // Find the distance of the furthest atom from the new origin; clamp to 1
  // so we never divide by zero on a single-atom molecule
  const maxR = Math.max(
    ...centered.map(a => Math.sqrt(a.x ** 2 + a.y ** 2 + a.z ** 2)),
    1,
  );

  const scale = targetRadius / maxR;
  return centered.map(a => ({
    ...a,
    x: a.x * scale,
    y: a.y * scale,
    z: a.z * scale,
  }));
}
