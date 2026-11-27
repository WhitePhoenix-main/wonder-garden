export const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
export const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
