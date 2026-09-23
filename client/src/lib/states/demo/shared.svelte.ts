import { scenarioConditions } from '$lib/data/demoScenarios';
import { validateConditions } from '$lib/services/simulationValidation';
import type { Conditions, SimulationState } from '$lib/types/demo';
import type { DemoScenario } from '$lib/types/navigation';
import { requestJson } from '$lib/utils/http';
import { demo, navigation } from './core.svelte';
import { runtime } from './runtime';
import { rebaseAtCurrentPosition } from './geometry.svelte';

export function receive(next: SimulationState) {
	runtime.lastSnapshot = Date.now();
	demo.connected = true;
	demo.syncError = '';
	if (demo.shared && next.revision <= demo.shared.revision) return;
	if (demo.offlineDemo) {
		demo.shared = next;
		return;
	}
	const previous = demo.shared?.conditions;
	if (
		previous &&
		(previous.trafficSimulation !== next.conditions.trafficSimulation ||
			previous.floodSimulation !== next.conditions.floodSimulation)
	) {
		if (!navigation.gpsTravel) demo.playing = false;
		rebaseAtCurrentPosition();
		demo.fixture = false;
		demo.routeRequest++;
		demo.notice = navigation.gpsTravel
			? 'Shared data source changed. GPS tracking continues.'
			: 'Data source changed. Review the remaining route, then resume.';
	}
	demo.shared = next;
	demo.candidates = [];
	demo.rerouting = false;
	runtime.rerouteGeneration++;
}

export async function syncConditions() {
	if (runtime.syncing || runtime.disposed || !navigator.onLine) return;
	runtime.syncing = true;
	const session = runtime.session;
	try {
		const next = await requestJson('/api/simulation', 'GET', undefined, (value) => {
			if (session === runtime.session && !runtime.disposed) receive(value);
		});
		if (!runtime.disposed && session === runtime.session) receive(next);
	} catch (error) {
		if (!runtime.disposed && session === runtime.session)
			demo.syncError = error instanceof Error ? error.message : 'Shared conditions unavailable.';
	} finally {
		if (session === runtime.session) runtime.syncing = false;
	}
}

export async function applyConditions(next: Conditions, revision: number, preset?: DemoScenario) {
	const session = runtime.session;
	const active = () => !runtime.disposed && session === runtime.session;
	const receiveCurrent = (value: SimulationState) => {
		if (active()) receive(value);
	};
	if (demo.offlineDemo && demo.localSimulation) {
		try {
			const validated = validateConditions(preset ? scenarioConditions(preset) : next);
			demo.localSimulation = {
				revision: demo.localSimulation.revision + 1,
				conditions: { ...validated, trafficSimulation: true, floodSimulation: true },
				updatedAt: new Date().toISOString()
			};
			demo.error = '';
			return true;
		} catch (error) {
			demo.error = error instanceof Error ? error.message : 'Invalid local conditions';
			return false;
		}
	}
	if (!navigator.onLine) {
		demo.error = 'Internet is needed to publish shared changes.';
		return false;
	}
	try {
		receiveCurrent(
			await requestJson(
				'/api/simulation',
				'PATCH',
				{ conditions: next, revision, preset },
				receiveCurrent
			)
		);
		if (!active()) return false;
		demo.error = '';
		return true;
	} catch (error) {
		if (!active()) return false;
		demo.error = error instanceof Error ? error.message : 'Could not publish changes.';
		try {
			receiveCurrent(await requestJson('/api/simulation', 'GET', undefined, receiveCurrent));
		} catch {
			// Keep the local error; a later poll may recover.
		}
		return false;
	}
}
