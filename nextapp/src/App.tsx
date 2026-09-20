import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppMode,
  Coordinate,
  DemoScenario,
  RoutingStatus,
  RouteOption,
} from "./types/navigation";
import { DEFAULT_VEHICLE_CATEGORY } from "./data/vehicleCategories";
import {
  INITIAL_FLOOD_ZONES,
  PRESET_DESTINATIONS,
  PRESET_ORIGINS,
} from "./data/mockFloodData";
import {
  DEMO_DESTINATION,
  DEMO_ORIGIN,
  DEMO_ROADS,
  scenarioFloods,
} from "./data/demoScenarios";
import {
  cumulativeDistances,
  evaluateRoutes,
  fetchRoadRoutes,
  positionAt,
  RoadRoute,
} from "./services/routingService";
import {
  advanceProgress,
  RequestGate,
  WarningGate,
} from "./services/navigationState";
import { useSensorReadings } from "./hooks/useSensorReadings";
import { loadSupabaseConfig } from "./services/supabaseConfig";
import { SupabaseConnection } from "./components/Settings/SupabaseConnection";
import { sensorZones } from "./services/sensorService";
import { speechService } from "./services/speechService";
import { NavigationMap } from "./components/Map/NavigationMap";
import { VehicleModal } from "./components/VehicleSelector/VehicleModal";

