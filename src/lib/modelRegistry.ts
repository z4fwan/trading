export interface ModelVersionInfo {
  registryId: string; // e.g. 2026.07.02.001
  newsModel: string;
  technicalModel: string;
  historicalModel: string;
  ensembleWeights: string;
  promptVersion: string;
  featureSchema: string;
}

// Immutable Registry Snapshot
export const ACTIVE_MODEL_REGISTRY: Readonly<ModelVersionInfo> = Object.freeze({
  registryId: '2026.07.02.001',
  newsModel: 'v3.1',
  technicalModel: 'v2.8',
  historicalModel: 'v4.0',
  ensembleWeights: 'v17',
  promptVersion: 'v12',
  featureSchema: 'v12',
});

export function getCurrentRegistrySnapshot(): ModelVersionInfo {
  return { ...ACTIVE_MODEL_REGISTRY };
}
