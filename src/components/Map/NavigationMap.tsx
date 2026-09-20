import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Coordinate,
  FloodHazardZone,
  MapLayer,
  RouteOption,
  VehicleCategory,
} from "../../types/navigation";
interface Props {
  origin: Coordinate;
  destination: Coordinate | null;
  activeRoute: RouteOption | null;
  alternativeRoute: RouteOption | null;
  vehiclePosition: Coordinate | null;
  vehicle: VehicleCategory;
  floodZones: FloodHazardZone[];
  floodSource: "sensor" | "simulated";
  showTrafficDots: boolean;
  onSelectRoute?: (id: RouteOption["id"]) => void;
  onMapClick?: (coordinate: Coordinate) => void;
}
export function NavigationMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlays = useRef<L.LayerGroup | null>(null);
  const car = useRef<L.CircleMarker | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const fitted = useRef("");
  const [layer, setLayer] = useState<MapLayer>("Hybrid");
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, {
      center: latest.current.origin,
      zoom: 14,
      maxZoom: 21,
      zoomControl: false,
    });
    mapRef.current = map;
    const layers = { Hybrid: "y", Satellite: "s", Streets: "m" };
    const basemaps = Object.fromEntries(
      Object.entries(layers).map(([name, code]) => {
        const tiles = L.tileLayer(
          `https://mt1.google.com/vt/lyrs=${code}&x={x}&y={y}&z={z}`,
          { maxZoom: 21, attribution: "© Google" },
        );
        let failed = false;
        tiles.on("loading", () => {
          failed = false;
        });
        tiles.on("tileerror", () => {
          failed = true;
          if (map.hasLayer(tiles)) setTileError(true);
        });
        tiles.on("load", () => {
          if (map.hasLayer(tiles)) setTileError(failed);
        });
        return [name, tiles];
      }),
    );
    basemaps.Hybrid.addTo(map);
    L.control
      .layers(basemaps, undefined, { position: "topright", collapsed: false })
      .addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);
    map.on("baselayerchange", (e) => {
      setLayer(e.name as MapLayer);
      setTileError(false);
    });
    map.on("click", (e: L.LeafletMouseEvent) =>
      latest.current.onMapClick?.([e.latlng.lat, e.latlng.lng]),
    );
    overlays.current = L.layerGroup().addTo(map);
    car.current = L.circleMarker(latest.current.origin, {
      radius: 9,
      color: "#fff",
      weight: 3,
      fillColor: "#2563eb",
      fillOpacity: 1,
      interactive: false,
    }).addTo(map);
    car.current.bindTooltip("Simulated vehicle");
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      overlays.current = null;
      car.current = null;
      fitted.current = "";
    };
  }, []);
  useEffect(() => {
    const map = mapRef.current,
      group = overlays.current;
    if (!map || !group) return;
    group.clearLayers();
    const marker = (coordinate: Coordinate, label: string, color: string) => {
      L.circleMarker(coordinate, {
        radius: 8,
        color: "#fff",
        fillColor: color,
        fillOpacity: 1,
        bubblingMouseEvents: false,
      })
        .addTo(group)
        .bindTooltip(label, { permanent: true, direction: "top" });
    };
    marker(props.origin, "A · Origin", "#059669");
    if (props.destination)
      marker(props.destination, "B · Destination", "#dc2626");
    props.floodZones
      .filter((z) => z.active)
      .forEach((zone) => {
        const blocked =
          zone.depthCm >
          (props.floodSource === "sensor"
            ? 0
            : props.vehicle.maxSafeWaterDepthCm);
        const circle = L.circle(zone.center, {
          radius: zone.radiusMeters,
          color: blocked ? "#f87171" : "#fbbf24",
          fillOpacity: 0.3,
          bubblingMouseEvents: false,
        }).addTo(group);
        const text = document.createElement("div");
        text.textContent = `${zone.name}: ${zone.depthCm} cm — ${props.floodSource === "sensor" ? "Sensor observation; configured coverage radius" : "Simulated depth; demo threshold only"}.`;
        circle.bindPopup(text);
      });
    if (
      props.alternativeRoute &&
      props.alternativeRoute.id !== props.activeRoute?.id
    ) {
      const route = L.polyline(props.alternativeRoute.polyline, {
        color: "#34d399",
        weight: 6,
        dashArray: "8 8",
        bubblingMouseEvents: false,
      }).addTo(group);
      route.bindTooltip("Alternative avoiding displayed hazard zones");
      route.on("click", () =>
        latest.current.onSelectRoute?.("alternative_safe"),
      );
    }
    if (props.activeRoute) {
      const route = L.polyline(props.activeRoute.polyline, {
        color: props.activeRoute.isPassable ? "#38bdf8" : "#f87171",
        weight: 6,
        bubblingMouseEvents: false,
      }).addTo(group);
      const key = JSON.stringify(props.activeRoute.polyline);
      if (key !== fitted.current) {
        fitted.current = key;
        map.fitBounds(route.getBounds(), { padding: [35, 35], maxZoom: 16 });
      }
      if (props.showTrafficDots)
        props.activeRoute.trafficDots.forEach((dot) =>
          L.circleMarker(dot.coordinate, {
            radius: 3,
            weight: 1,
            color: "#0f172a",
            fillColor:
              dot.level === "heavy"
                ? "#ef4444"
                : dot.level === "moderate"
                  ? "#facc15"
                  : "#22c55e",
            fillOpacity: 0.85,
            bubblingMouseEvents: false,
          })
            .addTo(group)
            .bindTooltip(`Simulated ${dot.level} traffic`),
        );
    }
    car.current?.bringToFront();
  }, [
    props.origin,
    props.destination,
    props.activeRoute,
    props.alternativeRoute,
    props.floodZones,
    props.vehicle,
    props.showTrafficDots,
    props.floodSource,
  ]);
  useEffect(() => {
    car.current?.setLatLng(props.vehiclePosition || props.origin);
  }, [props.vehiclePosition, props.origin]);
  return (
    <div className="relative h-full min-h-[360px]" data-map-layer={layer}>
      <div ref={container} className="h-full min-h-[360px]" />
      <div className="map-caption">
        {layer} · Floods: {props.floodSource} · Traffic: simulated
      </div>
      {tileError && (
        <div role="status" className="map-error">
          Google map tiles unavailable. Routes and demo controls remain
          available.
          <button
            onClick={() => {
              setTileError(false);
              mapRef.current?.eachLayer((l) => {
                if (l instanceof L.TileLayer) l.redraw();
              });
            }}
          >
            Retry map
          </button>
        </div>
      )}
    </div>
  );
}
