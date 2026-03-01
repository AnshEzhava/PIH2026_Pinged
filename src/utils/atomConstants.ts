/**
 * CPK color convention: each chemical element is assigned a standard color so
 * atoms are visually distinguishable in a 3D molecular model. These hex strings
 * are fed directly into Three.js MeshStandardMaterial as the `color` property.
 */
export const CPK: Record<string, string> = {
  H:  '#FFFFFF',
  C:  '#909090',
  N:  '#3050F8',
  O:  '#FF0D0D',
  F:  '#90E050',
  Cl: '#1FF01F',
  Br: '#A62929',
  I:  '#940094',
  S:  '#FFFF30',
  P:  '#FF8000',
  Fe: '#E06633',
  Na: '#AB5CF2',
  K:  '#8F40D4',
  Ca: '#3DFF00',
  Mg: '#8AFF00',
  Zn: '#7D80B0',
};

/**
 * Van der Waals radii scaled for display (not true Angstrom values).
 * Larger atoms like I, Fe, K get bigger spheres; hydrogen is the smallest.
 * The fallback radius (0.45) is used for any element not listed here.
 */
export const RADII: Record<string, number> = {
  H:  0.3,
  C:  0.5,
  N:  0.48,
  O:  0.46,
  S:  0.6,
  P:  0.58,
  F:  0.42,
  Cl: 0.55,
  Br: 0.6,
  I:  0.65,
  Fe: 0.65,
  Na: 0.6,
  K:  0.7,
  Ca: 0.65,
  Mg: 0.6,
  Zn: 0.6,
};

export const DEFAULT_COLOR  = '#FF69B4';
export const DEFAULT_RADIUS = 0.45;