export default function App() {
  const [mode, setMode] = useState<AppMode>("online");
  const [supabaseConfig, setSupabaseConfig] = useState(loadSupabaseConfig);
  const [floodSource, setFloodSource] = useState<"mock" | "supabase">(
    "supabase",
  );
  const live = mode === "online" && floodSource === "supabase";
  const sensors = useSensorReadings(live, supabaseConfig);
  const [scenario, setScenario] = useState<DemoScenario>("dry");
  const [origin, setOrigin] = useState<Coordinate>(DEMO_ORIGIN);
  const [destination, setDestination] = useState<Coordinate>(DEMO_DESTINATION);
  const [vehicle, setVehicle] = useState(DEFAULT_VEHICLE_CATEGORY);
  const [modal, setModal] = useState(false);
  const [roads, setRoads] = useState<RoadRoute[]>([]);
  const [status, setStatus] = useState<RoutingStatus>("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<RouteOption["id"]>("primary");
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(false);
  const [locating, setLocating] = useState(false);
  const requestGate = useRef(new RequestGate());
  const warnings = useRef(new WarningGate());
  const tripVersion = useRef(0);
  const spokenStep = useRef("");
  const reset = () => {
    setPlaying(false);
    setProgress(0);
    spokenStep.current = "";
    speechService.cancel();
  };
  const resetInput = () => {
    reset();
    tripVersion.current++;
    warnings.current.reset();
    setSelected("primary");
  };

  useEffect(() => {
    const id = requestGate.current.next();
    const controller = new AbortController();
    setRoads([]);
    setError("");
    setStatus("loading");
    if (mode === "demo") {
      setRoads(DEMO_ROADS);
      setStatus("ready");
      return () => {
        requestGate.current.next();
      };
    }
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    fetchRoadRoutes(origin, destination, controller.signal)
      .then((result) => {
        if (requestGate.current.isCurrent(id)) {
          setRoads(result);
          setStatus("ready");
        }
      })
      .catch((reason) => {
        if (requestGate.current.isCurrent(id)) {
          setError(
            controller.signal.aborted
              ? "Routing timed out. Retry or use Demo scenarios."
              : reason instanceof Error
                ? reason.message
                : "Routing failed.",
          );
          setStatus("error");
        }
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      requestGate.current.next();
      controller.abort();
      clearTimeout(timeout);
    };
  }, [origin, destination, mode, retry]);

  const floods = useMemo(
    () =>
      mode === "demo"
        ? scenarioFloods(scenario)
        : live
          ? sensorZones(sensors.rows)
          : INITIAL_FLOOD_ZONES,
    [mode, scenario, live, sensors.rows],
  );
  const routes = useMemo(
    () =>
      evaluateRoutes(
        roads,
        live ? { ...vehicle, maxSafeWaterDepthCm: 0 } : vehicle,
        floods,
        live ? "sensor" : "simulated",
      ),
    [roads, vehicle, floods, live],
  );
  const active =
    selected === "primary" ? routes.primary : routes.alternativeSafe;
  const total = useMemo(
    () => (active ? cumulativeDistances(active.polyline).at(-1) || 0 : 0),
    [active],
  );
  const canDrive =
    status === "ready" && !!active?.isPassable && (!live || sensors.usable);
  const lastPosition = useRef<Coordinate>(origin);
  const lastGeometry = useRef("");
  const geometry = active ? JSON.stringify(active.polyline) : "";
  const position = active
    ? positionAt(active.polyline, progress)
    : progress > 0
      ? lastPosition.current
      : origin;
  useEffect(() => {
    if (active) lastPosition.current = position;
  }, [active, position]);
  useEffect(() => {
    if (!geometry) return;
    if (lastGeometry.current && lastGeometry.current !== geometry) {
      setPlaying(false);
      setProgress(0);
      spokenStep.current = "";
      speechService.cancel();
    }
    lastGeometry.current = geometry;
  }, [geometry]);
  const nextStep =
    active?.steps.find((s) => s.progressMeters > progress + 1) ||
    active?.steps.at(-1);
  const arrived = total > 0 && progress >= total;
  const remaining = Math.max(0, total - progress);
  const remainingMinutes =
    active && total ? (active.durationMinutes * remaining) / total : 0;

  useEffect(() => {
    if (!playing || !canDrive || total <= 0) return;
    const timer = window.setInterval(
      () => setProgress((p) => advanceProgress(p, 20, total)),
      250,
    );
    return () => clearInterval(timer);
  }, [playing, canDrive, total]);
  useEffect(() => {
    if (!canDrive) setPlaying(false);
    if (arrived) setPlaying(false);
  }, [canDrive, arrived]);
  useEffect(() => {
    if (!playing || !nextStep) return;
    const key = `${selected}:${nextStep.id}`;
    if (spokenStep.current !== key) {
      spokenStep.current = key;
      speechService.speakNavigationTurn(
        nextStep.instruction,
        Math.round(Math.max(0, nextStep.progressMeters - progress)),
      );
    }
  }, [playing, nextStep, progress, selected]);
  useEffect(() => {
    if (arrived && warnings.current.accept("arrival"))
      speechService.speak("You have arrived at your destination.");
  }, [arrived]);
  useEffect(() => {
    if (active && !active.isPassable) {
      const worst = [...active.floodZonesEncountered].sort(
        (a, b) => b.depthCm - a.depthCm,
      )[0];
      if (
        worst &&
        warnings.current.accept(
          `${selected}:${vehicle.id}:${worst.id}:${worst.depthCm}`,
        )
      )
        speechService.speak(
          `${live ? "Sensor" : "Simulation"} alert: route blocked by a ${worst.depthCm} centimeter flood observation.`,
          { priority: true },
        );
    }
  }, [active, selected, vehicle, live]);
  useEffect(() => () => speechService.cancel(), []);

  const changeMode = (value: AppMode) => {
    resetInput();
    setMode(value);
    setNotice("");
    setLocating(false);
    if (value === "demo") {
      setOrigin(DEMO_ORIGIN);
      setDestination(DEMO_DESTINATION);
    }
  };
  const chooseRoute = (id: RouteOption["id"]) => {
    reset();
    warnings.current.reset();
    setSelected(id);
  };
  const locate = () => {
    if (!navigator.geolocation) {
      setNotice("GPS is unavailable in this browser.");
      return;
    }
    const version = tripVersion.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        if (tripVersion.current !== version) return;
        resetInput();
        setOrigin([p.coords.latitude, p.coords.longitude]);
        setNotice("GPS origin updated. Travel remains simulated.");
      },
      () => {
        setLocating(false);
        if (tripVersion.current === version)
          setNotice(
            "GPS unavailable or permission denied. Existing origin retained.",
          );
      },
      { timeout: 8000, enableHighAccuracy: true },
    );
  };
  return (
    <main className="app-shell">
      <aside className="control-panel">
        <header>
          <h1 className="text-2xl font-black">
            FloodNav <span className="text-sm text-sky-300">Cebu</span>
          </h1>
          <p className="text-sm text-slate-300">
            Leaflet + Google · Navigation prototype
          </p>
        </header>
        <p className="notice">
          {live
            ? "Flood readings: ESP sensors via Supabase. Avoid all reported water; sensor coverage does not establish road safety."
            : "Floods and vehicle thresholds are simulated."}{" "}
          Traffic and travel remain simulated. Driving profile applies to all
          vehicle examples.
        </p>
        <label>
          Routing mode
          <select
            aria-label="Routing mode"
            value={mode}
            onChange={(e) => changeMode(e.target.value as AppMode)}
          >
            <option value="online">Online routes</option>
            <option value="demo">Demo scenarios</option>
          </select>
        </label>
        {mode === "demo" ? (
          <>
            <p>Preset trip: Fuente Osmeña → SM City Cebu</p>
            <label>
              Demo scenario
              <select
                aria-label="Demo scenario"
                value={scenario}
                onChange={(e) => {
                  setScenario(e.target.value as DemoScenario);
                }}
              >
                <option value="dry">Dry roads</option>
                <option value="bypass">
                  Flooded primary / bypass available
                </option>
                <option value="blocked">All routes blocked</option>
              </select>
            </label>
            <p className="text-xs text-slate-400">
              Bundled OSRM road routes. Google basemap still needs internet.
            </p>
          </>
        ) : (
          <>
            <label>
              Flood source
              <select
                aria-label="Flood source"
                value={floodSource}
                onChange={(e) => {
                  resetInput();
                  setFloodSource(e.target.value as "mock" | "supabase");
                }}
              >
                <option value="mock">Simulated floods</option>
                <option value="supabase">Supabase ESP sensors</option>
              </select>
            </label>
            {live && (
              <section className="notice" aria-label="Sensor feed status">
                <SupabaseConnection
                  config={supabaseConfig}
                  onConnect={(config) => {
                    resetInput();
                    setSupabaseConfig(config);
                  }}
                />
                <strong>ESP sensor feed</strong>
                <p>
                  {sensors.freshCount}/{sensors.rows.length} sensors have fresh
                  readings · refresh every 15 seconds
                </p>
                {sensors.loading && <p>Checking readings…</p>}
                {sensors.error && <p role="alert">{sensors.error}</p>}
                {!sensors.usable && (
                  <p>
                    Sensor data missing, stale (over 5 minutes), or unavailable.
                    Simulation is paused; absence of readings is not a dry-road
                    report.
                  </p>
                )}
                <button onClick={sensors.retry}>Refresh sensors</button>
                <ul className="space-y-2 mt-3" aria-label="Sensor readings">
                  {sensors.rows.map((sensor) => (
                    <li key={sensor.sensor_id}>
                      <strong>{sensor.name}</strong>:{" "}
                      {sensor.water_depth_cm === null
                        ? "No reading"
                        : `${sensor.water_depth_cm} cm`}
                      <div>
                        {sensor.affected_road} ·{" "}
                        {sensor.observed_at
                          ? new Date(sensor.observed_at).toLocaleString()
                          : "Awaiting first reading"}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <label>
              Origin
              <select
                aria-label="Origin"
                value={
                  PRESET_ORIGINS.find(
                    (p) => p.coordinate.toString() === origin.toString(),
                  )?.id || "custom"
                }
                onChange={(e) => {
                  const p = PRESET_ORIGINS.find((p) => p.id === e.target.value);
                  if (p) {
                    resetInput();
                    setOrigin(p.coordinate);
                  }
                }}
              >
                <option value="custom" disabled>
                  GPS / custom origin
                </option>
                {PRESET_ORIGINS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={locate} disabled={locating}>
              {locating ? "Locating…" : "Use my GPS location"}
            </button>
            <label>
              Destination
              <select
                aria-label="Destination"
                value={
                  PRESET_DESTINATIONS.find(
                    (p) => p.coordinate.toString() === destination.toString(),
                  )?.id || "custom"
                }
                onChange={(e) => {
                  const p = PRESET_DESTINATIONS.find(
                    (p) => p.id === e.target.value,
                  );
                  if (p) {
                    resetInput();
                    setDestination(p.coordinate);
                  }
                }}
              >
                <option value="custom" disabled>
                  Map pin destination
                </option>
                {PRESET_DESTINATIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-slate-400">
              Click the map to choose another destination.
            </p>
          </>
        )}
        <button onClick={() => setModal(true)}>Vehicle: {vehicle.title}</button>
        <p className="text-xs text-slate-400">
          Demo threshold: {vehicle.maxSafeWaterDepthCm} cm — not a wading
          rating.
        </p>
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {status === "loading" && <p role="status">Loading road routes…</p>}
        {status === "error" && (
          <div role="alert">
            <p>{error}</p>
            <button
              onClick={() => {
                resetInput();
                setRetry((r) => r + 1);
              }}
            >
              Retry routing
            </button>
            <button onClick={() => changeMode("demo")}>
              Use Demo scenarios
            </button>
          </div>
        )}
        <section aria-label="Route options" className="space-y-2">
          {[routes.primary, routes.alternativeSafe]
            .filter((r): r is RouteOption => !!r)
            .map((r) => (
              <button
                key={r.id}
                className={`route-card ${selected === r.id ? "selected" : ""}`}
                aria-pressed={selected === r.id}
                onClick={() => chooseRoute(r.id)}
              >
                <strong>{r.name}</strong>
                <span>
                  {r.distanceKm.toFixed(2)} km · {Math.ceil(r.durationMinutes)}{" "}
                  min · {r.source === "fixture" ? "Bundled demo" : "OSRM"}
                </span>
                <span
                  className={r.isPassable ? "text-sky-300" : "text-red-300"}
                >
                  {r.summary}
                </span>
              </button>
            ))}
        </section>
        {status === "ready" && !routes.alternativeSafe && (
          <p role="status">
            No flood-avoiding alternative found among returned routes.
          </p>
        )}
        {active && !active.isPassable && (
          <div role="alert" className="notice text-red-300">
            Selected route blocked by{" "}
            {live ? "sensor-reported water" : "simulated flood"}. Simulation
            paused.
            {routes.alternativeSafe && selected !== "alternative_safe" && (
              <button onClick={() => chooseRoute("alternative_safe")}>
                Apply flood-avoiding alternative
              </button>
            )}
          </div>
        )}
        {!active && status === "ready" && (
          <p role="alert">
            Selected alternative is unavailable. Choose the primary route to
            inspect it.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            disabled={!canDrive || arrived}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? "Pause simulation" : "Start / resume simulation"}
          </button>
          <button
            onClick={() => {
              reset();
              warnings.current.reset();
            }}
          >
            Reset trip
          </button>
        </div>
        <section aria-label="Navigation progress" className="notice">
          <strong>
            {arrived
              ? "Arrived at destination"
              : nextStep?.instruction || "Select a road route"}
          </strong>
          <p>
            {Math.round(remaining)} m remaining · {Math.ceil(remainingMinutes)}{" "}
            min
          </p>
          {nextStep && !arrived && (
            <p>
              Next maneuver in{" "}
              {Math.round(Math.max(0, nextStep.progressMeters - progress))} m
            </p>
          )}
          <progress
            aria-label="Trip progress"
            value={progress}
            max={total || 1}
            className="w-full"
          />
        </section>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setMuted(!muted);
              speechService.setMuted(!muted);
            }}
          >
            {muted ? "Unmute voice" : "Mute voice"}
          </button>
          <button
            onClick={() => {
              if (!speechService.testVoice())
                setNotice("Speech synthesis is unavailable in this browser.");
            }}
          >
            Test voice
          </button>
        </div>
      </aside>
      <section className="map-panel" aria-label="Navigation map">
        <NavigationMap
          origin={origin}
          destination={destination}
          activeRoute={active}
          alternativeRoute={routes.alternativeSafe}
          vehiclePosition={position}
          vehicle={vehicle}
          floodZones={floods}
          floodSource={live ? "sensor" : "simulated"}
          showTrafficDots
          onSelectRoute={chooseRoute}
          onMapClick={
            mode === "online"
              ? (p) => {
                  resetInput();
                  setDestination(p);
                }
              : undefined
          }
        />
      </section>
      <VehicleModal
        isOpen={modal}
        onClose={() => setModal(false)}
        selectedVehicle={vehicle}
        onSelectVehicle={setVehicle}
      />
    </main>
  );
}
