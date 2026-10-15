import type { ServerInfo } from './types';

export function byActivity(a: ServerInfo, b: ServerInfo): number {
	return (b.dru15 ?? 0) - (a.dru15 ?? 0);
}
