import type { Conditions, SimulationState } from '../types/demo';
import { DemoError, validateConditions } from './simulationValidation';
import { scenarioConditions } from '../data/demoScenarios';
import type { DemoScenario } from '../types/navigation';

type Settings = {
	SUPABASE_URL?: string;
	PUBLIC_SUPABASE_URL?: string;
	SUPABASE_SERVICE_ROLE_KEY?: string;
};
export class SimulationStore {
	constructor(
		private settings: () => Settings,
		private request: typeof fetch = fetch
	) {}

	private async query(path: string, payload?: unknown): Promise<SimulationState | null> {
		const env = this.settings();
		const url = env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL;
		const key = env.SUPABASE_SERVICE_ROLE_KEY;
		if (!url || !key || url.includes('YOUR_PROJECT') || key === 'REPLACE_ME')
			throw new DemoError(
				'Shared simulation is not configured. Set Supabase server credentials and apply the shared simulation migration.',
				503
			);
		const response = await this.request(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
			method: payload ? 'POST' : 'GET',
			headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
			body: payload ? JSON.stringify(payload) : undefined,
			signal: AbortSignal.timeout(10000)
		});
		if (!response.ok)
			throw new DemoError(
				'Shared simulation storage unavailable. Check the database migration and retry.',
				503
			);
		const rows = await response.json();
		const row = rows[0];
		return row
			? { revision: row.revision, conditions: row.conditions, updatedAt: row.updated_at }
			: null;
	}

	async get(): Promise<SimulationState> {
		const state = await this.query(
			'simulation_state?id=eq.true&select=revision,conditions,updated_at'
		);
		if (!state)
			throw new DemoError(
				'Shared simulation is not initialized. Apply the shared simulation migration.',
				503
			);
		return state;
	}

	async update(
		revision: number,
		input: Conditions,
		preset?: DemoScenario
	): Promise<SimulationState | null> {
		if (!Number.isInteger(revision) || revision < 0 || revision >= 2147483647)
			throw new DemoError('Invalid simulation revision.');
		let conditions = validateConditions(input);
		if (preset !== undefined) {
			if (!['dry', 'bypass', 'blocked'].includes(preset)) throw new DemoError('Invalid preset.');
			conditions = scenarioConditions(preset);
		}
		return this.query('rpc/update_simulation', { p_revision: revision, p_conditions: conditions });
	}
}
